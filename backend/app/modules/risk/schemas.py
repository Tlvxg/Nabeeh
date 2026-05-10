"""Pydantic schemas for the risk module."""

from pydantic import BaseModel, Field


class VaRResponse(BaseModel):
    """Value at Risk response with historical and parametric VaR."""

    symbol: str
    confidence_levels: dict[str, dict]  # {"95": {"historical": float, "parametric": float}, "99": {...}}
    cvar_95: float
    lookback_days: int


class VolatilityResponse(BaseModel):
    """Volatility metrics response."""

    symbol: str
    vol_30d: float
    vol_90d: float
    vol_252d: float
    ewma_vol: float  # lambda=0.94, annualized
    lookback_days: int


class DrawdownResponse(BaseModel):
    """Maximum drawdown response with peak/trough dates."""

    symbol: str
    max_drawdown: float  # negative percentage
    peak_date: str
    trough_date: str
    recovery_date: str | None = None  # null if not yet recovered


class RatiosResponse(BaseModel):
    """Risk-adjusted return ratios response."""

    symbol: str
    sharpe_ratio: float
    sortino_ratio: float
    risk_free_rate: float  # SAMA rate used


class GARCHForecastDay(BaseModel):
    """Single day GARCH volatility forecast."""

    day: int
    vol_annualized: float


class GARCHResponse(BaseModel):
    """GARCH(1,1) volatility forecast response."""

    symbol: str
    converged: bool
    forecast_days: list[GARCHForecastDay]
    params: dict | None  # omega, alpha, beta GARCH params (None if failed)
    fallback_ewma: float | None  # EWMA fallback if GARCH didn't converge


class BetaResponse(BaseModel):
    """Beta vs benchmark index response."""

    symbol: str
    beta: float
    benchmark: str  # "TASI"
    lookback_days: int


class RiskSummaryResponse(BaseModel):
    """Combined risk metrics summary response."""

    symbol: str
    var: VaRResponse
    volatility: VolatilityResponse
    drawdown: DrawdownResponse
    ratios: RatiosResponse
    garch: GARCHResponse | None = None
    beta: BetaResponse | None = None


class MonteCarloRequest(BaseModel):
    """Request body for Monte Carlo simulation."""

    days: int = Field(default=252, ge=1, le=504, description="Simulation horizon in trading days")
    paths: int = Field(default=10000, ge=100, le=100000, description="Number of simulation paths")


class MonteCarloPercentiles(BaseModel):
    """Per-day percentile paths from Monte Carlo simulation."""

    p5: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p95: list[float]


class MonteCarloResponse(BaseModel):
    """Monte Carlo simulation response with percentile paths and VaR metrics."""

    symbol: str
    percentiles: MonteCarloPercentiles
    mc_var_95: float
    mc_var_99: float
    mc_cvar_95: float
    days: int
    paths: int
    elapsed_ms: float
    annual_volatility: float | None = None  # annualized volatility (sigma * sqrt(252))
    daily_drift: float | None = None  # daily mu used in GBM
    data_points_used: int | None = None  # number of historical price days
