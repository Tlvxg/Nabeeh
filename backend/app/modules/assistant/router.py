"""API endpoints for the assistant module."""

from fastapi import APIRouter

from app.config import settings
from app.modules.assistant import service
from app.modules.assistant.schemas import (
    ChatRequest,
    ChatResponse,
    AssistantHealthResponse,
)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    """
    Send a message to the AI assistant and receive a contextual reply.

    The assistant gathers real-time stock data (price, risk metrics,
    sentiment) for the given symbol and uses it to ground its response.

    Gracefully degrades if OPENROUTER_API_KEY is not configured.
    """
    result = await service.chat(
        message=body.message,
        symbol=body.symbol,
        history=[msg.model_dump() for msg in body.conversation_history],
    )
    return ChatResponse(**result)


@router.get("/health", response_model=AssistantHealthResponse)
async def health():
    """Check whether the assistant service is configured and ready."""
    return AssistantHealthResponse(
        configured=bool(settings.OPENROUTER_API_KEY),
    )
