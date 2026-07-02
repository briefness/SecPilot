import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { BypassRequest } from '@/types'

interface ApiBypassResponse {
  data: Array<{
    id: string
    projectId: string
    reason: string
    requestedBy: string
    requestedAt: string
    expiresAt: string | null
    status: string
    approvedBy: string | null
    approvedAt: string | null
    createdAt: string
    updatedAt: string
    project: { id: string; name: string; productId: string }
    requester: { id: string; name: string; email: string }
    approver?: { id: string; name: string; email: string } | null
  }>
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function useBypassRequests() {
  return useQuery({
    queryKey: ['bypass'],
    queryFn: async () => {
      const response = await api.get<ApiBypassResponse>('/bypass')
      return response.data.data.map((b): BypassRequest => ({
        id: b.id,
        findingId: '',
        findingTitle: b.project.name,
        projectId: b.projectId,
        projectName: b.project.name,
        reason: b.reason,
        requestedBy: b.requester.name,
        status: b.status as BypassRequest['status'],
        reviewedBy: b.approver?.name || null,
        reviewedAt: b.approvedAt,
        reviewComment: null,
        expiresAt: b.expiresAt,
        createdAt: b.createdAt,
      }))
    },
  })
}
