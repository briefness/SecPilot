import { useCallback, useState } from 'react'
import api from '@/lib/api'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T = unknown>() {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const execute = useCallback(
    async (url: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; data?: unknown } = {}) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const { method = 'GET', data } = options
        let response
        switch (method) {
          case 'POST':
            response = await api.post<T>(url, data)
            break
          case 'PUT':
            response = await api.put<T>(url, data)
            break
          case 'DELETE':
            response = await api.delete<T>(url)
            break
          default:
            response = await api.get<T>(url)
        }
        const result = response as T
        setState({ data: result, loading: false, error: null })
        return result
      } catch (err) {
        const errorMessage = (err as { message?: string })?.message || '请求失败'
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
        throw err
      }
    },
    []
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return {
    ...state,
    execute,
    reset,
  }
}
