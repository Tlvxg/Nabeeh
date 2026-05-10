/**
 * SentimentTrendChart — SVG stacked bar chart showing sentiment
 * breakdown (positive / neutral / negative) with smart aggregation.
 *
 * Auto-aggregates by week when data spans too many days, keeping
 * bars wide and readable.
 */

import { useState, useMemo } from 'react'
import type { NewsWithSentiment } from '../types/stock.ts'
import './SentimentTrendChart.css'

interface SentimentTrendChartProps {
  articles: NewsWithSentiment[]
}

const VB_W = 600
const VB_H = 220
const PAD = { top: 16, right: 30, bottom: 36, left: 8 }

type Period = 30 | 90 | 0 // 0 = all time

/** Max bars before switching from daily to weekly aggregation. */
const MAX_DAILY_BARS = 14

interface BucketData {
  key: string
  label: string
  positive: number
  neutral: number
  negative: number
  total: number
}

/** Get ISO week start (Monday) for a date. Returns YYYY-MM-DD of that Monday. */
function weekStart(d: Date): string {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday = 1
  dt.setDate(dt.getDate() + diff)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Format a YYYY-MM-DD to short Arabic label. */
function fmtShort(key: string): string {
  const d = new Date(key + 'T00:00:00')
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })
}

/** Format a YYYY-MM-DD to month-only Arabic label. */
function fmtMonth(key: string): string {
  const d = new Date(key + 'T00:00:00')
  return d.toLocaleDateString('ar-SA', { month: 'short' })
}

export function SentimentTrendChart({ articles }: SentimentTrendChartProps) {
  const [period, setPeriod] = useState<Period>(0)

  const buckets = useMemo<BucketData[]>(() => {
    if (!articles || articles.length === 0) return []

    // Filter by period first
    let cutoff: Date | null = null
    if (period > 0) {
      cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - period)
    }

    // Collect articles into date groups
    const byDate = new Map<string, { pos: number; neu: number; neg: number }>()
    for (const a of articles) {
      if (!a.published_at) continue
      const d = new Date(a.published_at)
      if (cutoff && d < cutoff) continue

      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const key = `${y}-${m}-${dd}`

      const entry = byDate.get(key) ?? { pos: 0, neu: 0, neg: 0 }
      if (a.sentiment === 'positive') entry.pos++
      else if (a.sentiment === 'negative') entry.neg++
      else entry.neu++
      byDate.set(key, entry)
    }

    const uniqueDays = byDate.size
    if (uniqueDays === 0) return []

    // If few enough days, show daily bars
    if (uniqueDays <= MAX_DAILY_BARS) {
      const result: BucketData[] = []
      for (const [key, e] of byDate) {
        result.push({
          key,
          label: fmtShort(key),
          positive: e.pos,
          neutral: e.neu,
          negative: e.neg,
          total: e.pos + e.neu + e.neg,
        })
      }
      result.sort((a, b) => a.key.localeCompare(b.key))
      return result
    }

    // Too many days — aggregate by week
    const byWeek = new Map<string, { pos: number; neu: number; neg: number }>()
    for (const [dateKey, e] of byDate) {
      const d = new Date(dateKey + 'T00:00:00')
      const wk = weekStart(d)
      const entry = byWeek.get(wk) ?? { pos: 0, neu: 0, neg: 0 }
      entry.pos += e.pos
      entry.neu += e.neu
      entry.neg += e.neg
      byWeek.set(wk, entry)
    }

    const result: BucketData[] = []
    for (const [key, e] of byWeek) {
      result.push({
        key,
        label: fmtMonth(key),
        positive: e.pos,
        neutral: e.neu,
        negative: e.neg,
        total: e.pos + e.neu + e.neg,
      })
    }
    result.sort((a, b) => a.key.localeCompare(b.key))
    return result
  }, [articles, period])

  // Compute totals for the legend
  const totals = useMemo(() => {
    let pos = 0, neu = 0, neg = 0
    for (const d of buckets) {
      pos += d.positive
      neu += d.neutral
      neg += d.negative
    }
    return { pos, neu, neg, total: pos + neu + neg }
  }, [buckets])

  if (buckets.length === 0) {
    return (
      <div className="stc">
        <div className="stc__header">
          <span className="stc__title">اتجاه المشاعر</span>
        </div>
        <div className="stc__empty">لا توجد بيانات كافية لعرض التحليل</div>
      </div>
    )
  }

  const plotW = VB_W - PAD.left - PAD.right
  const plotH = VB_H - PAD.top - PAD.bottom
  const maxTotal = Math.max(...buckets.map((d) => d.total), 1)

  // Bar layout — guarantee minimum bar width of 14px
  const n = buckets.length
  const barGap = Math.max(4, plotW * 0.015)
  const rawW = (plotW - barGap * (n - 1)) / n
  const barW = Math.max(14, Math.min(48, rawW))
  const totalBarsWidth = n * barW + (n - 1) * barGap
  const offsetX = PAD.left + (plotW - totalBarsWidth) / 2

  // Grid lines (1 to max, skip 0)
  const gridSteps = maxTotal <= 4 ? maxTotal : Math.min(4, maxTotal)
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const val = Math.round((maxTotal / gridSteps) * i)
    return { val, y: PAD.top + plotH - (val / maxTotal) * plotH }
  })

  // X-axis labels — show at most ~10
  const labelEvery = n > 20 ? Math.ceil(n / 8) : n > 10 ? 3 : n > 6 ? 2 : 1

  return (
    <div className="stc">
      <div className="stc__header">
        <span className="stc__title">اتجاه المشاعر</span>
        <div className="stc__toggle">
          {([30, 90, 0] as Period[]).map((p) => (
            <button
              key={p}
              className={`stc__toggle-btn ${period === p ? 'stc__toggle-btn--active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 0 ? 'الكل' : `${p} يوم`}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="stc__legend">
        <span className="stc__legend-item">
          <span className="stc__legend-dot stc__legend-dot--pos" />
          إيجابي ({totals.pos})
        </span>
        <span className="stc__legend-item">
          <span className="stc__legend-dot stc__legend-dot--neu" />
          محايد ({totals.neu})
        </span>
        <span className="stc__legend-item">
          <span className="stc__legend-dot stc__legend-dot--neg" />
          سلبي ({totals.neg})
        </span>
      </div>

      <div className="stc__wrap">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" className="stc__svg">
          {/* Horizontal grid lines */}
          {gridLines.map((g) => (
            <g key={g.val}>
              <line
                x1={PAD.left}
                x2={VB_W - PAD.right}
                y1={g.y}
                y2={g.y}
                className="stc__grid-line"
              />
              <text
                x={VB_W - PAD.right + 4}
                y={g.y + 3}
                className="stc__label"
              >
                {g.val}
              </text>
            </g>
          ))}

          {/* Stacked bars */}
          {buckets.map((d, i) => {
            const bx = offsetX + i * (barW + barGap)
            const baseY = PAD.top + plotH

            const negH = (d.negative / maxTotal) * plotH
            const neuH = (d.neutral / maxTotal) * plotH
            const posH = (d.positive / maxTotal) * plotH

            const negY = baseY - negH
            const neuY = negY - neuH
            const posY = neuY - posH

            return (
              <g key={d.key}>
                {d.negative > 0 && (
                  <rect x={bx} y={negY} width={barW} height={negH} className="stc__bar--neg" />
                )}
                {d.neutral > 0 && (
                  <rect x={bx} y={neuY} width={barW} height={neuH} className="stc__bar--neu" />
                )}
                {d.positive > 0 && (
                  <rect x={bx} y={posY} width={barW} height={posH} className="stc__bar--pos" />
                )}
              </g>
            )
          })}

          {/* X-axis labels */}
          {buckets.map((d, i) => {
            if (i % labelEvery !== 0 && i !== n - 1) return null
            return (
              <text
                key={`x-${d.key}`}
                x={offsetX + i * (barW + barGap) + barW / 2}
                y={VB_H - 6}
                textAnchor="middle"
                className="stc__label"
              >
                {d.label}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
