/**
 * NewsCard — single news article card with sentiment label.
 * Displays headline, source badge, relative timestamp, and sentiment pill.
 */

import type { NewsWithSentiment } from '../types/stock.ts'
import { StockLogo } from './StockLogo.tsx'
import { NabeehAILogo } from './NabeehAILogo.tsx'
import './NewsCard.css'

interface NewsCardProps {
  article: NewsWithSentiment
  compact?: boolean
  onAskAI?: () => void
}

/** Arabic sentiment labels. */
const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'إيجابي',
  negative: 'سلبي',
  neutral: 'محايد',
}

/** Format a date string as Arabic relative time (e.g., "منذ ٣ ساعات"). */
function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  if (isNaN(then)) return ''

  const minutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)

  const fmt = (n: number) => n.toLocaleString('ar-SA')

  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${fmt(minutes)} دقيقة`
  if (hours < 24) return `منذ ${fmt(hours)} ساعة`
  if (days < 30) return `منذ ${fmt(days)} يوم`

  // Fallback: formatted date
  return new Date(dateStr).toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'short',
  })
}

export function NewsCard({ article, compact = false, onAskAI }: NewsCardProps) {
  const sentimentLabel = article.sentiment
    ? SENTIMENT_LABELS[article.sentiment] ?? article.sentiment
    : 'لم يُحلل بعد'

  const sentimentClass = article.sentiment
    ? `ncard__pill--${article.sentiment}`
    : 'ncard__pill--unknown'

  return (
    <a
      className={`ncard ${compact ? 'ncard--compact' : ''}`}
      href={article.source_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="ncard__body">
        <h3 className="ncard__headline">{article.headline_ar}</h3>
        {!compact && article.snippet_ar && (
          <p className="ncard__snippet">{article.snippet_ar}</p>
        )}
      </div>

      <div className="ncard__meta">
        {article.stock_symbol && (
          <span className="ncard__stock-tag">
            <StockLogo symbol={article.stock_symbol} size={16} className="ncard__stock-logo" />
            {article.stock_name_ar}
          </span>
        )}
        <span className="ncard__source">{article.source}</span>
        <span className="ncard__time">{relativeTime(article.published_at)}</span>
        <span className={`ncard__pill ${sentimentClass}`}>
          {sentimentLabel}
        </span>
        {onAskAI && (
          <button
            className="ncard__ask-ai"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAskAI() }}
            title="اسأل نبيه عن هذا الخبر"
          >
            <NabeehAILogo size={14} />
          </button>
        )}
      </div>
    </a>
  )
}
