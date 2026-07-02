import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { GitlabIntegration } from '@/types'

export function useGitlabIntegrations(projectId?: string) {
  return useQuery({
    queryKey: ['gitlab-integrations', projectId],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (projectId) searchParams.set('projectId', projectId)
      const response = await api.get<GitlabIntegration[]>(`/gitlab-integrations?${searchParams.toString()}`)
      return response as unknown as GitlabIntegration[]
    },
  })
}

export function useGitlabIntegration(projectId: string) {
  return useQuery({
    queryKey: ['gitlab-integration', projectId],
    queryFn: async () => {
      const response = await api.get<GitlabIntegration>(`/gitlab-integrations/${projectId}`)
      return response as unknown as GitlabIntegration
    },
    enabled: !!projectId,
  })
}

export function useCreateGitlabIntegration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      projectId: string
      groupPath: string
      projectPath: string
      webhookToken: string
      complianceTemplateEnabled?: boolean
      securityBypassToken?: string
    }) => {
      const response = await api.post<GitlabIntegration>('/gitlab-integrations', data)
      return response as unknown as GitlabIntegration
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gitlab-integrations'] })
    },
  })
}

export function useUpdateGitlabIntegration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: Partial<GitlabIntegration> }) => {
      const response = await api.patch<GitlabIntegration>(`/gitlab-integrations/${projectId}`, data)
      return response as unknown as GitlabIntegration
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['gitlab-integrations'] })
      queryClient.invalidateQueries({ queryKey: ['gitlab-integration', projectId] })
    },
  })
}

export function useDeleteGitlabIntegration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/gitlab-integrations/${projectId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gitlab-integrations'] })
    },
  })
}

export function useRotateWebhookToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await api.post<{ webhookToken: string }>(`/gitlab-integrations/${projectId}/rotate-webhook-token`)
      return response as unknown as { webhookToken: string }
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['gitlab-integration', projectId] })
    },
  })
}

export function useRotateBypassToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await api.post<{ securityBypassToken: string }>(`/gitlab-integrations/${projectId}/rotate-bypass-token`)
      return response as unknown as { securityBypassToken: string }
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['gitlab-integration', projectId] })
    },
  })
}

export function useComplianceTemplate() {
  return useQuery({
    queryKey: ['compliance-template'],
    queryFn: async () => {
      const response = await api.get<{ template: string }>('/gitlab-integrations/compliance/template')
      return response as unknown as { template: string }
    },
  })
}
