import { useEffect, type ReactNode } from 'react'

/**
 * ThemeProvider syncs the theme between React dashboard and the vanilla landing page.
 * Both use the same localStorage key 'theme' and data-theme attribute on <html>.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize from localStorage (same key as landing page)
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    const theme = saved || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  return <>{children}</>
}

/** Toggle the theme and persist to localStorage */
export function toggleTheme(): void {
  const current = document.documentElement.getAttribute('data-theme') || 'light'
  const next = current === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('theme', next)
}

/** Get the current theme */
export function getTheme(): 'light' | 'dark' {
  return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'
}
