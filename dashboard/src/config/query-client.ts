import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 minutes default
      gcTime: 30 * 60 * 1000,          // 30 minutes garbage collection
      retry: 2,
      refetchOnWindowFocus: false,      // Financial data: user controls refresh
    },
  },
})
