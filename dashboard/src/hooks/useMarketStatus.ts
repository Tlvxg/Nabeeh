/**
 * React Query hook for Tadawul market open/closed status.
 *
 * Computed entirely client-side — no backend API call.
 * Tadawul hours: Sun-Thu, 10:00-15:00 AST (07:00-12:00 UTC).
 *
 * Auto-refetches every 60 seconds to keep the status indicator current.
 *
 * Usage:
 *   const { data, isLoading, error } = useMarketStatus()
 */

import { useQuery } from '@tanstack/react-query'
import type { MarketStatus } from '../types/stock.ts'

/**
 * Check whether Tadawul (Saudi Exchange) is currently open.
 *
 * Open hours: Sunday through Thursday, 10:00-15:00 AST (UTC+3).
 * That is 07:00-12:00 UTC.
 */
export function isTadawulOpen(): boolean {
  const now = new Date()
  const utcDay = now.getUTCDay()     // 0=Sun … 6=Sat
  const utcHour = now.getUTCHours()
  const utcMin = now.getUTCMinutes()
  const utcTime = utcHour * 60 + utcMin  // minutes since midnight UTC

  // Trading days: Sun(0) through Thu(4)
  if (utcDay < 0 || utcDay > 4) return false
  // Sat(6) and Fri(5) are weekend
  if (utcDay === 5 || utcDay === 6) return false

  // Open 07:00 UTC (420 min) to 12:00 UTC (720 min)
  return utcTime >= 420 && utcTime < 720
}

/** Build a MarketStatus object from the client-side check. */
function getMarketStatus(): MarketStatus {
  const isOpen = isTadawulOpen()
  return {
    is_open: isOpen,
    status_ar: isOpen ? 'مفتوح' : 'مغلق',
    next_open: null,
  }
}

export function useMarketStatus() {
  return useQuery<MarketStatus, Error>({
    queryKey: ['market', 'status'],
    queryFn: () => Promise.resolve(getMarketStatus()),
    staleTime: 60_000,          // 1 minute
    refetchInterval: 60_000,    // auto-refetch every minute
  })
}
