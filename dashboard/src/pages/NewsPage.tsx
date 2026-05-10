/**
 * NewsPage — dedicated news feed for supported stocks with AI sentiment tags.
 * Only shows articles matched to stocks in our system.
 */

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNewsWithSentimentFromSupabase } from '../services/supabase-queries.ts'
import { ensureFreshNews } from '../services/api.ts'
import { NewsCard } from '../components/NewsCard.tsx'
import './NewsPage.css'

const PAGE_SIZE = 20

export function NewsPage() {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const queryClient = useQueryClient()

  // Fire-and-forget: ask backend to refresh news if stale (>6h old)
  useEffect(() => {
    ensureFreshNews().then(() => {
      queryClient.invalidateQueries({ queryKey: ['news'] })
    })
  }, [queryClient])

  // Fetch news for supported stocks only (stock_id IS NOT NULL)
  const { data: articles, isLoading, isError } = useQuery({
    queryKey: ['news', 'supported-stocks', 'with-sentiment'],
    queryFn: () => fetchNewsWithSentimentFromSupabase(),
    staleTime: 2 * 60_000,
  })

  return (
    <div className="news-page">
      <header className="news-page__header">
        <h1>أخبار الأسهم المدعومة</h1>
        <p>أخبار الأسهم في نظام نبيه مع تحليل المشاعر بالذكاء الاصطناعي</p>
      </header>

      {isLoading && (
        <div className="news-page__list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="news-page__skeleton" />
          ))}
        </div>
      )}

      {isError && (
        <div className="news-page__empty">
          <p>حدث خطأ في تحميل الأخبار</p>
        </div>
      )}

      {!isLoading && !isError && articles && articles.length === 0 && (
        <div className="news-page__empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <line x1="6" y1="8" x2="18" y2="8" />
            <line x1="6" y1="12" x2="14" y2="12" />
            <line x1="6" y1="16" x2="10" y2="16" />
          </svg>
          <p>لا توجد أخبار متعلقة بالأسهم المدعومة حالياً</p>
        </div>
      )}

      {!isLoading && !isError && articles && articles.length > 0 && (
        <div className="news-page__list">
          {articles.slice(0, visibleCount).map((article) => (
            <NewsCard key={article.id} article={article} />
          ))}
          {visibleCount < articles.length && (
            <button
              className="news-page__show-more"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              <span>عرض المزيد</span>
              <span className="news-page__show-more-count">
                {`${Math.min(visibleCount, articles.length)} من ${articles.length}`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
