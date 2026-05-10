"""API endpoints for the risk module."""

from fastapi import APIRouter

from app.modules.risk import service
from app.modules.risk.schemas import (
    RiskSummaryResponse,
    VaRResponse,
    VolatilityResponse,
    DrawdownResponse,
    RatiosResponse,
    GARCHResponse,
    BetaResponse,
    MonteCarloRequest,
    MonteCarloResponse,
)

router = APIRouter()


# Manual trigger endpoint — MUST be before /{symbol}/... routes to avoid path conflict
@router.post("/cron/trigger")
async def trigger_risk_pipeline():
    """Manually trigger the full risk + Monte Carlo pipeline for all active stocks.

    Runs the same computation as the scheduled cron job:
    - All risk metrics (VaR, volatility, drawdown, ratios, beta)
    - Monte Carlo simulation (10,000 paths, 252 days)
    - S/R break detection
    - Composite risk score
    - Stores results in risk_metrics and monte_carlo_results tables
    """
    import logging
    from app.tasks.compute_risk import run_risk_pipeline
    from app.modules.prices import repository

    logger = logging.getLogger(__name__)
    stocks = await repository.get_active_stocks()
    if not stocks:
        return {"status": "skipped", "message": "No active stocks found"}

    results = {}
    for stock in stocks:
        symbol = stock["symbol"]
        try:
            result = await run_risk_pipeline(symbol, trigger="manual")
            results[symbol] = {"status": "completed", **result}
        except Exception as e:
            logger.exception("Risk pipeline failed for %s", symbol)
            results[symbol] = {"status": "failed", "error": str(e)}

    return {
        "status": "completed",
        "results": results,
    }


@router.get("/{symbol}/summary", response_model=RiskSummaryResponse)
async def get_risk_summary(symbol: str):
    """Get all risk metrics for a stock in one call."""
    return await service.get_risk_metrics(symbol)


@router.get("/{symbol}/var", response_model=VaRResponse)
async def get_var(symbol: str):
    """Get Value at Risk and Conditional VaR metrics."""
    return await service.get_var_metrics(symbol)


@router.get("/{symbol}/volatility", response_model=VolatilityResponse)
async def get_volatility(symbol: str):
    """Get volatility metrics (30d, 90d, 252d, EWMA)."""
    return await service.get_volatility_metrics(symbol)


@router.get("/{symbol}/drawdown", response_model=DrawdownResponse)
async def get_drawdown(symbol: str):
    """Get maximum drawdown with peak/trough dates."""
    return await service.get_drawdown_metrics(symbol)


@router.get("/{symbol}/ratios", response_model=RatiosResponse)
async def get_ratios(symbol: str):
    """Get Sharpe and Sortino ratios."""
    return await service.get_ratio_metrics(symbol)


@router.get("/{symbol}/garch", response_model=GARCHResponse)
async def get_garch(symbol: str):
    """Get GARCH(1,1) 5-day volatility forecast."""
    return await service.get_garch_forecast(symbol)


@router.get("/{symbol}/beta", response_model=BetaResponse)
async def get_beta(symbol: str):
    """Get Beta coefficient vs TASI index."""
    return await service.get_beta_metrics(symbol)


@router.post("/{symbol}/monte-carlo", response_model=MonteCarloResponse)
async def run_monte_carlo(symbol: str, body: MonteCarloRequest = MonteCarloRequest()):
    """Run Monte Carlo simulation with configurable horizon and paths.

    POST body (optional):
    - days: simulation horizon in trading days (default 252, max 504)
    - paths: number of simulation paths (default 10000, max 100000)
    """
    return await service.run_monte_carlo(symbol, days=body.days, paths=body.paths)
