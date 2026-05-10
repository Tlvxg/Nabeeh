import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'

/**
 * Route guard that protects dashboard routes.
 * - While loading auth state: shows a centered spinner
 * - If unauthenticated: redirects to /login
 * - If authenticated: renders child routes via Outlet
 */
export function RouteGuard() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '4px solid var(--color-border, #c8cbc7)',
            borderTopColor: 'var(--color-primary, #2d6a4f)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
