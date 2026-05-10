/**
 * React Query hook for fetching aggregated risk metrics from Supabase.
 *
 * Usage:
 *   const { data, isLoading, error } = useRiskMetrics('2222')
 */

import { useQuery } from '@tanstack/react-query'
import { fetchRiskMetricsFromSupabase } from '../services/supabase-queries.ts'
import type { RiskMetrics } from '../types/stock.ts'

export function useRiskMetrics(symbol: string) {
  return useQuery<RiskMetrics, Error>({
    queryKey: ['risk', 'summary', symbol],
    queryFn: () => fetchRiskMetricsFromSupabase(symbol),
    staleTime: 5 * 60_000, // 5 minutes — risk metrics change slowly
    enabled: symbol.length > 0,
  })
}
