import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { AppRelease, ReleaseStatus } from '@/types'

export function useAppReleases(params?: { projectId?: string; status?: ReleaseStatus; platform?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['app-releases', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      if (params?.status) searchParams.set('status', params.status)
      if (params?.platform) searchParams.set('platform', params.platform)
      if (params?.page) searchParams.set('page', String(params.page))
      if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
      const response = await api.get<{ data: AppRelease[]; pagination: { total: number; totalPages: number } }>(
        `/app-releases?${searchParams.toString()}`
      )
      return response as unknown as { data: AppRelease[]; pagination: { total: number; totalPages: number } }
    },
  })
}

export function useAppRelease(id: string) {
  return useQuery({
    queryKey: ['app-release', id],
    queryFn: async () => {
      const response = await api.get<AppRelease>(`/app-releases/${id}`)
      return response as unknown as AppRelease
    },
    enabled: !!id,
  })
}

export function useCreateRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { projectId: string; version: string; buildNumber: string; platform: string; artifactUrl?: string; preHardeningHash: string }) => {
      const response = await api.post<AppRelease>('/app-releases', data)
      return response as unknown as AppRelease
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-releases'] })
    },
  })
}

export function useUpdateRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AppRelease> }) => {
      const response = await api.patch<AppRelease>(`/app-releases/${id}`, data)
      return response as unknown as AppRelease
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['app-releases'] })
      queryClient.invalidateQueries({ queryKey: ['app-release', id] })
    },
  })
}

export function useTriggerReleaseScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<AppRelease>(`/app-releases/${id}/trigger-scan`)
      return response as unknown as AppRelease
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['app-releases'] })
      queryClient.invalidateQueries({ queryKey: ['app-release', id] })
    },
  })
}

export function useVerifyHash() {
  return useMutation({
    mutationFn: async (data: { hash: string; expectedHash?: string; releaseId?: string }) => {
      const response = await api.post<{ valid: boolean; reason?: string; release?: AppRelease; matches?: string | null }>('/app-releases/verify-hash', data)
      return response as unknown as { valid: boolean; reason?: string; release?: AppRelease; matches?: string | null }
    },
  })
}

export function useHashChain(projectId: string) {
  return useQuery({
    queryKey: ['hash-chain', projectId],
    queryFn: async () => {
      const response = await api.get<{ projectId: string; releases: AppRelease[]; chainValid: boolean; chainLength: number }>(
        `/app-releases/hash-chain/${projectId}`
      )
      return response as unknown as { projectId: string; releases: AppRelease[]; chainValid: boolean; chainLength: number }
    },
    enabled: !!projectId,
  })
}

export function useDeleteRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/app-releases/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-releases'] })
    },
  })
}
