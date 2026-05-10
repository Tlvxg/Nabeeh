import './SignalSummaryCard.css'
import { useMemo } from 'react'
import { useIndicatorResults } from '../hooks/useIndicatorResults.ts'
import { computeConsensus, CATEGORY_ARABIC_LABELS } from '../utils/consensus.ts'
import type { IndicatorCategory } from '../config/indicatorRegistry.ts'
import type { OHLCVItem } from '../types/stock.ts'

const PERIOD_LABEL_AR: Record<string, string> = {
  '1d':   'آخر يوم',
  '3d':   'آخر ٣ أيام',
  '7d':   'آخر ٧ أيام',
  '30d':  'آخر ٣٠ يوماً',
  '90d':  'آخر ٩٠ يوماً',
  '252d': 'سنة كاملة',
}

interface SignalSummaryCardProps {
  data: OHLCVItem[]
  activeKeys: string[]
  windowDays?: number
  period?: string
}

// ─── SVG gauge helpers ────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignalSummaryCard({ data, activeKeys, windowDays, period }: SignalSummaryCardProps) {
  const results = useIndicatorResults(data, activeKeys, windowDays)
  const consensus = useMemo(() => computeConsensus(results), [results])

  // Gauge geometry
  const cx = 110, cy = 108, r = 80, strokeWidth = 12
  const scoreAngle = ((consensus.overall + 1) / 2) * 180  // -1→0°, 0→90°, +1→180°
  const trackPath = describeArc(cx, cy, r, 0, 180)
  // Color bands (even thirds):
  const negArc = describeArc(cx, cy, r, 0, 60)    // bearish zone
  const neuArc = describeArc(cx, cy, r, 60, 120)   // neutral zone
  const posArc = describeArc(cx, cy, r, 120, 180)  // bullish zone
  const progressArc = scoreAngle > 0.5 ? describeArc(cx, cy, r, 0, scoreAngle) : ''
  const leftEnd = polarToCartesian(cx, cy, r, 0)   // label position: "بيع"
  const rightEnd = polarToCartesian(cx, cy, r, 180) // label position: "شراء"

  return (
    <div className="ssc">
      {/* Card header */}
      <div className="ssc__header">
        <h3 className="ssc__title">ملخص الإشارات الفنية</h3>
        {period && PERIOD_LABEL_AR[period] && (
          <span className="ssc__period-label">{PERIOD_LABEL_AR[period]}</span>
        )}
      </div>

      {/* Gauge + category rows — side by side on desktop */}
      <div className="ssc__body">

        {/* Left column: SVG gauge */}
        <div className="ssc__gauge-col">
          <svg className="ssc__svg" viewBox="0 0 220 140"
            aria-label={`الإجماع الفني: ${consensus.verdict}`}>
            {/* Background track */}
            <path d={trackPath} fill="none" stroke="var(--color-bg-input)"
              strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* Color bands */}
            <path d={negArc} fill="none" stroke="var(--color-negative)"
              strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.2" />
            <path d={neuArc} fill="none" stroke="var(--color-text-muted)"
              strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.2" />
            <path d={posArc} fill="none" stroke="var(--color-positive)"
              strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.2" />
            {/* Progress arc */}
            {progressArc && (
              <path d={progressArc} fill="none" stroke={consensus.verdictColor}
                strokeWidth={strokeWidth} strokeLinecap="round" className="ssc__progress" />
            )}
            {/* Verdict text centered in gauge */}
            <text x={cx} y={cy - 12} textAnchor="middle" dominantBaseline="central"
              className="ssc__verdict-text" fill={consensus.verdictColor}>
              {consensus.verdict}
            </text>
            {/* Arc endpoint labels */}
            <text x={leftEnd.x - 4} y={leftEnd.y + 16} textAnchor="start"
              className="ssc__arc-label" fill="var(--color-text-faint)">بيع</text>
            <text x={rightEnd.x + 4} y={rightEnd.y + 16} textAnchor="end"
              className="ssc__arc-label" fill="var(--color-text-faint)">شراء</text>
          </svg>
        </div>

        {/* Right column: category rows */}
        <div className="ssc__categories-col">
          {(['momentum', 'trend', 'volatility', 'volume'] as IndicatorCategory[]).map(cat => {
            const cs = consensus.categories[cat]
            const color = cs.score >= 0.2
              ? 'var(--color-positive)'
              : cs.score <= -0.2
                ? 'var(--color-negative)'
                : 'var(--color-text-muted)'
            return (
              <div className="ssc__category-row" key={cat}>
                <span className="ssc__category-name">{CATEGORY_ARABIC_LABELS[cat]}</span>
                <span className="ssc__category-verdict" style={{ color }}>{cs.verdict}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Signal count bar */}
      <div className="ssc__count-section">
        <div className="ssc__count-bar" role="img" aria-label="توزيع الإشارات">
          {consensus.counts.positive > 0 && (
            <div className="ssc__count-seg ssc__count-seg--pos"
              style={{ flexBasis: `${(consensus.counts.positive / results.length) * 100}%` }} />
          )}
          {consensus.counts.neutral > 0 && (
            <div className="ssc__count-seg ssc__count-seg--neu"
              style={{ flexBasis: `${(consensus.counts.neutral / results.length) * 100}%` }} />
          )}
          {consensus.counts.negative > 0 && (
            <div className="ssc__count-seg ssc__count-seg--neg"
              style={{ flexBasis: `${(consensus.counts.negative / results.length) * 100}%` }} />
          )}
        </div>
        <div className="ssc__count-labels">
          <span className="ssc__count-label ssc__count-label--pos">
            {consensus.counts.positive.toLocaleString('ar-SA')} إيجابي
          </span>
          <span className="ssc__count-label ssc__count-label--neu">
            {consensus.counts.neutral.toLocaleString('ar-SA')} محايد
          </span>
          <span className="ssc__count-label ssc__count-label--neg">
            {consensus.counts.negative.toLocaleString('ar-SA')} سلبي
          </span>
        </div>
      </div>

      {/* Synthesis paragraph */}
      <p className="ssc__synthesis">{consensus.synthesis}</p>

      {/* Disclaimer */}
      <p className="ssc__disclaimer">
        هذا التحليل الفني لأغراض تعليمية فقط ولا يُعتبر نصيحة استثمارية
      </p>
    </div>
  )
}
