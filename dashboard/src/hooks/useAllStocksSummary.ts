import { useQuery } from '@tanstack/react-query'
import { fetchAllStocksSummary, type StockSummaryRow } from '../services/supabase-queries.ts'

/**
 * Batch-fetches all active stocks with price + risk for the dashboard table.
 * Replaces N individual useStockPrice/useRiskScore hook calls.
 */
export function useAllStocksSummary() {
  return useQuery<StockSummaryRow[]>({
    queryKey: ['all-stocks-summary'],
    queryFn: fetchAllStocksSummary,
    staleTime: 5 * 60 * 1000, // 5 min — same as useActiveStocks
    refetchOnWindowFocus: false,
  })
}
