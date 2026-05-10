import { Routes, Route } from 'react-router'
import { DashboardLayout } from './layouts/DashboardLayout.tsx'
import { RouteGuard } from './components/RouteGuard.tsx'
import { LandingPage } from './pages/LandingPage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { StockDetailPage } from './pages/StockDetailPage.tsx'
import { SearchPage } from './pages/SearchPage.tsx'
import { NewsPage } from './pages/NewsPage.tsx'
import { ChatbotPage } from './pages/ChatbotPage.tsx'
import { UpgradePage } from './pages/UpgradePage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'

export function App() {
  return (
    <Routes>
      {/* Landing page — public */}
      <Route path="/" element={<LandingPage />} />

      {/* Auth routes — public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes — RouteGuard redirects to /login if unauthenticated */}
      <Route element={<RouteGuard />}>
        <Route element={<DashboardLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="chat" element={<ChatbotPage />} />
          <Route path="stock/:symbol" element={<StockDetailPage />} />
          <Route path="upgrade" element={<UpgradePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
