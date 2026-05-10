"""Business logic for the risk module — pure computation functions using numpy."""

import asyncio
import math

import numpy as np
import yfinance as yf

from app.modules.prices import repository
from app.core.exceptions import StockNotFoundError
from app.modules.risk.schemas import (
    VaRResponse,
    VolatilityResponse,
    DrawdownResponse,
    RatiosResponse,
    RiskSummaryResponse,
    MonteCarloPercentiles,
    MonteCarloResponse,
    GARCHForecastDay,
    GARCHResponse,
    BetaResponse,
)

# Hardcoded z-scores to avoid scipy dependency
Z_SCORES = {
    0.95: 1.6449,
    0.99: 2.3263,
}

# SAMA repo rate (approximate Saudi risk-free rate)
RISK_FREE_RATE = 0.05

# Trading days per year
TRADING_DAYS = 252


def calculate_var(returns: np.ndarray, confidence: float) -> float:
    """
    Historical Value at Risk.

    VaR at given confidence level is the (1-confidence) percentile of returns.
    A negative value means expected daily loss at that confidence level.

    Args:
        returns: Array of daily log returns.
        confidence: Confidence level (e.g. 0.95 or 0.99).

    Returns:
        VaR as a float (typically negative).
    """
    percentile = (1 - confidence) * 100
    return round(float(np.percentile(returns, percentile)), 6)


def calculate_parametric_var(mu: float, sigma: float, confidence: float) -> float:
    """
    Parametric (Gaussian) Value at Risk.

    Assumes returns are normally distributed.
    VaR = mu - z_score * sigma

    Args:
        mu: Mean daily return.
        sigma: Standard deviation of daily returns.
        confidence: Confidence level (0.95 or 0.99).

    Returns:
        Parametric VaR as a float (typically negative).
    """
    z = Z_SCORES.get(confidence, 1.6449)
    return round(mu - z * sigma, 6)


def calculate_cvar(returns: np.ndarray, confidence: float) -> float:
    """
    Conditional Value at Risk (Expected Shortfall).

    Average of all returns that fall below the VaR threshold.
    CVaR is always more negative than VaR.

    Args:
        returns: Array of daily log returns.
        confidence: Confidence level (e.g. 0.95).

    Returns:
        CVaR as a float (more negative than VaR).
    """
    var = calculate_var(returns, confidence)
    tail_returns = returns[returns <= var]
    if len(tail_returns) == 0:
        return var
    return round(float(np.mean(tail_returns)), 6)


def calculate_volatility(returns: np.ndarray, window: int) -> float:
    """
    Annualized historical volatility over a given window.

    Uses sample standard deviation (ddof=1), annualized by sqrt(252).

    Args:
        returns: Array of daily log returns.
        window: Number of most recent days to use.

    Returns:
        Annualized volatility as a float.
    """
    subset = returns[-window:] if len(returns) >= window else returns
    daily_vol = float(np.std(subset, ddof=1))
    return round(daily_vol * math.sqrt(TRADING_DAYS), 6)


def calculate_ewma_vol(returns: np.ndarray, lambda_: float = 0.94) -> float:
    """
    Exponentially Weighted Moving Average volatility (RiskMetrics model).

    Recursive: variance_t = lambda * variance_{t-1} + (1 - lambda) * r_t^2
    Annualized by sqrt(252).

    Args:
        returns: Array of daily log returns.
        lambda_: Decay factor (default 0.94, RiskMetrics standard).

    Returns:
        Annualized EWMA volatility as a float.
    """
    # Initialize with sample variance
    variance = float(np.var(returns, ddof=1))

    for r in returns:
        variance = lambda_ * variance + (1 - lambda_) * (float(r) ** 2)

    ewma_daily = math.sqrt(variance)
    return round(ewma_daily * math.sqrt(TRADING_DAYS), 6)


def calculate_max_drawdown(prices: np.ndarray, dates: list[str]) -> dict:
    """
    Maximum drawdown from peak to trough.

    Tracks running maximum and finds the deepest percentage decline.

    Args:
        prices: Array of closing prices (chronological order).
        dates: List of date strings corresponding to prices.

    Returns:
        Dict with max_drawdown (negative %), peak_date, trough_date, recovery_date.
    """
    running_max = np.maximum.accumulate(prices)
    drawdowns = (prices - running_max) / running_max

    trough_idx = int(np.argmin(drawdowns))
    peak_idx = int(np.argmax(prices[:trough_idx + 1])) if trough_idx > 0 else 0

    max_dd = round(float(drawdowns[trough_idx]), 6)

    # Find recovery date (first time price returns to peak level after trough)
    recovery_date = None
    peak_price = prices[peak_idx]
    for i in range(trough_idx + 1, len(prices)):
        if prices[i] >= peak_price:
            recovery_date = dates[i]
            break

    return {
        "max_drawdown": max_dd,
        "peak_date": dates[peak_idx],
        "trough_date": dates[trough_idx],
        "recovery_date": recovery_date,
    }


def calculate_sharpe(returns: np.ndarray, risk_free: float = RISK_FREE_RATE) -> float:
    """
    Sharpe Ratio: (annualized return - risk-free rate) / annualized volatility.

    Args:
        returns: Array of daily log returns.
        risk_free: Annual risk-free rate (default SAMA rate ~5%).

    Returns:
        Sharpe ratio as a float.
    """
    mu = float(np.mean(returns))
    sigma = float(np.std(returns, ddof=1))

    if sigma == 0:
        return 0.0

    annualized_return = mu * TRADING_DAYS
    annualized_vol = sigma * math.sqrt(TRADING_DAYS)

    return round((annualized_return - risk_free) / annualized_vol, 6)


def calculate_sortino(returns: np.ndarray, risk_free: float = RISK_FREE_RATE) -> float:
    """
    Sortino Ratio: (annualized return - risk-free rate) / downside deviation.

    Uses only negative returns for the denominator (downside risk).

    Args:
        returns: Array of daily log returns.
        risk_free: Annual risk-free rate (default SAMA rate ~5%).

    Returns:
        Sortino ratio as a float.
    """
    mu = float(np.mean(returns))
    annualized_return = mu * TRADING_DAYS

    # Daily risk-free rate for threshold
    daily_rf = risk_free / TRADING_DAYS

    # Downside returns (below daily risk-free rate)
    downside = returns[returns < daily_rf]

    if len(downside) == 0:
        return 0.0

    downside_std = float(np.std(downside, ddof=1))
    if downside_std == 0:
        return 0.0

    annualized_downside = downside_std * math.sqrt(TRADING_DAYS)

    return round((annualized_return - risk_free) / annualized_downside, 6)


def calculate_garch_forecast(returns: np.ndarray, horizon: int = 5) -> dict:
    """
    GARCH(1,1) volatility forecast.

    Fits a GARCH(1,1) model and forecasts conditional volatility for
    the next `horizon` days. Returns annualized forecast volatilities.

    If GARCH fails to converge (common for low-volatility stocks like
    Aramco ~15% annual vol), falls back to EWMA volatility estimate.

    Args:
        returns: Array of daily log returns.
        horizon: Number of days to forecast (default 5).

    Returns:
        Dict with forecast_days, converged flag, params, and fallback_ewma.
    """
    # Fallback EWMA value in case GARCH fails
    ewma_fallback = calculate_ewma_vol(returns)

    try:
        from arch import arch_model

        # Scale returns to percentage for numerical stability
        returns_pct = returns * 100

        model = arch_model(
            returns_pct,
            vol="Garch",
            p=1,
            q=1,
            mean="Constant",
            dist="normal",
        )
        result = model.fit(disp="off", show_warning=False)

        # Extract GARCH parameters
        params = {
            "omega": round(float(result.params.get("omega", 0)), 8),
            "alpha": round(float(result.params.get("alpha[1]", 0)), 6),
            "beta": round(float(result.params.get("beta[1]", 0)), 6),
        }

        # Forecast horizon days ahead
        forecast = result.forecast(horizon=horizon)
        # forecast.variance gives conditional variance (in pct^2 units)
        variance_forecast = forecast.variance.values[-1]  # last row = forecast from end

        forecast_days = []
        for day_idx in range(horizon):
            # Convert from pct^2 back to decimal variance, then annualize
            daily_var_decimal = variance_forecast[day_idx] / (100 ** 2)
            daily_vol = math.sqrt(daily_var_decimal)
            vol_annualized = round(daily_vol * math.sqrt(TRADING_DAYS), 6)
            forecast_days.append(
                GARCHForecastDay(day=day_idx + 1, vol_annualized=vol_annualized)
            )

        return {
            "converged": True,
            "forecast_days": forecast_days,
            "params": params,
            "fallback_ewma": None,
        }

    except Exception:
        # GARCH failed to converge or other error — return EWMA fallback
        forecast_days = [
            GARCHForecastDay(day=i + 1, vol_annualized=ewma_fallback)
            for i in range(horizon)
        ]
        return {
            "converged": False,
            "forecast_days": forecast_days,
            "params": None,
            "fallback_ewma": ewma_fallback,
        }


def calculate_beta(stock_returns: np.ndarray, market_returns: np.ndarray) -> float:
    """
    Beta: covariance(stock, market) / variance(market).

    Measures systematic risk relative to the market benchmark (TASI).

    Args:
        stock_returns: Array of daily log returns for the stock.
        market_returns: Array of daily log returns for the market index.

    Returns:
        Beta coefficient as a float.
    """
    if len(stock_returns) < 2 or len(market_returns) < 2:
        return 1.0  # Default beta if insufficient data

    cov_matrix = np.cov(stock_returns, market_returns)
    market_var = cov_matrix[1, 1]

    if market_var == 0:
        return 1.0

    beta = cov_matrix[0, 1] / market_var
    return round(float(beta), 6)


async def fetch_tasi_returns(period: str = "1y") -> tuple[np.ndarray, list[str]]:
    """
    Fetch TASI index data from yfinance and compute log returns.

    Uses ^TASI.SR ticker for the Tadawul All Share Index.

    Args:
        period: yfinance period string (default "1y").

    Returns:
        Tuple of (log_returns array, list of date strings).
    """
    ticker = yf.Ticker("^TASI.SR")
    hist = await asyncio.to_thread(
        lambda: ticker.history(period=period)
    )

    if hist.empty:
        raise ValueError("No TASI index data available from yfinance")

    close_prices = hist["Close"].values.astype(np.float64)
    dates = [str(idx.date()) for idx in hist.index]

    log_returns = np.diff(np.log(close_prices))
    # dates for returns start from second entry
    return_dates = dates[1:]

    return log_returns, return_dates


async def get_risk_metrics(symbol: str) -> RiskSummaryResponse:
    """
    Orchestrator: fetch price data and compute all risk metrics.

    Reuses prices.repository for DB access. Computes log returns
    from closing prices and calls all calculation functions.

    Args:
        symbol: Tadawul stock symbol (e.g. "2222").

    Returns:
        RiskSummaryResponse with all risk metrics.
    """
    # 1. Get stock from repository
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise StockNotFoundError(symbol)

    stock_id = stock["id"]

    # 2. Get daily prices (up to 252 trading days)
    prices_data = await repository.get_daily_prices(stock_id, limit=252)

    if len(prices_data) < 10:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient price data for {symbol}: need at least 10 days, got {len(prices_data)}",
        )

    # Extract closing prices and dates as numpy arrays
    close_prices = np.array(
        [float(p["close_price"]) for p in prices_data], dtype=np.float64
    )
    dates = [p["trade_date"] for p in prices_data]

    # 3. Compute log returns
    log_returns = np.diff(np.log(close_prices))
    mu = float(np.mean(log_returns))
    sigma = float(np.std(log_returns, ddof=1))

    lookback_days = len(close_prices)

    # 4. Compute all risk metrics

    # VaR
    hist_var_95 = calculate_var(log_returns, 0.95)
    hist_var_99 = calculate_var(log_returns, 0.99)
    param_var_95 = calculate_parametric_var(mu, sigma, 0.95)
    param_var_99 = calculate_parametric_var(mu, sigma, 0.99)
    cvar_95 = calculate_cvar(log_returns, 0.95)

    var_response = VaRResponse(
        symbol=symbol,
        confidence_levels={
            "95": {"historical": hist_var_95, "parametric": param_var_95},
            "99": {"historical": hist_var_99, "parametric": param_var_99},
        },
        cvar_95=cvar_95,
        lookback_days=lookback_days,
    )

    # Volatility
    vol_30d = calculate_volatility(log_returns, 30)
    vol_90d = calculate_volatility(log_returns, 90)
    vol_252d = calculate_volatility(log_returns, 252)
    ewma_vol = calculate_ewma_vol(log_returns)

    vol_response = VolatilityResponse(
        symbol=symbol,
        vol_30d=vol_30d,
        vol_90d=vol_90d,
        vol_252d=vol_252d,
        ewma_vol=ewma_vol,
        lookback_days=lookback_days,
    )

    # Drawdown
    dd = calculate_max_drawdown(close_prices, dates)

    dd_response = DrawdownResponse(
        symbol=symbol,
        max_drawdown=dd["max_drawdown"],
        peak_date=dd["peak_date"],
        trough_date=dd["trough_date"],
        recovery_date=dd["recovery_date"],
    )

    # Ratios
    sharpe = calculate_sharpe(log_returns)
    sortino = calculate_sortino(log_returns)

    ratios_response = RatiosResponse(
        symbol=symbol,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        risk_free_rate=RISK_FREE_RATE,
    )

    # GARCH forecast (non-blocking, gracefully degrades)
    garch_result = calculate_garch_forecast(log_returns, horizon=5)
    garch_response = GARCHResponse(
        symbol=symbol,
        converged=garch_result["converged"],
        forecast_days=garch_result["forecast_days"],
        params=garch_result["params"],
        fallback_ewma=garch_result["fallback_ewma"],
    )

    # Beta vs TASI (best-effort, None if TASI data unavailable)
    beta_response = None
    try:
        tasi_returns, tasi_dates = await fetch_tasi_returns(period="1y")
        stock_return_dates = dates[1:]  # returns dates start at second entry
        stock_map = dict(zip(stock_return_dates, log_returns))
        tasi_map = dict(zip(tasi_dates, tasi_returns))
        common_dates = sorted(set(stock_return_dates) & set(tasi_dates))

        if len(common_dates) >= 20:
            aligned_stock = np.array([stock_map[d] for d in common_dates])
            aligned_tasi = np.array([tasi_map[d] for d in common_dates])
            beta = calculate_beta(aligned_stock, aligned_tasi)
            beta_response = BetaResponse(
                symbol=symbol,
                beta=beta,
                benchmark="TASI",
                lookback_days=len(common_dates),
            )
    except Exception:
        pass  # Beta is best-effort in summary

    # 5. Assemble and return
    return RiskSummaryResponse(
        symbol=symbol,
        var=var_response,
        volatility=vol_response,
        drawdown=dd_response,
        ratios=ratios_response,
        garch=garch_response,
        beta=beta_response,
    )


async def get_var_metrics(symbol: str) -> VaRResponse:
    """Get VaR and CVaR metrics only."""
    summary = await get_risk_metrics(symbol)
    return summary.var


async def get_volatility_metrics(symbol: str) -> VolatilityResponse:
    """Get volatility metrics only."""
    summary = await get_risk_metrics(symbol)
    return summary.volatility


async def get_drawdown_metrics(symbol: str) -> DrawdownResponse:
    """Get maximum drawdown metrics only."""
    summary = await get_risk_metrics(symbol)
    return summary.drawdown


async def get_ratio_metrics(symbol: str) -> RatiosResponse:
    """Get Sharpe/Sortino ratio metrics only."""
    summary = await get_risk_metrics(symbol)
    return summary.ratios


async def get_garch_forecast(symbol: str, horizon: int = 5) -> GARCHResponse:
    """
    Get GARCH(1,1) volatility forecast for a stock.

    Fetches price data, computes log returns, fits GARCH model,
    and returns annualized volatility forecasts for each day.

    Args:
        symbol: Tadawul stock symbol (e.g. "2222").
        horizon: Number of days to forecast (default 5).

    Returns:
        GARCHResponse with forecast days and convergence info.
    """
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise StockNotFoundError(symbol)

    prices_data = await repository.get_daily_prices(stock["id"], limit=252)

    if len(prices_data) < 30:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient data for GARCH: need 30+ days, got {len(prices_data)}",
        )

    close_prices = np.array(
        [float(p["close_price"]) for p in prices_data], dtype=np.float64
    )
    log_returns = np.diff(np.log(close_prices))

    garch_result = calculate_garch_forecast(log_returns, horizon=horizon)

    return GARCHResponse(
        symbol=symbol,
        converged=garch_result["converged"],
        forecast_days=garch_result["forecast_days"],
        params=garch_result["params"],
        fallback_ewma=garch_result["fallback_ewma"],
    )


async def get_beta_metrics(symbol: str) -> BetaResponse:
    """
    Get Beta vs TASI index for a stock.

    Fetches stock and TASI data, aligns by date, computes
    covariance-based beta.

    Args:
        symbol: Tadawul stock symbol (e.g. "2222").

    Returns:
        BetaResponse with beta coefficient and benchmark info.
    """
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise StockNotFoundError(symbol)

    # Get stock prices from DB
    prices_data = await repository.get_daily_prices(stock["id"], limit=252)

    if len(prices_data) < 30:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient data for Beta: need 30+ days, got {len(prices_data)}",
        )

    # Build stock returns keyed by date
    close_prices = np.array(
        [float(p["close_price"]) for p in prices_data], dtype=np.float64
    )
    stock_dates = [p["trade_date"] for p in prices_data]
    stock_log_returns = np.diff(np.log(close_prices))
    # Returns dates start at second entry
    stock_return_dates = stock_dates[1:]

    # Fetch TASI returns
    try:
        tasi_returns, tasi_dates = await fetch_tasi_returns(period="1y")
    except Exception:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch TASI index data from yfinance",
        )

    # Align by date (inner join)
    stock_map = dict(zip(stock_return_dates, stock_log_returns))
    tasi_map = dict(zip(tasi_dates, tasi_returns))

    common_dates = sorted(set(stock_return_dates) & set(tasi_dates))

    if len(common_dates) < 20:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient overlapping dates: {len(common_dates)} (need 20+)",
        )

    aligned_stock = np.array([stock_map[d] for d in common_dates])
    aligned_tasi = np.array([tasi_map[d] for d in common_dates])

    beta = calculate_beta(aligned_stock, aligned_tasi)

    # Update beta in stock_stats table
    try:
        from app.database import get_supabase_service
        client = get_supabase_service()
        client.table("stock_stats").update(
            {"beta": str(beta)}
        ).eq("stock_id", stock["id"]).execute()
    except Exception:
        pass  # Non-critical: stock_stats update is best-effort

    return BetaResponse(
        symbol=symbol,
        beta=beta,
        benchmark="TASI",
        lookback_days=len(common_dates),
    )


async def run_monte_carlo(
    symbol: str, days: int = 252, paths: int = 10000
) -> MonteCarloResponse:
    """
    Server-side Monte Carlo simulation using numpy vectorised GBM.

    Fetches current price and historical returns for the stock, then
    generates `paths` price paths over `days` trading days using GBM.
    Returns percentile paths and MC VaR/CVaR.

    Args:
        symbol: Tadawul stock symbol (e.g. "2222").
        days: Number of trading days to simulate (default 252 = 1 year).
        paths: Number of simulation paths (default 10,000).

    Returns:
        MonteCarloResponse with percentile paths and MC VaR.
    """
    import time

    start = time.perf_counter()

    # 1. Get stock and price data
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise StockNotFoundError(symbol)

    stock_id = stock["id"]
    prices_data = await repository.get_daily_prices(stock_id, limit=252)

    if len(prices_data) < 10:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient price data for {symbol}: need at least 10 days, got {len(prices_data)}",
        )

    close_prices = np.array(
        [float(p["close_price"]) for p in prices_data], dtype=np.float64
    )

    # 2. Compute log returns, mu, sigma
    log_returns = np.diff(np.log(close_prices))
    mu = float(np.mean(log_returns))
    sigma = float(np.std(log_returns, ddof=1))

    current_price = float(close_prices[-1])

    # 3. GBM simulation (vectorised)
    # mu and sigma are daily (from daily log returns), so dt = 1 day
    dt = 1.0
    Z = np.random.standard_normal((paths, days))
    drift_val = (mu - 0.5 * sigma**2) * dt
    diffusion_val = sigma * math.sqrt(dt) * Z
    log_increments = drift_val + diffusion_val
    cum_log_returns = np.cumsum(log_increments, axis=1)

    # Prepend column of zeros (day 0 = current price)
    zeros_col = np.zeros((paths, 1))
    cum_log_returns = np.concatenate([zeros_col, cum_log_returns], axis=1)

    price_paths = current_price * np.exp(cum_log_returns)  # shape: (paths, days+1)

    # 4. Per-day percentiles
    p5 = np.percentile(price_paths, 5, axis=0).tolist()
    p25 = np.percentile(price_paths, 25, axis=0).tolist()
    p50 = np.percentile(price_paths, 50, axis=0).tolist()
    p75 = np.percentile(price_paths, 75, axis=0).tolist()
    p95 = np.percentile(price_paths, 95, axis=0).tolist()

    # 5. MC VaR from final-day returns
    final_prices = price_paths[:, -1]
    final_returns = (final_prices - current_price) / current_price

    mc_var_95 = round(float(np.percentile(final_returns, 5)), 6)
    mc_var_99 = round(float(np.percentile(final_returns, 1)), 6)

    # CVaR 95: average of returns at or below VaR 95
    tail = final_returns[final_returns <= mc_var_95]
    mc_cvar_95 = round(float(np.mean(tail)), 6) if len(tail) > 0 else mc_var_95

    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

    # Round percentile arrays to 2 decimal places for reasonable JSON size
    def round_list(lst: list[float]) -> list[float]:
        return [round(v, 2) for v in lst]

    return MonteCarloResponse(
        symbol=symbol,
        percentiles=MonteCarloPercentiles(
            p5=round_list(p5),
            p25=round_list(p25),
            p50=round_list(p50),
            p75=round_list(p75),
            p95=round_list(p95),
        ),
        mc_var_95=mc_var_95,
        mc_var_99=mc_var_99,
        mc_cvar_95=mc_cvar_95,
        days=days,
        paths=paths,
        elapsed_ms=elapsed_ms,
        annual_volatility=round(float(sigma * math.sqrt(TRADING_DAYS)), 6),
        daily_drift=round(float(mu), 8),
        data_points_used=len(close_prices),
    )
