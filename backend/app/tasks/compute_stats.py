"""Task: Compute stock statistics (mu, sigma, annual return, volatility) from daily prices."""

import asyncio
import logging
import math
from datetime import datetime, timezone

import numpy as np

from app.modules.prices import repository

logger = logging.getLogger(__name__)


async def compute_stock_stats(symbol: str = "2222") -> dict:
    """
    Compute statistics from daily price data and store in stock_stats table.

    Calculates:
    - daily_return_mean (mu): Average daily log return
    - daily_return_std (sigma): Standard deviation of daily log returns
    - annual_return: Annualized return (mu * 252)
    - annual_volatility: Annualized volatility (sigma * sqrt(252))

    Args:
        symbol: Tadawul stock symbol

    Returns:
        Dictionary of computed statistics
    """
    logger.info("Computing stats for %s...", symbol)

    # Get stock record
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Stock {symbol} not found in database")

    stock_id = stock["id"]

    # Get daily prices (up to 252 trading days = ~1 year)
    prices_data = await repository.get_daily_prices(stock_id, limit=252)

    if len(prices_data) < 10:
        raise ValueError(
            f"Insufficient data for {symbol}: need at least 10 days, got {len(prices_data)}"
        )

    # Extract closing prices as numpy array
    close_prices = np.array(
        [float(p["close_price"]) for p in prices_data], dtype=np.float64
    )

    # Calculate daily log returns
    log_returns = np.diff(np.log(close_prices))

    # Basic statistics
    mu = float(np.mean(log_returns))  # daily return mean
    sigma = float(np.std(log_returns, ddof=1))  # daily return std (sample)

    # Annualized (252 trading days)
    trading_days = 252
    annual_return = mu * trading_days
    annual_volatility = sigma * math.sqrt(trading_days)

    stats = {
        "daily_return_mean": round(mu, 8),
        "daily_return_std": round(sigma, 8),
        "annual_return": round(annual_return, 6),
        "annual_volatility": round(annual_volatility, 6),
        "lookback_days": len(close_prices),
    }

    # Compute 52-week high/low from daily_prices
    try:
        range_52w = await repository.get_52_week_range(stock_id)
        if range_52w:
            stats["week_52_high"] = float(range_52w["week_52_high"])
            stats["week_52_low"] = float(range_52w["week_52_low"])
            logger.info(
                "52-week range for %s: high=%.4f low=%.4f",
                symbol,
                stats["week_52_high"],
                stats["week_52_low"],
            )
    except Exception as e:
        logger.warning("52-week range computation failed for %s: %s", symbol, e)

    logger.info(
        "Stats for %s: mu=%.8f sigma=%.8f annual_ret=%.4f%% annual_vol=%.4f%% lookback=%d",
        symbol,
        stats["daily_return_mean"],
        stats["daily_return_std"],
        stats["annual_return"] * 100,
        stats["annual_volatility"] * 100,
        stats["lookback_days"],
    )

    # Store in database
    await repository.upsert_stock_stats(stock_id, stats)
    logger.info("Stats saved for %s", symbol)

    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    stats = asyncio.run(compute_stock_stats("2222"))
    logger.info("Done. Stats: %s", stats)
