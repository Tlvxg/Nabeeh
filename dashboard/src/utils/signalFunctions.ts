/**
 * Signal functions — map each technical indicator to a consensus-ready signal.
 *
 * Each function accepts:
 *   data:       full OHLCV history (computation always uses the full series)
 *   windowDays: optional — if provided, the signal is EVALUATED on the last
 *               `windowDays` values of the computed indicator series.
 *               This gives genuinely period-specific signals without data
 *               starvation (computation still uses the full dataset).
 *
 * Signal shape: { direction: -1 (bearish) | 0 (neutral) | 1 (bullish), strength: 0–1 }
 *
 * Signal hierarchy (same for all indicators):
 *   1. Level signal — is the indicator in an extreme zone NOW?
 *      (computed on full data → always statistically valid)
 *   2. Trend signal — did the indicator move significantly within the window?
 *      (period-specific — shows recent momentum even in the neutral zone)
 *   Level always takes priority over Trend when both fire.
 */

import type { OHLCVItem } from '../types/stock.ts'
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
} from './indicators.ts'

export type SignalResult = { direction: -1 | 0 | 1; strength: number }

const NEUTRAL: SignalResult = { direction: 0, strength: 0 }

/** Slice a computed series to the last `n` values (or return full if n undefined). */
function applyWindow<T>(series: T[], windowDays?: number): T[] {
  if (windowDays && windowDays < series.length) return series.slice(-windowDays)
  return series
}

/* ══════════════════════════════════════════════════════════════════
   OSCILLATORS — RSI, StochRSI, WilliamsR, CCI
   Level: extreme zone (primary)
   Trend: direction of momentum within the window (secondary)
══════════════════════════════════════════════════════════════════ */

export function getSignalRSI(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateRSI(data)
  if (full.length === 0) return NEUTRAL

  const current = full[full.length - 1].value

  // Level signal (computed on full series — always valid)
  if (current >= 70) return { direction: -1, strength: Math.min((current - 70) / 30, 1) }
  if (current <= 30) return { direction: 1,  strength: Math.min((30 - current) / 30, 1) }

  // Trend signal — evaluate on windowed computed series
  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const trend = current - win[0].value          // RSI change within window
    if (Math.abs(trend) >= 15) {
      return { direction: trend > 0 ? 1 : -1, strength: Math.min(Math.abs(trend) / 40, 0.7) }
    }
  }

  return NEUTRAL
}

export function getSignalStochRSI(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateStochasticRSI(data)
  if (full.length === 0) return NEUTRAL

  const current = full[full.length - 1].value

  if (current >= 80) return { direction: -1, strength: Math.min((current - 80) / 20, 1) }
  if (current <= 20) return { direction: 1,  strength: Math.min((20 - current) / 20, 1) }

  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const trend = current - win[0].value
    if (Math.abs(trend) >= 20) {
      return { direction: trend > 0 ? 1 : -1, strength: Math.min(Math.abs(trend) / 60, 0.7) }
    }
  }

  return NEUTRAL
}

export function getSignalWilliamsR(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateWilliamsR(data)
  if (full.length === 0) return NEUTRAL

  const current = full[full.length - 1].value

  // Williams %R: -20 = overbought (bearish), -80 = oversold (bullish)
  if (current >= -20) return { direction: -1, strength: Math.min((current + 20) / 20, 1) }
  if (current <= -80) return { direction: 1,  strength: Math.min((-80 - current) / 20, 1) }

  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const trend = current - win[0].value
    // Rising toward 0 = approaching overbought → bearish trend
    // Falling toward -100 = approaching oversold → bullish trend
    if (Math.abs(trend) >= 20) {
      return { direction: trend > 0 ? -1 : 1, strength: Math.min(Math.abs(trend) / 60, 0.7) }
    }
  }

  return NEUTRAL
}

export function getSignalCCI(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateCCI(data)
  if (full.length === 0) return NEUTRAL

  const current = full[full.length - 1].value

  if (current >= 100)  return { direction: -1, strength: Math.min((current - 100)  / 100, 1) }
  if (current <= -100) return { direction: 1,  strength: Math.min((-100 - current) / 100, 1) }

  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const trend = current - win[0].value
    // Rising CCI = price gaining vs mean = bullish momentum
    if (Math.abs(trend) >= 50) {
      return { direction: trend > 0 ? 1 : -1, strength: Math.min(Math.abs(trend) / 200, 0.7) }
    }
  }

  return NEUTRAL
}

/* ══════════════════════════════════════════════════════════════════
   TREND — MACD
   Level: current histogram/MACD direction
   Window: was there a crossover within this period? (strongest signal)
══════════════════════════════════════════════════════════════════ */

export function getSignalMACD(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateMACD(data)
  if (full.length < 2) return NEUTRAL

  const win = applyWindow(full, windowDays)

  // Crossover detection — most recent crossover within the window
  let crossoverDir = 0
  for (let i = 1; i < win.length; i++) {
    const prev = win[i - 1]
    const curr = win[i]
    if (prev.histogram <= 0 && curr.histogram > 0) crossoverDir = 1   // bullish crossover
    if (prev.histogram >= 0 && curr.histogram < 0) crossoverDir = -1  // bearish crossover
  }
  // A crossover within the selected window is the strongest MACD signal
  if (crossoverDir !== 0) {
    return { direction: crossoverDir as -1 | 0 | 1, strength: 0.9 }
  }

  // Fallback: current direction (same as original logic)
  const last = win[win.length - 1]
  const { macd, histogram } = last
  if (histogram > 0 && macd > 0) return { direction: 1,  strength: 0.8 }
  if (histogram < 0 && macd < 0) return { direction: -1, strength: 0.8 }
  if (histogram > 0)              return { direction: 1,  strength: 0.3 }
  if (histogram < 0)              return { direction: -1, strength: 0.3 }

  return NEUTRAL
}

/* ══════════════════════════════════════════════════════════════════
   TREND STRENGTH — ADX
   Level: current ADX value (trend strength)
   Window: is ADX rising? (trend is building)
══════════════════════════════════════════════════════════════════ */

export function getSignalADX(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateADX(data)
  if (full.length === 0) return NEUTRAL

  const current = full[full.length - 1].value

  // Level signal (trend strength — same as before)
  if (current >= 40) return { direction: 1, strength: Math.min((current - 25) / 75, 1) }
  if (current >= 25) return { direction: 1, strength: 0.3 }

  // Trend signal — ADX rising within window = trend is building
  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const rise = current - win[0].value
    if (rise >= 8 && current >= 18) {
      // ADX rose ≥8 points AND has some base level → a trend is forming
      return { direction: 1, strength: Math.min(rise / 30, 0.5) }
    }
  }

  return NEUTRAL
}

/* ══════════════════════════════════════════════════════════════════
   VOLATILITY — Bollinger Bands
   Level: pctB position (near upper / near lower band)
   Window: is pctB trending toward an extreme?
══════════════════════════════════════════════════════════════════ */

export function getSignalBollinger(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateBollingerBands(data)
  if (full.length === 0) return NEUTRAL

  const last  = full[full.length - 1]
  const close = data[data.length - 1].close
  const { upper, lower } = last
  if (upper === lower) return NEUTRAL

  const pctB = (close - lower) / (upper - lower)

  // Level signal — near extremes (same as before)
  if (pctB >= 0.95) return { direction: -1, strength: Math.min((pctB - 0.95) / 0.05, 1) }
  if (pctB <= 0.05) return { direction: 1,  strength: Math.min((0.05 - pctB) / 0.05, 1) }

  // Trend signal — pctB trending toward an extreme within window
  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const firstBand  = win[0]
    const firstClose = data[data.length - win.length]?.close ?? close
    const firstPctB  = firstBand.upper !== firstBand.lower
      ? (firstClose - firstBand.lower) / (firstBand.upper - firstBand.lower)
      : 0.5
    const pctBDelta = pctB - firstPctB
    // Rising pctB → approaching upper band → overbought trend (bearish)
    // Falling pctB → approaching lower band → oversold trend (bullish)
    if (Math.abs(pctBDelta) >= 0.3) {
      return { direction: pctBDelta > 0 ? -1 : 1, strength: Math.min(Math.abs(pctBDelta) / 0.5, 0.7) }
    }
  }

  return NEUTRAL
}

/* ══════════════════════════════════════════════════════════════════
   VOLATILITY — ATR
   Level: ATR% relative to close (high = risk, low = calm)
   Window: is volatility rising? (risk signal)
══════════════════════════════════════════════════════════════════ */

export function getSignalATR(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateATR(data)
  if (full.length === 0 || data.length === 0) return NEUTRAL

  const lastClose = data[data.length - 1].close
  if (lastClose === 0) return NEUTRAL

  const current    = full[full.length - 1].value
  const currentPct = (current / lastClose) * 100

  // Level signal (same as before)
  if (currentPct >= 3) return { direction: -1, strength: Math.min((currentPct - 3) / 3, 1) }
  if (currentPct < 1)  return { direction: 1,  strength: Math.min((1 - currentPct) / 1, 1) }

  // Trend signal — is ATR% rising within window? (volatility expanding = risk)
  const win = applyWindow(full, windowDays)
  if (win.length >= 2) {
    const firstClose = data[data.length - win.length]?.close ?? lastClose
    const firstPct   = firstClose > 0 ? (win[0].value / firstClose) * 100 : currentPct
    const rise       = currentPct - firstPct
    if (rise >= 0.5) {
      return { direction: -1, strength: Math.min(rise / 2, 0.6) }
    }
  }

  return NEUTRAL
}

/* ══════════════════════════════════════════════════════════════════
   VOLUME — OBV
   Window: OBV slope over the selected period (min 10 bars)
══════════════════════════════════════════════════════════════════ */

export function getSignalOBV(data: OHLCVItem[], windowDays?: number): SignalResult {
  const full = calculateOBV(data)
  const n    = Math.max(windowDays ?? 10, 10)   // always at least 10 bars for meaningful OBV slope
  if (full.length < n) return NEUTRAL

  const slice  = full.slice(-n)
  const first  = slice[0].value
  const last   = slice[slice.length - 1].value
  const pctChg = ((last - first) / Math.abs(first || 1)) * 100

  if (pctChg > 5)  return { direction: 1,  strength: Math.min(pctChg  / 20, 1) }
  if (pctChg < -5) return { direction: -1, strength: Math.min(-pctChg / 20, 1) }

  return NEUTRAL
}

/* ══════════════════════════════════════════════════════════════════
   VOLUME — VWAP
   Level: current price vs VWAP (always meaningful regardless of window)
══════════════════════════════════════════════════════════════════ */

export function getSignalVWAP(data: OHLCVItem[], _windowDays?: number): SignalResult {
  const full = calculateVWAP(data)
  if (full.length === 0) return NEUTRAL

  const vwapValue = full[full.length - 1].value
  if (vwapValue === 0) return NEUTRAL

  const lastClose = data[data.length - 1].close
  const pct = ((lastClose - vwapValue) / vwapValue) * 100

  if (pct >= 1)  return { direction: 1,  strength: Math.min(pct  / 5, 1) }
  if (pct <= -1) return { direction: -1, strength: Math.min(-pct / 5, 1) }

  return NEUTRAL
}
