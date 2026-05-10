"""Database operations for the news module."""

from app.database import get_supabase, get_supabase_service


async def insert_articles(articles: list[dict]) -> int:
    """
    Bulk insert news articles with deduplication.

    Uses ON CONFLICT (source, headline_ar) DO NOTHING to skip duplicates.
    Returns count of newly inserted rows.
    """
    if not articles:
        return 0

    client = get_supabase_service()
    new_count = 0

    # Insert in batches of 50 to stay within payload limits
    batch_size = 50
    for i in range(0, len(articles), batch_size):
        batch = articles[i : i + batch_size]
        result = (
            client.table("news_articles")
            .upsert(batch, on_conflict="source,headline_ar", ignore_duplicates=True)
            .execute()
        )
        new_count += len(result.data) if result.data else 0

    return new_count


async def get_articles_by_stock(stock_id: int, limit: int = 20) -> list[dict]:
    """Get latest articles for a specific stock, ordered by published_at DESC."""
    client = get_supabase()
    result = (
        client.table("news_articles")
        .select("*")
        .eq("stock_id", stock_id)
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data if result.data else []


async def get_unanalyzed_articles(limit: int = 50) -> list[dict]:
    """Get articles that have not been analyzed for sentiment yet."""
    client = get_supabase()
    result = (
        client.table("news_articles")
        .select("*")
        .eq("is_analyzed", False)
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data if result.data else []


async def mark_analyzed(article_ids: list[int]) -> None:
    """Set is_analyzed = true for given article IDs."""
    if not article_ids:
        return

    client = get_supabase_service()
    for article_id in article_ids:
        client.table("news_articles").update(
            {"is_analyzed": True}
        ).eq("id", article_id).execute()


async def get_latest_article_timestamp() -> str | None:
    """Get the published_at timestamp of the most recent article. Returns ISO string or None."""
    client = get_supabase()
    result = (
        client.table("news_articles")
        .select("published_at")
        .order("published_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["published_at"]
    return None


async def get_recent_articles(limit: int = 20) -> list[dict]:
    """Get all recent articles regardless of stock, ordered by published_at DESC."""
    client = get_supabase()
    result = (
        client.table("news_articles")
        .select("*")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data if result.data else []


async def get_all_articles_with_sentiment(limit: int = 50) -> list[dict]:
    """
    Get all articles with joined sentiment scores (not stock-filtered).

    Uses Supabase's foreign key select to LEFT JOIN sentiment_scores.
    Articles without sentiment will have sentiment_scores as an empty list.
    Returns article fields + flattened sentiment/confidence.
    """
    client = get_supabase()
    result = (
        client.table("news_articles")
        .select("id, source, headline_ar, snippet_ar, source_url, published_at, sentiment_scores(sentiment, confidence)")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )

    if not result.data:
        return []

    # Flatten: extract first sentiment_scores entry (UNIQUE(article_id) means at most 1)
    enriched = []
    for article in result.data:
        scores = article.get("sentiment_scores")
        # Supabase returns dict for unique FK, list for many, or None
        if isinstance(scores, dict):
            first_score = scores
        elif isinstance(scores, list) and scores:
            first_score = scores[0]
        else:
            first_score = {}
        enriched.append(
            {
                "id": article["id"],
                "source": article["source"],
                "headline_ar": article["headline_ar"],
                "snippet_ar": article.get("snippet_ar"),
                "source_url": article.get("source_url"),
                "published_at": article.get("published_at", ""),
                "sentiment": first_score.get("sentiment"),
                "confidence": first_score.get("confidence"),
            }
        )

    return enriched


async def get_articles_with_sentiment(stock_id: int, limit: int = 20) -> list[dict]:
    """
    Get articles with joined sentiment scores for a specific stock.

    Uses Supabase's foreign key select to LEFT JOIN sentiment_scores.
    Articles without sentiment will have sentiment_scores as an empty list.
    Returns article fields + flattened sentiment/confidence.
    """
    client = get_supabase()
    result = (
        client.table("news_articles")
        .select("id, source, headline_ar, snippet_ar, source_url, published_at, sentiment_scores(sentiment, confidence)")
        .eq("stock_id", stock_id)
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )

    if not result.data:
        return []

    # Flatten: extract first sentiment_scores entry (UNIQUE(article_id) means at most 1)
    enriched = []
    for article in result.data:
        scores = article.get("sentiment_scores")
        # Supabase returns dict for unique FK, list for many, or None
        if isinstance(scores, dict):
            first_score = scores
        elif isinstance(scores, list) and scores:
            first_score = scores[0]
        else:
            first_score = {}
        enriched.append(
            {
                "id": article["id"],
                "source": article["source"],
                "headline_ar": article["headline_ar"],
                "snippet_ar": article.get("snippet_ar"),
                "source_url": article.get("source_url"),
                "published_at": article.get("published_at", ""),
                "sentiment": first_score.get("sentiment"),
                "confidence": first_score.get("confidence"),
            }
        )

    return enriched


async def get_sentiment_summary(stock_id: int) -> dict:
    """
    Get aggregate sentiment counts and percentages for a stock.

    Queries all sentiment_scores for the stock and computes:
    - Counts per sentiment (positive, negative, neutral)
    - Percentages per sentiment
    - Average model confidence
    """
    client = get_supabase()
    result = (
        client.table("sentiment_scores")
        .select("sentiment, confidence")
        .eq("stock_id", stock_id)
        .execute()
    )

    rows = result.data if result.data else []
    total = len(rows)

    if total == 0:
        return {
            "total_articles": 0,
            "positive_count": 0,
            "negative_count": 0,
            "neutral_count": 0,
            "positive_pct": 0.0,
            "negative_pct": 0.0,
            "neutral_pct": 0.0,
            "avg_confidence": 0.0,
        }

    counts = {"positive": 0, "negative": 0, "neutral": 0}
    total_confidence = 0.0

    for row in rows:
        sentiment = row.get("sentiment", "neutral")
        if sentiment in counts:
            counts[sentiment] += 1
        total_confidence += row.get("confidence", 0.0)

    avg_confidence = total_confidence / total if total > 0 else 0.0

    return {
        "total_articles": total,
        "positive_count": counts["positive"],
        "negative_count": counts["negative"],
        "neutral_count": counts["neutral"],
        "positive_pct": round(counts["positive"] / total * 100, 1),
        "negative_pct": round(counts["negative"] / total * 100, 1),
        "neutral_pct": round(counts["neutral"] / total * 100, 1),
        "avg_confidence": round(avg_confidence, 4),
    }
