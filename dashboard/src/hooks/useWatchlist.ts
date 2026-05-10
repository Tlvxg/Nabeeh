import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth.ts'
import { useUserProfile } from './useUserProfile.ts'
import {
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '../services/supabase-queries.ts'

/**
 * Hook to manage the current user's stock watchlist.
 *
 * Returns:
 * - watchlist: string[] of stock symbols (most recently added first)
 * - isLoading: true while fetching watchlist
 * - isInWatchlist(symbol): check if a symbol is already watched
 * - addStock(symbol): add a stock to the watchlist (optimistic)
 * - removeStock(symbol): remove a stock from the watchlist (optimistic)
 * - toggleStock(symbol): add if not watched, remove if already watched
 *
 * Only enabled for premium users who are logged in.
 */
export function useWatchlist() {
  const { user } = useAuth()
  const { isPremium, isPremiumKnown } = useUserProfile()
  const queryClient = useQueryClient()

  const queryKey = ['watchlist', user?.id] as const

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchWatchlist(user!.id),
    // Gate on isPremiumKnown so the query stays disabled during the initial
    // profile fetch instead of firing as "!isPremium" (which would briefly
    // look like a free user). Enables the instant the profile resolves.
    enabled: !!user?.id && isPremiumKnown && isPremium,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const watchlist: string[] = data ?? []

  function isInWatchlist(symbol: string): boolean {
    return watchlist.includes(symbol)
  }

  async function addStock(symbol: string): Promise<void> {
    if (!user?.id) return

    // Optimistic update: immediately add to local cache
    queryClient.setQueryData<string[]>(queryKey, (old) => {
      if (!old) return [symbol]
      if (old.includes(symbol)) return old
      return [symbol, ...old]
    })

    try {
      await addToWatchlist(user.id, symbol)
    } finally {
      // Always invalidate to sync with server truth
      await queryClient.invalidateQueries({ queryKey })
    }
  }

  async function removeStock(symbol: string): Promise<void> {
    if (!user?.id) return

    // Optimistic update: immediately remove from local cache
    queryClient.setQueryData<string[]>(queryKey, (old) => {
      if (!old) return []
      return old.filter(s => s !== symbol)
    })

    try {
      await removeFromWatchlist(user.id, symbol)
    } finally {
      // Always invalidate to sync with server truth
      await queryClient.invalidateQueries({ queryKey })
    }
  }

  async function toggleStock(symbol: string): Promise<void> {
    if (isInWatchlist(symbol)) {
      await removeStock(symbol)
    } else {
      await addStock(symbol)
    }
  }

  return {
    watchlist,
    isLoading,
    isInWatchlist,
    addStock,
    removeStock,
    toggleStock,
  }
}
