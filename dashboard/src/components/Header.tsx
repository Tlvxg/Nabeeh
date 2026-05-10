import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { toggleTheme, getTheme } from '../providers/ThemeProvider.tsx'
import './Header.css'

interface HeaderProps {
  onToggleSidebar: () => void
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme)

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  const handleToggle = () => {
    toggleTheme()
  }

  const logoSrc = theme === 'dark'
    ? `${import.meta.env.BASE_URL}assets/logo-dark.svg`
    : `${import.meta.env.BASE_URL}assets/logo.svg`

  return (
    <header className="header">
      <div className="header__start">
        <button
          className="header__hamburger"
          onClick={onToggleSidebar}
          aria-label="فتح القائمة"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        <Link to="/dashboard" className="header__brand">
          <img
            src={logoSrc}
            alt="Nabeeh"
            width={38}
            height={38}
            className="header__logo"
          />
          <span className="header__title">نبيه</span>
        </Link>
      </div>

      <div className="header__end">
        <a href="/" className="header__back-link">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          <span>الرئيسية</span>
        </a>
        <button
          className="theme-toggle"
          onClick={handleToggle}
          aria-label="تبديل الوضع"
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
