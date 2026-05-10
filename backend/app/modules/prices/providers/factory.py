"""Factory function for creating data providers (DATA-02)."""

from app.config import settings
from app.modules.prices.providers.base import DataProvider
from app.modules.prices.providers.yfinance_provider import YFinanceProvider


def get_data_provider() -> DataProvider:
    """
    Factory function that returns the configured data provider.

    The provider is determined by the DATA_PROVIDER environment variable.
    Currently supports:
    - 'yfinance': Uses Yahoo Finance API (default)

    Future providers can be added by creating a new class implementing
    DataProvider and adding a case here.
    """
    provider_name = settings.DATA_PROVIDER.lower()

    if provider_name == "yfinance":
        return YFinanceProvider()
    else:
        raise ValueError(
            f"Unknown data provider: '{provider_name}'. "
            f"Supported providers: yfinance"
        )
