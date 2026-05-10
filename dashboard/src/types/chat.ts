/**
 * TypeScript types for the AI assistant chat, matching backend schemas.
 * @see backend/app/modules/assistant/schemas.py
 */

/** Single message in conversation history. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** Request body for the chat endpoint. */
export interface ChatRequest {
  message: string
  symbol: string
  conversation_history: { role: string; content: string }[]
}

/** Response from the chat endpoint. */
export interface ChatResponse {
  reply: string
  context_used: string[]
}

/** Health check response for the assistant. */
export interface AssistantHealth {
  configured: boolean
  model: string
}
