import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { queryClient } from '../config/query-client.ts'
import { ThemeProvider } from './ThemeProvider.tsx'
import { AuthProvider } from './AuthProvider.tsx'
import type { ReactNode } from 'react'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * Composes all application providers in the correct order.
 * BrowserRouter must wrap anything that uses React Router (including AuthProvider for Navigate).
 * QueryClientProvider wraps anything that uses TanStack Query.
 * ThemeProvider initializes theme from localStorage.
 * AuthProvider manages Supabase auth session state.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
