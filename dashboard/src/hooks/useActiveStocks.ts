import { useQuery } from '@tanstack/react-query'
import { fetchActiveStocks } from '../services/supabase-queries.ts'

export function useActiveStocks() {
  return useQuery({
    queryKey: ['stocks', 'active'],
    queryFn: fetchActiveStocks,
    staleTime: 5 * 60_000, // stocks list rarely changes
  })
}
