/**
 * React Query hook for fetching the current stock price.
 *
 * Reads directly from Supabase (no backend API call).
 *
 * Usage:
 *   const { data, isLoading, error } = useStockPrice('2222')
 */

import { useQuery } from '@tanstack/react-query'
import { fetchStockPriceFromSupabase } from '../services/supabase-queries.ts'
import type { StockPrice } from '../types/stock.ts'

export function useStockPrice(symbol: string) {
  return useQuery<StockPrice, Error>({
    queryKey: ['stock', 'price', symbol],
    queryFn: () => fetchStockPriceFromSupabase(symbol),
    staleTime: 60_000, // 1 minute — price data should be relatively fresh
    enabled: symbol.length > 0,
  })
}
