"""Pydantic schemas for the sentiment module."""

from pydantic import BaseModel, Field


class SentimentResult(BaseModel):
    """Single article sentiment analysis result."""

    article_id: int
    headline_ar: str
    sentiment: str = Field(
        ..., description="Predicted sentiment: positive, negative, or neutral"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Model confidence score"
    )
    processing_ms: float = Field(
        ..., ge=0.0, description="Inference time in milliseconds"
    )


class SentimentBatchResponse(BaseModel):
    """Response from batch sentiment analysis."""

    analyzed: int = Field(..., description="Number of articles analyzed")
    results: list[SentimentResult]
    model_version: str


class SentimentScoreResponse(BaseModel):
    """Stored sentiment score from the database."""

    id: int
    article_id: int
    sentiment: str
    confidence: float
    analyzed_at: str


class SentimentTestRequest(BaseModel):
    """Request body for single-text sentiment test."""

    text: str = Field(
        ..., min_length=1, max_length=2000, description="Arabic text to analyze"
    )


class SentimentTestResponse(BaseModel):
    """Response from single-text sentiment test."""

    text: str
    sentiment: str
    confidence: float
    processing_ms: float


class SentimentHealthResponse(BaseModel):
    """Sentiment model health check response."""

    loaded: bool
    model: str
    labels: dict[int, str] | None = None


class SentimentAggregateResponse(BaseModel):
    """Aggregate sentiment counts for a stock."""

    stock_id: int
    positive: int = 0
    negative: int = 0
    neutral: int = 0
    total: int = 0
