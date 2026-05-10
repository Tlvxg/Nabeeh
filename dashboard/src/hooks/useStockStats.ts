/**
 * React Query hook for fetching computed stock statistics.
 *
 * Reads directly from Supabase stock_stats (no backend API call).
 *
 * Usage:
 *   const { data, isLoading, error } = useStockStats('2222')
 */

import { useQuery } from '@tanstack/react-query'
import { fetchStockStatsFromSupabase } from '../services/supabase-queries.ts'
import type { StockStats } from '../types/stock.ts'

export function useStockStats(symbol: string) {
  return useQuery<StockStats, Error>({
    queryKey: ['stock', 'stats', symbol],
    queryFn: () => fetchStockStatsFromSupabase(symbol),
    staleTime: 5 * 60_000, // 5 minutes — stats don't change often
    enabled: symbol.length > 0,
  })
}
