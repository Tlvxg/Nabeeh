import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router'
import type { ChatMessage } from '../types/chat.ts'
import { sendChatMessage } from '../services/api.ts'
import { renderMarkdown } from '../utils/renderMarkdown.tsx'
import { useUserProfile } from '../hooks/useUserProfile.ts'
import { UpgradePrompt } from '../components/UpgradePrompt.tsx'
import './ChatbotPage.css'

/** Welcome message shown when the chatbot page loads. */
const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    '\u0645\u0631\u062d\u0628\u0627\u064b! \u0623\u0646\u0627 \u0646\u0628\u064a\u0647\u060c \u0645\u0633\u0627\u0639\u062f\u0643 \u0627\u0644\u0630\u0643\u064a \u0644\u062a\u062d\u0644\u064a\u0644 \u0645\u062e\u0627\u0637\u0631 \u0627\u0644\u0623\u0633\u0647\u0645 \u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629. \u0643\u064a\u0641 \u064a\u0645\u0643\u0646\u0646\u064a \u0645\u0633\u0627\u0639\u062f\u062a\u0643\u061f',
  timestamp: Date.now(),
}

/**
 * Full-page chatbot interface.
 *
 * Provides a dedicated page for conversing with the AI assistant,
 * with message history, input field, and send button. Reuses the
 * same backend endpoint as the floating ChatWidget.
 */
export function ChatbotPage() {
  const location = useLocation()
  const currentSymbol = location.pathname.match(/\/stock\/(\d{4})/)?.[1] ?? '2222'
  const { isPremium, isLoading: profileLoading } = useUserProfile()

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processingStage, setProcessingStage] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

  // Clean up stage timers on unmount
  useEffect(() => {
    return () => {
      stageTimersRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  /** Clear all progressive stage timers and reset stage. */
  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach(t => clearTimeout(t))
    stageTimersRef.current = []
    setProcessingStage(0)
  }, [])

  /** Start progressive stage indicators (fetching -> thinking -> analyzing). */
  const startStageTimers = useCallback(() => {
    clearStageTimers()
    setProcessingStage(1)
    const t1 = setTimeout(() => setProcessingStage(2), 1500)
    const t2 = setTimeout(() => setProcessingStage(3), 3000)
    stageTimersRef.current = [t1, t2]
  }, [clearStageTimers])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setError(null)
    setIsLoading(true)
    startStageTimers()

    try {
      // Build conversation history (exclude welcome message, just role+content)
      const history = messages
        .filter(m => m !== WELCOME_MESSAGE)
        .map(m => ({ role: m.role, content: m.content }))

      const response = await sendChatMessage({
        message: trimmed,
        symbol: currentSymbol,
        conversation_history: history,
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : '\u062d\u062f\u062b \u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u062a\u0648\u0642\u0639'
      setError(errorMsg)
    } finally {
      clearStageTimers()
      setIsLoading(false)
    }
  }, [input, isLoading, messages, currentSymbol, startStageTimers, clearStageTimers])

  const handleRetry = useCallback(() => {
    setError(null)
    // Re-populate input with last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      setMessages(prev => prev.filter(m => m !== lastUserMsg))
      setInput(lastUserMsg.content)
    }
  }, [messages])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="chatbot-page">
      <div className="chatbot-page__container">
        {/* Header — always visible */}
        <header className="chatbot-page__header">
          <div className="chatbot-page__header-info">
            <div>
              <h1 className="chatbot-page__title">{'\u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0630\u0643\u064a'}</h1>
              <p className="chatbot-page__subtitle">{'\u0646\u0628\u064a\u0647 - \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062e\u0627\u0637\u0631'}</p>
            </div>
          </div>
        </header>

        {/* Premium gate: loading / upgrade prompt / chat interface */}
        {profileLoading ? (
          <div className="chatbot-page__gate-loading">
            <div className="chatbot-page__gate-spinner" />
          </div>
        ) : !isPremium ? (
          <UpgradePrompt
            variant="page"
            feature="المساعد الذكي"
            description="احصل على تحليل مخاطر مدعوم بالذكاء الاصطناعي، إجابات فورية عن أسئلتك حول الأسهم السعودية"
          />
        ) : (
          <>
            {/* Messages */}
            <div className="chatbot-page__messages">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`chatbot-page__bubble chatbot-page__bubble--${msg.role}`}
                >
                  {msg.role === 'assistant'
                    ? renderMarkdown(msg.content)
                    : msg.content
                  }
                </div>
              ))}
              {isLoading && processingStage > 0 && (
                <div className="chatbot-page__bubble chatbot-page__bubble--assistant chatbot-page__state-indicator">
                  <span className="chatbot-page__state-dot" />
                  <span className="chatbot-page__state-text">
                    {processingStage === 1 && '\u062c\u0627\u0631\u064a \u062c\u0644\u0628 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a...'}
                    {processingStage === 2 && '\u064a\u0641\u0643\u0631...'}
                    {processingStage === 3 && '\u064a\u062d\u0644\u0644 \u0627\u0644\u0646\u062a\u0627\u0626\u062c...'}
                  </span>
                </div>
              )}
              {error && (
                <div className="chatbot-page__error">
                  <span>{'\u062d\u062f\u062b \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644'}</span>
                  <button className="chatbot-page__retry" onClick={handleRetry}>
                    {'\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629'}
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chatbot-page__input-area">
              <textarea
                ref={inputRef}
                className="chatbot-page__input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={'\u0627\u0643\u062a\u0628 \u0633\u0624\u0627\u0644\u0643 \u0647\u0646\u0627...'}
                rows={1}
                disabled={isLoading}
                dir="rtl"
              />
              <button
                className="chatbot-page__send"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                aria-label={'\u0625\u0631\u0633\u0627\u0644'}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
