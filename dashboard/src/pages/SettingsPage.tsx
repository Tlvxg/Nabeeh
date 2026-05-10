/**
 * SettingsPage — User profile, notifications, theme, analytics preferences, and watchlist management.
 */

import { useState, useCallback } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'
import { useUserProfile } from '../hooks/useUserProfile.ts'
import { useWatchlist } from '../hooks/useWatchlist.ts'
import { useActiveStocks } from '../hooks/useActiveStocks.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { useAnalysisPrefs, DEFAULT_PREFS } from '../hooks/useAnalysisPrefs.ts'
import { INDICATOR_REGISTRY } from '../config/indicatorRegistry.ts'
import { RISK_REGISTRY } from '../config/riskRegistry.ts'
import { StockLogo } from '../components/StockLogo.tsx'
import './SettingsPage.css'

export function SettingsPage() {
  const { user } = useAuth()
  const {
    isPremium,
    email_alerts_enabled,
    updatePreferences,
  } = useUserProfile()
  const { watchlist, removeStock } = useWatchlist()
  const { data: stocks } = useActiveStocks()
  const currentTheme = useTheme()
  const { prefs, updatePrefs: updateAnalysisPrefs } = useAnalysisPrefs()

  const [savingField, setSavingField] = useState<string | null>(null)

  const displayName = user?.user_metadata?.display_name || '\u0645\u0633\u062a\u062e\u062f\u0645'

  // ------- Handlers -------

  const handleToggleAlerts = useCallback(async () => {
    setSavingField('alerts')
    try {
      await updatePreferences({ email_alerts_enabled: !email_alerts_enabled })
    } finally {
      setSavingField(null)
    }
  }, [email_alerts_enabled, updatePreferences])

  const handleThemeChange = useCallback(async (newTheme: 'light' | 'dark') => {
    if (newTheme === currentTheme) return
    setSavingField('theme')
    // Apply immediately for instant visual feedback
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
    try {
      await updatePreferences({ theme_preference: newTheme })
    } finally {
      setSavingField(null)
    }
  }, [currentTheme, updatePreferences])

  const handleRemoveStock = useCallback(async (symbol: string) => {
    await removeStock(symbol)
  }, [removeStock])

  // Helper: find stock name from active stocks
  function getStockName(symbol: string): string {
    const stock = stocks?.find(s => s.symbol === symbol)
    return stock?.name_ar ?? symbol
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page__title">{'\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a'}</h1>

      <div className="settings-page__sections">
        {/* Section 1: Profile */}
        <section className="settings-section">
          <h2 className="settings-section__title">{'\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a'}</h2>
          <div className="settings-profile__row">
            <span className="settings-profile__label">{'\u0627\u0644\u0627\u0633\u0645'}</span>
            <span className="settings-profile__value">{displayName}</span>
          </div>
          <div className="settings-profile__row">
            <span className="settings-profile__label">{'\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a'}</span>
            <span className="settings-profile__value">{user?.email ?? ''}</span>
          </div>
          <div className="settings-profile__row">
            <span className="settings-profile__label">{'\u0627\u0644\u062e\u0637\u0629'}</span>
            <span>
              {isPremium ? (
                <span className="settings-profile__badge settings-profile__badge--premium">
                  {'\u0645\u0645\u064a\u0632'}
                </span>
              ) : (
                <>
                  <span className="settings-profile__badge settings-profile__badge--free">
                    {'\u0645\u062c\u0627\u0646\u064a'}
                  </span>
                  <Link to="/upgrade" className="settings-profile__upgrade-link">
                    {'\u062a\u0631\u0642\u064a\u0629'}
                  </Link>
                </>
              )}
            </span>
          </div>
        </section>

        {/* Section 2: Notifications */}
        <section className="settings-section">
          <h2 className="settings-section__title">{'\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a'}</h2>
          <div className="settings-toggle">
            <div className="settings-toggle__info">
              <span className="settings-toggle__label">
                {'\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a'}
              </span>
              <span className="settings-toggle__desc">
                {'\u0627\u0633\u062a\u0644\u0627\u0645 \u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0639\u0646\u062f \u062a\u062d\u062f\u064a\u062b \u062f\u0631\u062c\u0629 \u0627\u0644\u0645\u062e\u0627\u0637\u0631 \u0644\u0644\u0623\u0633\u0647\u0645 \u0641\u064a \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629'}
              </span>
            </div>
            <label className="settings-toggle__switch">
              <input
                type="checkbox"
                checked={email_alerts_enabled}
                onChange={handleToggleAlerts}
                disabled={savingField === 'alerts'}
              />
              <span className="settings-toggle__track" />
            </label>
          </div>
        </section>

        {/* Section 3: Theme */}
        <section className="settings-section">
          <h2 className="settings-section__title">{'\u0627\u0644\u0645\u0638\u0647\u0631'}</h2>
          <div className="settings-theme__options">
            <button
              type="button"
              className={`settings-theme__card${currentTheme === 'light' ? ' settings-theme__card--active' : ''}`}
              onClick={() => handleThemeChange('light')}
              disabled={savingField === 'theme'}
            >
              <svg className="settings-theme__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span>{'\u0641\u0627\u062a\u062d'}</span>
            </button>
            <button
              type="button"
              className={`settings-theme__card${currentTheme === 'dark' ? ' settings-theme__card--active' : ''}`}
              onClick={() => handleThemeChange('dark')}
              disabled={savingField === 'theme'}
            >
              <svg className="settings-theme__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span>{'\u062f\u0627\u0643\u0646'}</span>
            </button>
          </div>
        </section>

        {/* Section 4: Analytics Preferences */}
        <section className="settings-section">
          <h2 className="settings-section__title">{'\u062a\u062e\u0635\u064a\u0635 \u0627\u0644\u062a\u062d\u0644\u064a\u0644'}</h2>
          <p className="settings-section__desc">
            {'\u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a \u0648\u0645\u0642\u0627\u064a\u064a\u0633 \u0627\u0644\u0645\u062e\u0627\u0637\u0631 \u0627\u0644\u062a\u064a \u062a\u0631\u064a\u062f \u0639\u0631\u0636\u0647\u0627 \u0641\u064a \u0635\u0641\u062d\u0629 \u0627\u0644\u0633\u0647\u0645'}
          </p>

          {/* Indicators */}
          <h3 className="settings-subsection__title">{'\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a \u0627\u0644\u0641\u0646\u064a\u0629'}</h3>
          {INDICATOR_REGISTRY.map(ind => (
            <div key={ind.key} className="settings-toggle">
              <div className="settings-toggle__info">
                <span className="settings-toggle__label">{ind.arabicLabel}</span>
                <span className="settings-toggle__desc">{ind.description}</span>
              </div>
              <label className="settings-toggle__switch">
                <input
                  type="checkbox"
                  checked={prefs.indicators[ind.key] ?? true}
                  onChange={() => updateAnalysisPrefs({
                    indicators: { ...prefs.indicators, [ind.key]: !(prefs.indicators[ind.key] ?? true) }
                  })}
                />
                <span className="settings-toggle__track" />
              </label>
            </div>
          ))}

          {/* Risk Metrics */}
          <h3 className="settings-subsection__title">{'\u0645\u0642\u0627\u064a\u064a\u0633 \u0627\u0644\u0645\u062e\u0627\u0637\u0631'}</h3>
          {RISK_REGISTRY.map(metric => (
            <div key={metric.key} className="settings-toggle">
              <div className="settings-toggle__info">
                <span className="settings-toggle__label">{metric.arabicLabel}</span>
                <span className="settings-toggle__desc">{metric.description}</span>
              </div>
              <label className="settings-toggle__switch">
                <input
                  type="checkbox"
                  checked={prefs.risk[metric.key] ?? true}
                  onChange={() => updateAnalysisPrefs({
                    risk: { ...prefs.risk, [metric.key]: !(prefs.risk[metric.key] ?? true) }
                  })}
                />
                <span className="settings-toggle__track" />
              </label>
            </div>
          ))}

          {/* MC Horizon */}
          <h3 className="settings-subsection__title">{'\u0623\u0641\u0642 \u0627\u0644\u0645\u062d\u0627\u0643\u0627\u0629'}</h3>
          <div className="settings-horizon">
            {(['90d', '252d'] as const).map(h => (
              <button
                key={h}
                type="button"
                className={`settings-horizon__btn${prefs.mcHorizon === h ? ' settings-horizon__btn--active' : ''}`}
                onClick={() => updateAnalysisPrefs({ mcHorizon: h })}
              >
                {({ '90d': '\u0669\u0660 \u064a\u0648\u0645', '252d': '\u0633\u0646\u0629' } as const)[h]}
              </button>
            ))}
          </div>

          {/* Reset to defaults */}
          <button
            type="button"
            className="settings-section__reset"
            onClick={() => updateAnalysisPrefs(DEFAULT_PREFS)}
          >
            {'\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0636\u0628\u0637 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a'}
          </button>
        </section>

        {/* Section 5: Watchlist */}
        <section className="settings-section">
          <h2 className="settings-section__title">{'\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629'}</h2>
          {isPremium ? (
            watchlist.length > 0 ? (
              <div className="settings-watchlist__list">
                {watchlist.map(symbol => (
                  <div key={symbol} className="settings-watchlist__item">
                    <StockLogo symbol={symbol} size={32} />
                    <div className="settings-watchlist__stock-info">
                      <Link to={`/stock/${symbol}`}>{getStockName(symbol)}</Link>
                      <span className="settings-watchlist__ticker">{symbol}.SR</span>
                    </div>
                    <button
                      type="button"
                      className="settings-watchlist__remove"
                      onClick={() => handleRemoveStock(symbol)}
                      title={'\u0625\u0632\u0627\u0644\u0629'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="settings-watchlist__empty">
                <p>
                  {'\u0644\u0645 \u062a\u0636\u0641 \u0623\u064a \u0623\u0633\u0647\u0645 \u0628\u0639\u062f. \u064a\u0645\u0643\u0646\u0643 \u0625\u0636\u0627\u0641\u0629 \u0623\u0633\u0647\u0645 \u0645\u0646 \u0635\u0641\u062d\u0629 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0633\u0647\u0645.'}
                </p>
              </div>
            )
          ) : (
            <div className="settings-upgrade-prompt">
              <p className="settings-upgrade-prompt__text">
                {'\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0645\u062a\u0627\u062d\u0629 \u0644\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646 \u0627\u0644\u0645\u0645\u064a\u0632\u064a\u0646'}
              </p>
              <Link to="/upgrade" className="settings-upgrade-prompt__link">
                {'\u062a\u0631\u0642\u064a\u0629 \u0627\u0644\u062d\u0633\u0627\u0628'}
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
