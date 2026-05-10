"""yfinance implementation of DataProvider (DATA-02)."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

import yfinance as yf
import pandas as pd

from app.modules.prices.providers.base import DataProvider, StockPrice, OHLCVRecord
from app.core.exceptions import DataProviderError, DataValidationError
from app.modules.prices import repository


def _to_decimal(value: float, places: int = 4) -> Decimal:
    """Convert float to Decimal with specified precision."""
    return Decimal(str(value)).quantize(
        Decimal(10) ** -places, rounding=ROUND_HALF_UP
    )


class YFinanceProvider(DataProvider):
    """
    Data provider using yfinance library.
    Uses Yahoo Finance API with Tadawul tickers (e.g., 2222.SR for Aramco).
    """

    async def fetch_current_price(self, symbol: str) -> StockPrice:
        """Fetch current price from yfinance."""
        stock = await repository.get_stock_by_symbol(symbol)
        if not stock:
            raise DataProviderError(
                "yfinance", f"Unknown symbol: {symbol}"
            )

        yf_ticker = f"{symbol}.SR"

        try:
            ticker = yf.Ticker(yf_ticker)
            # Run blocking yfinance call in executor
            info = await asyncio.to_thread(lambda: ticker.info)

            if not info or "currentPrice" not in info:
                # Fallback: use history for last price
                hist = await asyncio.to_thread(
                    lambda: ticker.history(period="5d")
                )
                if hist.empty:
                    raise DataProviderError(
                        "yfinance", f"No data available for {symbol}"
                    )
                last_row = hist.iloc[-1]
                prev_row = hist.iloc[-2] if len(hist) > 1 else hist.iloc[-1]
                price = float(last_row["Close"])
                prev_close = float(prev_row["Close"])
                change = price - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                volume = int(last_row["Volume"])
                market_cap = info.get("marketCap")
            else:
                price = info["currentPrice"]
                prev_close = info.get("previousClose", price)
                change = price - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                volume = info.get("volume", 0)
                market_cap = info.get("marketCap")

            return StockPrice(
                symbol=symbol,
                name_ar=stock["name_ar"],
                name_en=stock["name_en"],
                price=_to_decimal(price),
                change=_to_decimal(change),
                change_percent=_to_decimal(change_pct, 2),
                volume=volume or 0,
                market_cap=market_cap,
                currency="SAR",
                last_updated=datetime.now(timezone.utc),
            )

        except DataProviderError:
            raise
        except Exception as e:
            raise DataProviderError("yfinance", str(e))

    async def fetch_historical(
        self, symbol: str, period: str = "1y", interval: str = "1d"
    ) -> list[OHLCVRecord]:
        """Fetch historical OHLCV data from yfinance with validation (DATA-05)."""
        stock = await repository.get_stock_by_symbol(symbol)
        if not stock:
            raise DataProviderError(
                "yfinance", f"Unknown symbol: {symbol}"
            )

        yf_ticker = f"{symbol}.SR"

        valid_periods = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}
        if period not in valid_periods:
            raise DataValidationError(
                f"Invalid period: {period}. Valid: {valid_periods}"
            )

        try:
            ticker = yf.Ticker(yf_ticker)
            hist: pd.DataFrame = await asyncio.to_thread(
                lambda: ticker.history(period=period, interval=interval)
            )

            if hist.empty:
                raise DataProviderError(
                    "yfinance", f"No historical data for {symbol} (period={period})"
                )

            records: list[OHLCVRecord] = []

            for idx, row in hist.iterrows():
                # DATA-05: Handle null values
                if pd.isna(row["Close"]) or pd.isna(row["Open"]):
                    continue  # Skip rows with null prices

                trade_date = idx.date() if hasattr(idx, "date") else idx

                # DATA-05: Price sanity check (Tadawul +/- 10% daily limit)
                open_price = float(row["Open"])
                close_price = float(row["Close"])
                if open_price > 0:
                    daily_return = abs((close_price - open_price) / open_price)
                    if daily_return > 0.15:
                        # Allow slightly more than 10% to account for gaps/adjustments
                        continue

                records.append(
                    OHLCVRecord(
                        trade_date=trade_date,
                        open_price=_to_decimal(row["Open"]),
                        high_price=_to_decimal(row["High"]),
                        low_price=_to_decimal(row["Low"]),
                        close_price=_to_decimal(row["Close"]),
                        adj_close=_to_decimal(
                            row.get("Adj Close", row["Close"])
                        ),
                        volume=int(row.get("Volume", 0)),
                    )
                )

            if not records:
                raise DataValidationError(
                    f"All records for {symbol} failed validation"
                )

            # DATA-05: Detect large gaps (> 5 consecutive trading days missing)
            if len(records) > 1:
                gap_days = []
                for i in range(1, len(records)):
                    delta = (records[i].trade_date - records[i - 1].trade_date).days
                    if delta > 7:  # More than 7 calendar days = suspicious gap
                        gap_days.append(
                            (records[i - 1].trade_date, records[i].trade_date, delta)
                        )
                if gap_days:
                    # Log warning but don't fail - gaps happen during holidays
                    print(
                        f"Warning: Data gaps detected for {symbol}: {gap_days}"
                    )

            return records

        except (DataProviderError, DataValidationError):
            raise
        except Exception as e:
            raise DataProviderError("yfinance", str(e))
