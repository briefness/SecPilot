import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { GithubIntegration } from '@/types'

export function useGithubIntegrations(projectId?: string) {
  return useQuery({
    queryKey: ['github-integrations', projectId],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (projectId) searchParams.set('projectId', projectId)
      const response = await api.get<GithubIntegration[]>(`/github-integrations?${searchParams.toString()}`)
      return response as unknown as GithubIntegration[]
    },
  })
}

export function useGithubIntegration(projectId: string) {
  return useQuery({
    queryKey: ['github-integration', projectId],
    queryFn: async () => {
      const response = await api.get<GithubIntegration>(`/github-integrations/${projectId}`)
      return response as unknown as GithubIntegration
    },
    enabled: !!projectId,
  })
}

export function useCreateGithubIntegration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      projectId: string
      owner: string
      repo: string
      webhookSecret: string
      personalAccessToken?: string
      requiredWorkflowEnabled?: boolean
      securityBypassToken?: string
    }) => {
      const response = await api.post<GithubIntegration>('/github-integrations', data)
      return response as unknown as GithubIntegration
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-integrations'] })
    },
  })
}

export function useUpdateGithubIntegration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: Partial<GithubIntegration> }) => {
      const response = await api.patch<GithubIntegration>(`/github-integrations/${projectId}`, data)
      return response as unknown as GithubIntegration
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['github-integrations'] })
      queryClient.invalidateQueries({ queryKey: ['github-integration', projectId] })
    },
  })
}

export function useDeleteGithubIntegration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/github-integrations/${projectId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-integrations'] })
    },
  })
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await api.post<{ webhookSecret: string }>(`/github-integrations/${projectId}/rotate-webhook-secret`)
      return response as unknown as { webhookSecret: string }
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['github-integration', projectId] })
    },
  })
}

export function useRotateGithubBypassToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await api.post<{ securityBypassToken: string }>(`/github-integrations/${projectId}/rotate-bypass-token`)
      return response as unknown as { securityBypassToken: string }
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['github-integration', projectId] })
    },
  })
}

export function useWorkflowTemplate() {
  return useQuery({
    queryKey: ['github-workflow-template'],
    queryFn: async () => {
      const response = await api.get<{ template: string }>('/github-integrations/workflow/template')
      return response as unknown as { template: string }
    },
  })
}
