/**
 * API service — typed fetch functions for backend endpoints.
 *
 * After the Supabase migration (Phase 24), only the following remain:
 *   - fetchTASIIndex: TASI not in Supabase, fetched live from yfinance via backend
 *   - sendChatMessage: POST action, requires backend AI assistant proxy
 *   - fetchAssistantHealth: backend health check for AI assistant
 *
 * All stock/price/risk/news/sentiment reads now go through supabase-queries.ts.
 */

import type { TASIIndex } from '../types/stock.ts'
import type { ChatRequest, ChatResponse, AssistantHealth } from '../types/chat.ts'

/** Resolve the API base URL (no trailing slash). */
function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined
  // If explicitly set (including ""), respect it.
  if (envUrl !== undefined) return envUrl
  // Production default: same-origin → vercel.json rewrites route to api/*.py.
  // Development default: backend running on localhost:8000.
  return import.meta.env.PROD ? '' : 'http://localhost:8000'
}

/** Shared fetch helper with error handling. */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase()
  const url = `${base}${path}`

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  }
  // Ensure JSON content-type for POST/PUT/PATCH bodies
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, { ...init, headers })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `API error ${res.status}: ${res.statusText}${body ? ` — ${body}` : ''}`
    )
  }

  return res.json() as Promise<T>
}

/** Fetch current TASI index value and daily change. */
export function fetchTASIIndex(): Promise<TASIIndex> {
  return apiFetch<TASIIndex>('/api/v1/prices/market/tasi')
}

/** Send a chat message to the AI assistant and receive a contextual reply. */
export function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/api/v1/assistant/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/** Check whether the AI assistant is configured and ready. */
export function fetchAssistantHealth(): Promise<AssistantHealth> {
  return apiFetch<AssistantHealth>('/api/v1/assistant/health')
}

/**
 * Ensure news is fresh — fire-and-forget on page load.
 * If news is older than 6 hours, the backend auto-fetches + runs sentiment.
 * Silently swallows errors so it never blocks UI.
 */
export async function ensureFreshNews(): Promise<void> {
  try {
    await apiFetch<unknown>('/api/v1/news/ensure-fresh')
  } catch {
    // Non-critical — stale news is better than no news
  }
}

