import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { DyeRule, DyeWhitelistEntry, DyeLogEntry, DyeStats } from '@/types'

interface PaginatedResponse<T> {
  data: T[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function useDyeRules() {
  return useQuery({
    queryKey: ['dye-rules'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<DyeRule>>('/traffic-dye/rules?pageSize=100')
      return (response as unknown as PaginatedResponse<DyeRule>).data
    },
  })
}

export function useDyeRule(id: string | null) {
  return useQuery({
    queryKey: ['dye-rule', id],
    queryFn: async () => {
      if (!id) return null
      const response = await api.get<DyeRule & { whitelistEntries: DyeWhitelistEntry[] }>(`/traffic-dye/rules/${id}`)
      return response as unknown as DyeRule & { whitelistEntries: DyeWhitelistEntry[] }
    },
    enabled: !!id,
  })
}

export function useCreateDyeRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<DyeRule> & { name: string; salt: string }) => {
      const response = await api.post<DyeRule>('/traffic-dye/rules', data)
      return response as unknown as DyeRule
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dye-rules'] })
      queryClient.invalidateQueries({ queryKey: ['dye-stats'] })
    },
  })
}

export function useUpdateDyeRule(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<DyeRule>) => {
      const response = await api.put<DyeRule>(`/traffic-dye/rules/${id}`, data)
      return response as unknown as DyeRule
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dye-rules'] })
      queryClient.invalidateQueries({ queryKey: ['dye-rule', id] })
    },
  })
}

export function useDeleteDyeRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/traffic-dye/rules/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dye-rules'] })
      queryClient.invalidateQueries({ queryKey: ['dye-stats'] })
    },
  })
}

export function useAddWhitelist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { ruleId: string; ip: string; note?: string }) => {
      const response = await api.post<DyeWhitelistEntry>('/traffic-dye/whitelist', data)
      return response as unknown as DyeWhitelistEntry
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dye-rule', variables.ruleId] })
    },
  })
}

export function useRemoveWhitelist(ruleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/traffic-dye/whitelist/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dye-rule', ruleId] })
    },
  })
}

export function useDyeLogs(params?: { ruleId?: string; action?: string; result?: string }) {
  return useQuery({
    queryKey: ['dye-logs', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      searchParams.set('pageSize', '50')
      if (params?.ruleId) searchParams.set('ruleId', params.ruleId)
      if (params?.action) searchParams.set('action', params.action)
      if (params?.result) searchParams.set('result', params.result)
      const response = await api.get<PaginatedResponse<DyeLogEntry>>(`/traffic-dye/logs?${searchParams.toString()}`)
      return (response as unknown as PaginatedResponse<DyeLogEntry>).data
    },
  })
}

export function useDyeStats() {
  return useQuery({
    queryKey: ['dye-stats'],
    queryFn: async () => {
      const response = await api.get<DyeStats>('/traffic-dye/stats/summary')
      return response as unknown as DyeStats
    },
  })
}

export function useGenerateDyeHeaders() {
  return useMutation({
    mutationFn: async (data: { ruleId: string; traceId?: string }) => {
      const response = await api.post<{ headers: Record<string, string>; traceId?: string }>('/traffic-dye/generate', data)
      return response as unknown as { headers: Record<string, string>; traceId?: string }
    },
  })
}

export function useVerifyDyeHeaders() {
  return useMutation({
    mutationFn: async (data: { ruleId: string; headers: Record<string, string | string[] | undefined>; clientIp?: string }) => {
      const response = await api.post<{ valid: boolean; reason?: string; traceId?: string }>('/traffic-dye/verify', data)
      return response as unknown as { valid: boolean; reason?: string; traceId?: string }
    },
  })
}
