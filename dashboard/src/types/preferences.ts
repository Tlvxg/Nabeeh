/**
 * Analysis preferences — controls which indicators, risk metrics,
 * and simulation parameters are visible/active on the dashboard.
 *
 * Stored as JSONB in user_profiles.dashboard_preferences.
 * All fields have sensible defaults via DEFAULT_PREFS.
 *
 * REG-07: Dynamic preferences — keys are Record<string, boolean>
 * so adding a registry entry auto-extends preferences with zero type changes.
 */

import { getDefaultIndicatorPrefs } from '../config/indicatorRegistry.ts'
import { getDefaultRiskPrefs } from '../config/riskRegistry.ts'

export interface AnalysisPreferences {
  /** Which technical indicators are visible — keys match indicatorRegistry */
  indicators: Record<string, boolean>

  /** Which risk metrics are visible — keys match riskRegistry */
  risk: Record<string, boolean>

  /** Time period for indicator chart display (zoom window) */
  indicatorPeriod: '1d' | '3d' | '7d' | '30d' | '90d' | '252d'

  /** Monte Carlo simulation horizon (90d = worker MC, 252d = server) */
  mcHorizon: '90d' | '252d'
}

/**
 * Default preferences — all indicators ON, all risk metrics ON.
 * Auto-generated from registries: adding a new registry entry
 * automatically includes it in defaults (enabled by default).
 * Satisfies PREF-04: first-time users see everything enabled.
 */
export const DEFAULT_PREFS: AnalysisPreferences = {
  indicators: getDefaultIndicatorPrefs(),
  risk: getDefaultRiskPrefs(),
  indicatorPeriod: '30d',
  mcHorizon: '252d',
}
