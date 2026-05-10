/**
 * Risk Registry — single source of truth for all risk metrics.
 *
 * Adding a new risk metric = one entry here. DEFAULT_PREFS, customizers,
 * and panels all derive from this registry automatically.
 *
 * REG-02: Central risk metric definitions
 */

export interface RiskRegistryEntry {
  key: string                  // unique key (e.g. 'var')
  arabicLabel: string          // display label (e.g. 'أقصى خسارة متوقعة')
  description: string          // one-sentence Arabic description
}

export const RISK_REGISTRY: RiskRegistryEntry[] = [
  {
    key: 'var',
    arabicLabel: 'أقصى خسارة متوقعة',
    description: 'تقدير أقصى خسارة يومية، كم قد تخسر في يوم سيء؟',
  },
  {
    key: 'volatility',
    arabicLabel: 'تقلب السعر',
    description: 'مدى تذبذب السعر خلال السنة، هل السهم مستقر أم متقلب؟',
  },
  {
    key: 'drawdown',
    arabicLabel: 'أكبر انخفاض',
    description: 'أكبر هبوط من القمة، ما أسوأ سيناريو حصل؟',
  },
]

/** Helper: create default risk prefs (all true) */
export function getDefaultRiskPrefs(): Record<string, boolean> {
  const prefs: Record<string, boolean> = {}
  for (const r of RISK_REGISTRY) {
    prefs[r.key] = true
  }
  return prefs
}
