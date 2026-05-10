/**
 * React Query hook for fetching historical OHLCV data.
 *
 * Reads directly from Supabase daily_prices (no backend API call).
 *
 * Usage:
 *   const { data, isLoading, error } = useStockHistory('2222', '1y', '1d')
 */

import { useQuery } from '@tanstack/react-query'
import { fetchStockHistoryFromSupabase } from '../services/supabase-queries.ts'
import type { OHLCVResponse } from '../types/stock.ts'

/** Map period strings to approximate trading-day counts. */
const PERIOD_TO_DAYS: Record<string, number | undefined> = {
  '1mo': 30,
  '3mo': 90,
  '6mo': 180,
  '1y': 252,
  '2y': 504,
  '5y': 1260,
  'max': undefined,
}

export function useStockHistory(
  symbol: string,
  period = '1y',
  _interval = '1d',
) {
  const days = PERIOD_TO_DAYS[period]

  return useQuery<OHLCVResponse, Error>({
    queryKey: ['stock', 'history', symbol, period, _interval],
    queryFn: () => fetchStockHistoryFromSupabase(symbol, days),
    staleTime: 5 * 60_000, // 5 minutes — historical data doesn't change often
    enabled: symbol.length > 0,
  })
}
