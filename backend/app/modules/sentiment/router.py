"""API endpoints for the sentiment module."""

from fastapi import APIRouter, HTTPException, Query

from app.modules.sentiment.model import SentimentModelManager
from app.modules.sentiment import service
from app.modules.sentiment.schemas import (
    SentimentBatchResponse,
    SentimentHealthResponse,
    SentimentTestRequest,
    SentimentTestResponse,
)

router = APIRouter()


def _require_model_loaded() -> SentimentModelManager:
    """Check that the sentiment model is loaded, raise 503 if not."""
    manager = SentimentModelManager.get_instance()
    if not manager.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="Sentiment model not loaded. The model may still be loading or failed to initialize.",
        )
    return manager


@router.get("/health", response_model=SentimentHealthResponse)
async def sentiment_health():
    """Check if the sentiment model is loaded and ready for inference."""
    manager = SentimentModelManager.get_instance()
    return SentimentHealthResponse(
        loaded=manager.is_loaded,
        model=manager.MODEL_ID if manager.is_loaded else "not loaded",
        labels=manager.LABELS if manager.is_loaded else None,
    )


@router.post("/analyze", response_model=SentimentBatchResponse)
async def analyze_articles(
    limit: int = Query(
        default=50, ge=1, le=200, description="Max articles to analyze"
    ),
):
    """Trigger batch sentiment analysis of unanalyzed news articles.

    Fetches articles where is_analyzed=false, runs MARBERTv2 inference,
    stores results in sentiment_scores table, and marks articles as analyzed.
    """
    _require_model_loaded()

    try:
        result = await service.analyze_unanalyzed(limit=limit)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sentiment analysis failed: {e}",
        )


@router.post("/test", response_model=SentimentTestResponse)
async def test_sentiment(request: SentimentTestRequest):
    """Test sentiment analysis with a single Arabic text string.

    Useful for debugging and verifying model behavior.
    """
    _require_model_loaded()

    try:
        result = await service.analyze_text(request.text)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sentiment test failed: {e}",
        )
