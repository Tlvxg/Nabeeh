/**
 * Fast SVG-based candlestick chart — zero external dependencies.
 *
 * Features:
 * - Pure SVG rendering (instant, no library overhead)
 * - Arabic timeframe tabs
 * - Theme-aware via CSS custom properties
 * - Responsive via viewBox
 * - Bollinger Bands overlay
 */

import { useMemo } from 'react'
import type { OHLCVItem } from '../types/stock.ts'
import { calculateBollingerBands } from '../utils/indicators.ts'
import './CandlestickChart.css'

interface CandlestickChartProps {
  data: OHLCVItem[]
  period: string
  onPeriodChange: (period: string) => void
}

const TIMEFRAMES = [
  { label: '١ أ', value: '1w' },
  { label: '٢ أ', value: '2w' },
  { label: '١ ش', value: '1mo' },
  { label: '٣ أش', value: '3mo' },
  { label: '١ س', value: '1y' },
]

const CHART_W = 800
const CHART_H = 360
const PAD = { top: 16, right: 56, bottom: 32, left: 8 }

export function CandlestickChart({ data, period, onPeriodChange }: CandlestickChartProps) {
  const { candles, yLabels, bbPaths, dateLabels } = useMemo(() => {
    if (data.length === 0) {
      return { candles: [], yLabels: [], bbPaths: { upper: '', middle: '', lower: '' }, dateLabels: [] }
    }

    // Slice data based on selected timeframe
    const sliced = period === '1w' ? data.slice(-5)
      : period === '2w' ? data.slice(-10)
      : data

    const plotW = CHART_W - PAD.left - PAD.right
    const plotH = CHART_H - PAD.top - PAD.bottom

    // Price range with padding
    let lo = Infinity, hi = -Infinity
    for (const d of sliced) {
      if (d.low < lo) lo = d.low
      if (d.high > hi) hi = d.high
    }
    const rangePad = (hi - lo) * 0.08 || 0.5
    const pMin = lo - rangePad
    const pMax = hi + rangePad
    const pRange = pMax - pMin

    const yScale = (v: number) => PAD.top + plotH - ((v - pMin) / pRange) * plotH

    // Candle geometry
    const n = sliced.length
    const gap = 3
    const barW = Math.max(3, Math.min(14, (plotW - gap * (n - 1)) / n))
    const totalW = n * barW + (n - 1) * gap
    const xOff = PAD.left + (plotW - totalW) / 2

    const candleData = sliced.map((d, i) => {
      const x = xOff + i * (barW + gap)
      const isUp = d.close >= d.open
      const bodyTop = yScale(Math.max(d.open, d.close))
      const bodyBot = yScale(Math.min(d.open, d.close))
      const bodyH = Math.max(1, bodyBot - bodyTop)
      return {
        x,
        wickX: x + barW / 2,
        wickTop: yScale(d.high),
        wickBot: yScale(d.low),
        bodyY: bodyTop,
        bodyH,
        w: barW,
        isUp,
        date: d.date,
      }
    })

    // Y-axis labels (5 steps)
    const steps = 5
    const yLabelData = Array.from({ length: steps + 1 }, (_, i) => {
      const v = pMin + (pRange * i) / steps
      return { y: yScale(v), label: v.toFixed(2) }
    })

    // X-axis date labels — limit count to prevent overlap
    const maxLabels = Math.min(5, Math.floor(plotW / 120))
    const labelStep = Math.max(1, Math.ceil(n / maxLabels))
    const dateLabelData: { x: number; label: string }[] = []
    for (let i = 0; i < n; i += labelStep) {
      const c = candleData[i]
      dateLabelData.push({
        x: c.x + c.w / 2,
        label: new Date(c.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
      })
    }
    // Always include the last candle if not already included
    const lastIdx = n - 1
    if (lastIdx % labelStep !== 0 && dateLabelData.length > 0) {
      const lastC = candleData[lastIdx]
      const lastX = lastC.x + lastC.w / 2
      // Only add if far enough from previous label
      if (lastX - dateLabelData[dateLabelData.length - 1].x > 80) {
        dateLabelData.push({
          x: lastX,
          label: new Date(lastC.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
        })
      }
    }

    // Bollinger Bands
    const bb = calculateBollingerBands(sliced)
    let bbUpper = '', bbMiddle = '', bbLower = ''
    if (bb.length > 0) {
      // Align BB data with candles (BB starts at period-1)
      const bbOffset = sliced.length - bb.length
      const points = bb.map((b, i) => {
        const ci = i + bbOffset
        const cx = ci >= 0 && ci < candleData.length ? candleData[ci].wickX : 0
        return { x: cx, u: yScale(b.upper), m: yScale(b.middle), l: yScale(b.lower) }
      }).filter((p) => p.x > 0)

      if (points.length > 1) {
        bbUpper = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.u}`).join(' ')
        bbMiddle = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.m}`).join(' ')
        bbLower = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.l}`).join(' ')
      }
    }

    return {
      candles: candleData,
      yLabels: yLabelData,
      yMin: pMin,
      yMax: pMax,
      bbPaths: { upper: bbUpper, middle: bbMiddle, lower: bbLower },
      dateLabels: dateLabelData,
    }
  }, [data, period])

  if (data.length === 0) return null

  return (
    <div className="candle">
      <div className="candle__tabs">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            className={`candle__tab${period === tf.value ? ' candle__tab--active' : ''}`}
            onClick={() => onPeriodChange(tf.value)}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div className="candle__wrap">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="candle__svg"
        >
          {/* Grid lines */}
          {yLabels.map((yl, i) => (
            <line
              key={i}
              x1={PAD.left}
              x2={CHART_W - PAD.right}
              y1={yl.y}
              y2={yl.y}
              className="candle__grid"
            />
          ))}

          {/* Bollinger Bands */}
          {bbPaths.upper && (
            <>
              <path d={bbPaths.upper} className="candle__bb candle__bb--band" />
              <path d={bbPaths.middle} className="candle__bb candle__bb--mid" />
              <path d={bbPaths.lower} className="candle__bb candle__bb--band" />
            </>
          )}

          {/* Candlesticks */}
          {candles.map((c, i) => (
            <g key={i}>
              {/* Wick */}
              <line
                x1={c.wickX}
                x2={c.wickX}
                y1={c.wickTop}
                y2={c.wickBot}
                className={c.isUp ? 'candle__wick--up' : 'candle__wick--down'}
              />
              {/* Body */}
              <rect
                x={c.x}
                y={c.bodyY}
                width={c.w}
                height={c.bodyH}
                className={c.isUp ? 'candle__body--up' : 'candle__body--down'}
              />
            </g>
          ))}

          {/* Y-axis labels */}
          {yLabels.map((yl, i) => (
            <text
              key={i}
              x={CHART_W - PAD.right + 6}
              y={yl.y + 4}
              className="candle__y-label"
            >
              {yl.label}
            </text>
          ))}

          {/* X-axis labels */}
          {dateLabels.map((dl, i) => (
            <text
              key={i}
              x={dl.x}
              y={CHART_H - 6}
              textAnchor="middle"
              className="candle__x-label"
            >
              {dl.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
