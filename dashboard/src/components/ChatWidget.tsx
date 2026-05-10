import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { ChatMessage } from '../types/chat.ts'
import { sendChatMessage } from '../services/api.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { renderMarkdown } from '../utils/renderMarkdown.tsx'
import './ChatWidget.css'

/** Welcome message shown when chat first opens. */
const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'مرحباً! أنا نبيه، مساعدك الذكي لتحليل مخاطر الأسهم السعودية. اضغط على أي قسم لسؤالي عنه.',
  timestamp: Date.now(),
}

export interface MentionedSection {
  id: string
  title: string
  context: string
}

interface ChatWidgetProps {
  isOpen: boolean
  onClose: () => void
  symbol: string
  mentionedSection: MentionedSection | null
}

/**
 * AI chat panel — opens when user clicks "Ask AI" on a stock detail section.
 *
 * Receives the mentioned section context and prepends it to messages
 * so the AI knows which component the user is asking about.
 */
export function ChatWidget({ isOpen, onClose, symbol, mentionedSection }: ChatWidgetProps) {
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

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Clean up stage timers on unmount
  useEffect(() => {
    return () => {
      stageTimersRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach(t => clearTimeout(t))
    stageTimersRef.current = []
    setProcessingStage(0)
  }, [])

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
      const history = messages
        .filter(m => m !== WELCOME_MESSAGE)
        .map(m => ({ role: m.role, content: m.content }))

      // Prepend section context so AI knows what user is looking at
      let messageToSend = trimmed
      if (mentionedSection) {
        messageToSend = `[${mentionedSection.context}]\n${trimmed}`
      }

      const response = await sendChatMessage({
        message: messageToSend,
        symbol,
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
        err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setError(errorMsg)
    } finally {
      clearStageTimers()
      setIsLoading(false)
    }
  }, [input, isLoading, messages, symbol, mentionedSection, startStageTimers, clearStageTimers])

  const handleRetry = useCallback(() => {
    setError(null)
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
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [handleSend, onClose],
  )

  const theme = useTheme()
  const logoSrc = theme === 'dark'
    ? `${import.meta.env.BASE_URL}assets/logo-dark.svg`
    : `${import.meta.env.BASE_URL}assets/logo.svg`

  if (!isOpen) return null

  return createPortal(
    <div className="chat-widget__panel" role="dialog" aria-label="المساعد الذكي">
      {/* Header */}
      <div className="chat-widget__header">
        <div className="chat-widget__header-info">
          <img src={logoSrc} alt="نبيه" className="chat-widget__logo" />
          <div className="chat-widget__header-text">
            <h3 className="chat-widget__title">نبيه</h3>
            <span className="chat-widget__subtitle">المساعد الذكي</span>
          </div>
        </div>
        <button
          className="chat-widget__close"
          onClick={onClose}
          aria-label="إغلاق المحادثة"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mention badge */}
      {mentionedSection && (
        <div className="chat-widget__mention">
          <span className="chat-widget__mention-dot" />
          <span className="chat-widget__mention-label">يسأل عن:</span>
          <span className="chat-widget__mention-title">{mentionedSection.title}</span>
        </div>
      )}

      {/* Messages */}
      <div className="chat-widget__messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-widget__bubble chat-widget__bubble--${msg.role}`}
          >
            {msg.role === 'assistant'
              ? renderMarkdown(msg.content)
              : msg.content
            }
          </div>
        ))}
        {isLoading && processingStage > 0 && (
          <div className="chat-widget__loading">
            <div className="chat-widget__loading-dots">
              <span className="chat-widget__loading-dot" />
              <span className="chat-widget__loading-dot" />
              <span className="chat-widget__loading-dot" />
            </div>
            <span className="chat-widget__loading-text">
              {processingStage === 1 && 'جاري جلب البيانات...'}
              {processingStage === 2 && 'يفكر...'}
              {processingStage === 3 && 'يحلل النتائج...'}
            </span>
          </div>
        )}
        {error && (
          <div className="chat-widget__error">
            <span>حدث خطأ في الاتصال</span>
            <button className="chat-widget__retry" onClick={handleRetry}>
              إعادة المحاولة
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-widget__input-area">
        <textarea
          ref={inputRef}
          className="chat-widget__input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب سؤالك هنا..."
          rows={1}
          disabled={isLoading}
          dir="rtl"
        />
        <button
          className="chat-widget__send"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          aria-label="إرسال"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
