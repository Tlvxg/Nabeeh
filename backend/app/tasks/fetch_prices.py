"""Task: Fetch Aramco OHLCV data from yfinance and store in Supabase (DATA-01, DATA-04)."""

import asyncio
import logging
from datetime import datetime, timezone

from app.modules.prices.providers.factory import get_data_provider
from app.modules.prices import repository

logger = logging.getLogger(__name__)


async def fetch_and_store_prices(symbol: str = "2222", period: str = "1y") -> int:
    """
    Fetch historical OHLCV data from the data provider and store in Supabase.

    Args:
        symbol: Tadawul stock symbol (default: Aramco 2222)
        period: Time period to fetch (default: 1y for initial load)

    Returns:
        Number of rows upserted
    """
    logger.info("Fetching %s of data for %s...", period, symbol)

    # Get the stock record from database
    stock = await repository.get_stock_by_symbol(symbol)
    if not stock:
        raise ValueError(f"Stock {symbol} not found in database. Run seed script first.")

    stock_id = stock["id"]

    # Fetch from data provider
    provider = get_data_provider()
    records = await provider.fetch_historical(symbol, period=period, interval="1d")

    logger.info("Fetched %d records from provider for %s", len(records), symbol)

    # Convert to dict format for repository
    rows = [
        {
            "trade_date": r.trade_date.isoformat(),
            "open_price": str(r.open_price),
            "high_price": str(r.high_price),
            "low_price": str(r.low_price),
            "close_price": str(r.close_price),
            "adj_close": str(r.adj_close),
            "volume": r.volume,
        }
        for r in records
    ]

    # Upsert into database (handles duplicates via ON CONFLICT)
    count = await repository.upsert_daily_prices(stock_id, rows)
    logger.info("Upserted %d rows for %s", count, symbol)

    return count


async def fetch_daily_prices():
    """Scheduled task: fetch latest prices for all active stocks.

    Uses 1y period for stocks with < 100 days of data (initial load),
    otherwise 1mo for incremental updates.
    """
    from app.modules.prices import repository as prices_repo
    from app.database import get_supabase

    client = get_supabase()
    stocks = await prices_repo.get_active_stocks()
    for stock_row in stocks:
        symbol = stock_row["symbol"]
        try:
            # Check how much data we have for this stock
            stock = await prices_repo.get_stock_by_symbol(symbol)
            if stock:
                count_result = (
                    client.table("daily_prices")
                    .select("id", count="exact")
                    .eq("stock_id", stock["id"])
                    .execute()
                )
                row_count = count_result.count if count_result.count is not None else 0
                period = "1y" if row_count < 100 else "1mo"
            else:
                period = "1y"
            await fetch_and_store_prices(symbol, period=period)
        except Exception:
            logger.exception("fetch_daily_prices failed for %s", symbol)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    count = asyncio.run(fetch_and_store_prices("2222", period="1y"))
    logger.info("Done. %d rows upserted.", count)
