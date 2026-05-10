"""Pydantic schemas for the assistant module."""

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """Single message in conversation history."""

    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message text content")


class ChatRequest(BaseModel):
    """Request body for the chat endpoint."""

    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    symbol: str = Field(default="2222", description="Tadawul stock symbol for context")
    conversation_history: list[ChatMessage] = Field(
        default_factory=list, description="Previous messages for multi-turn context"
    )


class ChatResponse(BaseModel):
    """Response from the chat endpoint."""

    reply: str = Field(..., description="Assistant reply text")
    context_used: list[str] = Field(
        default_factory=list, description="Data sources used to build context"
    )


class AssistantHealthResponse(BaseModel):
    """Health check response for the assistant module."""

    configured: bool = Field(..., description="Whether OPENROUTER_API_KEY is set")
    model: str = Field(default="deepseek/deepseek-v4-pro", description="Model in use")
