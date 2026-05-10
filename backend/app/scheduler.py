"""APScheduler setup for automated cron jobs (PIPE-01 through PIPE-07).

Schedules:
- Price fetch: Daily at 12:30 UTC (15:30 AST) Sun-Thu after Tadawul close
- Pivot calc: Daily at 12:35 UTC (15:35 AST) Sun-Thu after prices arrive
- Stats compute: Daily at 12:35 UTC alongside pivots
- News + Sentiment: Every 30 minutes, all days (news publishes on weekends too)
- Risk + Monte Carlo: Daily at 12:40 UTC (15:40 AST) Sun-Thu after stats+pivots

Stats/pivots and risk/MC jobs check for today's prices before running
(skip if price fetch failed).
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level scheduler instance
_scheduler: AsyncIOScheduler | None = None


async def _has_fresh_prices(stock_id: int | None = None) -> bool:

    """Check if recent price data exists in daily_prices.

    Looks for prices from the last trading day (not necessarily today).
    On non-trading days (Fri/Sat), checks for the previous Thursday's data.
    Used by downstream cron jobs (stats, risk) to skip recomputation
    when the price fetch failed or hasn't run yet.

    Args:
        stock_id: If provided, check freshness for this specific stock only.
                  If None, check globally (any stock has fresh prices).
    """
  
    from datetime import datetime, timedelta, timezone

    from app.database import get_supabase

    client = get_supabase()
    now = datetime.now(timezone.utc)

    # Look back up to 5 days to find the last trading day's prices
    # (covers weekends + possible holidays)
    cutoff = (now - timedelta(days=5)).strftime("%Y-%m-%d")
    query = (
        client.table("daily_prices")
        .select("id", count="exact")
        .gte("trade_date", cutoff)
    )
    if stock_id is not None:
        query = query.eq("stock_id", stock_id)
    result = query.limit(1).execute()
    count = result.count if result.count is not None else len(result.data or [])
    return count > 0


async def _run_price_fetch() -> None:
    """Scheduled job: fetch latest prices for all active stocks."""
    from app.tasks.fetch_prices import fetch_and_store_prices
    from app.modules.prices import repository

    try:
        stocks = await repository.get_active_stocks()
        logger.info("Cron job started: price fetch for %d stocks", len(stocks))
        total = 0
        for stock in stocks:
            symbol = stock["symbol"]
            try:
                count = await fetch_and_store_prices(symbol, period="1mo")
                total += count
                logger.info("Price fetch for %s: %d rows upserted", symbol, count)
            except Exception:
                logger.exception("Price fetch failed for %s", symbol)
        logger.info("Cron job completed: price fetch — %d total rows upserted", total)
    except Exception:
        logger.exception("Cron job failed: price fetch")


async def _run_stats_and_pivots() -> None:
    """Scheduled job: compute stats and pivot levels for all active stocks (only if fresh prices exist)."""
    from app.tasks.compute_stats import compute_stock_stats
    from app.tasks.compute_pivots import compute_pivot_levels
    from app.modules.prices import repository

    try:
        stocks = await repository.get_active_stocks()
        logger.info("Cron job started: stats + pivots for %d stocks", len(stocks))

        for stock in stocks:
            symbol = stock["symbol"]
            stock_id = stock["id"]
            try:
                if not await _has_fresh_prices(stock_id=stock_id):
                    logger.info("Skipping stats + pivots for %s — no fresh prices", symbol)
                    continue

                stats = await compute_stock_stats(symbol)
                logger.info("Stats for %s: mu=%.8f sigma=%.8f",
                             symbol, stats["daily_return_mean"], stats["daily_return_std"])

                pivots = await compute_pivot_levels(symbol)
                if pivots:
                    logger.info("Pivots for %s: PP=%.4f R1=%.4f S1=%.4f",
                                 symbol, pivots["pivot_point"], pivots["r1"], pivots["s1"])
                else:
                    logger.warning("No pivot data produced for %s", symbol)
            except Exception:
                logger.exception("Stats + pivots failed for %s", symbol)

    except Exception:
        logger.exception("Cron job failed: stats + pivots")


async def _run_news_pipeline() -> None:
    """Scheduled job: fetch news and run sentiment analysis."""
    from app.tasks.news_pipeline import run_news_pipeline

    try:
        logger.info("Cron job started: news + sentiment pipeline")
        result = await run_news_pipeline()
        news = result.get("news_summary")
        sentiment = result.get("sentiment_summary")
        new_articles = news.total_new if news else 0
        analyzed = sentiment.analyzed if sentiment else 0
        logger.info(
            "Cron job completed: news + sentiment — %d new articles, %d analyzed",
            new_articles,
            analyzed,
        )
    except Exception:
        logger.exception("Cron job failed: news + sentiment pipeline")


async def _run_risk_pipeline() -> None:
    """Scheduled job: compute risk metrics and Monte Carlo for all active stocks (only if fresh prices exist)."""
    from app.tasks.compute_risk import run_risk_pipeline
    from app.modules.prices import repository

    try:
        stocks = await repository.get_active_stocks()
        logger.info("Cron job started: risk + Monte Carlo for %d stocks", len(stocks))

        for stock in stocks:
            symbol = stock["symbol"]
            stock_id = stock["id"]
            try:
                if not await _has_fresh_prices(stock_id=stock_id):
                    logger.info("Skipping risk + MC for %s — no fresh prices", symbol)
                    continue

                result = await run_risk_pipeline(symbol, trigger="scheduled")
                logger.info(
                    "Risk + MC for %s: overall_score=%.2f, sr_break=%s",
                    symbol, result["overall_score"], result["sr_break_detected"],
                )
            except Exception:
                logger.exception("Risk + MC failed for %s", symbol)

    except Exception:
        logger.exception("Cron job failed: risk + Monte Carlo")


def start_scheduler() -> None:
    """Initialize and start the APScheduler with Tadawul-aware cron triggers."""
    global _scheduler

    if not settings.SCHEDULER_ENABLED:
        logger.info("Scheduler disabled (SCHEDULER_ENABLED=false)")
        return

    _scheduler = AsyncIOScheduler()

    # Tadawul trading days: Sunday to Thursday
    # Market close: 15:00 AST = 12:00 UTC
    # Fetch at 12:30 UTC (30 min after close for data settlement)
    # Stats + pivots at 12:35 UTC (5 min after fetch)
    #
    # APScheduler day_of_week: mon=0 ... sun=6
    # Tadawul days: sun(6), mon(0), tue(1), wed(2), thu(3)
    tadawul_days = "sun,mon,tue,wed,thu"

    # Job 1: Price fetch — 12:30 UTC Sun-Thu
    _scheduler.add_job(
        _run_price_fetch,
        trigger=CronTrigger(
            hour=12,
            minute=30,
            day_of_week=tadawul_days,
            timezone="UTC",
        ),
        id="price_fetch",
        name="Fetch daily OHLCV prices from yfinance",
        replace_existing=True,
    )

    # Job 2: Stats + Pivots — 12:35 UTC Sun-Thu (after prices arrive)
    _scheduler.add_job(
        _run_stats_and_pivots,
        trigger=CronTrigger(
            hour=12,
            minute=35,
            day_of_week=tadawul_days,
            timezone="UTC",
        ),
        id="stats_and_pivots",
        name="Compute stock stats and pivot levels",
        replace_existing=True,
    )

    # Job 3: News + Sentiment — every 30 minutes, all days (news publishes on weekends too)
    _scheduler.add_job(
        _run_news_pipeline,
        trigger=IntervalTrigger(minutes=30),
        id="news_and_sentiment",
        name="Fetch news and run MARBERT sentiment analysis",
        replace_existing=True,
    )

    # Job 4: Risk + Monte Carlo — 12:40 UTC Sun-Thu (5 min after stats+pivots)
    _scheduler.add_job(
        _run_risk_pipeline,
        trigger=CronTrigger(
            hour=12,
            minute=40,
            day_of_week=tadawul_days,
            timezone="UTC",
        ),
        id="risk_and_monte_carlo",
        name="Compute risk metrics and Monte Carlo simulation",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("Scheduler started with %d jobs", len(_scheduler.get_jobs()))

    for job in _scheduler.get_jobs():
        logger.info("  Job: %s — next run: %s", job.name, job.next_run_time)


def shutdown_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    global _scheduler

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down")
        _scheduler = None


def get_scheduler() -> AsyncIOScheduler | None:
    """Get the scheduler instance (for status/admin endpoints)."""
    return _scheduler
