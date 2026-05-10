/**
 * Indicator Registry — single source of truth for all technical indicators.
 *
 * Adding a new indicator = one entry here. DEFAULT_PREFS, customizers,
 * and panels all derive from this registry automatically.
 *
 * REG-01: Central indicator definitions
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
} from '../utils/indicators.ts'
import type { SignalResult } from '../utils/signalFunctions.ts'
import {
  getSignalRSI,
  getSignalMACD,
  getSignalBollinger,
  getSignalStochRSI,
  getSignalWilliamsR,
  getSignalCCI,
  getSignalATR,
  getSignalADX,
  getSignalOBV,
  getSignalVWAP,
} from '../utils/signalFunctions.ts'

export type IndicatorCategory = 'momentum' | 'trend' | 'volatility' | 'volume'

export interface IndicatorRegistryEntry {
  key: string                                    // unique key (e.g. 'rsi')
  arabicLabel: string                            // display label (e.g. 'مؤشر الشراء والبيع')
  description: string                            // one-sentence Arabic description
  calcFunction: (data: OHLCVItem[]) => any[]    // calculation function
  minDataPoints: number                          // min data needed for calculation
  chartType: 'line' | 'histogram' | 'band'      // how to render on SVG
  /** Y-axis range for line charts. [min, max] = fixed scale; 'auto' = scale to data min/max with 10% padding. Omit for non-line charts (histogram/band handle their own scaling). */
  yRange?: [number, number] | 'auto'
  category: IndicatorCategory
  categoryArabicLabel: string                    // Arabic section header (e.g. 'مؤشرات الزخم')
  signalFunction: (data: OHLCVItem[], windowDays?: number) => SignalResult
}

export const INDICATOR_REGISTRY: IndicatorRegistryEntry[] = [
  {
    key: 'rsi',
    arabicLabel: 'مؤشر الشراء والبيع',
    description: 'يقيس سرعة تحرك السعر، هل السهم مبالغ في شرائه أو بيعه؟',
    calcFunction: calculateRSI,
    minDataPoints: 14,
    chartType: 'line',
    yRange: [0, 100],
    category: 'momentum',
    categoryArabicLabel: 'مؤشرات الزخم',
    signalFunction: getSignalRSI,
  },
  {
    key: 'macd',
    arabicLabel: 'اتجاه السعر',
    description: 'يتتبع اتجاه وزخم السعر، هل الاتجاه صاعد أم هابط؟',
    calcFunction: calculateMACD,
    minDataPoints: 35,
    chartType: 'histogram',
    category: 'trend',
    categoryArabicLabel: 'مؤشرات الاتجاه',
    signalFunction: getSignalMACD,
  },
  {
    key: 'bollinger',
    arabicLabel: 'نطاقات التذبذب',
    description: 'تحدد نطاق التذبذب الطبيعي، هل السعر خارج المعتاد؟',
    calcFunction: calculateBollingerBands,
    minDataPoints: 20,
    chartType: 'band',
    category: 'trend',
    categoryArabicLabel: 'مؤشرات الاتجاه',
    signalFunction: getSignalBollinger,
  },
  {
    key: 'stochRsi',
    arabicLabel: 'مؤشر ستوكاستيك',
    description: 'يكتشف تحولات الزخم السريعة، أكثر حساسية من مؤشر الشراء والبيع العادي',
    calcFunction: calculateStochasticRSI,
    minDataPoints: 28, // 14 (RSI) + 14 (stoch)
    chartType: 'line',
    yRange: [0, 100],
    category: 'momentum',
    categoryArabicLabel: 'مؤشرات الزخم',
    signalFunction: getSignalStochRSI,
  },
  {
    key: 'williamsR',
    arabicLabel: 'مؤشر ويليامز',
    description: 'يقيس قوة البيع والشراء، هل السهم في منطقة تشبع؟',
    calcFunction: calculateWilliamsR,
    minDataPoints: 14,
    chartType: 'line',
    yRange: [-100, 0],
    category: 'momentum',
    categoryArabicLabel: 'مؤشرات الزخم',
    signalFunction: getSignalWilliamsR,
  },
  {
    key: 'cci',
    arabicLabel: 'مؤشر قناة السلع',
    description: 'يقيس انحراف السعر عن متوسطه، هل السعر متطرف الآن؟',
    calcFunction: calculateCCI,
    minDataPoints: 20,
    chartType: 'line',
    yRange: 'auto',
    category: 'momentum',
    categoryArabicLabel: 'مؤشرات الزخم',
    signalFunction: getSignalCCI,
  },
  {
    key: 'atr',
    arabicLabel: 'متوسط المدى الحقيقي',
    description: 'يقيس تقلب السعر اليومي، ما حجم حركة السهم في اليوم؟',
    calcFunction: calculateATR,
    minDataPoints: 15,
    chartType: 'line',
    yRange: 'auto',
    category: 'volatility',
    categoryArabicLabel: 'مؤشرات التذبذب',
    signalFunction: getSignalATR,
  },
  {
    key: 'adx',
    arabicLabel: 'قوة الاتجاه',
    description: 'يقيس قوة الاتجاه الحالي، هل السهم في اتجاه قوي أم عرضي؟',
    calcFunction: calculateADX,
    minDataPoints: 28,
    chartType: 'line',
    yRange: [0, 100],
    category: 'trend',
    categoryArabicLabel: 'مؤشرات الاتجاه',
    signalFunction: getSignalADX,
  },
  {
    key: 'obv',
    arabicLabel: 'حجم التداول التراكمي',
    description: 'يتتبع تدفق الأموال من خلال حجم التداول، هل المتداولون يشترون أم يبيعون؟',
    calcFunction: calculateOBV,
    minDataPoints: 2,
    chartType: 'line',
    yRange: 'auto',
    category: 'volume',
    categoryArabicLabel: 'مؤشرات الحجم',
    signalFunction: getSignalOBV,
  },
  {
    key: 'vwap',
    arabicLabel: 'السعر المتوسط الموزون',
    description: 'السعر العادل الموزون بالحجم، هل السعر الحالي أعلى أم أقل من القيمة العادلة؟',
    calcFunction: calculateVWAP,
    minDataPoints: 20,
    chartType: 'line',
    yRange: 'auto',
    category: 'volume',
    categoryArabicLabel: 'مؤشرات الحجم',
    signalFunction: getSignalVWAP,
  },
]

/** Helper: get all indicator keys */
export function getIndicatorKeys(): string[] {
  return INDICATOR_REGISTRY.map(i => i.key)
}

/** Helper: create default indicator prefs (all true) */
export function getDefaultIndicatorPrefs(): Record<string, boolean> {
  const prefs: Record<string, boolean> = {}
  for (const ind of INDICATOR_REGISTRY) {
    prefs[ind.key] = true
  }
  return prefs
}
