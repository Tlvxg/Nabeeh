"""Task: Fetch news from all sources and run MARBERT sentiment analysis (PIPE-02, PIPE-03).

Pipeline:
1. Fetch articles from Argaam RSS + GNews API concurrently
2. Deduplicate via ON CONFLICT (source, headline_ar) in Supabase
3. Run MARBERT sentiment inference on unanalyzed articles
4. Store scores in sentiment_scores table

Also called from startup_health.py for initial backfill with sentiment_limit=200.
"""

import logging

from app.modules.news.schemas import NewsFetchSummary
from app.modules.sentiment.schemas import SentimentBatchResponse

logger = logging.getLogger(__name__)


async def run_news_pipeline(sentiment_limit: int = 100) -> dict:
    """
    Run the full news + sentiment pipeline.

    Steps:
    1. fetch_all_news() — Argaam RSS + GNews API concurrently, dedup via DB upsert
    2. analyze_unanalyzed() — MARBERT inference on articles where is_analyzed=False

    Args:
        sentiment_limit: Max articles to analyze per run (default 100).

    Returns:
        Dict with news_summary and sentiment_summary for logging/response.
    """
    from app.modules.news.service import fetch_all_news
    from app.modules.sentiment.service import analyze_unanalyzed

    # Step 1: Fetch news from all sources
    logger.info("News pipeline: starting news fetch")
    news_summary: NewsFetchSummary = await fetch_all_news()
    logger.info(
        "News pipeline: fetch complete — %d new articles (sources: %s)",
        news_summary.total_new,
        ", ".join(f"{r.source}={r.new}" for r in news_summary.results),
    )

    # Step 2: Run sentiment analysis on unanalyzed articles
    sentiment_summary: SentimentBatchResponse | None = None
    try:
        logger.info("News pipeline: starting sentiment analysis (limit=%d)", sentiment_limit)
        sentiment_summary = await analyze_unanalyzed(limit=sentiment_limit)
        logger.info(
            "News pipeline: sentiment complete — %d articles analyzed",
            sentiment_summary.analyzed,
        )
    except RuntimeError as e:
        # Model not loaded — non-fatal, articles will be analyzed on next run
        logger.warning("News pipeline: sentiment model not available — %s", e)
    except Exception:
        logger.exception("News pipeline: sentiment analysis failed")

    return {
        "news_summary": news_summary,
        "sentiment_summary": sentiment_summary,
    }
