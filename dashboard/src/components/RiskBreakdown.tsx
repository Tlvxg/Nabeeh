/**
 * Risk Factors display — beginner-friendly breakdown.
 *
 * Shows 3 colored progress bars with intuitive Arabic names:
 * - Price Stability (استقرار السعر) — mapped from VaR
 * - Chart Signals (إشارات المؤشرات) — mapped from Volatility
 * - Market Mood (مزاج السوق) — mapped from Sentiment
 */

import type { RiskComponent } from '../utils/riskScore.ts'
import './RiskBreakdown.css'

interface RiskBreakdownProps {
  components: RiskComponent[]
}

/** Beginner-friendly factor mapping from technical names. */
const FACTOR_MAP: Record<string, string> = {
  'القيمة المعرضة للخطر': 'استقرار السعر',
  'التقلب': 'إشارات المؤشرات',
  'المشاعر': 'مزاج السوق',
}

/** Determine bar color based on normalized score. */
function barColor(score: number): string {
  if (score <= 33) return 'var(--color-risk-low)'
  if (score <= 66) return 'var(--color-risk-medium)'
  return 'var(--color-risk-high)'
}

/** Get risk level label in Arabic based on normalized score. */
function riskLabel(score: number): { label: string; color: string } {
  if (score <= 33) return { label: 'مخاطرة منخفضة', color: 'var(--color-risk-low)' }
  if (score <= 66) return { label: 'مخاطرة متوسطة', color: 'var(--color-risk-medium)' }
  return { label: 'مخاطرة مرتفعة', color: 'var(--color-risk-high)' }
}

/** Convert a number to Arabic-Indic digits. */
function toArabicDigits(n: number): string {
  return n.toString().replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)))
}

export function RiskBreakdown({ components }: RiskBreakdownProps) {
  return (
    <div className="rf">
      {components.map((comp) => {
        const label = FACTOR_MAP[comp.name_ar] ?? comp.name_ar
        const risk = riskLabel(comp.normalizedScore)
        const color = barColor(comp.normalizedScore)

        return (
          <div key={comp.name_ar} className="rf__factor">
            <div className="rf__header">
              <span className="rf__label">{label}</span>
              <span
                className="rf__risk-tag"
                style={{ color: risk.color, borderColor: risk.color }}
              >
                {risk.label}
              </span>
            </div>
            <div className="rf__bar-track">
              <div
                className="rf__bar-fill"
                style={{
                  width: `${comp.normalizedScore}%`,
                  background: color,
                }}
              />
            </div>
            <span className="rf__score">
              {toArabicDigits(comp.normalizedScore)}/{toArabicDigits(100)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
