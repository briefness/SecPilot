export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export type ScanType = 'STATIC_SAST' | 'STATIC_SCA' | 'DYNAMIC_DAST' | 'DYNAMIC_PLAYWRIGHT' | 'MOBILE_MOBSF' | 'API_NUCLEI'

export type ScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type ProjectType = 'WEB' | 'MOBILE' | 'API' | 'INFRA'

export type BypassStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'

export type DyeLogAction = 'GENERATE' | 'VERIFY'
export type DyeLogResult = 'SUCCESS' | 'FAILED'
export type PipelineStage = 'DAY_FAST_SCAN' | 'NIGHT_DEEP_SCAN' | 'RELEASE_AUDIT' | 'EMERGENCY_PATROL'

export interface FindingSummary {
  CRITICAL: number
  HIGH: number
  MEDIUM: number
  LOW: number
  INFO: number
}

export interface Project {
  id: string
  name: string
  productId: string
  gitRepo: string
  type: ProjectType
  status: string
  onboardingStage: number
  lastScanAt: string | null
  findingSummary: FindingSummary
  createdAt: string
}

export interface Scan {
  id: string
  type: ScanType
  status: ScanStatus
  projectId: string
  pipelineStage: string | null
  targetUrl: string | null
  branch: string | null
  commitHash: string | null
  triggeredBy: string
  triggeredAt: string
  startedAt: string | null
  completedAt: string | null
  findingsCritical: number
  findingsHigh: number
  findingsMedium: number
  findingsLow: number
  findingsInfo: number
  durationSeconds: number | null
  traceId: string | null
  errorMessage: string | null
  scannerUsed: string | null
  project: {
    id: string
    name: string
  }
}

export interface Finding {
  id: string
  title: string
  severity: RiskLevel
  cwe: string | null
  cve: string | null
  cvss: number | null
  description: string
  location: string | null
  filePath: string | null
  lineStart: number | null
  lineEnd: number | null
  scanId: string
  projectId: string
  dedupHash: string
  falsePositive: boolean
  createdAt: string
  updatedAt: string
  project: {
    id: string
    name: string
  }
}

export interface BypassRequest {
  id: string
  findingId: string
  findingTitle: string
  projectId: string
  projectName: string
  reason: string
  requestedBy: string
  status: BypassStatus
  reviewedBy: string | null
  reviewComment: string | null
  expiresAt: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface FindingsTrendItem {
  date: string
  count: number
}

export interface SeverityDistribution {
  CRITICAL: number
  HIGH: number
  MEDIUM: number
  LOW: number
  INFO: number
}

export interface ScanTypeDistribution {
  STATIC_SAST: number
  STATIC_SCA: number
  DYNAMIC_DAST: number
  DYNAMIC_PLAYWRIGHT: number
  MOBILE_MOBSF: number
  API_NUCLEI: number
}

export interface TopProjectItem {
  projectId: string
  projectName: string
  count: number
}

export interface DashboardStats {
  totalProjects: number
  totalFindings: number
  criticalFindings: number
  highFindings: number
  mediumFindings: number
  lowFindings: number
  runningScans: number
  scansToday: number
  findingsTrend: FindingsTrendItem[]
  severityDistribution: SeverityDistribution
  scanTypeDistribution: ScanTypeDistribution
  topProjectsByFindings: TopProjectItem[]
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'developer' | 'security'
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

export interface DyeRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  salt: string
  timeWindowSeconds: number
  headerSimulation: string
  headerSign: string
  headerTimestamp: string
  headerTraceId: string
  shadowRedisPrefix: string
  shadowMqSuffix: string
  createdAt: string
  updatedAt: string
  _count?: {
    whitelistEntries: number
    dyeLogs: number
  }
}

export interface DyeWhitelistEntry {
  id: string
  ruleId: string
  ip: string
  note?: string
  createdAt: string
}

export interface DyeLogEntry {
  id: string
  ruleId: string
  action: DyeLogAction
  result: DyeLogResult
  traceId?: string
  clientIp?: string
  reason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  rule?: {
    id: string
    name: string
  }
}

export interface DyeStats {
  totalRules: number
  enabledRules: number
  totalLogs: number
  todayLogs: number
  successLogs: number
  failedLogs: number
}

export interface PipelineExecution {
  id: string
  type: ScanType
  status: ScanStatus
  projectId: string
  pipelineStage: PipelineStage | null
  targetUrl: string | null
  branch: string | null
  commitHash: string | null
  triggeredBy: string
  triggeredAt: string
  startedAt: string | null
  completedAt: string | null
  findingsCritical: number
  findingsHigh: number
  findingsMedium: number
  findingsLow: number
  findingsInfo: number
  durationSeconds: number | null
  traceId: string | null
  project: {
    id: string
    name: string
    productId: string
  }
}

export interface PipelineStats {
  total: number
  running: number
  completed: number
  failed: number
  todayCount: number
  stageDistribution: Array<{ stage: PipelineStage; count: number }>
  scanTypeDistribution: Array<{ type: ScanType; count: number }>
}

export type ScannerType = 'STATIC_SAST' | 'STATIC_SCA' | 'DYNAMIC_DAST' | 'DYNAMIC_PLAYWRIGHT' | 'MOBILE_MOBSF' | 'API_NUCLEI'

export interface ScannerConfig {
  id: string
  type: ScannerType
  name: string
  description?: string
  enabled: boolean
  icon?: string
  defaultParams?: Record<string, unknown>
  docUrl?: string | null
  createdAt: string
  updatedAt: string
}

export type UserRole = 'ADMIN' | 'DEVELOPER' | 'AUDITOR' | 'VIEWER'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  mfaEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UserStats {
  total: number
  byRole: Record<UserRole, number>
}

export interface AuditLogEntry {
  id: string
  action: string
  userId: string
  user?: { name: string; email: string }
  projectId?: string | null
  project?: { name: string; productId: string } | null
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AuditLogStats {
  total: number
  today: number
  last7Days: number
  byAction: Array<{ action: string; count: number }>
}

export type ConfigCategory = 'GENERAL' | 'SECURITY' | 'NOTIFICATION' | 'INTEGRATION'

export interface SystemConfig {
  id: string
  key: string
  value: Record<string, unknown>
  category: ConfigCategory
  description?: string | null
  updatedAt: string
  updatedBy?: string | null
}

export interface VulnerabilityTrendItem {
  date: string
  CRITICAL: number
  HIGH: number
  MEDIUM: number
  LOW: number
  INFO: number
  total: number
}

export interface SeverityDistributionReport {
  bySeverity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; INFO: number }
  total: number
}

export interface ProjectComplianceItem {
  id: string
  name: string
  productId: string
  type: string
  status: 'compliant' | 'warning' | 'critical' | 'unknown'
  findingsCount: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }
  totalFindings: number
  totalScans: number
  lastScanAt: string | null
}

export interface ProjectComplianceReport {
  projects: ProjectComplianceItem[]
  summary: {
    total: number
    compliant: number
    warning: number
    critical: number
    unknown: number
    complianceRate: number
  }
}

export interface ScanSummaryReport {
  total: number
  byStatus: { completed: number; failed: number; running: number; pending: number }
  byType: Array<{ type: string; count: number }>
  successRate: number
}

export interface TopVulnerableProject {
  id: string
  name: string
  productId: string
  critical: number
  high: number
  medium: number
  total: number
  riskScore: number
}

export type FindingStatus = 'NEW' | 'CONFIRMED' | 'IN_PROGRESS' | 'MITIGATED' | 'RESOLVED' | 'FALSE_POSITIVE' | 'ACCEPTED_RISK'

export type PentestStatus = 'PLANNED' | 'IN_PROGRESS' | 'REPORT_SUBMITTED' | 'REMEDIATION' | 'CLOSED'

export type PentestType = 'WEB_APP' | 'MOBILE_APP' | 'API' | 'INFRASTRUCTURE' | 'RED_TEAM' | 'CODE_REVIEW'

export type ReleaseStatus = 'PENDING_SCAN' | 'SCANNING' | 'SCAN_FAILED' | 'SCAN_PASSED' | 'HARDENED' | 'PUBLISHED' | 'FAILED'

export interface AppRelease {
  id: string
  projectId: string
  project?: { id: string; name: string; productId: string }
  version: string
  buildNumber: string
  platform: string
  artifactUrl?: string | null
  preHardeningHash: string
  postHardeningHash?: string | null
  status: ReleaseStatus
  scanTaskId?: string | null
  scanTask?: { id: string; type: string; status: string; triggeredAt: string }
  findingsCritical: number
  findingsHigh: number
  findingsMedium: number
  findingsLow: number
  mobsfReportUrl?: string | null
  hardenedAt?: string | null
  publishedAt?: string | null
  triggeredBy: string
  createdAt: string
  updatedAt: string
}

export interface Pentest {
  id: string
  projectId: string
  project?: { id: string; name: string; productId: string }
  title: string
  type: PentestType
  vendor: string
  scope: string
  status: PentestStatus
  plannedStartAt: string
  plannedEndAt: string
  actualStartAt?: string | null
  actualEndAt?: string | null
  reportUrl?: string | null
  findingsTotal: number
  findingsCritical: number
  findingsHigh: number
  findingsMedium: number
  findingsLow: number
  remediatedCount: number
  assigneeId?: string | null
  assignee?: { id: string; name: string; email: string } | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface GitlabIntegration {
  id: string
  projectId: string
  project?: { id: string; name: string; productId: string; gitRepo: string }
  groupPath: string
  projectPath: string
  webhookToken: string
  complianceTemplateEnabled: boolean
  securityBypassToken?: string | null
  lastSyncAt?: string | null
  syncStatus?: string | null
  createdAt: string
  updatedAt: string
}

export interface GithubIntegration {
  id: string
  projectId: string
  project?: { id: string; name: string; productId: string; gitRepo: string; type: string }
  owner: string
  repo: string
  webhookSecret: string
  personalAccessToken?: string | null
  requiredWorkflowEnabled: boolean
  securityBypassToken?: string | null
  lastSyncAt?: string | null
  syncStatus?: string | null
  createdAt: string
  updatedAt: string
}

export type ApiKeyScope = 'SCANNER' | 'CI_CD' | 'GATEWAY' | 'WEBHOOK' | 'READ_ONLY' | 'ADMIN'

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scope: ApiKeyScope
  projectId?: string | null
  project?: { id: string; name: string; productId: string } | null
  expiresAt?: string | null
  lastUsedAt?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  rawKey?: string
}

export interface SlaStats {
  total: number
  breached: number
  atRisk: number
}

export interface ScannerStats {
  total: number
  enabled: number
  disabled: number
}
