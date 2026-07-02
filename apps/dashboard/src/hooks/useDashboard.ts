import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { DashboardStats } from '@/types'

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => {
      const response = await api.get<DashboardStats>('/dashboard/overview')
      return response as unknown as DashboardStats
    },
  })
}
