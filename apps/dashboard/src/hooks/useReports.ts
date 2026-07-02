import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type {
  VulnerabilityTrendItem,
  SeverityDistributionReport,
  ProjectComplianceReport,
  ScanSummaryReport,
  TopVulnerableProject,
} from '@/types'

export function useVulnerabilityTrend(params?: { from?: string; to?: string; projectId?: string }) {
  return useQuery({
    queryKey: ['reports', 'vulnerability-trend', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.from) searchParams.set('from', params.from)
      if (params?.to) searchParams.set('to', params.to)
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      const response = await api.get<{ trend: VulnerabilityTrendItem[] }>(
        `/reports/vulnerability-trend?${searchParams.toString()}`
      )
      return (response as unknown as { trend: VulnerabilityTrendItem[] }).trend
    },
  })
}

export function useSeverityDistribution(params?: { from?: string; to?: string; projectId?: string }) {
  return useQuery({
    queryKey: ['reports', 'severity-distribution', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.from) searchParams.set('from', params.from)
      if (params?.to) searchParams.set('to', params.to)
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      const response = await api.get<SeverityDistributionReport>(
        `/reports/severity-distribution?${searchParams.toString()}`
      )
      return response as unknown as SeverityDistributionReport
    },
  })
}

export function useProjectCompliance() {
  return useQuery({
    queryKey: ['reports', 'project-compliance'],
    queryFn: async () => {
      const response = await api.get<ProjectComplianceReport>('/reports/project-compliance')
      return response as unknown as ProjectComplianceReport
    },
  })
}

export function useScanSummary(params?: { from?: string; to?: string; projectId?: string }) {
  return useQuery({
    queryKey: ['reports', 'scan-summary', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.from) searchParams.set('from', params.from)
      if (params?.to) searchParams.set('to', params.to)
      if (params?.projectId) searchParams.set('projectId', params.projectId)
      const response = await api.get<ScanSummaryReport>(
        `/reports/scan-summary?${searchParams.toString()}`
      )
      return response as unknown as ScanSummaryReport
    },
  })
}

export function useTopVulnerableProjects() {
  return useQuery({
    queryKey: ['reports', 'top-vulnerable-projects'],
    queryFn: async () => {
      const response = await api.get<{ projects: TopVulnerableProject[] }>(
        '/reports/top-vulnerable-projects'
      )
      return (response as unknown as { projects: TopVulnerableProject[] }).projects
    },
  })
}
