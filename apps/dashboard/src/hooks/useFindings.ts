import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Finding, RiskLevel } from '@/types'

interface UseFindingsParams {
  projectId?: string
  severity?: RiskLevel
}

export function useFindings(params: UseFindingsParams = {}) {
  return useQuery({
    queryKey: ['findings', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params.projectId) searchParams.set('projectId', params.projectId)
      if (params.severity) searchParams.set('severity', params.severity)
      const response = await api.get<{ data: Finding[]; pagination: unknown }>(`/findings?${searchParams.toString()}`)
      return (response as unknown as { data: Finding[] }).data
    },
  })
}

export function useFinding(id: string) {
  return useQuery({
    queryKey: ['finding', id],
    queryFn: async () => {
      const response = await api.get<Finding>(`/findings/${id}`)
      return response as unknown as Finding
    },
    enabled: !!id,
  })
}

export function useMarkFalsePositive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, falsePositive }: { id: string; falsePositive: boolean; reason?: string }) => {
      const response = await api.patch<Finding>(`/findings/${id}/false-positive`, { falsePositive })
      return response as unknown as Finding
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}
