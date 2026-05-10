/**
 * computeConsensus — TradingView-style weighted category aggregation.
 *
 * Takes all active IndicatorResult[] and produces a ConsensusResult with:
 * - per-category score/verdict
 * - overall weighted score (-1 to +1)
 * - Arabic verdict + color
 * - signal counts
 * - one-sentence Arabic synthesis paragraph
 *
 * Category weights: momentum 0.35, trend 0.35, volume 0.20, volatility 0.10
 *
 * CMA compliance: descriptive labels only — no imperative buy/sell commands.
 *
 * REQ: Phase 60-02 consensus utility
 */

import type { IndicatorCategory } from '../config/indicatorRegistry.ts'
import type { IndicatorResult } from '../hooks/useIndicatorResults.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CategoryConsensus {
  score: number           // -1 to +1 (average direction of non-neutral indicators)
  verdict: string         // Arabic label: 'صاعد' | 'هابط' | 'محايد'
  indicatorCount: number  // how many indicators in this category had data
}

export interface ConsensusResult {
  overall: number                                    // -1 to +1 weighted score
  verdict: string                                    // Arabic: 'شراء قوي' | 'شراء' | 'محايد' | 'بيع' | 'بيع قوي'
  verdictColor: string                               // CSS var for verdict color
  categories: Record<IndicatorCategory, CategoryConsensus>
  counts: { positive: number; neutral: number; negative: number }
  synthesis: string                                  // one-sentence Arabic synthesis
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WEIGHTS: Record<IndicatorCategory, number> = {
  momentum:   0.35,
  trend:      0.35,
  volatility: 0.10,
  volume:     0.20,
}

const CATEGORY_ARABIC_LABELS: Record<IndicatorCategory, string> = {
  momentum:   'مؤشرات الزخم',
  trend:      'مؤشرات الاتجاه',
  volatility: 'مؤشرات التذبذب',
  volume:     'مؤشرات الحجم',
}

const ALL_CATEGORIES: IndicatorCategory[] = ['momentum', 'trend', 'volatility', 'volume']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryVerdict(score: number): string {
  if (score >= 0.2)  return 'صاعد'
  if (score <= -0.2) return 'هابط'
  return 'محايد'
}

function overallVerdict(overall: number): { verdict: string; verdictColor: string } {
  if (overall >= 0.6)  return { verdict: 'شراء قوي', verdictColor: 'var(--color-positive)' }
  if (overall >= 0.2)  return { verdict: 'شراء',     verdictColor: 'var(--color-positive)' }
  if (overall > -0.2)  return { verdict: 'محايد',    verdictColor: 'var(--color-text-muted)' }
  if (overall > -0.6)  return { verdict: 'بيع',      verdictColor: 'var(--color-negative)' }
  return                        { verdict: 'بيع قوي', verdictColor: 'var(--color-negative)' }
}

function verdictSentence(overall: number): string {
  if (overall >= 0.6)  return 'الصورة الشاملة تشير إلى زخم إيجابي قوي.'
  if (overall >= 0.2)  return 'الصورة الشاملة تميل نحو الزخم الإيجابي.'
  if (overall > -0.2)  return 'الإشارات متضاربة — لا اتجاه واضح حالياً.'
  if (overall > -0.6)  return 'الصورة الشاملة تميل نحو الضغط البيعي.'
  return                       'الصورة الشاملة تشير إلى ضغط بيعي قوي.'
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computeConsensus(results: IndicatorResult[]): ConsensusResult {
  // Step 1: Per-category scores
  const categories = {} as Record<IndicatorCategory, CategoryConsensus>

  for (const cat of ALL_CATEGORIES) {
    const catResults = results.filter(r => r.entry.category === cat)
    const nonNeutral = catResults.filter(r => r.signal.direction !== 0)
    const score =
      nonNeutral.length === 0
        ? 0
        : nonNeutral.reduce((sum, r) => sum + r.signal.direction, 0) / nonNeutral.length

    categories[cat] = {
      score,
      verdict: categoryVerdict(score),
      indicatorCount: catResults.length,
    }
  }

  // Step 2: Overall weighted score (clamped to [-1, 1])
  const rawOverall = ALL_CATEGORIES.reduce(
    (sum, cat) => sum + categories[cat].score * WEIGHTS[cat],
    0
  )
  const overall = Math.max(-1, Math.min(1, rawOverall))

  // Step 3: Signal counts across all results
  const counts = {
    positive: results.filter(r => r.signal.direction === 1).length,
    neutral:  results.filter(r => r.signal.direction === 0).length,
    negative: results.filter(r => r.signal.direction === -1).length,
  }

  // Step 4 + 5: Overall verdict + color
  const { verdict, verdictColor } = overallVerdict(overall)

  // Step 6: Arabic synthesis using Arabic-Indic numerals
  const posStr   = counts.positive.toLocaleString('ar-SA')
  const totalStr = results.length.toLocaleString('ar-SA')
  const negStr   = counts.negative.toLocaleString('ar-SA')
  const neuStr   = counts.neutral.toLocaleString('ar-SA')
  const synthesis =
    `${posStr} من ${totalStr} مؤشرات تعطي إشارة إيجابية (${negStr} سلبية، ${neuStr} محايدة). ${verdictSentence(overall)}`

  return { overall, verdict, verdictColor, categories, counts, synthesis }
}

// Re-export for consumers that only import from this module
export type { IndicatorCategory }
export { CATEGORY_ARABIC_LABELS }
