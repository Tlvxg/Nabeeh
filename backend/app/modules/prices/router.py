"""API endpoints for the prices module."""

import logging

from fastapi import APIRouter, Query

from app.modules.prices import service
from app.modules.prices.schemas import (
    StockPriceResponse,
    OHLCVResponse,
    OHLCVItem,
    StockStatsResponse,
    FetchResultResponse,
    MarketStatusResponse,
    TASIIndexResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/cron/trigger")
async def trigger_cron_pipeline():
    """
    Manually trigger the full price pipeline: fetch -> stats -> pivots.
    Useful for testing, recovery, or initial data population.
    Runs the same sequence as the scheduled cron job for all active stocks.
    """
    from app.tasks.fetch_prices import fetch_and_store_prices
    from app.tasks.compute_stats import compute_stock_stats
    from app.tasks.compute_pivots import compute_pivot_levels
    from app.modules.prices import repository

    stocks = await repository.get_active_stocks()
    if not stocks:
        return {"status": "skipped", "message": "No active stocks found"}

    results = {}
    for stock in stocks:
        symbol = stock["symbol"]
        logger.info("Manual pipeline trigger: starting full pipeline for %s", symbol)
        try:
            price_count = await fetch_and_store_prices(symbol, period="1mo")
            stats = await compute_stock_stats(symbol)
            pivots = await compute_pivot_levels(symbol)
            results[symbol] = {
                "prices_upserted": price_count,
                "stats": stats,
                "pivots": pivots,
            }
            logger.info("Pipeline complete for %s: %d prices", symbol, price_count)
        except Exception as e:
            logger.exception("Pipeline failed for %s", symbol)
            results[symbol] = {"error": str(e)}

    return {
        "status": "success",
        "pipeline": results,
        "message": f"Full pipeline executed for {len(stocks)} stocks: fetch -> stats -> pivots",
    }


@router.get("/market/status", response_model=MarketStatusResponse)
async def get_market_status():
    """Get Saudi stock market (Tadawul) open/closed status."""
    status = await service.get_market_status()
    return MarketStatusResponse(
        is_open=status.is_open,
        status_ar=status.status_ar,
        next_open=status.next_open,
    )


@router.get("/market/tasi", response_model=TASIIndexResponse)
async def get_tasi_index():
    """Get TASI (Tadawul All Share Index) real-time data."""
    tasi = await service.get_tasi_index()
    return TASIIndexResponse(
        value=float(tasi.value),
        change=float(tasi.change),
        change_percent=float(tasi.change_percent),
        volume=tasi.volume,
        trades=tasi.trades,
        day_high=float(tasi.day_high) if tasi.day_high else None,
        day_low=float(tasi.day_low) if tasi.day_low else None,
        prev_close=float(tasi.prev_close) if tasi.prev_close else None,
        last_updated=tasi.last_updated,
    )


@router.get("/{symbol}", response_model=StockPriceResponse)
async def get_price(symbol: str):
    """Get current price for a stock with enriched data."""
    price = await service.get_current_price(symbol)
    return StockPriceResponse(
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
        day_high=price.day_high,
        day_low=price.day_low,
        prev_close=price.prev_close,
        week_52_high=price.week_52_high,
        week_52_low=price.week_52_low,
    )


@router.get("/{symbol}/history", response_model=OHLCVResponse)
async def get_history(
    symbol: str,
    period: str = Query(default="1y", description="Time period: 1mo, 3mo, 6mo, 1y, 2y, 5y"),
    interval: str = Query(default="1d", description="Data interval: 1d, 1wk, 1mo"),
):
    """Get historical OHLCV data for a stock."""
    records = await service.get_historical_prices(symbol, period, interval)
    return OHLCVResponse(
        symbol=symbol,
        period=period,
        interval=interval,
        count=len(records),
        data=[
            OHLCVItem(
                date=r.trade_date,
                open=r.open_price,
                high=r.high_price,
                low=r.low_price,
                close=r.close_price,
                adj_close=r.adj_close,
                volume=r.volume,
            )
            for r in records
        ],
    )


@router.post("/{symbol}/fetch", response_model=FetchResultResponse)
async def trigger_fetch(
    symbol: str,
    period: str = Query(default="1y", description="Time period to fetch"),
):
    """
    Trigger an immediate data fetch for a stock.
    Fetches OHLCV data from the data provider and stores in database.
    For development/testing -- not for production scheduled use.
    """
    from app.tasks.fetch_prices import fetch_and_store_prices

    count = await fetch_and_store_prices(symbol, period=period)
    return FetchResultResponse(
        symbol=symbol,
        rows_upserted=count,
        period=period,
        message=f"Fetched and stored {count} price records for {symbol}",
    )


@router.post("/{symbol}/compute-stats")
async def trigger_compute_stats(symbol: str):
    """
    Trigger stats computation for a stock.
    Reads daily_prices and computes mu, sigma, annual return, volatility.
    """
    from app.tasks.compute_stats import compute_stock_stats

    stats = await compute_stock_stats(symbol)
    return {
        "symbol": symbol,
        "message": "Stats computed and stored",
        "stats": stats,
    }


@router.get("/{symbol}/stats", response_model=StockStatsResponse)
async def get_stats(symbol: str):
    """Get computed statistics for a stock (mu, sigma, annual return, etc.)."""
    stats = await service.get_stats(symbol)
    if not stats:
        from app.core.exceptions import StockNotFoundError
        raise StockNotFoundError(symbol)
    return StockStatsResponse(
        symbol=symbol,
        daily_return_mean=float(stats["daily_return_mean"]),
        daily_return_std=float(stats["daily_return_std"]),
        annual_return=float(stats["annual_return"]),
        annual_volatility=float(stats["annual_volatility"]),
        beta=float(stats["beta"]) if stats.get("beta") else None,
        lookback_days=stats["lookback_days"],
        updated_at=stats["updated_at"],
        week_52_high=float(stats["week_52_high"]) if stats.get("week_52_high") else None,
        week_52_low=float(stats["week_52_low"]) if stats.get("week_52_low") else None,
    )
