"""Custom exception classes for the application."""

from fastapi import HTTPException, status


class StockNotFoundError(HTTPException):
    """Raised when a stock symbol is not found."""

    def __init__(self, symbol: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with symbol '{symbol}' not found",
        )


class DataProviderError(HTTPException):
    """Raised when the data provider fails to fetch data."""

    def __init__(self, provider: str, detail: str):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Data provider '{provider}' error: {detail}",
        )


class DataValidationError(HTTPException):
    """Raised when fetched data fails validation checks."""

    def __init__(self, detail: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Data validation error: {detail}",
        )


class DatabaseError(HTTPException):
    """Raised when a database operation fails."""

    def __init__(self, detail: str):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {detail}",
        )
