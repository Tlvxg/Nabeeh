/**
 * Pure calculation functions for technical indicators.
 *
 * All functions take OHLCV data and return date-aligned arrays
 * suitable for lightweight-charts consumption.
 */

import type { OHLCVItem } from '../types/stock.ts'

/* ---- Helper: Exponential Moving Average ---- */

export function ema(data: number[], period: number): number[] {
  const result: number[] = []
  if (data.length === 0) return result

  const k = 2 / (period + 1)

  // First value is SMA of the first `period` values
  let sum = 0
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i]
  }
  result.push(sum / Math.min(period, data.length))

  // Subsequent values use EMA formula
  for (let i = 1; i < data.length; i++) {
    const prev = result[result.length - 1]
    result.push(data[i] * k + prev * (1 - k))
  }

  return result
}

/* ---- RSI (Relative Strength Index) ---- */

export interface RSIPoint {
  date: string
  value: number
}

export function calculateRSI(items: OHLCVItem[], period: number = 14): RSIPoint[] {
  const closes = items.map((d) => d.close)
  if (closes.length < period + 1) return []

  const result: RSIPoint[] = []

  // Calculate price changes
  const changes: number[] = []
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1])
  }

  // First average gain / loss over `period`
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period

  // First RSI value at index `period` (0-based in items = period)
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0)
  result.push({ date: items[period].date, value: rsi0 })

  // Subsequent RSI values using smoothed averages
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs)
    result.push({ date: items[i + 1].date, value: rsi })
  }

  return result
}

/* ---- MACD (Moving Average Convergence Divergence) ---- */

export interface MACDPoint {
  date: string
  macd: number
  signal: number
  histogram: number
}

export function calculateMACD(
  items: OHLCVItem[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): MACDPoint[] {
  const closes = items.map((d) => d.close)
  if (closes.length < slowPeriod + signalPeriod) return []

  const fastEMA = ema(closes, fastPeriod)
  const slowEMA = ema(closes, slowPeriod)

  // MACD line = fast EMA - slow EMA
  const macdLine: number[] = []
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i])
  }

  // Signal line = EMA of MACD line
  const signalLine = ema(macdLine, signalPeriod)

  // Build output starting from slowPeriod - 1 to have meaningful data
  const startIdx = slowPeriod - 1
  const result: MACDPoint[] = []

  for (let i = startIdx; i < closes.length; i++) {
    const m = macdLine[i]
    const s = signalLine[i]
    result.push({
      date: items[i].date,
      macd: m,
      signal: s,
      histogram: m - s,
    })
  }

  return result
}

/* ---- Bollinger Bands ---- */

export interface BollingerPoint {
  date: string
  upper: number
  middle: number
  lower: number
}

export function calculateBollingerBands(
  items: OHLCVItem[],
  period: number = 20,
  stdDevMultiplier: number = 2,
): BollingerPoint[] {
  const closes = items.map((d) => d.close)
  if (closes.length < period) return []

  const result: BollingerPoint[] = []

  for (let i = period - 1; i < closes.length; i++) {
    // SMA
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j]
    }
    const sma = sum / period

    // Standard deviation
    let sqDiffSum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sqDiffSum += (closes[j] - sma) ** 2
    }
    const stdev = Math.sqrt(sqDiffSum / period)

    result.push({
      date: items[i].date,
      upper: sma + stdDevMultiplier * stdev,
      middle: sma,
      lower: sma - stdDevMultiplier * stdev,
    })
  }

  return result
}

/* ---- Stochastic RSI ---- */

export interface StochasticRSIPoint {
  date: string
  value: number // 0-100
}

/**
 * Stochastic RSI: Applies stochastic oscillator formula to RSI values.
 * Formula: StochRSI = (RSI - RSI_min) / (RSI_max - RSI_min) * 100
 * where min/max are over the lookback period.
 *
 * Standard parameters: RSI period 14, stochastic lookback 14
 */
export function calculateStochasticRSI(
  items: OHLCVItem[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
): StochasticRSIPoint[] {
  const rsi = calculateRSI(items, rsiPeriod)
  if (rsi.length < stochPeriod) return []

  const result: StochasticRSIPoint[] = []
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const window = rsi.slice(i - stochPeriod + 1, i + 1).map((r) => r.value)
    const min = Math.min(...window)
    const max = Math.max(...window)
    const curr = rsi[i].value
    const value = max === min ? 50 : ((curr - min) / (max - min)) * 100
    result.push({ date: rsi[i].date, value })
  }
  return result
}

/* ---- Williams %R ---- */

export interface WilliamsRPoint {
  date: string
  value: number // -100 to 0
}

/**
 * Williams %R: Momentum indicator measuring overbought/oversold.
 * Formula: %R = (Highest_High - Close) / (Highest_High - Lowest_Low) * -100
 * Range: -100 (oversold) to 0 (overbought)
 *
 * Standard parameter: 14-period lookback
 */
export function calculateWilliamsR(
  items: OHLCVItem[],
  period: number = 14,
): WilliamsRPoint[] {
  if (items.length < period) return []

  const result: WilliamsRPoint[] = []
  for (let i = period - 1; i < items.length; i++) {
    const window = items.slice(i - period + 1, i + 1)
    const highestHigh = Math.max(...window.map((d) => d.high))
    const lowestLow = Math.min(...window.map((d) => d.low))
    const close = items[i].close
    const range = highestHigh - lowestLow
    const value = range === 0 ? -50 : ((highestHigh - close) / range) * -100
    result.push({ date: items[i].date, value })
  }
  return result
}

/* ---- CCI (Commodity Channel Index) ---- */

export interface CCIPoint {
  date: string
  value: number // typically -200 to +200
}

/**
 * CCI: Measures how far price is from its statistical mean.
 * Formula: CCI = (TypicalPrice - SMA(TP)) / (0.015 * MeanDeviation)
 * where TP = (High + Low + Close) / 3
 *
 * Standard parameter: 20-period lookback
 * Above +100 = overbought, below -100 = oversold
 */
export function calculateCCI(
  items: OHLCVItem[],
  period: number = 20,
): CCIPoint[] {
  if (items.length < period) return []

  // Calculate typical prices
  const tp = items.map((d) => (d.high + d.low + d.close) / 3)

  const result: CCIPoint[] = []
  for (let i = period - 1; i < items.length; i++) {
    const window = tp.slice(i - period + 1, i + 1)
    const sma = window.reduce((a, b) => a + b, 0) / period
    const meanDev = window.reduce((acc, v) => acc + Math.abs(v - sma), 0) / period
    const value = meanDev === 0 ? 0 : (tp[i] - sma) / (0.015 * meanDev)
    result.push({ date: items[i].date, value })
  }
  return result
}

/* ---- ATR (Average True Range) ---- */

export interface ATRPoint {
  date: string
  value: number // absolute price range in SAR
}

/**
 * ATR: Measures volatility as average of daily True Range.
 * True Range = max of:
 *   - High - Low
 *   - |High - PreviousClose|
 *   - |Low - PreviousClose|
 * ATR = EMA of TR over N periods (default 14)
 */
export function calculateATR(
  items: OHLCVItem[],
  period: number = 14,
): ATRPoint[] {
  if (items.length < period + 1) return []

  // Compute true range for each bar (starting from index 1)
  const tr: number[] = []
  for (let i = 1; i < items.length; i++) {
    const curr = items[i]
    const prev = items[i - 1]
    const hl = curr.high - curr.low
    const hc = Math.abs(curr.high - prev.close)
    const lc = Math.abs(curr.low - prev.close)
    tr.push(Math.max(hl, hc, lc))
  }

  // Apply EMA to true range
  const atrValues = ema(tr, period)

  const result: ATRPoint[] = []
  for (let i = 0; i < atrValues.length; i++) {
    // tr[0] corresponds to items[1], so atrValues[i] corresponds to items[i+1]
    result.push({ date: items[i + 1].date, value: atrValues[i] })
  }
  return result
}

/* ---- ADX (Average Directional Index) ---- */

export interface ADXPoint {
  date: string
  value: number // 0-100, trend strength
}

/**
 * ADX: Measures trend strength (not direction).
 * Steps:
 *   1. Calculate +DM, -DM (directional movement)
 *   2. Smooth with EMA
 *   3. Calculate +DI, -DI
 *   4. DX = |(+DI) - (-DI)| / |(+DI) + (-DI)| * 100
 *   5. ADX = EMA of DX
 *
 * Range: 0-100. Above 25 = trending, above 50 = strong trend.
 */
export function calculateADX(
  items: OHLCVItem[],
  period: number = 14,
): ADXPoint[] {
  if (items.length < period * 2) return []

  // True range and directional movement
  const tr: number[] = []
  const plusDM: number[] = []
  const minusDM: number[] = []

  for (let i = 1; i < items.length; i++) {
    const curr = items[i]
    const prev = items[i - 1]
    const hl = curr.high - curr.low
    const hc = Math.abs(curr.high - prev.close)
    const lc = Math.abs(curr.low - prev.close)
    tr.push(Math.max(hl, hc, lc))

    const upMove = curr.high - prev.high
    const downMove = prev.low - curr.low
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0)
  }

  // Smooth TR, +DM, -DM with EMA
  const smTR = ema(tr, period)
  const smPlusDM = ema(plusDM, period)
  const smMinusDM = ema(minusDM, period)

  // Calculate +DI and -DI
  const plusDI: number[] = smPlusDM.map((v, i) => smTR[i] === 0 ? 0 : (v / smTR[i]) * 100)
  const minusDI: number[] = smMinusDM.map((v, i) => smTR[i] === 0 ? 0 : (v / smTR[i]) * 100)

  // Calculate DX
  const dx: number[] = plusDI.map((pd, i) => {
    const md = minusDI[i]
    const sum = pd + md
    return sum === 0 ? 0 : (Math.abs(pd - md) / sum) * 100
  })

  // ADX = EMA of DX
  const adxValues = ema(dx, period)

  const result: ADXPoint[] = []
  for (let i = period; i < adxValues.length; i++) {
    // dx[0] corresponds to items[1], so adxValues[i] corresponds to items[i+1]
    if (i + 1 < items.length) {
      result.push({ date: items[i + 1].date, value: adxValues[i] })
    }
  }
  return result
}

/* ---- OBV (On-Balance Volume) ---- */

export interface OBVPoint {
  date: string
  value: number // cumulative signed volume
}

/**
 * OBV: Cumulative volume that adds/subtracts based on close price direction.
 * - If close > previous close: OBV += volume
 * - If close < previous close: OBV -= volume
 * - If close == previous close: OBV unchanged
 *
 * Rising OBV with rising price = confirmation.
 * Divergence between OBV and price = warning signal.
 */
export function calculateOBV(items: OHLCVItem[]): OBVPoint[] {
  if (items.length < 2) return []

  const result: OBVPoint[] = []
  let obv = 0

  // First bar: start at 0 (or volume, depending on convention — we use 0)
  result.push({ date: items[0].date, value: 0 })

  for (let i = 1; i < items.length; i++) {
    const currClose = items[i].close
    const prevClose = items[i - 1].close
    const volume = items[i].volume

    if (currClose > prevClose) {
      obv += volume
    } else if (currClose < prevClose) {
      obv -= volume
    }
    // If equal, obv unchanged

    result.push({ date: items[i].date, value: obv })
  }
  return result
}

/* ---- VWAP (Volume Weighted Average Price) ---- */

export interface VWAPPoint {
  date: string
  value: number // VWAP in SAR
}

/**
 * VWAP: Average price weighted by volume.
 * Formula: VWAP = Σ(TypicalPrice × Volume) / Σ(Volume)
 * where TypicalPrice = (High + Low + Close) / 3
 *
 * Daily VWAP resets each day, but for our daily-bar chart we compute
 * ROLLING VWAP over N periods to track trend-relative fair value.
 * Standard parameter: 20-period rolling window.
 */
export function calculateVWAP(
  items: OHLCVItem[],
  period: number = 20,
): VWAPPoint[] {
  if (items.length < period) return []

  const result: VWAPPoint[] = []

  for (let i = period - 1; i < items.length; i++) {
    const window = items.slice(i - period + 1, i + 1)
    let tpVolSum = 0
    let volSum = 0
    for (const bar of window) {
      const tp = (bar.high + bar.low + bar.close) / 3
      tpVolSum += tp * bar.volume
      volSum += bar.volume
    }
    const vwap = volSum === 0 ? items[i].close : tpVolSum / volSum
    result.push({ date: items[i].date, value: vwap })
  }
  return result
}
