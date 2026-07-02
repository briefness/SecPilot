import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Scan, ScanType } from '@/types'

export function useScans(projectId?: string) {
  return useQuery({
    queryKey: ['scans', projectId],
    queryFn: async () => {
      const url = projectId ? `/scans?projectId=${projectId}` : '/scans'
      const response = await api.get<{ data: Scan[]; pagination: unknown }>(url)
      return (response as unknown as { data: Scan[] }).data
    },
  })
}

export function useScan(id: string) {
  return useQuery({
    queryKey: ['scan', id],
    queryFn: async () => {
      const response = await api.get<Scan>(`/scans/${id}`)
      return response as unknown as Scan
    },
    enabled: !!id,
  })
}

export function useTriggerScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { projectId: string; type: ScanType; targetUrl?: string; branch?: string; commitHash?: string }) => {
      const response = await api.post<Scan>('/scans', data)
      return response as unknown as Scan
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] })
    },
  })
}
