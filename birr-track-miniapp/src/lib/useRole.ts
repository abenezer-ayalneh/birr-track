import { useQuery } from '@tanstack/react-query'
import { useApi } from './useApi'

/**
 * Fetch and cache the user's role; gate all views on this.
 */
export function useRole() {
  const api = useApi()
  const { data: me, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
  })

  return {
    role: me?.role,
    me,
    isLoading,
    error,
  }
}
