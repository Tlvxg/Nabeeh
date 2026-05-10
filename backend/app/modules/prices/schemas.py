"""Pydantic schemas for the prices module."""

from datetime import date, datetime

from pydantic import BaseModel


class StockPriceResponse(BaseModel):
    """Current stock price response."""

    symbol: str
    name_ar: str
    name_en: str
    price: float
    change: float
    change_percent: float
    volume: int
    market_cap: int | None = None
    currency: str = "SAR"
    last_updated: datetime
    day_high: float | None = None
    day_low: float | None = None
    prev_close: float | None = None
    week_52_high: float | None = None
    week_52_low: float | None = None


class MarketStatusResponse(BaseModel):
    """Saudi stock market status response."""

    is_open: bool
    status_ar: str
    next_open: datetime | None = None


class OHLCVItem(BaseModel):
    """Single OHLCV data point."""

    date: date
    open: float
    high: float
    low: float
    close: float
    adj_close: float
    volume: int


class OHLCVResponse(BaseModel):
    """Historical OHLCV data response."""

    symbol: str
    period: str
    interval: str
    count: int
    data: list[OHLCVItem]


class StockStatsResponse(BaseModel):
    """Computed stock statistics response."""

    symbol: str
    daily_return_mean: float
    daily_return_std: float
    annual_return: float
    annual_volatility: float
    beta: float | None = None
    lookback_days: int
    updated_at: datetime
    week_52_high: float | None = None
    week_52_low: float | None = None


class TASIIndexResponse(BaseModel):
    """TASI (Tadawul All Share Index) response."""

    value: float
    change: float
    change_percent: float
    volume: int
    trades: int | None = None  # yfinance doesn't provide trade count for indices
    day_high: float | None = None
    day_low: float | None = None
    prev_close: float | None = None
    last_updated: datetime


class FetchResultResponse(BaseModel):
    """Response from triggering a data fetch."""

    symbol: str
    rows_upserted: int
    period: str
    message: str
