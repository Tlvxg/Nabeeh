import { useState, useCallback } from 'react'
import { useAuth } from './useAuth.ts'
import type { AnalysisPreferences } from '../types/preferences.ts'
import { DEFAULT_PREFS } from '../types/preferences.ts'
import { upsertAnalysisPrefs } from '../services/supabase-queries.ts'

/**
 * Single source of truth for analysis preferences across all stock detail tabs.
 *
 * Uses React state as primary (instant, always works).
 * Supabase persistence is fire-and-forget background sync.
 *
 * Returns:
 * - prefs: AnalysisPreferences — NEVER undefined
 * - isLoading: always false (state is synchronous)
 * - updatePrefs: instant state update + background Supabase sync
 */
export function useAnalysisPrefs() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<AnalysisPreferences>(DEFAULT_PREFS)

  const updatePrefs = useCallback((partial: Partial<AnalysisPreferences>) => {
    // Instant local state update — always works, no network dependency
    setPrefs(prev => ({
      ...prev,
      ...partial,
      indicators: {
        ...prev.indicators,
        ...(partial.indicators ?? {}),
      },
      risk: {
        ...prev.risk,
        ...(partial.risk ?? {}),
      },
    }))

    // Background Supabase sync (fire-and-forget, ignore errors)
    if (user?.id) {
      upsertAnalysisPrefs(user.id, partial).catch(() => {
        // Silently ignore — prefs still work in local state
      })
    }
  }, [user?.id])

  return { prefs, isLoading: false, updatePrefs }
}

// Re-export types and defaults for convenience
export type { AnalysisPreferences }
export { DEFAULT_PREFS }
