/**
 * React Query hook for fetching the TASI index value and daily change.
 *
 * Auto-refetches every 60 seconds to keep the market bar current.
 *
 * Usage:
 *   const { data, isLoading, error } = useTASIIndex()
 */

import { useQuery } from '@tanstack/react-query'
import { fetchTASIIndex } from '../services/api.ts'
import type { TASIIndex } from '../types/stock.ts'

export function useTASIIndex() {
  return useQuery<TASIIndex, Error>({
    queryKey: ['market', 'tasi'],
    queryFn: fetchTASIIndex,
    staleTime: 60_000,          // 1 minute
    refetchInterval: 60_000,    // auto-refetch every minute
  })
}
