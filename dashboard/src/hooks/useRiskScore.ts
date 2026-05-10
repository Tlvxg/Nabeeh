/**
 * Hook that reads the pre-computed composite risk score from Supabase.
 *
 * Returns 3 individual risk components (VaR, Volatility, Sentiment)
 * normalized to 0-100 using the same logic as the backend cron.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchRiskScoreFromSupabase } from '../services/supabase-queries.ts'
import type { RiskComponent } from '../utils/riskScore.ts'

export interface UseRiskScoreReturn {
  score?: number
  level?: 'low' | 'medium' | 'high'
  label_ar?: string
  components?: RiskComponent[]
  isLoading: boolean
  error: Error | null
}

/** Derive risk level from a 0-100 score. */
function getRiskLevel(score: number): { level: 'low' | 'medium' | 'high'; label_ar: string } {
  if (score <= 33) return { level: 'low', label_ar: 'منخفض' }
  if (score <= 66) return { level: 'medium', label_ar: 'متوسط' }
  return { level: 'high', label_ar: 'مرتفع' }
}

/** Clamp value between 0 and 100. */
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v))
}

export function useRiskScore(symbol: string): UseRiskScoreReturn {
  const { data, isLoading, error } = useQuery({
    queryKey: ['risk', 'score', symbol],
    queryFn: () => fetchRiskScoreFromSupabase(symbol),
    staleTime: 5 * 60_000,
    enabled: symbol.length > 0,
  })

  if (!data) {
    return { isLoading, error: error ?? null }
  }

  const score = Math.round(data.overall_score)
  const { level, label_ar } = getRiskLevel(score)

  // Normalize individual components (same formulas as backend compute_risk.py)
  const varScore = data.var_95_hist != null
    ? Math.round(clamp100(Math.abs(data.var_95_hist) / 0.05 * 100))
    : null
  const volScore = data.vol_252d != null
    ? Math.round(clamp100(data.vol_252d / 0.50 * 100))
    : null
  const sentScore = Math.round(data.sentiment_score)

  const components: RiskComponent[] = []

  if (varScore != null) {
    components.push({
      name_ar: 'القيمة المعرضة للخطر',
      weight: 0.40,
      rawValue: data.var_95_hist!,
      normalizedScore: varScore,
    })
  }

  if (volScore != null) {
    components.push({
      name_ar: 'التقلب',
      weight: 0.35,
      rawValue: data.vol_252d!,
      normalizedScore: volScore,
    })
  }

  components.push({
    name_ar: 'المشاعر',
    weight: 0.25,
    rawValue: data.sentiment_score,
    normalizedScore: sentScore,
  })

  return {
    score,
    level,
    label_ar: data.interpretation_ar || label_ar,
    components,
    isLoading,
    error: error ?? null,
  }
}
