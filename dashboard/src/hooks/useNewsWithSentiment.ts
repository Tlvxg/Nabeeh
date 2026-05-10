/**
 * React Query hook for fetching news articles with sentiment labels from Supabase.
 *
 * Usage:
 *   const { data, isLoading, error } = useNewsWithSentiment('2222', 10)
 */

import { useQuery } from '@tanstack/react-query'
import { fetchNewsWithSentimentFromSupabase, getStockIdBySymbol } from '../services/supabase-queries.ts'
import type { NewsWithSentiment } from '../types/stock.ts'

export function useNewsWithSentiment(symbol: string, limit = 10) {
  return useQuery<NewsWithSentiment[], Error>({
    queryKey: ['news', 'with-sentiment', symbol, limit],
    queryFn: async () => {
      const stockId = await getStockIdBySymbol(symbol)
      return fetchNewsWithSentimentFromSupabase(limit, stockId)
    },
    staleTime: 2 * 60_000, // 2 minutes — news updates moderately
    enabled: symbol.length > 0,
  })
}
