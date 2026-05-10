/**
 * React Query hook for fetching aggregate sentiment summary from Supabase.
 *
 * Usage:
 *   const { data, isLoading, error } = useSentimentSummary('2222')
 */

import { useQuery } from '@tanstack/react-query'
import { fetchSentimentSummaryFromSupabase } from '../services/supabase-queries.ts'
import type { SentimentSummary } from '../types/stock.ts'

export function useSentimentSummary(symbol: string) {
  return useQuery<SentimentSummary, Error>({
    queryKey: ['news', 'sentiment-summary', symbol],
    queryFn: () => fetchSentimentSummaryFromSupabase(symbol),
    staleTime: 2 * 60_000, // 2 minutes
    enabled: symbol.length > 0,
  })
}
