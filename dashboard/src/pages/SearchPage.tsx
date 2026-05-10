import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.ts'
import { useActiveStocks } from '../hooks/useActiveStocks.ts'
import {
  fetchSearchHistory,
  addToSearchHistory,
  clearSearchHistory,
} from '../services/supabase-queries.ts'
import { StockLogo } from '../components/StockLogo.tsx'
import './SearchPage.css'

export function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { data: stocks } = useActiveStocks()

  const historyQueryKey = ['searchHistory', user?.id] as const

  const { data: history } = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => fetchSearchHistory(user!.id),
    enabled: !!user?.id,
    staleTime: 2 * 60_000,
  })

  // Build search aliases dynamically from DB data
  const searchAliases = useMemo(() => {
    if (!stocks) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const s of stocks) {
      map.set(s.symbol, s.symbol)
      map.set(s.name_ar, s.symbol)
      map.set(s.name_en.toLowerCase(), s.symbol)
    }
    return map
  }, [stocks])

  // Save symbol to history (optimistic) without navigating — used by card onClick
  const saveHistory = useCallback((symbol: string) => {
    if (user?.id) {
      queryClient.setQueryData<string[]>(historyQueryKey, (old) => {
        const filtered = (old ?? []).filter(s => s !== symbol)
        return [symbol, ...filtered].slice(0, 10)
      })
      addToSearchHistory(user.id, symbol).then(() => {
        queryClient.invalidateQueries({ queryKey: historyQueryKey })
      })
    }
    setSearchQuery('')
  }, [user?.id, queryClient, historyQueryKey])

  // Navigate to stock AND save history — used by form submit only
  const goToStock = useCallback((symbol: string) => {
    saveHistory(symbol)
    navigate(`/stock/${symbol}`)
  }, [navigate, saveHistory])

  const handleClear = useCallback(async () => {
    if (!user?.id) return
    queryClient.setQueryData<string[]>(historyQueryKey, [])
    await clearSearchHistory(user.id)
    queryClient.invalidateQueries({ queryKey: historyQueryKey })
  }, [user?.id, queryClient, historyQueryKey])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim().toLowerCase()
    if (!q) return

    // Direct match in aliases
    const match = searchAliases.get(q)
    if (match) { goToStock(match); return }

    // Partial match
    for (const [key, symbol] of searchAliases) {
      if (key.includes(q) || q.includes(key)) { goToStock(symbol); return }
    }

    // 4-digit Tadawul ticker pattern
    if (/^\d{4}$/.test(q)) { goToStock(q); return }

    // No match — show visual feedback
    setSearchError(true)
    setTimeout(() => setSearchError(false), 2000)
  }

  // Resolve history symbols to stock data
  const recentStocks = useMemo(() => {
    if (!stocks || !history || history.length === 0) return []
    return history
      .slice(0, 5)
      .map((sym) => stocks.find((s) => s.symbol === sym))
      .filter((s): s is NonNullable<typeof s> => s != null)
  }, [stocks, history])

  // Live-filter the stock list as user types (Arabic name, English name, or ticker)
  const filteredStocks = useMemo(() => {
    if (!stocks) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return stocks
    return stocks.filter((s) =>
      s.symbol.includes(q) ||
      s.name_ar.includes(q) ||
      s.name_en.toLowerCase().includes(q)
    )
  }, [stocks, searchQuery])

  return (
    <div className="search-page">
      <div className="search-page__container">
        <header className="search-page__header">
          <svg
            className="search-page__header-icon"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <h1>البحث عن الأسهم</h1>
          <p>ابحث عن الأسهم السعودية باسم الشركة أو رمز التداول</p>
        </header>

        <form className="search-page__form" onSubmit={handleSearch}>
          <div className={`search-page__input-wrap${searchError ? ' search-page__input-wrap--error' : ''}`}>
            <svg
              className="search-page__search-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="ابحث عن سهم... (مثال: أرامكو، 2222)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (searchError) setSearchError(false)
              }}
              autoFocus
              dir="rtl"
            />
          </div>
          {searchError && (
            <p className="search-page__error">لم يتم العثور على السهم. جرّب اسماً آخر أو رمز التداول.</p>
          )}
        </form>

        {recentStocks.length > 0 && !searchQuery.trim() && (
          <section className="search-page__recent">
            <div className="search-page__recent-header">
              <h2>عمليات البحث الأخيرة</h2>
              <button
                className="search-page__clear-btn"
                onClick={handleClear}
                type="button"
              >
                مسح
              </button>
            </div>
            <div className="search-page__stock-list">
              {recentStocks.map((stock) => (
                <Link
                  key={stock.symbol}
                  to={`/stock/${stock.symbol}`}
                  className="search-page__stock-card"
                  onClick={() => saveHistory(stock.symbol)}
                >
                  <StockLogo symbol={stock.symbol} size={36} />
                  <span className="search-page__stock-name">{stock.name_ar}</span>
                  <span className="search-page__stock-ticker">{stock.symbol}.SR</span>
                  <span className="search-page__stock-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="search-page__stocks">
          <h2>{searchQuery.trim() ? 'نتائج البحث' : 'الأسهم المتاحة'}</h2>
          <div className="search-page__stock-list">
            {filteredStocks.length > 0 ? (
              filteredStocks.map((stock) => (
                <Link
                  key={stock.symbol}
                  to={`/stock/${stock.symbol}`}
                  className="search-page__stock-card"
                  onClick={() => saveHistory(stock.symbol)}
                >
                  <StockLogo symbol={stock.symbol} size={36} />
                  <span className="search-page__stock-name">{stock.name_ar}</span>
                  <span className="search-page__stock-ticker">{stock.symbol}.SR</span>
                  <span className="search-page__stock-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </span>
                </Link>
              ))
            ) : searchQuery.trim() ? (
              <div className="search-page__no-results">
                لم يتم العثور على نتائج
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
