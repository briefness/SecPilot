import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { PipelineExecution, PipelineStats, PipelineStage, ScanStatus } from '@/types'

interface PaginatedResponse<T> {
  data: T[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function usePipelineExecutions(params?: { projectId?: string; stage?: PipelineStage; status?: ScanStatus }) {
  return useQuery({
    queryKey: ['pipeline-executions', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      searchParams.set('pageSize', '50')
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      if (params?.stage) searchParams.set('stage', params.stage)
      if (params?.status) searchParams.set('status', params.status)
      const response = await api.get<PaginatedResponse<PipelineExecution>>(`/pipeline/executions?${searchParams.toString()}`)
      return (response as unknown as PaginatedResponse<PipelineExecution>).data
    },
  })
}

export function usePipelineStats(projectId?: string) {
  return useQuery({
    queryKey: ['pipeline-stats', projectId],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (projectId) searchParams.set('projectId', projectId)
      const response = await api.get<PipelineStats>(`/pipeline/stats/summary?${searchParams.toString()}`)
      return response as unknown as PipelineStats
    },
  })
}
