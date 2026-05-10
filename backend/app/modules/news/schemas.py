"""Pydantic schemas for the news module."""

from pydantic import BaseModel, Field

from app.modules.sentiment.schemas import SentimentBatchResponse


class NewsArticleResponse(BaseModel):
    """Single news article response."""

    id: int
    source: str
    headline_ar: str
    snippet_ar: str | None = None
    source_url: str | None = None
    published_at: str  # ISO datetime string
    stock_id: int | None = None
    is_analyzed: bool = False


class NewsListResponse(BaseModel):
    """Paginated list of news articles."""

    articles: list[NewsArticleResponse]
    total: int


class NewsFetchResult(BaseModel):
    """Result from a single news source fetch."""

    source: str
    fetched: int
    new: int  # after dedup
    errors: list[str] = []


class NewsFetchSummary(BaseModel):
    """Summary of a complete news fetch operation."""

    results: list[NewsFetchResult]
    total_new: int


class NewsWithSentimentResponse(BaseModel):
    """Single news article enriched with sentiment data."""

    id: int
    source: str
    headline_ar: str
    snippet_ar: str | None = None
    source_url: str | None = None
    published_at: str
    sentiment: str | None = None  # null if not yet analyzed
    confidence: float | None = None


class SentimentSummaryResponse(BaseModel):
    """Aggregate sentiment breakdown for a stock's news articles."""

    total_articles: int
    positive_count: int = 0
    negative_count: int = 0
    neutral_count: int = 0
    positive_pct: float = Field(default=0.0, description="Percentage of positive articles")
    negative_pct: float = Field(default=0.0, description="Percentage of negative articles")
    neutral_pct: float = Field(default=0.0, description="Percentage of neutral articles")
    avg_confidence: float = Field(default=0.0, description="Average model confidence across all scored articles")


class EnsureFreshResponse(BaseModel):
    """Response from the ensure-fresh endpoint."""

    was_stale: bool
    fetched: bool
    fetch_summary: NewsFetchSummary | None = None
    article_count: int


class PipelineResponse(BaseModel):
    """Response from the full news fetch + sentiment analysis pipeline."""

    news_fetch: NewsFetchSummary
    sentiment_analysis: SentimentBatchResponse
