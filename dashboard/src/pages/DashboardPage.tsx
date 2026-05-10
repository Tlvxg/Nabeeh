import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAllStocksSummary } from '../hooks/useAllStocksSummary.ts'
import { useMarketStatus } from '../hooks/useMarketStatus.ts'
import { useTASIIndex } from '../hooks/useTASIIndex.ts'
import { useUserProfile } from '../hooks/useUserProfile.ts'
import { useWatchlist } from '../hooks/useWatchlist.ts'
import { StockTable } from '../components/StockTable.tsx'
import { WatchlistSection } from '../components/WatchlistSection.tsx'
import './DashboardPage.css'

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState(false)
  const navigate = useNavigate()
  const { data: stocksSummary, isLoading: summaryLoading } = useAllStocksSummary()
  const { data: market, isLoading: marketLoading, error: marketError } = useMarketStatus()
  const { data: tasi, isLoading: tasiLoading, error: tasiError } = useTASIIndex()
  const { isPremium } = useUserProfile()
  const { watchlist, isLoading: watchlistLoading, removeStock } = useWatchlist()

  // Log errors for debugging but don't show to user (graceful degradation)
  if (marketError) console.error('Market status fetch failed:', marketError)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim().toLowerCase()
    if (!q) return

    // Match against active stocks: symbol, name_ar, name_en
    if (stocksSummary) {
      const match = stocksSummary.find(s =>
        s.symbol === q ||
        s.name_ar.includes(q) ||
        s.name_en.toLowerCase().includes(q)
      )
      if (match) {
        setSearchQuery('')
        navigate(`/stock/${match.symbol}`)
        return
      }
    }

    // 4-digit Tadawul ticker pattern
    if (/^\d{4}$/.test(q)) {
      setSearchQuery('')
      navigate(`/stock/${q}`)
      return
    }

    // No match — show visual feedback
    setSearchError(true)
    setTimeout(() => setSearchError(false), 2000)
  }

  // Derive market status display
  const marketIsOpen = market?.is_open ?? false
  const marketStatusText = marketLoading ? '...' : (market?.status_ar ?? 'السوق مغلق')

  // Derive TASI display values
  const tasiReady = !tasiLoading && tasi != null && !tasiError

  const displayTASI = tasiReady
    ? tasi.value.toLocaleString('ar-SA')
    : tasiLoading ? '...' : 'غير متاح'

  const displayTASIChange = tasiReady
    ? `${tasi.change_percent >= 0 ? '+' : ''}${tasi.change_percent.toFixed(2)}%`
    : tasiLoading ? '...' : 'غير متاح'

  const tasiChangeClass = tasiReady
    ? tasi.change_percent >= 0
      ? 'dash__market-change--positive'
      : 'dash__market-change--negative'
    : ''

  const displayTASIVolume = tasiReady
    ? tasi.volume.toLocaleString('ar-SA')
    : tasiLoading ? '...' : 'غير متاح'

  return (
    <div className="dash">
      {/* Header row */}
      <div className="dash__header animate-in animate-in-1">
        <div>
          <h1 className="dash__title">لوحة التحكم</h1>
          <p className="dash__subtitle">تحليل مخاطر الأسهم السعودية</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="dash__search-wrap animate-in animate-in-2">
        <form className={`dash__search${searchError ? ' dash__search--error' : ''}`} onSubmit={handleSearch}>
          <svg className="dash__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="dash__search-input"
            placeholder="ابحث عن سهم... (مثال: أرامكو، 2222)"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (searchError) setSearchError(false)
            }}
          />
        </form>
        {searchError && (
          <p className="dash__search-hint">لم يتم العثور على السهم</p>
        )}
      </div>

      {/* Market overview */}
      <div className="dash__market animate-in animate-in-3">
        {(marketLoading || tasiLoading) ? (
          <div className="dash__market-skeleton">
            <div className="dash__skeleton-line" style={{ width: '60px' }} />
            <div className="dash__skeleton-line" style={{ width: '1px', height: '24px' }} />
            <div className="dash__skeleton-line" style={{ width: '45%' }} />
            <div className="dash__skeleton-line dash__skeleton-line--lg" style={{ width: '60%' }} />
            <div className="dash__skeleton-line" style={{ width: '1px', height: '24px' }} />
            <div className="dash__skeleton-line" style={{ width: '35%' }} />
          </div>
        ) : (
          <>
            {/* Market status */}
            <div className="dash__market-item dash__market-status">
              <span className={`dash__market-status-dot ${marketIsOpen ? 'dash__market-status-dot--open' : ''}`} />
              <span className="dash__market-status-text">{marketStatusText}</span>
            </div>
            <span className="dash__market-sep" />
            {/* TASI index + change */}
            <div className="dash__market-item">
              <span className="dash__market-label">مؤشر تاسي</span>
              <span className="dash__market-val">{displayTASI}</span>
              <span className={`dash__market-change ${tasiChangeClass}`}>{displayTASIChange}</span>
            </div>
            <span className="dash__market-sep" />
            {/* Volume */}
            <div className="dash__market-item">
              <span className="dash__market-label">حجم التداول</span>
              <span className="dash__market-val">{displayTASIVolume}</span>
            </div>
          </>
        )}
      </div>

      {/* Watchlist section — premium users only */}
      {isPremium && (
        <section className="dash__section animate-in animate-in-4">
          <h2 className="dash__section-title dash__watchlist-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#d4a017' }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            قائمة المتابعة
          </h2>
          <WatchlistSection
            watchlist={watchlist}
            stocksSummary={stocksSummary ?? []}
            isLoading={watchlistLoading || summaryLoading}
            onRemove={removeStock}
          />
        </section>
      )}

      {/* Stock table */}
      <section className="dash__section animate-in animate-in-5">
        <h2 className="dash__section-title">أسهم تداول</h2>
        <StockTable
          data={stocksSummary ?? []}
          isLoading={summaryLoading}
        />
      </section>

    </div>
  )
}
