/**
 * React Query hook for pre-computed Monte Carlo simulation results from Supabase.
 *
 * Reads pre-computed percentile paths (p5/p25/p50/p75/p95) from the
 * monte_carlo_results table. Parameters (days=252, paths=10000) are fixed
 * by the backend cron — no need to send them from the client.
 *
 * Unlike useMonteCarloSimulation (Web Worker client-side), this reads
 * the server-side numpy-vectorised GBM results stored in Supabase.
 *
 * Usage:
 *   const { data, isLoading, error } = useServerMonteCarlo('2222')
 */

import { useQuery } from '@tanstack/react-query'
import { fetchMonteCarloFromSupabase } from '../services/supabase-queries.ts'
import type { MonteCarloResult } from '../types/stock.ts'

export function useServerMonteCarlo(symbol: string, _days = 252, _paths = 10000) {
  return useQuery<MonteCarloResult, Error>({
    queryKey: ['risk', 'monte-carlo', symbol],
    queryFn: () => fetchMonteCarloFromSupabase(symbol),
    staleTime: 10 * 60_000, // 10 minutes — expensive computation
    enabled: symbol.length > 0,
  })
}
