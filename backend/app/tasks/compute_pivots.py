"""Task: Compute classic pivot point support/resistance levels from daily OHLCV data (PIPE-04)."""

import asyncio
import logging
from decimal import Decimal, ROUND_HALF_UP

from app.modules.prices import repository

logger = logging.getLogger(__name__)


def _round4(value: Decimal) -> Decimal:
    """Round a Decimal to 4 decimal places."""
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calculate_classic_pivots(high: Decimal, low: Decimal, close: Decimal) -> dict:
    """
    Calculate classic pivot point support/resistance levels.

    Formulas:
        PP = (High + Low + Close) / 3
        R1 = 2*PP - Low,   S1 = 2*PP - High
        R2 = PP + (High - Low),  S2 = PP - (High - Low)
        R3 = High + 2*(PP - Low),  S3 = Low - 2*(High - PP)

    Args:
        high: Day's high price
        low: Day's low price
        close: Day's close price

    Returns:
        Dictionary with pivot_point, r1-r3, s1-s3
    """
    three = Decimal("3")
    two = Decimal("2")

    pp = (high + low + close) / three
    r1 = two * pp - low
    s1 = two * pp - high
    r2 = pp + (high - low)
    s2 = pp - (high - low)
    r3 = high + two * (pp - low)
    s3 = low - two * (high - pp)

    return {
        "pivot_point": _round4(pp),
        "r1": _round4(r1),
        "r2": _round4(r2),
        "r3": _round4(r3),
        "s1": _round4(s1),
        "s2": _round4(s2),
        "s3": _round4(s3),
    }


async def compute_pivot_levels(symbol: str = "2222") -> dict | None:
    """
    Compute classic pivot points from the most recent daily price and store in pivot_levels.

    Steps:
        1. Fetch latest daily_prices row for the stock
        2. Extract high, low, close
        3. Calculate PP, R1-R3, S1-S3 using classic formulas
        4. Upsert into pivot_levels with trade_date = price row's date

    Args:
        symbol: Tadawul stock symbol (default: Aramco 2222)

    Returns:
        Dictionary of computed pivot levels, or None if no price data available
    """
    logger.info("Computing pivot levels for %s...", symbol)

    # Get stock record
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Stock {symbol} not found in database")

    stock_id = stock["id"]

    # Get the most recent daily price
    latest_prices = await repository.get_latest_two_prices(stock_id)
    if not latest_prices:
        logger.warning("No daily prices found for %s — skipping pivot calculation", symbol)
        return None

    latest = latest_prices[0]  # Most recent (descending order)
    trade_date = latest["trade_date"]
    high = Decimal(str(latest["high_price"]))
    low = Decimal(str(latest["low_price"]))
    close = Decimal(str(latest["close_price"]))

    logger.info(
        "Source data for %s on %s: H=%s L=%s C=%s",
        symbol, trade_date, high, low, close,
    )

    # Calculate pivot points
    pivots = calculate_classic_pivots(high, low, close)

    logger.info(
        "Pivot levels for %s: PP=%s R1=%s R2=%s R3=%s S1=%s S2=%s S3=%s",
        symbol,
        pivots["pivot_point"],
        pivots["r1"], pivots["r2"], pivots["r3"],
        pivots["s1"], pivots["s2"], pivots["s3"],
    )

    # Upsert into database
    row = {
        "stock_id": stock_id,
        "trade_date": trade_date,
        "pivot_point": str(pivots["pivot_point"]),
        "r1": str(pivots["r1"]),
        "r2": str(pivots["r2"]),
        "r3": str(pivots["r3"]),
        "s1": str(pivots["s1"]),
        "s2": str(pivots["s2"]),
        "s3": str(pivots["s3"]),
        "source_high": str(high),
        "source_low": str(low),
        "source_close": str(close),
    }

    await repository.upsert_pivot_levels(row)
    logger.info("Pivot levels saved for %s on %s", symbol, trade_date)

    return {
        "trade_date": trade_date,
        "source_high": float(high),
        "source_low": float(low),
        "source_close": float(close),
        **{k: float(v) for k, v in pivots.items()},
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(compute_pivot_levels("2222"))
    print(f"Done. Pivots: {result}")
