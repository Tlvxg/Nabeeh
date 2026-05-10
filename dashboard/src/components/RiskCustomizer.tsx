/**
 * RiskCustomizer — compact dropdown menu for toggling risk metric visibility.
 *
 * REG-04: Reads RISK_REGISTRY to generate toggle items (no hardcoded array).
 * Adding a new risk metric to the registry automatically appears here.
 *
 * Same pattern as IndicatorCustomizer. Reuses cust-dropdown CSS classes.
 * Only controls the risk tab. Score tab stays static.
 */

import { useState, useRef, useEffect } from 'react'
import type { AnalysisPreferences } from '../types/preferences.ts'
import { RISK_REGISTRY } from '../config/riskRegistry.ts'
import './IndicatorCustomizer.css' // Shared dropdown styles

interface RiskCustomizerProps {
  prefs: AnalysisPreferences
  onToggle: (metric: string) => void
}

export function RiskCustomizer({ prefs, onToggle }: RiskCustomizerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeCount = RISK_REGISTRY.filter(r => prefs.risk[r.key]).length

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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>{'تخصيص المخاطر'}</span>
        <span className="cust-dropdown__count">{activeCount}/{RISK_REGISTRY.length}</span>
        <svg className={`cust-dropdown__arrow${open ? ' cust-dropdown__arrow--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="cust-dropdown__menu">
          {RISK_REGISTRY.map((metric) => {
            const isActive = prefs.risk[metric.key]
            return (
              <div key={metric.key} className="cust-dropdown__item" onClick={() => onToggle(metric.key)}>
                <div className="cust-dropdown__item-text">
                  <span className="cust-dropdown__item-label">{metric.arabicLabel}</span>
                  <span className="cust-dropdown__item-desc">{metric.description}</span>
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
