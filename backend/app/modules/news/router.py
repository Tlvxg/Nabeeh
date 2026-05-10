"""API endpoints for the news module."""

import logging

from fastapi import APIRouter, HTTPException, Query

from app.modules.news import service, repository
from app.modules.news.schemas import (
    NewsArticleResponse,
    NewsListResponse,
    NewsFetchSummary,
    NewsWithSentimentResponse,
    SentimentSummaryResponse,
    PipelineResponse,
    EnsureFreshResponse,
)
from app.modules.prices import repository as prices_repository

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/fetch", response_model=NewsFetchSummary)
async def trigger_news_fetch():
    """
    Trigger a news fetch from all configured sources (Argaam RSS, GNews API).

    Returns a summary with counts per source and any errors encountered.
    This is a manual trigger endpoint -- no background scheduler yet.
    """
    summary = await service.fetch_all_news()
    return summary


@router.get("/recent", response_model=NewsListResponse)
async def get_recent_news(
    limit: int = Query(default=20, ge=1, le=100, description="Number of articles"),
):
    """Get recent news articles from all sources."""
    articles = await repository.get_recent_articles(limit=limit)
    return NewsListResponse(
        articles=[
            NewsArticleResponse(
                id=a["id"],
                source=a["source"],
                headline_ar=a["headline_ar"],
                snippet_ar=a.get("snippet_ar"),
                source_url=a.get("source_url"),
                published_at=a.get("published_at", ""),
                stock_id=a.get("stock_id"),
                is_analyzed=a.get("is_analyzed", False),
            )
            for a in articles
        ],
        total=len(articles),
    )


@router.post("/pipeline", response_model=PipelineResponse)
async def run_pipeline():
    """
    Run the full news pipeline: fetch from all sources, then analyze sentiment.

    Orchestrates:
    1. Fetch news from Argaam RSS + GNews API
    2. Run MARBERTv2 sentiment analysis on unanalyzed articles
    3. Return combined summary

    Convenience endpoint for development and future scheduler integration.
    """
    from app.modules.sentiment import service as sentiment_service

    # Step 1: Fetch news
    try:
        news_summary = await service.fetch_all_news()
    except Exception as e:
        logger.error("Pipeline news fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=f"News fetch failed: {e}")

    # Step 2: Run sentiment analysis
    try:
        sentiment_result = await sentiment_service.analyze_unanalyzed()
    except RuntimeError as e:
        # Model not loaded -- still return news results with empty sentiment
        logger.warning("Pipeline sentiment analysis skipped: %s", e)
        from app.modules.sentiment.schemas import SentimentBatchResponse

        sentiment_result = SentimentBatchResponse(
            analyzed=0, results=[], model_version="not loaded"
        )
    except Exception as e:
        logger.error("Pipeline sentiment analysis failed: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Sentiment analysis failed: {e}"
        )

    return PipelineResponse(
        news_fetch=news_summary,
        sentiment_analysis=sentiment_result,
    )


@router.get("/ensure-fresh", response_model=EnsureFreshResponse)
async def ensure_fresh_news(
    max_age_hours: float = Query(
        default=6.0, ge=0.5, le=48.0, description="Max age in hours before re-fetch"
    ),
):
    """
    Ensure news database has fresh articles.

    Checks the most recent article's timestamp. If older than max_age_hours
    (or no articles exist), triggers the full news+sentiment pipeline.

    Designed to be called by the frontend on page load. Idempotent and
    never returns an error -- stale news is better than no news.
    """
    result = await service.ensure_fresh_news(max_age_hours=max_age_hours)
    return EnsureFreshResponse(**result)


@router.post("/backfill-stock-ids")
async def backfill_stock_ids():
    """One-time backfill: match existing articles to stock symbols using expanded keywords."""
    result = await service.backfill_stock_ids()
    return result


@router.post("/cron/trigger")
async def trigger_news_pipeline():
    """
    Manually trigger the full news + sentiment pipeline.

    Runs the same pipeline as the 30-minute cron job:
    1. Fetch news from Argaam RSS + GNews API
    2. Run MARBERT sentiment analysis on unanalyzed articles

    Useful for testing, recovery, or forcing an immediate refresh.
    Deduplication ensures safe repeated calls.
    """
    from app.tasks.news_pipeline import run_news_pipeline

    try:
        result = await run_news_pipeline()
        news_summary = result.get("news_summary")
        sentiment_summary = result.get("sentiment_summary")

        return {
            "status": "ok",
            "new_articles": news_summary.total_new if news_summary else 0,
            "articles_analyzed": sentiment_summary.analyzed if sentiment_summary else 0,
            "news_details": news_summary,
            "sentiment_details": sentiment_summary,
        }
    except Exception as e:
        logger.exception("Manual news pipeline trigger failed")
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {e}")


@router.get("/all-with-sentiment", response_model=list[NewsWithSentimentResponse])
async def get_all_news_with_sentiment(
    limit: int = Query(default=50, ge=1, le=100, description="Number of articles"),
):
    """
    Get all news articles enriched with sentiment scores (not stock-filtered).

    Returns articles from all stocks/sources ordered by most recent first,
    each with sentiment label and confidence score.
    Designed for the dedicated News Feed page.
    """
    articles = await repository.get_all_articles_with_sentiment(limit=limit)

    return [
        NewsWithSentimentResponse(
            id=a["id"],
            source=a["source"],
            headline_ar=a["headline_ar"],
            snippet_ar=a.get("snippet_ar"),
            source_url=a.get("source_url"),
            published_at=a.get("published_at", ""),
            sentiment=a.get("sentiment"),
            confidence=a.get("confidence"),
        )
        for a in articles
    ]


@router.get("/{symbol}/with-sentiment", response_model=list[NewsWithSentimentResponse])
async def get_news_with_sentiment(
    symbol: str,
    limit: int = Query(default=20, ge=1, le=100, description="Number of articles"),
):
    """
    Get news articles enriched with sentiment scores for a specific stock.

    Articles without sentiment analysis will have null sentiment/confidence fields.
    Uses Supabase foreign key join on news_articles -> sentiment_scores.
    """
    stock = await prices_repository.get_stock_by_symbol(symbol)
    if not stock:
        return []

    articles = await repository.get_articles_with_sentiment(
        stock_id=stock["id"], limit=limit
    )

    return [
        NewsWithSentimentResponse(
            id=a["id"],
            source=a["source"],
            headline_ar=a["headline_ar"],
            snippet_ar=a.get("snippet_ar"),
            source_url=a.get("source_url"),
            published_at=a.get("published_at", ""),
            sentiment=a.get("sentiment"),
            confidence=a.get("confidence"),
        )
        for a in articles
    ]


@router.get("/{symbol}/sentiment-summary", response_model=SentimentSummaryResponse)
async def get_sentiment_summary(
    symbol: str,
):
    """
    Get aggregate sentiment breakdown for a stock's news articles.

    Returns counts and percentages for positive/negative/neutral sentiment,
    plus the average model confidence score.
    """
    stock = await prices_repository.get_stock_by_symbol(symbol)
    if not stock:
        return SentimentSummaryResponse(total_articles=0)

    summary = await repository.get_sentiment_summary(stock_id=stock["id"])
    return SentimentSummaryResponse(**summary)


@router.get("/{symbol}", response_model=NewsListResponse)
async def get_stock_news(
    symbol: str,
    limit: int = Query(default=20, ge=1, le=100, description="Number of articles"),
):
    """
    Get news articles for a specific stock by Tadawul symbol.

    Looks up stock_id from the stocks table, then returns matching articles.
    """
    stock = await prices_repository.get_stock_by_symbol(symbol)
    if not stock:
        return NewsListResponse(articles=[], total=0)

    stock_id = stock["id"]
    articles = await repository.get_articles_by_stock(stock_id=stock_id, limit=limit)

    return NewsListResponse(
        articles=[
            NewsArticleResponse(
                id=a["id"],
                source=a["source"],
                headline_ar=a["headline_ar"],
                snippet_ar=a.get("snippet_ar"),
                source_url=a.get("source_url"),
                published_at=a.get("published_at", ""),
                stock_id=a.get("stock_id"),
                is_analyzed=a.get("is_analyzed", False),
            )
            for a in articles
        ],
        total=len(articles),
    )
