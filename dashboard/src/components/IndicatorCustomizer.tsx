/**
 * IndicatorCustomizer — compact dropdown menu for toggling indicator visibility.
 *
 * REG-03: Reads INDICATOR_REGISTRY to generate toggle items (no hardcoded array).
 * Adding a new indicator to the registry automatically appears here.
 */

import { useState, useRef, useEffect } from 'react'
import type { AnalysisPreferences } from '../types/preferences.ts'
import { INDICATOR_REGISTRY } from '../config/indicatorRegistry.ts'
import './IndicatorCustomizer.css'

interface IndicatorCustomizerProps {
  prefs: AnalysisPreferences
  onToggle: (indicator: string) => void
}

export function IndicatorCustomizer({ prefs, onToggle }: IndicatorCustomizerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeCount = INDICATOR_REGISTRY.filter(ind => prefs.indicators[ind.key]).length

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="cust-dropdown" ref={ref}>
      <button
        type="button"
        className="cust-dropdown__trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>{'تخصيص المؤشرات'}</span>
        <span className="cust-dropdown__count">{activeCount}/{INDICATOR_REGISTRY.length}</span>
        <svg className={`cust-dropdown__arrow${open ? ' cust-dropdown__arrow--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="cust-dropdown__menu">
          {INDICATOR_REGISTRY.map((ind) => {
            const isActive = prefs.indicators[ind.key]
            return (
              <div key={ind.key} className="cust-dropdown__item" onClick={() => onToggle(ind.key)}>
                <div className="cust-dropdown__item-text">
                  <span className="cust-dropdown__item-label">{ind.arabicLabel}</span>
                  <span className="cust-dropdown__item-desc">{ind.description}</span>
                </div>
                <div className={`cust-dropdown__switch${isActive ? ' cust-dropdown__switch--on' : ''}`}>
                  <span className="cust-dropdown__switch-thumb" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
