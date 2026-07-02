export enum ScanType {
  STATIC_SAST = 'static_sast',
  STATIC_SCA = 'static_sca',
  DYNAMIC_H5 = 'dynamic_h5',
  MOBILE_MOBSF = 'mobile_mobsf',
  API_NUCLEI = 'api_nuclei',
}

export enum ScanStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum Severity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export enum PipelineStage {
  DAY_FAST_SCAN = 'day_fast_scan',
  NIGHT_DEEP_SCAN = 'night_deep_scan',
  RELEASE_AUDIT = 'release_audit',
  EMERGENCY_PATROL = 'emergency_patrol',
}

export enum BypassStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  cwe?: string;
  cve?: string;
  cvss?: number;
  description: string;
  location?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  scanId: string;
  projectId: string;
  dedupHash: string;
  falsePositive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScanTask {
  id: string;
  type: ScanType;
  status: ScanStatus;
  projectId: string;
  pipelineStage?: PipelineStage;
  targetUrl?: string;
  branch?: string;
  commitHash?: string;
  triggeredBy: string;
  triggeredAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  findingsCount?: Record<Severity, number>;
  durationSeconds?: number;
  traceId?: string;
}

export interface Project {
  id: string;
  name: string;
  productId: string;
  gitRepo: string;
  type: 'web' | 'mobile' | 'api' | 'infra';
  status: 'active' | 'inactive' | 'onboarding';
  onboardingStage: number;
  lastScanAt?: Date;
  findingSummary: Record<Severity, number>;
  createdAt: Date;
}

export interface TrafficDyeConfig {
  enabled: boolean;
  headerName: string;
  hmacSalt: string;
  timeWindowSeconds: number;
  ipWhitelist: string[];
  shadowRedisPrefix: string;
  shadowMqSuffix: string;
}

export enum DyeLogAction {
  GENERATE = 'GENERATE',
  VERIFY = 'VERIFY',
}

export enum DyeLogResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface DyeRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  salt: string;
  timeWindowSeconds: number;
  headerSimulation: string;
  headerSign: string;
  headerTimestamp: string;
  headerTraceId: string;
  shadowRedisPrefix: string;
  shadowMqSuffix: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DyeWhitelistEntry {
  id: string;
  ruleId: string;
  ip: string;
  note?: string;
  createdAt: Date;
}

export interface DyeLogEntry {
  id: string;
  ruleId: string;
  action: DyeLogAction;
  result: DyeLogResult;
  traceId?: string;
  clientIp?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface DyeGenerateResult {
  headers: Record<string, string>;
  traceId?: string;
}

export interface DyeVerifyResult {
  valid: boolean;
  reason?: string;
  traceId?: string;
}

export interface BypassRequest {
  id: string;
  projectId: string;
  reason: string;
  requestedBy: string;
  requestedAt: Date;
  expiresAt: Date;
  status: BypassStatus;
  approvedBy?: string;
  approvedAt?: Date;
  auditLogId?: string;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
  AUDITOR = 'AUDITOR',
  VIEWER = 'VIEWER',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  user?: { name: string; email: string };
  projectId?: string;
  project?: { name: string; productId: string };
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface DashboardStats {
  totalProjects: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  runningScans: number;
  scansToday: number;
  findingsTrend: Array<{ date: string; count: number }>;
  severityDistribution: Record<Severity, number>;
  scanTypeDistribution: Record<ScanType, number>;
  topProjectsByFindings: Array<{ projectId: string; projectName: string; count: number }>;
}
