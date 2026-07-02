import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiKey, ApiKeyScope } from '@/types'

export function useApiKeys(params?: { projectId?: string; scope?: ApiKeyScope }) {
  return useQuery({
    queryKey: ['api-keys', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      if (params?.scope) searchParams.set('scope', params.scope)
      const response = await api.get<ApiKey[]>(`/api-keys?${searchParams.toString()}`)
      return response as unknown as ApiKey[]
    },
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; scope: ApiKeyScope; projectId?: string; expiresAt?: string }) => {
      const response = await api.post<ApiKey>('/api-keys', body)
      return response as unknown as ApiKey
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api-keys/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}
