/**
 * useIndicatorResults — compute-once hook for all active indicators.
 *
 * Consumes INDICATOR_REGISTRY + raw OHLCV data and returns a typed result
 * per active indicator. Downstream consumers (SignalSummaryCard, grouped
 * indicators) call this hook instead of re-computing each indicator
 * independently.
 *
 * REQ: Phase 60-02 compute-once hook
 */

import { useMemo } from 'react'
import { INDICATOR_REGISTRY } from '../config/indicatorRegistry.ts'
import type { IndicatorRegistryEntry } from '../config/indicatorRegistry.ts'
import type { OHLCVItem } from '../types/stock.ts'

export interface IndicatorResult {
  entry: IndicatorRegistryEntry
  calcData: any[]
  signal: { direction: -1 | 0 | 1; strength: number }
}

export function useIndicatorResults(
  data: OHLCVItem[],
  activeKeys: string[],
  windowDays?: number
): IndicatorResult[] {
  return useMemo(() => {
    return INDICATOR_REGISTRY
      .filter(entry => activeKeys.includes(entry.key))
      .map(entry => {
        const calcData = entry.calcFunction(data)
        const signal =
          data.length >= entry.minDataPoints
            ? entry.signalFunction(data, windowDays)
            : { direction: 0 as const, strength: 0 }
        return { entry, calcData, signal }
      })
  }, [data, activeKeys, windowDays])
}
