"""Task: Compute risk metrics and Monte Carlo simulation, store in Supabase (PIPE-05, PIPE-06, PIPE-07).

Orchestrates the full risk pipeline:
1. Check for S/R level breaks (PIPE-07)
2. Compute all risk metrics (VaR, volatility, drawdown, ratios, beta)
3. Run Monte Carlo simulation (10,000 paths, 252 days)
4. Compute composite risk score (quantitative + sentiment)
5. Store everything in risk_metrics and monte_carlo_results tables
6. Send email alerts to premium watchlist users (non-blocking)
"""

import logging
from datetime import datetime, timedelta, timezone

from app.database import get_supabase
from app.modules.prices import repository as prices_repo
from app.modules.risk import repository as risk_repo
from app.modules.risk import service as risk_service

logger = logging.getLogger(__name__)


async def check_sr_break(stock_id: int) -> tuple[bool, str | None]:
    """
    Check if today's closing price crossed a pivot S/R level from the previous pivots.

    Compares the two most recent closing prices against the OLDER pivot levels
    (which were the active S/R levels during today's trading session).

    Args:
        stock_id: Foreign key to stocks table.

    Returns:
        Tuple of (break_detected: bool, level_name: str | None).
        level_name is the first broken level (e.g. "r1", "s2", "pivot_point").
    """
    client = get_supabase()

    # Get the 2 most recent pivot_levels records
    pivot_result = (
        client.table("pivot_levels")
        .select("pivot_point,r1,r2,r3,s1,s2,s3,trade_date")
        .eq("stock_id", stock_id)
        .order("trade_date", desc=True)
        .limit(2)
        .execute()
    )

    if not pivot_result.data or len(pivot_result.data) < 2:
        logger.info("S/R break check: fewer than 2 pivot records — skipping")
        return (False, None)

    # The older record has the previous pivot levels (active S/R for today)
    prev_pivots = pivot_result.data[1]

    # Get the 2 most recent daily_prices records
    prices = await prices_repo.get_latest_two_prices(stock_id)

    if not prices or len(prices) < 2:
        logger.info("S/R break check: fewer than 2 price records — skipping")
        return (False, None)

    # prices[0] = most recent (today), prices[1] = second most recent (prev)
    today_close = float(prices[0]["close_price"])
    prev_close = float(prices[1]["close_price"])

    # Check each S/R level for breaks
    level_names = ["pivot_point", "r1", "r2", "r3", "s1", "s2", "s3"]

    for level_name in level_names:
        level_value = float(prev_pivots[level_name])

        # Upward break: prev below level, today at or above
        if prev_close < level_value and today_close >= level_value:
            logger.info(
                "S/R BREAK detected: %s (%.4f) — upward break (prev=%.4f, today=%.4f)",
                level_name, level_value, prev_close, today_close,
            )
            return (True, level_name)

        # Downward break: prev above level, today at or below
        if prev_close > level_value and today_close <= level_value:
            logger.info(
                "S/R BREAK detected: %s (%.4f) — downward break (prev=%.4f, today=%.4f)",
                level_name, level_value, prev_close, today_close,
            )
            return (True, level_name)

    logger.info(
        "S/R break check: no break detected (prev_close=%.4f, today_close=%.4f)",
        prev_close, today_close,
    )
    return (False, None)


def compute_risk_score(
    var_95: float, vol_252d: float, sentiment_avg: float | None
) -> dict:
    """
    Compute a composite risk score on a 0-100 scale.

    Components:
    - VaR component (40% weight): abs(var_95) / 0.05 * 100, capped at 100
    - Volatility component (35% weight): vol_252d / 0.50 * 100, capped at 100
    - Sentiment component (25% weight): maps [-1, 1] to [100, 0]

    When sentiment is unavailable, quantitative components are rescaled to fill 0-100.

    Args:
        var_95: Historical VaR at 95% confidence (negative value = loss).
        vol_252d: Annualized 252-day volatility.
        sentiment_avg: Average sentiment score [-1, 1], or None if unavailable.

    Returns:
        Dict with overall_score, quantitative_score, sentiment_score,
        quantitative_weight, sentiment_weight, interpretation_ar.
    """
    # VaR component: 5% daily loss = score 100
    var_component = min(abs(var_95) / 0.05 * 100, 100)

    # Volatility component: 50% annual vol = score 100
    vol_component = min(vol_252d / 0.50 * 100, 100)

    # Quantitative score: weighted combination of VaR and vol, rescaled to 0-100
    # var_weight=40, vol_weight=35, total=75 — rescale: var*(40/75) + vol*(35/75)
    quantitative_score = var_component * (40 / 75) + vol_component * (35 / 75)

    if sentiment_avg is not None:
        # Map sentiment from [-1, 1] to [100, 0] scale (negative sentiment = high risk)
        sentiment_score = (1 - sentiment_avg) / 2 * 100
        sentiment_score = max(0, min(100, sentiment_score))

        overall_score = quantitative_score * 0.75 + sentiment_score * 0.25
        quant_weight = 0.75
        sent_weight = 0.25
    else:
        sentiment_score = 50.0  # Neutral default
        overall_score = quantitative_score
        quant_weight = 1.0
        sent_weight = 0.0

    overall_score = round(max(0, min(100, overall_score)), 2)
    quantitative_score = round(max(0, min(100, quantitative_score)), 2)
    sentiment_score = round(sentiment_score, 2)

    # Arabic interpretation
    if overall_score <= 33:
        interpretation_ar = "منخفض"
    elif overall_score <= 66:
        interpretation_ar = "متوسط"
    else:
        interpretation_ar = "مرتفع"

    return {
        "overall_score": overall_score,
        "quantitative_score": quantitative_score,
        "sentiment_score": sentiment_score,
        "quantitative_weight": quant_weight,
        "sentiment_weight": sent_weight,
        "interpretation_ar": interpretation_ar,
    }


async def _get_sentiment_average(stock_id: int) -> float | None:
    """
    Get sentiment risk score from articles in the last 14 days.

    Uses the ratio of negative to opinionated (positive + negative) articles
    to produce a meaningful risk signal. Neutral articles are excluded from
    the ratio since they carry no directional signal.

    Returns a value in [-1, 1] range where:
      -1 = all positive (low risk)
       0 = balanced or no opinionated news
      +1 = all negative (high risk)

    Returns None if no sentiment data exists at all.
    """
    client = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()

    result = (
        client.table("sentiment_scores")
        .select("sentiment,confidence")
        .eq("stock_id", stock_id)
        .gte("analyzed_at", cutoff)
        .execute()
    )

    if not result.data:
        return None

    positive_count = 0
    negative_count = 0
    total_count = 0
    neg_confidence_sum = 0.0
    pos_confidence_sum = 0.0

    for row in result.data:
        sentiment = row["sentiment"]
        confidence = float(row["confidence"])
        total_count += 1

        if sentiment == "positive":
            positive_count += 1
            pos_confidence_sum += confidence
        elif sentiment == "negative":
            negative_count += 1
            neg_confidence_sum += confidence

    if total_count == 0:
        return None

    opinionated = positive_count + negative_count

    if opinionated == 0:
        # All neutral — return slight positive (calm market, no alarm)
        return -0.2

    # Negative ratio weighted by confidence: more negative = higher risk
    neg_ratio = neg_confidence_sum / (pos_confidence_sum + neg_confidence_sum)
    # Map [0, 1] to [-1, 1]: 0% negative → -1, 50% → 0, 100% → +1
    return (neg_ratio * 2) - 1


async def run_risk_pipeline(
    symbol: str = "2222", trigger: str = "scheduled"
) -> dict:
    """
    Main risk computation pipeline: compute all metrics, run MC, detect S/R breaks, store results.

    Steps:
    A. Get stock from repository
    B. Check S/R break (if break detected, override trigger)
    C. Compute all risk metrics via risk service
    D. Run Monte Carlo simulation via risk service
    E. Get average sentiment from recent articles
    F. Compute composite risk score
    G. Store risk metrics in risk_metrics table
    H. Store MC results in monte_carlo_results table
    H.5. Send risk alerts to premium watchlist users (non-blocking)
    I. Log summary

    Args:
        symbol: Tadawul stock symbol (default "2222").
        trigger: One of "scheduled", "manual", "sr_break".

    Returns:
        Summary dict with key metrics and trigger info.
    """
    logger.info("Risk pipeline started for %s (trigger=%s)", symbol, trigger)

    try:
        # Step A: Get stock
        stock = await prices_repo.get_stock_by_symbol(symbol)
        if not stock:
            raise ValueError(f"Stock {symbol} not found in database")

        stock_id = stock["id"]

        # Step B: Check S/R break
        sr_break, sr_level = await check_sr_break(stock_id)
        if sr_break:
            trigger = "sr_break"
            logger.info("S/R break detected at %s — trigger overridden to sr_break", sr_level)

        # Step C: Compute all risk metrics
        logger.info("Computing risk metrics for %s...", symbol)
        risk_summary = await risk_service.get_risk_metrics(symbol)

        # Step D: Run Monte Carlo simulation
        logger.info("Running Monte Carlo simulation for %s (10000 paths, 252 days)...", symbol)
        mc_result = await risk_service.run_monte_carlo(symbol, days=252, paths=10000)

        # Step E: Get average sentiment
        sentiment_avg = await _get_sentiment_average(stock_id)
        logger.info("Sentiment average (7d): %s", sentiment_avg)

        # Step F: Compute risk score
        var_95_hist = risk_summary.var.confidence_levels["95"]["historical"]
        vol_252d = risk_summary.volatility.vol_252d

        score_data = compute_risk_score(var_95_hist, vol_252d, sentiment_avg)
        logger.info(
            "Risk score for %s: overall=%.2f quantitative=%.2f sentiment=%.2f (%s)",
            symbol,
            score_data["overall_score"],
            score_data["quantitative_score"],
            score_data["sentiment_score"],
            score_data["interpretation_ar"],
        )

        # Step G: Build and store risk metrics row
        risk_data = {
            **score_data,
            "var_95_hist": var_95_hist,
            "var_99_hist": risk_summary.var.confidence_levels["99"]["historical"],
            "cvar_95": risk_summary.var.cvar_95,
            "vol_30d": risk_summary.volatility.vol_30d,
            "vol_252d": vol_252d,
            "ewma_vol": risk_summary.volatility.ewma_vol,
            "max_drawdown": risk_summary.drawdown.max_drawdown,
            "sharpe_ratio": risk_summary.ratios.sharpe_ratio,
            "sortino_ratio": risk_summary.ratios.sortino_ratio,
            "beta": risk_summary.beta.beta if risk_summary.beta else None,
            "lookback_days": risk_summary.var.lookback_days,
            "sr_break_detected": sr_break,
            "sr_break_level": sr_level,
            "trigger": trigger,
        }

        # Fetch the prior row BEFORE we insert the new one — it becomes
        # the "previous" snapshot for diffing in the AI note + alert gating.
        prev_metrics = await risk_repo.get_latest_risk_metrics(stock_id)

        await risk_repo.upsert_risk_metrics(stock_id, risk_data)
        logger.info("Risk metrics stored in Supabase for %s", symbol)

        # Step G.5: Generate AI risk note (NabeehNotes) — persisted once,
        # consumed by both the email body and the dashboard.
        prev_score = (
            float(prev_metrics["overall_score"]) if prev_metrics and prev_metrics.get("overall_score") is not None else None
        )
        prev_var_95 = (
            float(prev_metrics["var_95_hist"]) if prev_metrics and prev_metrics.get("var_95_hist") is not None else None
        )
        prev_vol_252d = (
            float(prev_metrics["vol_252d"]) if prev_metrics and prev_metrics.get("vol_252d") is not None else None
        )
        prev_sr_break = (
            bool(prev_metrics["sr_break_detected"]) if prev_metrics and prev_metrics.get("sr_break_detected") is not None else None
        )

        sentiment_neg_pct = (
            max(0.0, min(100.0, ((sentiment_avg + 1) / 2) * 100)) if sentiment_avg is not None else 0.0
        )
        price_change_pct: float | None = None
        try:
            recent_prices = await prices_repo.get_latest_two_prices(stock_id)
            if recent_prices and len(recent_prices) >= 2:
                today_close = float(recent_prices[0]["close_price"])
                prev_close = float(recent_prices[1]["close_price"])
                if prev_close != 0:
                    price_change_pct = (today_close - prev_close) / prev_close * 100
        except Exception:
            logger.warning("Could not compute price_change_pct for %s", symbol, exc_info=True)

        from app.modules.notes.fallback import build_fallback_note
        from app.modules.notes.repository import insert_risk_note
        from app.modules.notes.schemas import RiskNoteInput
        from app.modules.notes.service import generate_risk_note

        note_input = RiskNoteInput(
            symbol=symbol,
            name_ar=stock.get("name_ar", symbol),
            overall_score=score_data["overall_score"],
            prev_score=prev_score,
            score_delta=(score_data["overall_score"] - prev_score) if prev_score is not None else None,
            interpretation_ar=score_data["interpretation_ar"],
            var_95_hist=var_95_hist,
            prev_var_95_hist=prev_var_95,
            vol_252d=vol_252d,
            prev_vol_252d=prev_vol_252d,
            sentiment_neg_pct=sentiment_neg_pct,
            price_change_pct=price_change_pct,
            sr_break_detected=sr_break,
            sr_break_level=sr_level,
        )

        risk_note_id: int | None = None
        try:
            note = await generate_risk_note(note_input)
        except Exception:
            logger.warning("AI note generation raised — using local fallback for %s", symbol, exc_info=True)
            note = build_fallback_note(note_input)

        try:
            risk_note_id = await insert_risk_note(stock_id, note, note_input)
        except Exception:
            logger.warning("Failed to persist risk_notes row for %s", symbol, exc_info=True)

        logger.info(
            "Risk note for %s: source=%s model=%s id=%s",
            symbol, note.source, note.model_used, risk_note_id,
        )

        # Step H: Build and store MC results row
        mc_data = {
            "percentiles": {
                "p5": mc_result.percentiles.p5,
                "p25": mc_result.percentiles.p25,
                "p50": mc_result.percentiles.p50,
                "p75": mc_result.percentiles.p75,
                "p95": mc_result.percentiles.p95,
            },
            "mc_var_95": mc_result.mc_var_95,
            "mc_var_99": mc_result.mc_var_99,
            "mc_cvar_95": mc_result.mc_cvar_95,
            "days": mc_result.days,
            "paths": mc_result.paths,
            "annual_volatility": mc_result.annual_volatility,
            "daily_drift": mc_result.daily_drift,
            "data_points_used": mc_result.data_points_used,
            "elapsed_ms": mc_result.elapsed_ms,
            "trigger": trigger,
        }

        await risk_repo.upsert_monte_carlo(stock_id, mc_data)
        logger.info("Monte Carlo results stored in Supabase for %s", symbol)

        # Step H.5: Send risk alerts to watchlist users
        alert_result = None
        try:
            from app.modules.alerts.schemas import RiskAlertData
            from app.modules.alerts.service import send_risk_alert

            alert_data = RiskAlertData(
                symbol=symbol,
                name_ar=stock.get("name_ar", symbol),
                stock_id=stock_id,
                overall_score=score_data["overall_score"],
                interpretation_ar=score_data["interpretation_ar"],
                var_95_hist=var_95_hist,
                vol_252d=vol_252d,
                trigger=trigger,
                sr_break_detected=sr_break,
                sr_break_level=sr_level,
                prev_overall_score=prev_score,
                prev_var_95_hist=prev_var_95,
                prev_vol_252d=prev_vol_252d,
                prev_sr_break_detected=prev_sr_break,
                risk_note_id=risk_note_id,
                headline_ar=note.headline_ar if note else None,
                paragraphs_ar=note.paragraphs_ar if note else [],
                watch_points_ar=note.watch_points_ar if note else [],
                note_source=note.source if note else None,
            )
            alert_result = await send_risk_alert(alert_data)
            logger.info(
                "Risk alerts for %s: sent=%d, failed=%d",
                symbol,
                alert_result.get("sent", 0),
                alert_result.get("failed", 0),
            )
        except Exception:
            logger.warning("Failed to send risk alerts for %s — continuing", symbol, exc_info=True)

        # Step I: Summary
        summary = {
            "symbol": symbol,
            "trigger": trigger,
            "sr_break_detected": sr_break,
            "sr_break_level": sr_level,
            "overall_score": score_data["overall_score"],
            "quantitative_score": score_data["quantitative_score"],
            "sentiment_score": score_data["sentiment_score"],
            "interpretation_ar": score_data["interpretation_ar"],
            "var_95_hist": var_95_hist,
            "vol_252d": vol_252d,
            "mc_var_95": mc_result.mc_var_95,
            "mc_var_99": mc_result.mc_var_99,
            "mc_elapsed_ms": mc_result.elapsed_ms,
            "lookback_days": risk_summary.var.lookback_days,
            "alerts_sent": alert_result.get("sent", 0) if alert_result else 0,
        }

        logger.info(
            "Risk pipeline completed for %s — overall_score=%.2f, var_95=%.6f, vol_252d=%.6f, mc_var_95=%.6f, trigger=%s",
            symbol,
            summary["overall_score"],
            summary["var_95_hist"],
            summary["vol_252d"],
            summary["mc_var_95"],
            summary["trigger"],
        )

        return summary

    except Exception:
        logger.exception("Risk pipeline failed for %s", symbol)
        raise
