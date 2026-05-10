"""Business logic for the prices module."""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

import yfinance as yf

from app.modules.prices.providers.factory import get_data_provider
from app.modules.prices.providers.base import StockPrice, OHLCVRecord
from app.modules.prices import repository
from app.core.exceptions import DataProviderError, StockNotFoundError

# Saudi Arabia timezone (AST = UTC+3)
SAUDI_TZ = ZoneInfo("Asia/Riyadh")

# Tadawul trading hours (Sun-Thu, 10:00-15:00 AST)
MARKET_OPEN_HOUR = 10
MARKET_OPEN_MINUTE = 0
MARKET_CLOSE_HOUR = 15
MARKET_CLOSE_MINUTE = 0

# Tadawul trading days: Sunday=6, Monday=0, Tuesday=1, Wednesday=2, Thursday=3
# Weekend: Friday=4, Saturday=5
TRADING_DAYS = {6, 0, 1, 2, 3}  # Sun, Mon, Tue, Wed, Thu (isoweekday % 7)


@dataclass
class EnrichedStockPrice:
    """Stock price with enriched fields from database."""

    symbol: str
    name_ar: str
    name_en: str
    price: Decimal
    change: Decimal
    change_percent: Decimal
    volume: int
    market_cap: int | None
    currency: str
    last_updated: datetime
    day_high: Decimal | None = None
    day_low: Decimal | None = None
    prev_close: Decimal | None = None
    week_52_high: Decimal | None = None
    week_52_low: Decimal | None = None


@dataclass
class MarketStatus:
    """Saudi stock market status."""

    is_open: bool
    status_ar: str
    next_open: datetime | None = None


@dataclass
class TASIIndex:
    """TASI (Tadawul All Share Index) data."""

    value: Decimal
    change: Decimal
    change_percent: Decimal
    volume: int
    trades: int | None
    day_high: Decimal | None
    day_low: Decimal | None
    prev_close: Decimal | None
    last_updated: datetime


def _to_decimal(value: float, places: int = 4) -> Decimal:
    """Convert float to Decimal with specified precision."""
    return Decimal(str(value)).quantize(
        Decimal(10) ** -places, rounding=ROUND_HALF_UP
    )


def _is_trading_day(dt: datetime) -> bool:
    """Check if a given datetime falls on a Tadawul trading day (Sun-Thu)."""
    # Python weekday(): Mon=0 ... Sun=6
    return dt.weekday() in {6, 0, 1, 2, 3}  # Sun=6, Mon=0, Tue=1, Wed=2, Thu=3


def _next_trading_open(now_saudi: datetime) -> datetime:
    """Calculate the next market open time from the given Saudi time."""
    # Start from tomorrow if we're past close or on a weekend
    candidate = now_saudi.replace(
        hour=MARKET_OPEN_HOUR, minute=MARKET_OPEN_MINUTE, second=0, microsecond=0
    )

    # If it's before market open on a trading day, next open is today
    if _is_trading_day(now_saudi) and now_saudi < candidate:
        return candidate

    # Otherwise, find the next trading day
    candidate += timedelta(days=1)
    while not _is_trading_day(candidate):
        candidate += timedelta(days=1)

    return candidate.replace(
        hour=MARKET_OPEN_HOUR, minute=MARKET_OPEN_MINUTE, second=0, microsecond=0
    )


async def get_market_status() -> MarketStatus:
    """
    Check if the Saudi stock market (Tadawul) is currently open.
    Trading hours: Sun-Thu, 10:00-15:00 AST (UTC+3).
    Weekend: Friday and Saturday.
    """
    now_utc = datetime.now(timezone.utc)
    now_saudi = now_utc.astimezone(SAUDI_TZ)

    is_trading_day = _is_trading_day(now_saudi)

    market_open = now_saudi.replace(
        hour=MARKET_OPEN_HOUR, minute=MARKET_OPEN_MINUTE, second=0, microsecond=0
    )
    market_close = now_saudi.replace(
        hour=MARKET_CLOSE_HOUR, minute=MARKET_CLOSE_MINUTE, second=0, microsecond=0
    )

    is_open = is_trading_day and market_open <= now_saudi < market_close

    if is_open:
        return MarketStatus(
            is_open=True,
            status_ar="السوق مفتوح",
            next_open=None,
        )
    else:
        next_open = _next_trading_open(now_saudi)
        return MarketStatus(
            is_open=False,
            status_ar="السوق مغلق",
            next_open=next_open.astimezone(timezone.utc),
        )


async def get_tasi_index() -> TASIIndex:
    """
    Get TASI (Tadawul All Share Index) data from yfinance.

    Uses ticker.history(period='5d') which reliably returns recent OHLCV data
    for indices. Derives value (last close), change (vs prev close), and volume.
    """
    try:
        ticker = yf.Ticker("^TASI.SR")
        hist = await asyncio.to_thread(lambda: ticker.history(period="5d"))

        if hist.empty:
            raise DataProviderError(
                "yfinance", "No data available for TASI index (^TASI.SR)"
            )

        last_row = hist.iloc[-1]
        value = float(last_row["Close"])
        day_high = float(last_row["High"])
        day_low = float(last_row["Low"])
        volume = int(last_row["Volume"])

        # Get previous close for change calculation
        if len(hist) > 1:
            prev_row = hist.iloc[-2]
            prev_close = float(prev_row["Close"])
        else:
            prev_close = value  # No previous data, change = 0

        change = value - prev_close
        change_percent = (change / prev_close * 100) if prev_close else 0.0

        # Use the index timestamp from the last row
        last_date = hist.index[-1]
        if hasattr(last_date, "to_pydatetime"):
            last_updated = last_date.to_pydatetime()
            if last_updated.tzinfo is None:
                last_updated = last_updated.replace(tzinfo=timezone.utc)
        else:
            last_updated = datetime.now(timezone.utc)

        return TASIIndex(
            value=_to_decimal(value, 2),
            change=_to_decimal(change, 2),
            change_percent=_to_decimal(change_percent, 2),
            volume=volume,
            trades=None,  # yfinance doesn't provide trade count for indices
            day_high=_to_decimal(day_high, 2),
            day_low=_to_decimal(day_low, 2),
            prev_close=_to_decimal(prev_close, 2),
            last_updated=last_updated,
        )

    except DataProviderError:
        raise
    except Exception as e:
        raise DataProviderError("yfinance", f"Failed to fetch TASI index: {e}")


async def get_current_price(symbol: str) -> EnrichedStockPrice:
    """Get current stock price from data provider, enriched with DB data."""
    provider = get_data_provider()
    price = await provider.fetch_current_price(symbol)

    # Build enriched response starting from provider data
    enriched = EnrichedStockPrice(
        symbol=price.symbol,
        name_ar=price.name_ar,
        name_en=price.name_en,
        price=price.price,
        change=price.change,
        change_percent=price.change_percent,
        volume=price.volume,
        market_cap=price.market_cap,
        currency=price.currency,
        last_updated=price.last_updated,
    )

    # Enrich from database (non-blocking -- if DB fails, return base data)
    try:
        stock = await repository.get_stock_by_symbol(symbol)
        if stock:
            stock_id = stock["id"]

            # Get latest two prices for day high/low and prev_close
            latest_two = await repository.get_latest_two_prices(stock_id)
            if len(latest_two) >= 1:
                enriched.day_high = Decimal(str(latest_two[0]["high_price"]))
                enriched.day_low = Decimal(str(latest_two[0]["low_price"]))
            if len(latest_two) >= 2:
                enriched.prev_close = Decimal(str(latest_two[1]["close_price"]))

            # Get 52-week range
            range_data = await repository.get_52_week_range(stock_id)
            if range_data:
                enriched.week_52_high = range_data["week_52_high"]
                enriched.week_52_low = range_data["week_52_low"]
    except Exception:
        # If DB enrichment fails, return base data from provider
        pass

    return enriched


async def get_historical_prices(
    symbol: str, period: str = "1y", interval: str = "1d"
) -> list[OHLCVRecord]:
    """Get historical OHLCV data from data provider."""
    provider = get_data_provider()
    return await provider.fetch_historical(symbol, period, interval)


async def get_prices_from_db(
    symbol: str, limit: int = 252
) -> list[dict]:
    """Get stored prices from database."""
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise StockNotFoundError(symbol)
    return await repository.get_daily_prices(stock["id"], limit=limit)


async def get_stats(symbol: str) -> dict | None:
    """Get computed statistics from database."""
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise StockNotFoundError(symbol)
    return await repository.get_stock_stats(stock["id"])
