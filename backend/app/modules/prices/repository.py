"""Database operations for the prices module."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.database import get_supabase, get_supabase_service


async def get_stock_by_symbol(symbol: str) -> dict | None:
    """Get stock record by Tadawul symbol."""
    client = get_supabase()
    result = client.table("stocks").select("*").eq("symbol", symbol).execute()
    if result.data:
        return result.data[0]
    return None


async def get_active_stocks() -> list[dict]:
    """Get all active stocks from the database.

    Returns list of dicts with keys: id, symbol, name_ar, is_active.
    """
    client = get_supabase()
    result = (
        client.table("stocks")
        .select("id, symbol, name_ar, is_active")
        .eq("is_active", True)
        .execute()
    )
    return result.data if result.data else []


async def upsert_daily_prices(stock_id: int, records: list[dict]) -> int:
    """
    Upsert daily price records into the database.
    Uses service role key to bypass RLS for writes.
    Returns count of rows upserted.
    """
    if not records:
        return 0

    client = get_supabase_service()

    # Upsert in batches of 100
    batch_size = 100
    total = 0

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        rows = [
            {
                "stock_id": stock_id,
                "trade_date": r["trade_date"],
                "open_price": str(r["open_price"]),
                "high_price": str(r["high_price"]),
                "low_price": str(r["low_price"]),
                "close_price": str(r["close_price"]),
                "adj_close": str(r["adj_close"]),
                "volume": r["volume"],
            }
            for r in batch
        ]

        result = client.table("daily_prices").upsert(
            rows, on_conflict="stock_id,trade_date"
        ).execute()
        total += len(result.data) if result.data else 0

    return total


async def get_daily_prices(
    stock_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 252,
) -> list[dict]:
    """Get daily price records for a stock."""
    client = get_supabase()
    query = (
        client.table("daily_prices")
        .select("*")
        .eq("stock_id", stock_id)
        .order("trade_date", desc=True)
        .limit(limit)
    )

    if start_date:
        query = query.gte("trade_date", start_date.isoformat())
    if end_date:
        query = query.lte("trade_date", end_date.isoformat())

    result = query.execute()
    # Return in ascending order
    return list(reversed(result.data)) if result.data else []


async def upsert_stock_stats(stock_id: int, stats: dict) -> None:
    """Upsert computed statistics for a stock."""
    client = get_supabase_service()
    row = {
        "stock_id": stock_id,
        "daily_return_mean": str(stats["daily_return_mean"]),
        "daily_return_std": str(stats["daily_return_std"]),
        "annual_return": str(stats["annual_return"]),
        "annual_volatility": str(stats["annual_volatility"]),
        "lookback_days": stats["lookback_days"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Include 52-week range if computed
    if "week_52_high" in stats:
        row["week_52_high"] = str(stats["week_52_high"])
    if "week_52_low" in stats:
        row["week_52_low"] = str(stats["week_52_low"])

    client.table("stock_stats").upsert(row, on_conflict="stock_id").execute()


async def get_stock_stats(stock_id: int) -> dict | None:
    """Get computed statistics for a stock."""
    client = get_supabase()
    result = (
        client.table("stock_stats").select("*").eq("stock_id", stock_id).execute()
    )
    if result.data:
        return result.data[0]
    return None


async def get_latest_two_prices(stock_id: int) -> list[dict]:
    """
    Get the 2 most recent daily_prices records for a stock.
    Used to derive day_high, day_low (from latest) and prev_close (from second-latest).
    Returns list of 0-2 dicts ordered by trade_date descending.
    """
    client = get_supabase()
    result = (
        client.table("daily_prices")
        .select("trade_date,high_price,low_price,close_price")
        .eq("stock_id", stock_id)
        .order("trade_date", desc=True)
        .limit(2)
        .execute()
    )
    return result.data if result.data else []


async def get_52_week_range(stock_id: int) -> dict | None:
    """
    Get 52-week high and low for a stock.
    Queries max(high_price) and min(low_price) from daily_prices
    where trade_date >= 252 trading days ago (approx 1 calendar year).

    Returns dict with keys 'week_52_high' and 'week_52_low', or None if no data.
    """
    client = get_supabase()
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=365)).date()

    result = (
        client.table("daily_prices")
        .select("high_price,low_price")
        .eq("stock_id", stock_id)
        .gte("trade_date", cutoff_date.isoformat())
        .execute()
    )

    if not result.data:
        return None

    highs = [Decimal(str(r["high_price"])) for r in result.data]
    lows = [Decimal(str(r["low_price"])) for r in result.data]

    return {
        "week_52_high": max(highs),
        "week_52_low": min(lows),
    }


async def upsert_pivot_levels(row: dict) -> None:
    """
    Upsert a pivot levels record into the pivot_levels table.
    Uses service role key to bypass RLS for writes.

    Args:
        row: Dictionary with stock_id, trade_date, pivot_point, r1-r3, s1-s3,
             source_high, source_low, source_close
    """
    client = get_supabase_service()
    client.table("pivot_levels").upsert(
        row, on_conflict="stock_id,trade_date"
    ).execute()


async def get_latest_pivot(stock_id: int) -> dict | None:
    """
    Get the most recent pivot levels for a stock.

    Returns:
        Dictionary with pivot_point, r1-r3, s1-s3, source data, and trade_date,
        or None if no pivot data exists.
    """
    client = get_supabase()
    result = (
        client.table("pivot_levels")
        .select("*")
        .eq("stock_id", stock_id)
        .order("trade_date", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None
