import { useState, useEffect } from 'react'
import { getTheme } from '../providers/ThemeProvider.tsx'

/** Returns the current theme ('light' | 'dark'), reactively updated via MutationObserver. */
export function useTheme(): 'light' | 'dark' {
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

  return theme
}
