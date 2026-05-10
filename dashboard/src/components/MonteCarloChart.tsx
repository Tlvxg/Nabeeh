/**
 * MonteCarloChart — simplified card layout for beginner investors.
 *
 * Single display mode: MC Simulation (90d/252d) — downside/upside hero +
 * 3 scenario rows. Uses the `result` prop from the worker (90d) or
 * server (252d) simulation.
 */

import { useMemo } from 'react'
import type { MonteCarloResult } from '../types/stock.ts'
import './MonteCarloChart.css'

interface MonteCarloChartProps {
  result?: MonteCarloResult
  currentPrice?: number | null
  stockName?: string
  days?: number  // simulation horizon — affects display mode
}

/** Horizon label mapping (Arabic). */
const HORIZON_LABELS: Record<number, string> = {
  90: 'محاكاة ٩٠ يوم',
  252: 'محاكاة سنة كاملة',
}

/** Format a decimal as positive percentage in Arabic locale. */
function fmtPct(v: number): string {
  return Math.abs(v).toLocaleString('ar-SA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Format SAR price in Arabic locale. */
function fmtPrice(v: number): string {
  return v.toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface Scenario {
  label: string
  price: number
  chg: number
  color: string
}

export function MonteCarloChart({ result, currentPrice, days }: MonteCarloChartProps) {
  const effectiveDays = days ?? result?.days ?? 252
  const lastIdx = (result?.percentiles.p50.length ?? 0) - 1

  const horizonLabel = HORIZON_LABELS[effectiveDays] ?? `محاكاة ${effectiveDays.toLocaleString('ar-SA')} يوم`

  const { downside, upside, scenarios } = useMemo(() => {
    if (!result || lastIdx < 0) return { downside: 0, upside: 0, scenarios: [] as Scenario[] }

    const p5Final = result.percentiles.p5[lastIdx]
    const p50Final = result.percentiles.p50[lastIdx]
    const p95Final = result.percentiles.p95[lastIdx]

    const down = currentPrice && currentPrice > 0
      ? ((currentPrice - p5Final) / currentPrice) * 100
      : 0
    const up = currentPrice && currentPrice > 0
      ? ((p95Final - currentPrice) / currentPrice) * 100
      : 0

    const chg = (target: number) =>
      currentPrice && currentPrice > 0
        ? ((target - currentPrice) / currentPrice) * 100
        : 0

    const sc: Scenario[] = [
      { label: 'متشائم', price: p5Final, chg: chg(p5Final), color: 'var(--color-risk-high)' },
      { label: 'المتوسط', price: p50Final, chg: chg(p50Final), color: 'var(--color-risk-medium)' },
      { label: 'متفائل', price: p95Final, chg: chg(p95Final), color: 'var(--color-risk-low)' },
    ]

    return { downside: down, upside: up, scenarios: sc }
  }, [result, currentPrice, lastIdx])

  if (!result) return null
  if (lastIdx < 0) return null

  return (
    <div className="mc">
      {/* Horizon label */}
      <div className="mc__horizon-label">{horizonLabel}</div>

      {/* Downside / Upside hero numbers */}
      <div className="mc__hero">
        <div className="mc__hero-item mc__hero-item--down">
          <span className="mc__hero-label">احتمال الخسارة</span>
          <span className="mc__hero-value">{fmtPct(downside)}٪</span>
        </div>
        <div className="mc__hero-item mc__hero-item--up">
          <span className="mc__hero-label">احتمال الربح</span>
          <span className="mc__hero-value">{fmtPct(upside)}٪</span>
        </div>
      </div>

      {/* 3 Scenario rows */}
      <div className="mc__scenarios">
        {scenarios.map(s => (
          <div className="mc__scenario-row" key={s.label}>
            <span className="mc__scenario-icon" style={{ color: s.color }}>●</span>
            <span className="mc__scenario-label">{s.label}</span>
            <span className="mc__scenario-price">{fmtPrice(s.price)} ر.س</span>
            <span className="mc__scenario-chg" style={{ color: s.color }}>
              {s.chg > 0 ? '+' : ''}{fmtPct(s.chg)}٪
            </span>
          </div>
        ))}
      </div>

      {/* Data transparency */}
      <div className="mc__transparency">
        <div className="mc__transparency-params">
          <div className="mc__transparency-param">
            <span className="mc__transparency-label">عدد السيناريوهات</span>
            <span className="mc__transparency-value">{result.paths.toLocaleString('ar-SA')}</span>
          </div>
          <div className="mc__transparency-param">
            <span className="mc__transparency-label">أفق المحاكاة</span>
            <span className="mc__transparency-value">{effectiveDays.toLocaleString('ar-SA')} يوم تداول</span>
          </div>
          <div className="mc__transparency-param">
            <span className="mc__transparency-label">التقلب السنوي</span>
            <span className="mc__transparency-value">
              {result.annual_volatility != null
                ? `${(result.annual_volatility * 100).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}٪`
                : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Footnote explanation */}
      <p className="mc__explain">
        محاكاة {result.paths.toLocaleString('ar-SA')} سيناريو لمدة {effectiveDays.toLocaleString('ar-SA')} يوم -- تعرض أفضل وأسوأ الاحتمالات المتوقعة لسعر السهم.
      </p>
    </div>
  )
}
