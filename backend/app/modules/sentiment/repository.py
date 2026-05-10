"""Database operations for the sentiment module."""

import logging

from app.database import get_supabase, get_supabase_service

logger = logging.getLogger(__name__)


async def insert_score(
    article_id: int,
    stock_id: int,
    sentiment: str,
    confidence: float,
    processing_ms: float,
) -> int | None:
    """Insert a sentiment score into the sentiment_scores table.

    Uses upsert with ON CONFLICT (article_id) to avoid duplicates.

    Args:
        article_id: Foreign key to news_articles.
        stock_id: Foreign key to stocks.
        sentiment: One of 'positive', 'negative', 'neutral'.
        confidence: Model confidence score (0-1).
        processing_ms: Inference time in milliseconds.

    Returns:
        The inserted row ID, or None if upsert skipped.
    """
    client = get_supabase_service()
    try:
        result = (
            client.table("sentiment_scores")
            .upsert(
                {
                    "article_id": article_id,
                    "stock_id": stock_id,
                    "sentiment": sentiment,
                    "confidence": confidence,
                    "processing_ms": processing_ms,
                    "model_version": "marbert-v2-onnx",
                },
                on_conflict="article_id",
            )
            .execute()
        )
        if result.data:
            return result.data[0].get("id")
        return None
    except Exception as e:
        logger.error("Failed to insert sentiment score for article %d: %s", article_id, e)
        return None


async def get_scores_by_stock(stock_id: int, limit: int = 20) -> list[dict]:
    """Get sentiment scores for a specific stock, ordered by most recent.

    Args:
        stock_id: Stock ID to filter by.
        limit: Maximum number of scores to return.

    Returns:
        List of sentiment score dicts.
    """
    client = get_supabase()
    result = (
        client.table("sentiment_scores")
        .select("*")
        .eq("stock_id", stock_id)
        .order("analyzed_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data if result.data else []


async def get_aggregate_sentiment(stock_id: int) -> dict:
    """Get aggregate sentiment counts for a stock.

    Returns:
        Dict with positive, negative, neutral counts and total.
    """
    client = get_supabase()
    result = (
        client.table("sentiment_scores")
        .select("sentiment")
        .eq("stock_id", stock_id)
        .execute()
    )

    counts = {"positive": 0, "negative": 0, "neutral": 0}
    if result.data:
        for row in result.data:
            sentiment = row.get("sentiment", "neutral")
            if sentiment in counts:
                counts[sentiment] += 1

    return {
        "stock_id": stock_id,
        "positive": counts["positive"],
        "negative": counts["negative"],
        "neutral": counts["neutral"],
        "total": sum(counts.values()),
    }
