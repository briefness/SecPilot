import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { AuditLogEntry, AuditLogStats } from '@/types'

interface ApiAuditLogResponse {
  data: AuditLogEntry[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function useAuditLogs(params?: { action?: string; userId?: string; projectId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.action) searchParams.set('action', params.action)
      if (params?.userId) searchParams.set('userId', params.userId)
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      if (params?.from) searchParams.set('from', params.from)
      if (params?.to) searchParams.set('to', params.to)
      const response = await api.get<ApiAuditLogResponse>(`/audit-logs?${searchParams.toString()}`)
      return response as unknown as ApiAuditLogResponse
    },
  })
}

export function useAuditLogStats() {
  return useQuery({
    queryKey: ['audit-logs', 'stats'],
    queryFn: async () => {
      const response = await api.get<AuditLogStats>('/audit-logs/stats/summary')
      return response as unknown as AuditLogStats
    },
  })
}

export function useAuditLogActions() {
  return useQuery({
    queryKey: ['audit-logs', 'actions'],
    queryFn: async () => {
      const response = await api.get<Array<{ action: string; count: number }>>('/audit-logs/actions')
      return response as unknown as Array<{ action: string; count: number }>
    },
  })
}
