"""Abstract base class for data providers (DATA-02)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass
class StockPrice:
    """Current stock price data."""

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


@dataclass
class OHLCVRecord:
    """Single OHLCV record for a trading day."""

    trade_date: date
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    close_price: Decimal
    adj_close: Decimal
    volume: int


class DataProvider(ABC):
    """
    Abstract base class for stock data providers.

    Implementations:
    - YFinanceProvider: Uses yfinance library with Tadawul tickers
    - Future: TwelveDataProvider, AlphaVantageProvider, etc.
    """

    @abstractmethod
    async def fetch_current_price(self, symbol: str) -> StockPrice:
        """
        Fetch the current/latest price for a stock.

        Args:
            symbol: Tadawul stock symbol (e.g., '2222' for Aramco)

        Returns:
            StockPrice with current market data

        Raises:
            DataProviderError: If the provider fails to fetch data
        """
        ...

    @abstractmethod
    async def fetch_historical(
        self, symbol: str, period: str = "1y", interval: str = "1d"
    ) -> list[OHLCVRecord]:
        """
        Fetch historical OHLCV data for a stock.

        Args:
            symbol: Tadawul stock symbol (e.g., '2222' for Aramco)
            period: Time period ('1mo', '3mo', '6mo', '1y', '2y', '5y')
            interval: Data interval ('1d', '1wk', '1mo')

        Returns:
            List of OHLCVRecord sorted by date ascending

        Raises:
            DataProviderError: If the provider fails to fetch data
            DataValidationError: If the data fails quality checks
        """
        ...
