import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { User, UserStats, UserRole } from '@/types'

interface ApiUserResponse {
  data: User[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function useUsers(params?: { role?: UserRole; search?: string }) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.role) searchParams.set('role', params.role)
      if (params?.search) searchParams.set('search', params.search)
      const response = await api.get<ApiUserResponse>(`/users?${searchParams.toString()}`)
      return response as unknown as ApiUserResponse
    },
  })
}

export function useUserStats() {
  return useQuery({
    queryKey: ['users', 'stats'],
    queryFn: async () => {
      const response = await api.get<UserStats>('/users/stats/summary')
      return response as unknown as UserStats
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { email: string; name: string; password: string; role: UserRole }) => {
      const response = await api.post<User>('/users', data)
      return response as unknown as User
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ name: string; role: UserRole; password: string; mfaEnabled: boolean }> }) => {
      const response = await api.put<User>(`/users/${id}`, data)
      return response as unknown as User
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete<{ success: boolean }>(`/users/${id}`)
      return response as unknown as { success: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
