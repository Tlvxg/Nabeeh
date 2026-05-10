/**
 * IndicatorPeriodSelector -- button group for indicator chart display period.
 *
 * Controls how many days of indicator data are DISPLAYED on the chart.
 * Calculation always uses full history for accuracy.
 */

import type { AnalysisPreferences } from '../types/preferences.ts'
import './IndicatorPeriodSelector.css'

type IndicatorPeriod = AnalysisPreferences['indicatorPeriod']

interface IndicatorPeriodSelectorProps {
  selected: IndicatorPeriod
  onSelect: (period: IndicatorPeriod) => void
}

const PERIODS: { value: IndicatorPeriod; label: string }[] = [
  { value: '1d', label: '١ يوم' },
  { value: '3d', label: '٣ أيام' },
  { value: '7d', label: '٧ أيام' },
  { value: '30d', label: '٣٠ يوم' },
  { value: '90d', label: '٩٠ يوم' },
  { value: '252d', label: 'سنة' },
]

export function IndicatorPeriodSelector({ selected, onSelect }: IndicatorPeriodSelectorProps) {
  return (
    <div className="ind-period">
      <span className="ind-period__label">{'عرض'}</span>
      <div className="ind-period__btns" role="group" aria-label={'فترة المؤشرات'}>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`ind-period__btn${selected === p.value ? ' ind-period__btn--active' : ''}`}
            onClick={() => onSelect(p.value)}
            aria-pressed={selected === p.value}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
