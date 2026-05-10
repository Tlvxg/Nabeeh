import { useState, useCallback, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Header } from '../components/Header.tsx'
import { Sidebar } from '../components/Sidebar.tsx'
import { useUserProfile } from '../hooks/useUserProfile.ts'
import './DashboardLayout.css'

/**
 * Main dashboard shell layout.
 * Composes Header (top) + Sidebar (right in RTL) + content area (Outlet).
 * Manages sidebar open/close state for mobile responsive behavior.
 * Syncs theme from user profile on login (once per session).
 */
export function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()
  const { theme_preference } = useUserProfile()
  const themeAppliedRef = useRef(false)

  // Sync saved theme preference from user profile on first load (login)
  useEffect(() => {
    if (theme_preference && !themeAppliedRef.current) {
      document.documentElement.setAttribute('data-theme', theme_preference)
      localStorage.setItem('theme', theme_preference)
      themeAppliedRef.current = true
    }
  }, [theme_preference])

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev)
  }, [])

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false)
  }, [])

  return (
    <div className="dashboard-layout">
      <Header onToggleSidebar={handleToggleSidebar} />
      <div className="dashboard-layout__body">
        <Sidebar isOpen={isSidebarOpen} onClose={handleCloseSidebar} />
        <main className="dashboard-layout__content">
          <div key={location.pathname} className="dashboard-layout__page-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
