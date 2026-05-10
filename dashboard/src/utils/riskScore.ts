/**
 * Composite risk score calculation.
 *
 * Combines VaR, volatility, and sentiment into a single 0-100 score.
 *
 * Components:
 *   1. VaR 95% (40% weight)  — maps [-5%, 0%] to [100, 0]
 *   2. Annualized vol (35%)  — maps [5%, 40%] to [0, 100]
 *   3. Sentiment positive% (25%) — maps [0%, 100%] to [100, 0]
 *
 * Risk levels:
 *   0-33  منخفض (low)   — green
 *   34-66 متوسط (medium) — amber
 *   67-100 مرتفع (high)  — red
 */

import type { RiskMetrics, SentimentSummary } from '../types/stock.ts'

/** Individual component contribution to the composite score. */
export interface RiskComponent {
  name_ar: string
  weight: number
  rawValue: number
  normalizedScore: number
}

/** Final composite risk score result. */
export interface RiskScoreResult {
  score: number
  level: 'low' | 'medium' | 'high'
  label_ar: string
  components: RiskComponent[]
}

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Normalize VaR 95% (historical) to 0-100 risk score.
 *
 * VaR is a negative number (e.g. -0.02 means -2% daily loss).
 * Maps [-0.05, 0] to [100, 0] — bigger loss = higher risk.
 */
function normalizeVaR(historicalVaR95: number): number {
  // VaR is negative; more negative = higher risk
  // -0.05 (5% loss) → 100, 0 (no loss) → 0
  const score = (Math.abs(historicalVaR95) / 0.05) * 100
  return clamp(score, 0, 100)
}

/**
 * Normalize annualized volatility to 0-100 risk score.
 *
 * Maps [0.05, 0.40] to [0, 100] — higher vol = higher risk.
 */
function normalizeVolatility(vol252d: number): number {
  const score = ((vol252d - 0.05) / (0.40 - 0.05)) * 100
  return clamp(score, 0, 100)
}

/**
 * Normalize sentiment to 0-100 risk score.
 *
 * Uses negative percentage as the primary risk signal.
 * More negative news = higher risk. Neutral news = moderate baseline.
 * Maps: 0% negative → 25 (low), 50% negative → 62, 100% negative → 100.
 */
function normalizeSentiment(positivePct: number, negativePct: number = 0): number {
  // If there's any opinionated news, use negative ratio as risk signal
  const opinionated = positivePct + negativePct
  if (opinionated > 0) {
    const negRatio = negativePct / opinionated
    // 0% negative → 15, 50% → 57, 100% → 100
    return clamp(15 + negRatio * 85, 0, 100)
  }
  // All neutral — calm market, moderate-low risk
  return 35
}

/** Determine risk level from composite score. */
function getRiskLevel(score: number): { level: 'low' | 'medium' | 'high'; label_ar: string } {
  if (score <= 33) return { level: 'low', label_ar: 'منخفض' }
  if (score <= 66) return { level: 'medium', label_ar: 'متوسط' }
  return { level: 'high', label_ar: 'مرتفع' }
}

/**
 * Calculate composite risk score from risk metrics and sentiment data.
 *
 * @param riskMetrics  Aggregated risk metrics from the backend.
 * @param sentiment    Sentiment summary, or null if unavailable (uses neutral default).
 * @returns            Composite score, level, Arabic label, and component breakdown.
 */
export function calculateRiskScore(
  riskMetrics: RiskMetrics,
  sentiment: SentimentSummary | null
): RiskScoreResult {
  // Extract raw values
  const historicalVaR95 = riskMetrics.var.confidence_levels['95']?.historical ?? 0
  const vol252d = riskMetrics.volatility.vol_252d
  const positivePct = sentiment?.positive_pct ?? 0
  const negativePct = sentiment?.negative_pct ?? 0

  // Normalize each component
  const varNormalized = normalizeVaR(historicalVaR95)
  const volNormalized = normalizeVolatility(vol252d)
  const sentNormalized = normalizeSentiment(positivePct, negativePct)

  // Weighted sum
  const rawScore = varNormalized * 0.40 + volNormalized * 0.35 + sentNormalized * 0.25
  const score = Math.round(clamp(rawScore, 0, 100))

  const { level, label_ar } = getRiskLevel(score)

  const components: RiskComponent[] = [
    {
      name_ar: 'القيمة المعرضة للخطر',
      weight: 0.40,
      rawValue: historicalVaR95,
      normalizedScore: Math.round(varNormalized),
    },
    {
      name_ar: 'التقلب',
      weight: 0.35,
      rawValue: vol252d,
      normalizedScore: Math.round(volNormalized),
    },
    {
      name_ar: 'المشاعر',
      weight: 0.25,
      rawValue: positivePct,
      normalizedScore: Math.round(sentNormalized),
    },
  ]

  return { score, level, label_ar, components }
}

/**
 * Generate 3 critical factor bullet points in plain Arabic.
 *
 * One sentence per risk component explaining WHY the score is what it is.
 */
export function generateCriticalFactors(components: RiskComponent[]): string[] {
  const fmt = (n: number) => n.toLocaleString('ar-SA', { maximumFractionDigits: 1 })

  return components.map((comp) => {
    const s = comp.normalizedScore

    if (comp.name_ar.includes('القيمة المعرضة للخطر')) {
      const pct = fmt(Math.abs(comp.rawValue) * 100)
      if (s <= 33) return `استقرار سعري — خسارة يومية محتملة ${pct}٪ فقط`
      if (s <= 66) return `خسارة يومية محتملة ${pct}٪ — مستوى مقبول`
      return `خسارة يومية محتملة ${pct}٪ — مخاطرة مرتفعة`
    }

    if (comp.name_ar.includes('التقلب')) {
      const pct = fmt(comp.rawValue * 100)
      if (s <= 33) return `تقلب سعري منخفض ${pct}٪ سنوياً — السهم مستقر`
      if (s <= 66) return `تقلب سعري متوسط ${pct}٪ سنوياً — تذبذب معتدل`
      return `تقلب سعري مرتفع ${pct}٪ سنوياً — تقلبات كبيرة`
    }

    if (comp.name_ar.includes('المشاعر')) {
      if (s <= 33) return `مزاج السوق إيجابي — أخبار السهم داعمة بشكل عام`
      if (s <= 66) return `مشاعر الأخبار متباينة — لا اتجاه واضح في الرأي العام`
      return `نسبة كبيرة من الأخبار سلبية — ضغط سلبي على السهم`
    }

    return `${comp.name_ar}: ${comp.normalizedScore}/١٠٠`
  })
}

/**
 * Generate AI-style analysis paragraph with strengths/weaknesses tags.
 *
 * Returns a 1-2 sentence Arabic summary, plus short positive/negative tags
 * for components that are clearly good or clearly bad.
 */
export function generateAIAnalysis(
  score: number,
  level: string,
  components: RiskComponent[],
  stockName = 'السهم'
): { text: string; strengths: string[]; weaknesses: string[] } {
  const TAG_MAP: Record<string, { pos: string; neg: string }> = {
    'القيمة المعرضة للخطر': { pos: 'استقرار سعري', neg: 'خسارة محتملة عالية' },
    'التقلب': { pos: 'تقلب منخفض', neg: 'تقلب مرتفع' },
    'المشاعر': { pos: 'أخبار إيجابية', neg: 'أخبار سلبية' },
  }

  const strengths: string[] = []
  const weaknesses: string[] = []

  for (const comp of components) {
    const tags = TAG_MAP[comp.name_ar]
    if (!tags) continue
    if (comp.normalizedScore <= 33) strengths.push(tags.pos)
    else if (comp.normalizedScore > 66) weaknesses.push(tags.neg)
  }

  const arScore = score.toLocaleString('ar-SA')
  let text: string

  if (level === 'low') {
    text = `${stockName} يُظهر مستوى مخاطرة منخفض (${arScore}/١٠٠). العوامل الثلاثة تشير إلى وضع مستقر نسبياً — مناسب للمستثمر المتحفظ.`
  } else if (level === 'medium') {
    text = `${stockName} يُظهر مستوى مخاطرة متوسط (${arScore}/١٠٠). بعض العوامل إيجابية وأخرى تحتاج متابعة — ينصح بالحذر المعقول.`
  } else {
    text = `${stockName} يُظهر مستوى مخاطرة مرتفع (${arScore}/١٠٠). عدة عوامل خطر نشطة — ينصح بالحذر الشديد ومراجعة المحفظة.`
  }

  return { text, strengths, weaknesses }
}
