import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ScannerConfig, ScannerStats, ScannerType } from '@/types'

export function useScanners() {
  return useQuery({
    queryKey: ['scanners'],
    queryFn: async () => {
      const response = await api.get<{ data: ScannerConfig[] }>('/scanners')
      return (response as unknown as { data: ScannerConfig[] }).data
    },
  })
}

export function useScanner(type: ScannerType | null) {
  return useQuery({
    queryKey: ['scanner', type],
    queryFn: async () => {
      if (!type) return null
      const response = await api.get<ScannerConfig>(`/scanners/${type}`)
      return response as unknown as ScannerConfig
    },
    enabled: !!type,
  })
}

export function useUpdateScanner(type: ScannerType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<ScannerConfig>) => {
      const response = await api.put<ScannerConfig>(`/scanners/${type}`, data)
      return response as unknown as ScannerConfig
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanners'] })
      queryClient.invalidateQueries({ queryKey: ['scanner', type] })
      queryClient.invalidateQueries({ queryKey: ['scanner-stats'] })
    },
  })
}

export function useToggleScanner(type: ScannerType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await api.patch<ScannerConfig>(`/scanners/${type}/toggle`)
      return response as unknown as ScannerConfig
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanners'] })
      queryClient.invalidateQueries({ queryKey: ['scanner', type] })
      queryClient.invalidateQueries({ queryKey: ['scanner-stats'] })
    },
  })
}

export function useScannerStats() {
  return useQuery({
    queryKey: ['scanner-stats'],
    queryFn: async () => {
      const response = await api.get<ScannerStats>('/scanners/stats/summary')
      return response as unknown as ScannerStats
    },
  })
}
