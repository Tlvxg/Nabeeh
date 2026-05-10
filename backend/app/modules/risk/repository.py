"""Database operations for the risk module (pre-computed metrics and Monte Carlo results)."""

from datetime import datetime, timezone

from app.database import get_supabase, get_supabase_service


async def upsert_risk_metrics(stock_id: int, data: dict) -> None:
    """
    Insert risk metrics and keep the 2 most recent rows per stock for history comparison.

    Uses service role client to bypass RLS for writes.

    Args:
        stock_id: Foreign key to stocks table.
        data: Flat dict with risk metric fields (VaR, vol, scores, etc.).
    """
    client = get_supabase_service()

    row = {
        "stock_id": stock_id,
        "overall_score": str(data.get("overall_score", 0)),
        "quantitative_score": str(data.get("quantitative_score", 0)),
        "sentiment_score": str(data.get("sentiment_score", 50)),
        "quantitative_weight": str(data.get("quantitative_weight", 0.75)),
        "sentiment_weight": str(data.get("sentiment_weight", 0.25)),
        "interpretation_ar": data.get("interpretation_ar"),
        "var_95_hist": str(data["var_95_hist"]) if data.get("var_95_hist") is not None else None,
        "var_99_hist": str(data["var_99_hist"]) if data.get("var_99_hist") is not None else None,
        "cvar_95": str(data["cvar_95"]) if data.get("cvar_95") is not None else None,
        "vol_30d": str(data["vol_30d"]) if data.get("vol_30d") is not None else None,
        "vol_252d": str(data["vol_252d"]) if data.get("vol_252d") is not None else None,
        "ewma_vol": str(data["ewma_vol"]) if data.get("ewma_vol") is not None else None,
        "max_drawdown": str(data["max_drawdown"]) if data.get("max_drawdown") is not None else None,
        "sharpe_ratio": str(data["sharpe_ratio"]) if data.get("sharpe_ratio") is not None else None,
        "sortino_ratio": str(data["sortino_ratio"]) if data.get("sortino_ratio") is not None else None,
        "beta": str(data["beta"]) if data.get("beta") is not None else None,
        "lookback_days": data.get("lookback_days"),
        "sr_break_detected": data.get("sr_break_detected", False),
        "sr_break_level": data.get("sr_break_level"),
        "trigger": data.get("trigger", "scheduled"),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }

    client.table("risk_metrics").insert(row).execute()

    # Keep only the 2 most recent rows per stock for history comparison
    history = (
        client.table("risk_metrics")
        .select("id, computed_at")
        .eq("stock_id", stock_id)
        .order("computed_at", desc=True)
        .execute()
    )
    if history.data and len(history.data) > 2:
        old_ids = [r["id"] for r in history.data[2:]]
        client.table("risk_metrics").delete().in_("id", old_ids).execute()


async def upsert_monte_carlo(stock_id: int, data: dict) -> None:
    """
    Upsert Monte Carlo simulation results into the monte_carlo_results table.

    Uses service role client to bypass RLS for writes.
    ON CONFLICT (stock_id) keeps only the latest result per stock.

    Args:
        stock_id: Foreign key to stocks table.
        data: Dict with percentiles JSONB, MC VaR values, and simulation params.
    """
    client = get_supabase_service()

    row = {
        "stock_id": stock_id,
        "percentiles": data["percentiles"],
        "mc_var_95": str(data["mc_var_95"]),
        "mc_var_99": str(data["mc_var_99"]),
        "mc_cvar_95": str(data["mc_cvar_95"]),
        "days": data.get("days", 252),
        "paths": data.get("paths", 10000),
        "annual_volatility": str(data["annual_volatility"]) if data.get("annual_volatility") is not None else None,
        "daily_drift": str(data["daily_drift"]) if data.get("daily_drift") is not None else None,
        "data_points_used": data.get("data_points_used"),
        "elapsed_ms": str(data["elapsed_ms"]) if data.get("elapsed_ms") is not None else None,
        "trigger": data.get("trigger", "scheduled"),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }

    client.table("monte_carlo_results").upsert(row, on_conflict="stock_id").execute()


async def get_latest_risk_metrics(stock_id: int) -> dict | None:
    """
    Read the latest risk_metrics row for a stock.

    Uses anon client for public read access.

    Args:
        stock_id: Foreign key to stocks table.

    Returns:
        Dictionary with all risk metric columns, or None if no data.
    """
    client = get_supabase()
    result = (
        client.table("risk_metrics")
        .select("*")
        .eq("stock_id", stock_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


async def get_latest_monte_carlo(stock_id: int) -> dict | None:
    """
    Read the latest monte_carlo_results row for a stock.

    Uses anon client for public read access.

    Args:
        stock_id: Foreign key to stocks table.

    Returns:
        Dictionary with MC results including percentiles JSONB, or None if no data.
    """
    client = get_supabase()
    result = (
        client.table("monte_carlo_results")
        .select("*")
        .eq("stock_id", stock_id)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None
