/**
 * WatchlistSection — compact card grid showing the user's watchlisted stocks.
 * Displayed on the dashboard for premium users.
 */

import { Link } from 'react-router'
import type { StockSummaryRow } from '../services/supabase-queries.ts'
import { StockLogo } from './StockLogo.tsx'
import './WatchlistSection.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRiskLevel(score: number | null): 'low' | 'medium' | 'high' | null {
  if (score == null) return null
  if (score <= 33) return 'low'
  if (score <= 66) return 'medium'
  return 'high'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchlistSectionProps {
  watchlist: string[]
  stocksSummary: StockSummaryRow[]
  isLoading: boolean
  onRemove: (symbol: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatchlistSection({ watchlist, stocksSummary, isLoading, onRemove }: WatchlistSectionProps) {
  // Loading skeleton
  if (isLoading) {
    return (
      <div className="watchlist__grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="watchlist__card watchlist__card--skeleton">
            <div className="watchlist__skeleton-logo" />
            <div className="watchlist__skeleton-lines">
              <div className="watchlist__skeleton-line" style={{ width: '70%' }} />
              <div className="watchlist__skeleton-line watchlist__skeleton-line--sm" style={{ width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Empty state
  if (watchlist.length === 0) {
    return (
      <div className="watchlist__empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <p className="watchlist__empty-text">
          لم تضف أي أسهم بعد
        </p>
        <p className="watchlist__empty-hint">
          اختر أسهمك المفضلة من صفحات التفاصيل
        </p>
      </div>
    )
  }

  // Filter stocksSummary to only include watchlisted symbols
  const watchedStocks = stocksSummary.filter(s => watchlist.includes(s.symbol))

  return (
    <div className="watchlist__grid">
      {watchedStocks.map(stock => {
        const riskLevel = getRiskLevel(stock.risk_score)
        const changePositive = stock.change_percent != null && stock.change_percent > 0
        const changeNegative = stock.change_percent != null && stock.change_percent < 0
        const changeClass = changePositive
          ? 'watchlist__change--positive'
          : changeNegative
            ? 'watchlist__change--negative'
            : ''

        return (
          <Link
            key={stock.symbol}
            to={`/stock/${stock.symbol}`}
            className="watchlist__card"
          >
            {/* Remove button */}
            <button
              className="watchlist__remove"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove(stock.symbol)
              }}
              title="إزالة من المتابعة"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Stock info */}
            <StockLogo symbol={stock.symbol} size={32} />
            <div className="watchlist__info">
              <span className="watchlist__name">{stock.name_ar}</span>
              <span className="watchlist__ticker">{stock.symbol}.SR</span>
            </div>

            {/* Price + change */}
            <div className="watchlist__price-col">
              <span className="watchlist__price">
                {stock.price != null
                  ? `${stock.price.toLocaleString('ar-SA')} ر.س`
                  : '\u2014'}
              </span>
              <span className={`watchlist__change ${changeClass}`}>
                {stock.change_percent != null
                  ? `${stock.change_percent >= 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%`
                  : '\u2014'}
              </span>
            </div>

            {/* Risk dot */}
            {riskLevel && (
              <span className={`watchlist__risk-dot watchlist__risk-dot--${riskLevel}`} />
            )}
          </Link>
        )
      })}
    </div>
  )
}
