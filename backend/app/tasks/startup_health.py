"""Startup health check: detect per-stock data gaps and auto-seed via existing pipelines.

Runs once on backend startup (after price fetch, before scheduler).
Inspects each critical table PER STOCK, determines which stocks are missing
data in which tables, calls the appropriate pipeline functions for only
those stocks, and logs a structured summary.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Tadawul trading days: Sun(6), Mon(0), Tue(1), Wed(2), Thu(3)
_TRADING_WEEKDAYS = {6, 0, 1, 2, 3}


def _is_trading_day() -> bool:
    """Check if today is a Tadawul trading day (Sun-Thu)."""
    return datetime.now(timezone.utc).weekday() in _TRADING_WEEKDAYS


def _is_stale(timestamp_str: str | None, max_hours: int = 24) -> bool:
    """Check if a timestamp string is older than max_hours.

    Args:
        timestamp_str: ISO-format timestamp string, or None.
        max_hours: Number of hours after which data is considered stale.

    Returns:
        True if stale or missing, False if fresh.
    """
    if not timestamp_str:
        return True

    try:
        # Handle various ISO formats from Supabase
        ts = timestamp_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        return age_hours > max_hours
    except (ValueError, TypeError):
        return True


def _get_stocks_with_data(client, table: str, stock_id_col: str = "stock_id") -> set:
    """Query a table to find which stock_ids have data.

    Args:
        client: Supabase client instance.
        table: Table name to query.
        stock_id_col: Column name for stock_id (default: "stock_id").

    Returns:
        Set of stock_ids that have at least one row in the table.
    """
    result = client.table(table).select(stock_id_col).execute()
    if not result.data:
        return set()
    return {row[stock_id_col] for row in result.data if row.get(stock_id_col) is not None}


async def run_startup_health_check() -> dict:
    """Run startup health check: detect per-stock gaps, seed missing data, log summary.

    For each of the 6 downstream tables (stock_stats, risk_metrics,
    monte_carlo_results, pivot_levels, news_articles, sentiment_scores),
    determines which active stocks are MISSING data and seeds only those
    stocks. This replaces the old table-level emptiness check.

    Returns:
        Health report dictionary with per-stock status across all tables.
    """
    # Lazy imports to avoid circular dependencies (same pattern as scheduler.py)
    from app.database import get_supabase
    from app.tasks.compute_risk import run_risk_pipeline
    from app.tasks.compute_pivots import compute_pivot_levels
    from app.tasks.compute_stats import compute_stock_stats
    from app.tasks.fetch_prices import fetch_and_store_prices
    from app.modules.prices import repository as prices_repo
    from app.modules.news.service import backfill_stock_ids

    logger.info("Startup health check: per-stock gap detection starting...")

    client = get_supabase()

    # ---------------------------------------------------------------
    # 1. Get all active stocks
    # ---------------------------------------------------------------
    active_stocks = await prices_repo.get_active_stocks()
    active_stock_ids = {stock["id"] for stock in active_stocks}
    stock_id_to_symbol = {stock["id"]: stock["symbol"] for stock in active_stocks}

    logger.info("Active stocks: %d (%s)", len(active_stocks),
                ", ".join(s["symbol"] for s in active_stocks))

    # ---------------------------------------------------------------
    # 2. Per-stock price staleness check (before downstream tables)
    # ---------------------------------------------------------------
    stale_price_stocks = []
    if _is_trading_day():
        for stock in active_stocks:
            stock_id = stock["id"]
            symbol = stock["symbol"]
            try:
                price_result = (
                    client.table("daily_prices")
                    .select("trade_date")
                    .eq("stock_id", stock_id)
                    .order("trade_date", desc=True)
                    .limit(1)
                    .execute()
                )
                if not price_result.data:
                    # No prices at all -- fetch full year
                    logger.info("No prices for %s, fetching 1y of data...", symbol)
                    try:
                        await fetch_and_store_prices(symbol, period="1y")
                        stale_price_stocks.append(symbol)
                    except Exception as e:
                        logger.warning("Price fetch failed for %s: %s", symbol, e)
                else:
                    latest_date = price_result.data[0]["trade_date"]
                    if _is_stale(latest_date, max_hours=72):  # ~3 trading days
                        logger.info("Stale prices for %s (latest: %s), fetching 1mo...",
                                    symbol, latest_date)
                        try:
                            await fetch_and_store_prices(symbol, period="1mo")
                            stale_price_stocks.append(symbol)
                        except Exception as e:
                            logger.warning("Price refresh failed for %s: %s", symbol, e)
            except Exception as e:
                logger.warning("Price staleness check failed for %s: %s", symbol, e)

    if stale_price_stocks:
        logger.info("Price staleness refresh: %d stocks updated (%s)",
                     len(stale_price_stocks), ", ".join(stale_price_stocks))
    else:
        logger.info("Price staleness check: all stocks fresh (or not a trading day)")

    # ---------------------------------------------------------------
    # 3. Query per-stock coverage for all 6 downstream tables
    # ---------------------------------------------------------------
    stocks_with_stats = _get_stocks_with_data(client, "stock_stats")
    stocks_with_risk = _get_stocks_with_data(client, "risk_metrics")
    stocks_with_mc = _get_stocks_with_data(client, "monte_carlo_results")
    stocks_with_pivots = _get_stocks_with_data(client, "pivot_levels")
    stocks_with_news = _get_stocks_with_data(client, "news_articles")
    stocks_with_sentiment = _get_stocks_with_data(client, "sentiment_scores")

    # Compute missing sets
    missing_stats = active_stock_ids - stocks_with_stats
    missing_risk = active_stock_ids - stocks_with_risk
    missing_mc = active_stock_ids - stocks_with_mc
    missing_pivots = active_stock_ids - stocks_with_pivots
    missing_news = active_stock_ids - stocks_with_news
    missing_sentiment = active_stock_ids - stocks_with_sentiment

    # Combined risk+MC missing (run_risk_pipeline seeds both)
    missing_risk_or_mc = missing_risk | missing_mc

    logger.info("Per-stock gaps: stats=%d, risk=%d, mc=%d, pivots=%d, news=%d, sentiment=%d",
                len(missing_stats), len(missing_risk), len(missing_mc),
                len(missing_pivots), len(missing_news), len(missing_sentiment))

    # ---------------------------------------------------------------
    # 4. Seed missing stocks per table
    # ---------------------------------------------------------------

    # Per-stock report: {symbol: {stats: ok/seeded/failed, ...}}
    per_stock_report: dict[str, dict[str, str]] = {}
    for stock in active_stocks:
        per_stock_report[stock["symbol"]] = {
            "stats": "ok",
            "risk": "ok",
            "mc": "ok",
            "pivots": "ok",
            "news": "ok",
            "sentiment": "ok",
        }

    # A. Stock stats -- seed missing stocks
    for stock_id in missing_stats:
        symbol = stock_id_to_symbol.get(stock_id)
        if not symbol:
            continue
        try:
            logger.info("Seeding stock_stats for %s...", symbol)
            await compute_stock_stats(symbol)
            per_stock_report[symbol]["stats"] = "seeded"
            logger.info("Stock stats seeding complete for %s", symbol)
        except Exception as e:
            logger.warning("Stock stats seeding failed for %s: %s", symbol, e)
            per_stock_report[symbol]["stats"] = "failed"

    # B. Risk metrics + Monte Carlo -- seed missing stocks (run_risk_pipeline does both)
    for stock_id in missing_risk_or_mc:
        symbol = stock_id_to_symbol.get(stock_id)
        if not symbol:
            continue
        try:
            logger.info("Seeding risk_metrics + monte_carlo for %s...", symbol)
            await run_risk_pipeline(symbol, trigger="startup")
            per_stock_report[symbol]["risk"] = "seeded"
            per_stock_report[symbol]["mc"] = "seeded"
            logger.info("Risk pipeline seeding complete for %s", symbol)
        except Exception as e:
            logger.warning("Risk pipeline seeding failed for %s: %s", symbol, e)
            per_stock_report[symbol]["risk"] = "failed"
            per_stock_report[symbol]["mc"] = "failed"

    # C. Pivot levels -- seed missing stocks
    for stock_id in missing_pivots:
        symbol = stock_id_to_symbol.get(stock_id)
        if not symbol:
            continue
        try:
            logger.info("Seeding pivot_levels for %s...", symbol)
            await compute_pivot_levels(symbol)
            per_stock_report[symbol]["pivots"] = "seeded"
            logger.info("Pivot levels seeding complete for %s", symbol)
        except Exception as e:
            logger.warning("Pivot levels seeding failed for %s: %s", symbol, e)
            per_stock_report[symbol]["pivots"] = "failed"

    # D. Compute 52-week range for all active stocks (idempotent, fast)
    for stock_row in active_stocks:
        symbol = stock_row["symbol"]
        try:
            stock = await prices_repo.get_stock_by_symbol(symbol)
            if stock:
                range_52w = await prices_repo.get_52_week_range(stock["id"])
                if range_52w:
                    from app.database import get_supabase_service
                    svc = get_supabase_service()
                    svc.table("stock_stats").update({
                        "week_52_high": str(range_52w["week_52_high"]),
                        "week_52_low": str(range_52w["week_52_low"]),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("stock_id", stock["id"]).execute()
                    logger.info(
                        "52-week range stored for %s: high=%s low=%s",
                        symbol, range_52w["week_52_high"], range_52w["week_52_low"],
                    )
                else:
                    logger.warning("No daily_prices data for 52-week range calculation for %s", symbol)
        except Exception as e:
            logger.warning("52-week range computation failed for %s: %s", symbol, e)

    # E. News + sentiment -- run global news pipeline if any stocks missing coverage
    if missing_news or missing_sentiment:
        try:
            from app.tasks.news_pipeline import run_news_pipeline
            logger.info("Seeding news + sentiment (stocks missing news: %d, sentiment: %d)...",
                        len(missing_news), len(missing_sentiment))
            result = await run_news_pipeline(sentiment_limit=200)
            news_summary = result.get("news_summary")
            sentiment_summary = result.get("sentiment_summary")
            new_articles = news_summary.total_new if news_summary else 0
            analyzed = sentiment_summary.analyzed if sentiment_summary else 0
            logger.info("News pipeline seeding complete: %d articles, %d analyzed",
                        new_articles, analyzed)

            # Update per-stock report for news/sentiment
            for stock_id in missing_news:
                symbol = stock_id_to_symbol.get(stock_id)
                if symbol:
                    per_stock_report[symbol]["news"] = "seeded"
            for stock_id in missing_sentiment:
                symbol = stock_id_to_symbol.get(stock_id)
                if symbol:
                    per_stock_report[symbol]["sentiment"] = "seeded"
        except Exception as e:
            logger.warning("News pipeline seeding failed: %s", e)
            for stock_id in missing_news:
                symbol = stock_id_to_symbol.get(stock_id)
                if symbol:
                    per_stock_report[symbol]["news"] = "failed"
            for stock_id in missing_sentiment:
                symbol = stock_id_to_symbol.get(stock_id)
                if symbol:
                    per_stock_report[symbol]["sentiment"] = "failed"

    # F. News backfill -- re-match articles with NULL stock_id
    try:
        backfill_result = await backfill_stock_ids()
        logger.info("News backfill: %d/%d articles re-matched",
                     backfill_result.get("matched", 0),
                     backfill_result.get("total", 0))
    except Exception as e:
        logger.warning("News backfill failed: %s", e)

    # ---------------------------------------------------------------
    # 5. Log structured per-stock summary table
    # ---------------------------------------------------------------
    logger.info("Startup health check complete — per-stock status:")
    header = f"  {'Symbol':<10} {'Stats':<10} {'Risk':<10} {'MC':<10} {'Pivots':<10} {'News':<10} {'Sentiment':<10}"
    logger.info(header)
    logger.info("  " + "-" * 70)
    for symbol, status in per_stock_report.items():
        logger.info(
            "  %-10s %-10s %-10s %-10s %-10s %-10s %-10s",
            symbol,
            status["stats"],
            status["risk"],
            status["mc"],
            status["pivots"],
            status["news"],
            status["sentiment"],
        )

    if stale_price_stocks:
        logger.info("  Price staleness refresh: %s", ", ".join(stale_price_stocks))

    return {
        "active_stocks": len(active_stocks),
        "stale_price_refreshed": stale_price_stocks,
        "per_stock": per_stock_report,
    }
