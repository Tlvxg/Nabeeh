import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth.ts'
import {
  fetchUserProfile,
  updateUserPlan,
  updateUserPreferences,
  type UserProfile,
} from '../services/supabase-queries.ts'

/**
 * Hook to access the current user's profile, plan, and preferences.
 *
 * Returns:
 * - plan: 'free' | 'premium' (defaults to 'free' while loading)
 * - isLoading: true while fetching profile
 * - isPremium: convenience boolean (plan === 'premium')
 * - isPremiumKnown: true only when the profile query has resolved with real
 *   data. Consumers that gate user-facing actions (blocking an action,
 *   disabling a query) MUST check isPremiumKnown before treating `!isPremium`
 *   as "user is on free plan". Otherwise they misfire during the initial
 *   ~500ms profile fetch and show upgrade prompts to premium users.
 * - upgradeToPremium: async function to upgrade and refresh cache
 * - email_alerts_enabled: boolean (defaults to true)
 * - theme_preference: 'light' | 'dark' (defaults to 'light')
 * - updatePreferences: async function to update notification/theme prefs
 */
export function useUserProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading, isSuccess } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: () => fetchUserProfile(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes — profile rarely changes
  })

  const plan = data?.plan ?? 'free'
  const isPremium = plan === 'premium'
  /**
   * True only when the profile query has resolved — i.e., we know for sure
   * whether the user is premium or free. Consumers that gate UI (block an
   * action, disable a query) MUST check isPremiumKnown before treating
   * `!isPremium` as "user is on free plan". Otherwise they misfire during
   * the initial ~500ms profile fetch and show upgrade prompts to premium users.
   */
  const isPremiumKnown = !!user?.id && isSuccess && data != null
  const email_alerts_enabled = data?.email_alerts_enabled ?? true
  const theme_preference = data?.theme_preference ?? 'light'

  async function upgradeToPremium() {
    if (!user?.id) return
    const updated = await updateUserPlan(user.id, 'premium')
    // Optimistic cache write — flips isPremium immediately across every subscriber
    queryClient.setQueryData(['user-profile', user.id], updated)
    // Background refetch for consistency
    await queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] })
  }

  async function updatePreferences(
    prefs: Partial<Pick<UserProfile, 'email_alerts_enabled' | 'theme_preference'>>,
  ) {
    if (!user?.id) return
    await updateUserPreferences(user.id, prefs)
    await queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] })
  }

  return {
    plan,
    isLoading,
    isPremium,
    isPremiumKnown,
    upgradeToPremium,
    email_alerts_enabled,
    theme_preference,
    updatePreferences,
  }
}
