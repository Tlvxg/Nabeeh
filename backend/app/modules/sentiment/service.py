"""Business logic for the sentiment module - batch analysis and single-text inference."""

import logging
import time

from app.modules.sentiment.model import SentimentModelManager
from app.modules.sentiment.schemas import (
    SentimentBatchResponse,
    SentimentResult,
    SentimentTestResponse,
)
from app.modules.news import repository as news_repository
from app.modules.sentiment import repository as sentiment_repository

logger = logging.getLogger(__name__)

# Batch size for inference (balance of speed and memory)
BATCH_SIZE = 16


async def analyze_unanalyzed(limit: int = 50) -> SentimentBatchResponse:
    """Fetch unanalyzed articles, run model inference, store results.

    Pipeline:
    1. Fetch unanalyzed articles from news_articles table
    2. Concatenate headline_ar + snippet_ar for each article
    3. Run model inference in batches of BATCH_SIZE
    4. Store results in sentiment_scores table
    5. Mark articles as analyzed
    6. Return batch response with counts

    Args:
        limit: Maximum number of articles to process.

    Returns:
        SentimentBatchResponse with analysis results.
    """
    manager = SentimentModelManager.get_instance()
    if not manager.is_loaded:
        raise RuntimeError("Sentiment model not loaded")

    # Step 1: Get unanalyzed articles
    articles = await news_repository.get_unanalyzed_articles(limit=limit)
    if not articles:
        return SentimentBatchResponse(
            analyzed=0, results=[], model_version=manager.model_version
        )

    logger.info("Processing %d unanalyzed articles", len(articles))

    all_results: list[SentimentResult] = []
    analyzed_ids: list[int] = []

    # Step 2-3: Process in batches
    for batch_start in range(0, len(articles), BATCH_SIZE):
        batch = articles[batch_start : batch_start + BATCH_SIZE]

        # Concatenate headline + snippet for each article
        texts = []
        for article in batch:
            headline = article.get("headline_ar", "")
            snippet = article.get("snippet_ar", "") or ""
            text = f"{headline} {snippet}".strip()
            texts.append(text)

        # Run inference with timing
        start_time = time.perf_counter()
        predictions = manager.predict(texts)
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        per_article_ms = elapsed_ms / len(texts) if texts else 0

        # Step 4: Store results and build response
        for i, (article, prediction) in enumerate(zip(batch, predictions)):
            article_id = article["id"]
            stock_id = article.get("stock_id")

            # Store in sentiment_scores table (stock_id may be None)
            await sentiment_repository.insert_score(
                article_id=article_id,
                stock_id=stock_id,
                sentiment=prediction["sentiment"],
                confidence=prediction["confidence"],
                processing_ms=per_article_ms,
            )

            all_results.append(
                SentimentResult(
                    article_id=article_id,
                    headline_ar=article.get("headline_ar", ""),
                    sentiment=prediction["sentiment"],
                    confidence=prediction["confidence"],
                    processing_ms=per_article_ms,
                )
            )
            analyzed_ids.append(article_id)

    # Step 5: Mark articles as analyzed
    await news_repository.mark_analyzed(analyzed_ids)

    logger.info(
        "Batch analysis complete: %d articles analyzed, %d with stock linkage",
        len(all_results),
        sum(1 for a in articles if a.get("stock_id") is not None),
    )

    return SentimentBatchResponse(
        analyzed=len(all_results),
        results=all_results,
        model_version=manager.model_version,
    )


async def analyze_text(text: str) -> SentimentTestResponse:
    """Run sentiment inference on a single text string.

    Useful for testing and debugging the model.

    Args:
        text: Arabic text to analyze.

    Returns:
        SentimentTestResponse with sentiment, confidence, and timing.
    """
    manager = SentimentModelManager.get_instance()
    if not manager.is_loaded:
        raise RuntimeError("Sentiment model not loaded")

    start_time = time.perf_counter()
    predictions = manager.predict([text])
    elapsed_ms = (time.perf_counter() - start_time) * 1000

    prediction = predictions[0]

    return SentimentTestResponse(
        text=text,
        sentiment=prediction["sentiment"],
        confidence=prediction["confidence"],
        processing_ms=elapsed_ms,
    )
