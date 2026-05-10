/**
 * MCHorizonSelector -- button group for Monte Carlo simulation time horizon.
 *
 * Displays 2 Arabic-labeled buttons: 90d / 252d (year).
 * Active button gets primary fill; inactive are muted/outlined.
 * When isSimulating is true, the active button shows a subtle pulse animation.
 *
 * 90d uses client-side Worker MC simulation.
 * 252d uses server pre-computed data.
 *
 * Follows the same segmented button group pattern as IndicatorPeriodSelector.
 */

import type { AnalysisPreferences } from '../types/preferences.ts'
import './MCHorizonSelector.css'

type MCHorizon = AnalysisPreferences['mcHorizon']

interface MCHorizonSelectorProps {
  selected: MCHorizon
  onSelect: (horizon: MCHorizon) => void
  isSimulating?: boolean
}

const HORIZONS: { value: MCHorizon; label: string }[] = [
  { value: '90d', label: '\u0669\u0660 \u064A\u0648\u0645' },
  { value: '252d', label: '\u0633\u0646\u0629' },
]

export function MCHorizonSelector({ selected, onSelect, isSimulating }: MCHorizonSelectorProps) {
  return (
    <div className="mc-horizon">
      <span className="mc-horizon__label">{'\u0623\u0641\u0642 \u0627\u0644\u0645\u062D\u0627\u0643\u0627\u0629'}</span>
      <div className="mc-horizon__btns" role="group" aria-label={'\u0623\u0641\u0642 \u0645\u062D\u0627\u0643\u0627\u0629 \u0645\u0648\u0646\u062A \u0643\u0627\u0631\u0644\u0648'}>
        {HORIZONS.map((h) => {
          const isActive = selected === h.value
          const className = [
            'mc-horizon__btn',
            isActive ? 'mc-horizon__btn--active' : '',
            isActive && isSimulating ? 'mc-horizon__btn--simulating' : '',
          ].filter(Boolean).join(' ')

          return (
            <button
              key={h.value}
              type="button"
              className={className}
              onClick={() => onSelect(h.value)}
              aria-pressed={isActive}
              disabled={isSimulating && !isActive}
            >
              {h.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
