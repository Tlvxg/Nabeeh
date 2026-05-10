/**
 * SVG-based indicator panels — generic renderer driven by INDICATOR_REGISTRY.
 *
 * Dispatches rendering by chartType ('line', 'histogram', 'band') from registry
 * instead of hardcoded if/else branches per indicator key.
 *
 * REG-05: Registry-driven indicator rendering
 */

import { useMemo, type ReactNode } from 'react'
import type { OHLCVItem } from '../types/stock.ts'
import { INDICATOR_REGISTRY, type IndicatorRegistryEntry } from '../config/indicatorRegistry.ts'
import {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochasticRSI,
  calculateWilliamsR,
  calculateCCI,
  calculateATR,
  calculateADX,
  calculateOBV,
  calculateVWAP,
} from '../utils/indicators.ts'
import { NabeehAILogo } from './NabeehAILogo.tsx'
import './IndicatorPanel.css'

interface IndicatorPanelProps {
  type: string
  data: OHLCVItem[]
  /** Number of days to DISPLAY on chart. Calculation always uses full data. */
  viewDays?: number
  onAskAI?: () => void
}

const PANEL_W = 800
const PANEL_H = 120
const PAD = { top: 8, right: 56, bottom: 4, left: 8 }

/* ---- Status functions (indicator-specific, kept as-is) ---- */

const statusFunctions: Record<string, (data: OHLCVItem[]) => { label: string; color: string; text: string }> = {
  rsi: getRSIStatus,
  macd: getMACDStatus,
  bollinger: getBollingerStatus,
  stochRsi: getStochasticRSIStatus,
  williamsR: getWilliamsRStatus,
  cci: getCCIStatus,
  atr: getATRStatus,
  adx: getADXStatus,
  obv: getOBVStatus,
  vwap: getVWAPStatus,
}

function getRSIStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const rsi = calculateRSI(data)
  if (rsi.length === 0) return { label: '', color: '', text: '' }
  const val = rsi[rsi.length - 1].value
  const fmtVal = val.toLocaleString('ar-SA', { maximumFractionDigits: 1 })
  if (val >= 70) return {
    label: 'شراء مفرط',
    color: 'var(--color-negative)',
    text: `القراءة الحالية ${fmtVal} — السهم في منطقة شراء مفرط. هذا يعني أن السعر ارتفع بسرعة وقد يشهد تصحيحاً للأسفل قريباً.`,
  }
  if (val <= 30) return {
    label: 'بيع مفرط',
    color: 'var(--color-positive)',
    text: `القراءة الحالية ${fmtVal} — السهم في منطقة بيع مفرط. هذا يعني أن السعر انخفض بشكل مبالغ فيه وقد يرتد للأعلى.`,
  }
  return {
    label: 'منطقة محايدة',
    color: 'var(--color-text-muted)',
    text: `القراءة الحالية ${fmtVal} — السهم في المنطقة المحايدة (بين ٣٠ و ٧٠). لا توجد إشارة شراء أو بيع مفرط حالياً.`,
  }
}

function getMACDStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const macd = calculateMACD(data)
  if (macd.length < 2) return { label: '', color: '', text: '' }
  const latest = macd[macd.length - 1]
  const prev = macd[macd.length - 2]
  const crossUp = prev.macd <= prev.signal && latest.macd > latest.signal
  const crossDown = prev.macd >= prev.signal && latest.macd < latest.signal
  if (crossUp) return {
    label: 'تقاطع صعودي',
    color: 'var(--color-positive)',
    text: 'خط MACD عبر فوق خط الإشارة مؤخراً — تقاطع صعودي. هذه إشارة شراء محتملة تدل على بداية زخم إيجابي.',
  }
  if (crossDown) return {
    label: 'تقاطع هبوطي',
    color: 'var(--color-negative)',
    text: 'خط MACD عبر تحت خط الإشارة مؤخراً — تقاطع هبوطي. هذه إشارة بيع محتملة تدل على ضعف الزخم.',
  }
  if (latest.histogram > 0) return {
    label: 'زخم إيجابي',
    color: 'var(--color-positive)',
    text: `خط MACD أعلى من خط الإشارة — الزخم إيجابي. الاتجاه الحالي صعودي لكن لم يحدث تقاطع جديد.`,
  }
  return {
    label: 'زخم سلبي',
    color: 'var(--color-negative)',
    text: `خط MACD أسفل من خط الإشارة — الزخم سلبي. الاتجاه الحالي هبوطي لكن لم يحدث تقاطع جديد.`,
  }
}

function getBollingerStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const bands = calculateBollingerBands(data)
  if (bands.length === 0) return { label: '', color: '', text: '' }
  const latest = bands[bands.length - 1]
  const lastClose = data[data.length - 1].close
  const bandWidth = ((latest.upper - latest.lower) / latest.middle * 100)
  const pctB = (lastClose - latest.lower) / (latest.upper - latest.lower)

  if (pctB >= 0.95) return {
    label: 'قرب النطاق العلوي',
    color: 'var(--color-negative)',
    text: `السعر يلامس النطاق العلوي — قد يكون مرتفعاً أكثر من اللازم. عرض النطاق ${bandWidth.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}%.`,
  }
  if (pctB <= 0.05) return {
    label: 'قرب النطاق السفلي',
    color: 'var(--color-positive)',
    text: `السعر يلامس النطاق السفلي — قد يكون منخفضاً ويمثل فرصة. عرض النطاق ${bandWidth.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}%.`,
  }
  if (bandWidth < 3) return {
    label: 'نطاق ضيق',
    color: 'var(--color-accent-gold)',
    text: `النطاقات ضيقة جداً (${bandWidth.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}%) — تقلب منخفض. غالباً ما يتبع ذلك تحرك سعري كبير قريباً.`,
  }
  return {
    label: 'منطقة وسطى',
    color: 'var(--color-text-muted)',
    text: `السعر في منتصف النطاق — لا توجد إشارة متطرفة. عرض النطاق ${bandWidth.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}%.`,
  }
}

function getStochasticRSIStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const stoch = calculateStochasticRSI(data)
  if (stoch.length === 0) return { label: '', color: '', text: '' }
  const val = stoch[stoch.length - 1].value
  const fmt = val.toLocaleString('ar-SA', { maximumFractionDigits: 1 })
  if (val >= 80) return {
    label: 'شراء مفرط',
    color: 'var(--color-negative)',
    text: `القراءة ${fmt} — ستوكاستيك في منطقة الشراء المفرط. الزخم الصعودي قد يكون في قمته وتصحيح محتمل.`,
  }
  if (val <= 20) return {
    label: 'بيع مفرط',
    color: 'var(--color-positive)',
    text: `القراءة ${fmt} — ستوكاستيك في منطقة البيع المفرط. الزخم الهبوطي قد يكون في قاعه وارتداد محتمل.`,
  }
  return {
    label: 'منطقة محايدة',
    color: 'var(--color-text-muted)',
    text: `القراءة ${fmt} — ستوكاستيك في المنطقة المحايدة (بين ٢٠ و ٨٠). لا إشارة تشبع حالياً.`,
  }
}

function getWilliamsRStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const wr = calculateWilliamsR(data)
  if (wr.length === 0) return { label: '', color: '', text: '' }
  const val = wr[wr.length - 1].value
  const fmt = val.toLocaleString('ar-SA', { maximumFractionDigits: 1 })
  if (val >= -20) return {
    label: 'تشبع شراء',
    color: 'var(--color-negative)',
    text: `القراءة ${fmt} — السهم في تشبع شرائي. قد يكون مرتفعاً فوق اللازم ويحتمل التصحيح.`,
  }
  if (val <= -80) return {
    label: 'تشبع بيع',
    color: 'var(--color-positive)',
    text: `القراءة ${fmt} — السهم في تشبع بيعي. قد يكون منخفضاً دون اللازم ويحتمل الارتداد.`,
  }
  return {
    label: 'منطقة محايدة',
    color: 'var(--color-text-muted)',
    text: `القراءة ${fmt} — السهم في المنطقة المحايدة. لا إشارة تشبع حالياً.`,
  }
}

function getCCIStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const cci = calculateCCI(data)
  if (cci.length === 0) return { label: '', color: '', text: '' }
  const val = cci[cci.length - 1].value
  const fmt = val.toLocaleString('ar-SA', { maximumFractionDigits: 0 })
  if (val >= 100) return {
    label: 'مبالغ في شرائه',
    color: 'var(--color-negative)',
    text: `القراءة ${fmt} — السعر أعلى من متوسطه بشكل كبير. قد يكون مبالغاً في شرائه وتصحيح محتمل.`,
  }
  if (val <= -100) return {
    label: 'مبالغ في بيعه',
    color: 'var(--color-positive)',
    text: `القراءة ${fmt} — السعر أقل من متوسطه بشكل كبير. قد يكون مبالغاً في بيعه وارتداد محتمل.`,
  }
  return {
    label: 'منطقة محايدة',
    color: 'var(--color-text-muted)',
    text: `القراءة ${fmt} — السعر قرب متوسطه. لا انحراف كبير حالياً.`,
  }
}

function getATRStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const atr = calculateATR(data)
  if (atr.length === 0 || data.length === 0) return { label: '', color: '', text: '' }
  const val = atr[atr.length - 1].value
  const lastClose = data[data.length - 1].close
  const pct = (val / lastClose) * 100
  const fmtVal = val.toLocaleString('ar-SA', { maximumFractionDigits: 2 })
  const fmtPct = pct.toLocaleString('ar-SA', { maximumFractionDigits: 1 })
  if (pct >= 3) return {
    label: 'تقلب مرتفع',
    color: 'var(--color-negative)',
    text: `المدى اليومي ${fmtVal} ريال (${fmtPct}% من السعر) — تقلب مرتفع. حركة السعر واسعة والمخاطر أعلى.`,
  }
  if (pct < 1) return {
    label: 'تقلب منخفض',
    color: 'var(--color-positive)',
    text: `المدى اليومي ${fmtVal} ريال (${fmtPct}% من السعر) — تقلب منخفض. حركة السعر هادئة.`,
  }
  return {
    label: 'تقلب طبيعي',
    color: 'var(--color-text-muted)',
    text: `المدى اليومي ${fmtVal} ريال (${fmtPct}% من السعر) — تقلب في المتوسط الطبيعي.`,
  }
}

function getADXStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const adx = calculateADX(data)
  if (adx.length === 0) return { label: '', color: '', text: '' }
  const val = adx[adx.length - 1].value
  const fmt = val.toLocaleString('ar-SA', { maximumFractionDigits: 1 })
  if (val >= 40) return {
    label: 'اتجاه قوي',
    color: 'var(--color-positive)',
    text: `القراءة ${fmt} — السهم في اتجاه قوي. مؤشر ADX فوق ٤٠ يعني أن الاتجاه الحالي (صعوداً أو هبوطاً) له قوة واضحة.`,
  }
  if (val >= 25) return {
    label: 'اتجاه معتدل',
    color: 'var(--color-accent-gold)',
    text: `القراءة ${fmt} — السهم في اتجاه معتدل. الاتجاه بدأ يتشكل لكنه لم يصل لمستوى القوة الواضحة.`,
  }
  return {
    label: 'بدون اتجاه',
    color: 'var(--color-text-muted)',
    text: `القراءة ${fmt} — لا يوجد اتجاه واضح. السهم في حركة عرضية وقراءات أقل من ٢٥ تدل على غياب الزخم الاتجاهي.`,
  }
}

function getOBVStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const obv = calculateOBV(data)
  if (obv.length < 10) return { label: '', color: '', text: '' }
  // Compare OBV over the last 10 bars to detect trend direction
  const recent = obv.slice(-10)
  const first = recent[0].value
  const last = recent[recent.length - 1].value
  const delta = last - first
  const absFirst = Math.abs(first) || 1
  const pctChange = (delta / absFirst) * 100
  if (pctChange > 5) return {
    label: 'تجميع',
    color: 'var(--color-positive)',
    text: `حجم التداول التراكمي في صعود (+${pctChange.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}% خلال ١٠ جلسات) — علامة على تجميع المشترين.`,
  }
  if (pctChange < -5) return {
    label: 'توزيع',
    color: 'var(--color-negative)',
    text: `حجم التداول التراكمي في هبوط (${pctChange.toLocaleString('ar-SA', { maximumFractionDigits: 1 })}% خلال ١٠ جلسات) — علامة على توزيع البائعين.`,
  }
  return {
    label: 'محايد',
    color: 'var(--color-text-muted)',
    text: `حجم التداول التراكمي مستقر — لا إشارة واضحة على التجميع أو التوزيع.`,
  }
}

function getVWAPStatus(data: OHLCVItem[]): { label: string; color: string; text: string } {
  const vwap = calculateVWAP(data)
  if (vwap.length === 0 || data.length === 0) return { label: '', color: '', text: '' }
  const vwapVal = vwap[vwap.length - 1].value
  const lastClose = data[data.length - 1].close
  const diff = lastClose - vwapVal
  const pct = (diff / vwapVal) * 100
  const fmtVwap = vwapVal.toLocaleString('ar-SA', { maximumFractionDigits: 2 })
  const fmtPct = Math.abs(pct).toLocaleString('ar-SA', { maximumFractionDigits: 2 })
  if (pct >= 1) return {
    label: 'أعلى من المتوسط',
    color: 'var(--color-positive)',
    text: `السعر الحالي أعلى من متوسط VWAP (${fmtVwap} ريال) بنسبة ${fmtPct}% — قوة شرائية واضحة.`,
  }
  if (pct <= -1) return {
    label: 'أقل من المتوسط',
    color: 'var(--color-negative)',
    text: `السعر الحالي أقل من متوسط VWAP (${fmtVwap} ريال) بنسبة ${fmtPct}% — ضغط بيعي واضح.`,
  }
  return {
    label: 'قرب المتوسط',
    color: 'var(--color-text-muted)',
    text: `السعر الحالي قرب متوسط VWAP (${fmtVwap} ريال) — السعر عند القيمة العادلة الموزونة.`,
  }
}

/* ---- SVG helpers ---- */

function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

/* ---- Chart type renderers ---- */

/** Line color class dispatched by indicator key */
const LINE_CLASS: Record<string, string> = {
  rsi: 'ind__line--rsi',
  stochRsi: 'ind__line--stoch',
  williamsR: 'ind__line--williams',
  cci: 'ind__line--cci',
  atr: 'ind__line--atr',
  adx: 'ind__line--adx',
  obv: 'ind__line--obv',
  vwap: 'ind__line--vwap',
}

/** Resolve y-axis range: fixed tuple or auto-scale from data with 10% padding */
function resolveYRange(
  calcResult: { value: number }[],
  yRange: [number, number] | 'auto' | undefined
): { yMin: number; yMax: number } {
  if (Array.isArray(yRange)) {
    return { yMin: yRange[0], yMax: yRange[1] }
  }
  // 'auto' or undefined — compute from data with 10% padding
  let lo = Infinity
  let hi = -Infinity
  for (const r of calcResult) {
    if (r.value < lo) lo = r.value
    if (r.value > hi) hi = r.value
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
    // Flat or empty data — give it a small range so line is visible
    const mid = Number.isFinite(lo) ? lo : 0
    return { yMin: mid - 1, yMax: mid + 1 }
  }
  const pad = (hi - lo) * 0.1
  return { yMin: lo - pad, yMax: hi + pad }
}

/** Render a line chart — data shape: { date, value }[] */
function renderLineChart(
  calcResult: any[],
  entry: IndicatorRegistryEntry,
  plotW: number,
  plotH: number
) {
  const { yMin, yMax } = resolveYRange(calcResult, entry.yRange)
  const yRangeSpan = yMax - yMin || 1
  const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / yRangeSpan) * plotH
  const xStep = calcResult.length > 1 ? plotW / (calcResult.length - 1) : plotW

  const points = calcResult.map((r: any, i: number) => ({ x: PAD.left + i * xStep, y: yScale(r.value) }))
  const path = buildLinePath(points)
  const lineClass = LINE_CLASS[entry.key] ?? 'ind__line--rsi'

  // Reference lines and zones depend on the indicator key
  let refs: ReactNode = null
  if (entry.key === 'rsi') {
    const y70 = yScale(70)
    const y30 = yScale(30)
    refs = (
      <>
        {/* Overbought / oversold zones (RSI only) */}
        <rect x={PAD.left} y={PAD.top} width={plotW} height={y70 - PAD.top}
          className="ind__zone ind__zone--over" />
        <rect x={PAD.left} y={y30} width={plotW} height={PAD.top + plotH - y30}
          className="ind__zone ind__zone--under" />

        {/* Reference lines at 70 / 30 */}
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={y70} y2={y70}
          className="ind__ref-line ind__ref-line--warn" />
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={y30} y2={y30}
          className="ind__ref-line ind__ref-line--safe" />

        {/* Labels */}
        <text x={PANEL_W - PAD.right + 6} y={y70 + 3} className="ind__ref-label">70</text>
        <text x={PANEL_W - PAD.right + 6} y={y30 + 3} className="ind__ref-label">30</text>
      </>
    )
  } else if (entry.key === 'stochRsi') {
    const y80 = yScale(80)
    const y20 = yScale(20)
    refs = (
      <>
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={y80} y2={y80}
          className="ind__ref-line ind__ref-line--warn" />
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={y20} y2={y20}
          className="ind__ref-line ind__ref-line--safe" />
        <text x={PANEL_W - PAD.right + 6} y={y80 + 3} className="ind__ref-label">80</text>
        <text x={PANEL_W - PAD.right + 6} y={y20 + 3} className="ind__ref-label">20</text>
      </>
    )
  } else if (entry.key === 'adx') {
    const y25 = yScale(25)
    refs = (
      <>
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={y25} y2={y25}
          className="ind__ref-line ind__ref-line--warn" />
        <text x={PANEL_W - PAD.right + 6} y={y25 + 3} className="ind__ref-label">25</text>
      </>
    )
  } else if (entry.key === 'williamsR') {
    const yM20 = yScale(-20)
    const yM80 = yScale(-80)
    refs = (
      <>
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={yM20} y2={yM20}
          className="ind__ref-line ind__ref-line--warn" />
        <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={yM80} y2={yM80}
          className="ind__ref-line ind__ref-line--safe" />
        <text x={PANEL_W - PAD.right + 6} y={yM20 + 3} className="ind__ref-label">-20</text>
        <text x={PANEL_W - PAD.right + 6} y={yM80 + 3} className="ind__ref-label">-80</text>
      </>
    )
  }
  // cci, atr, obv, vwap: no reference lines (auto-scale has no fixed thresholds)

  return (
    <>
      {refs}
      <path d={path} className={`ind__line ${lineClass}`} />
    </>
  )
}

/** Render a histogram chart (e.g. MACD) — data shape: { date, macd, signal, histogram }[] */
function renderHistogramChart(calcResult: any[], plotW: number, plotH: number) {
  // Find min/max for scaling
  let lo = Infinity, hi = -Infinity
  for (const d of calcResult) {
    const vals = [d.macd, d.signal, d.histogram]
    for (const v of vals) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  const pad = (hi - lo) * 0.1 || 0.01
  const vMin = lo - pad
  const vMax = hi + pad
  const vRange = vMax - vMin

  const yScale = (v: number) => PAD.top + plotH - ((v - vMin) / vRange) * plotH
  const xStep = calcResult.length > 1 ? plotW / (calcResult.length - 1) : plotW
  const zeroY = yScale(0)
  const barW = Math.max(1.5, Math.min(6, plotW / calcResult.length * 0.6))

  const macdPts = calcResult.map((d: any, i: number) => ({ x: PAD.left + i * xStep, y: yScale(d.macd) }))
  const sigPts = calcResult.map((d: any, i: number) => ({ x: PAD.left + i * xStep, y: yScale(d.signal) }))

  return (
    <>
      {/* Zero line */}
      <line x1={PAD.left} x2={PANEL_W - PAD.right} y1={zeroY} y2={zeroY}
        className="ind__ref-line" />

      {/* Histogram bars */}
      {calcResult.map((d: any, i: number) => {
        const x = PAD.left + i * xStep - barW / 2
        const top = d.histogram >= 0 ? yScale(d.histogram) : zeroY
        const h = Math.abs(yScale(d.histogram) - zeroY)
        return (
          <rect key={i} x={x} y={top} width={barW} height={Math.max(0.5, h)}
            className={d.histogram >= 0 ? 'ind__bar--pos' : 'ind__bar--neg'} />
        )
      })}

      {/* MACD line */}
      <path d={buildLinePath(macdPts)} className="ind__line ind__line--macd" />
      {/* Signal line */}
      <path d={buildLinePath(sigPts)} className="ind__line ind__line--signal" />
    </>
  )
}

/** Render a band chart (e.g. Bollinger) — data shape: { date, upper, middle, lower }[] */
function renderBandChart(calcResult: any[], data: OHLCVItem[], plotW: number, plotH: number) {
  // Scale based on min/max of upper/lower bands
  let lo = Infinity, hi = -Infinity
  for (const b of calcResult) {
    if (b.lower < lo) lo = b.lower
    if (b.upper > hi) hi = b.upper
  }
  const bPad = (hi - lo) * 0.1
  const vMin = lo - bPad
  const vMax = hi + bPad
  const vRange = vMax - vMin

  const yScale = (v: number) => PAD.top + plotH - ((v - vMin) / vRange) * plotH
  const xStep = calcResult.length > 1 ? plotW / (calcResult.length - 1) : plotW

  // Also get close prices for the same date range
  const closeMap = new Map(data.map(d => [d.date, d.close]))
  const closePts: { x: number; y: number }[] = []
  const upperPts = calcResult.map((b: any, i: number) => ({ x: PAD.left + i * xStep, y: yScale(b.upper) }))
  const middlePts = calcResult.map((b: any, i: number) => ({ x: PAD.left + i * xStep, y: yScale(b.middle) }))
  const lowerPts = calcResult.map((b: any, i: number) => ({ x: PAD.left + i * xStep, y: yScale(b.lower) }))

  calcResult.forEach((b: any, i: number) => {
    const c = closeMap.get(b.date)
    if (c != null) closePts.push({ x: PAD.left + i * xStep, y: yScale(c) })
  })

  // Build the band fill area (upper path forward + lower path reversed)
  const bandFill =
    `M${upperPts[0].x},${upperPts[0].y} ` +
    upperPts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` L${lowerPts[lowerPts.length - 1].x},${lowerPts[lowerPts.length - 1].y} ` +
    [...lowerPts].reverse().map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ' Z'

  return (
    <>
      <path d={bandFill} className="ind__band-fill" />
      <path d={buildLinePath(upperPts)} className="ind__line ind__line--band" />
      <path d={buildLinePath(lowerPts)} className="ind__line ind__line--band" />
      <path d={buildLinePath(middlePts)} className="ind__line ind__line--middle" />
      {closePts.length > 1 && (
        <path d={buildLinePath(closePts)} className="ind__line ind__line--close" />
      )}
    </>
  )
}

/* ---- Main component ---- */

export function IndicatorPanel({ type, data, viewDays, onAskAI }: IndicatorPanelProps) {
  // Registry lookup — no hardcoded if/else per indicator key
  const entry = INDICATOR_REGISTRY.find(i => i.key === type)

  const content = useMemo(() => {
    if (!entry || data.length === 0) return null

    const plotW = PANEL_W - PAD.left - PAD.right
    const plotH = PANEL_H - PAD.top - PAD.bottom

    // Calculate using the registry's calc function
    const fullCalcResult = entry.calcFunction(data)
    if (fullCalcResult.length < 2) return null

    // Slice to viewDays for display (min 2 points to draw)
    const calcResult = viewDays ? fullCalcResult.slice(-Math.max(viewDays, 2)) : fullCalcResult

    // Dispatch rendering by chartType from registry
    switch (entry.chartType) {
      case 'line':
        return renderLineChart(calcResult, entry, plotW, plotH)
      case 'histogram':
        return renderHistogramChart(calcResult, plotW, plotH)
      case 'band':
        return renderBandChart(calcResult, data, plotW, plotH)
      default:
        return null
    }
  }, [data, type, viewDays, entry])

  const status = useMemo(() => {
    if (data.length === 0) return null
    const statusFn = statusFunctions[type]
    return statusFn ? statusFn(data) : null
  }, [data, type, viewDays])

  if (!entry || !content) return null

  // Arabic-first label: arabicLabel (short technical symbol)
  const TECHNICAL_SHORT: Record<string, string> = {
    rsi: 'RSI',
    macd: 'MACD',
    bollinger: 'بولينجر',
    stochRsi: 'Stoch RSI',
    williamsR: '%R',
    cci: 'CCI',
    atr: 'ATR',
    adx: 'ADX',
    obv: 'OBV',
    vwap: 'VWAP',
  }
  const shortLabel = TECHNICAL_SHORT[type] ?? type
  const label = `${entry.arabicLabel} (${shortLabel})`

  return (
    <div className="ind">
      <div className="ind__header">
        <span className="ind__label">{label}</span>
        {onAskAI && (
          <button className="ind__ask-ai" onClick={onAskAI} title="اسأل نبيه">
            <NabeehAILogo size={14} />
          </button>
        )}
        {status && status.label && (
          <span className="ind__status" style={{ color: status.color, borderColor: status.color }}>
            {status.label}
          </span>
        )}
      </div>
      {entry.description && (
        <p className="ind__description">{entry.description}</p>
      )}
      <div className="ind__wrap">
        <svg
          viewBox={`0 0 ${PANEL_W} ${PANEL_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="ind__svg"
        >
          {content}
        </svg>
      </div>
      {status?.text && (
        <p className="ind__status-text">{status.text}</p>
      )}
    </div>
  )
}
