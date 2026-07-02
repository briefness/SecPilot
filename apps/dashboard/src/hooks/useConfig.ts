import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { SystemConfig, ConfigCategory } from '@/types'

export function useConfigs(category?: ConfigCategory) {
  return useQuery({
    queryKey: ['configs', category],
    queryFn: async () => {
      const url = category ? `/configs?category=${category}` : '/configs'
      const response = await api.get<SystemConfig[]>(url)
      return response as unknown as SystemConfig[]
    },
  })
}

export function useConfig(key: string) {
  return useQuery({
    queryKey: ['config', key],
    queryFn: async () => {
      const response = await api.get<SystemConfig>(`/configs/${key}`)
      return response as unknown as SystemConfig
    },
  })
}

export function useUpdateConfig(key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (value: Record<string, unknown>) => {
      const response = await api.put<SystemConfig>(`/configs/${key}`, { value })
      return response as unknown as SystemConfig
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      queryClient.invalidateQueries({ queryKey: ['config', key] })
    },
  })
}

export function useConfigsByCategory(category: ConfigCategory) {
  return useQuery({
    queryKey: ['configs-category', category],
    queryFn: async () => {
      const response = await api.get<Record<string, unknown>>(`/configs/category/${category}`)
      return response as unknown as Record<string, unknown>
    },
  })
}
