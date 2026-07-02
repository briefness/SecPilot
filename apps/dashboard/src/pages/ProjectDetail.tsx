import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Play,
  Settings,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Code,
  Package,
  Globe,
  Smartphone,
  Server,
  MousePointerClick,
  ChevronRight,
  Activity,
  FileText,
  Trash2,
  Bug,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import apiClient from '@/lib/api'
import { formatRelativeTime, formatDate } from '@/lib/utils'
import { useDeleteProject } from '@/hooks/useProjects'
import type { Project, Scan, Finding, RiskLevel, ScanType } from '@/types'

const scanTypeConfig: Record<ScanType, { label: string; icon: React.ElementType; description: string; category: string }> = {
  STATIC_SAST: { label: 'SAST 静态扫描', icon: Code, description: 'SonarQube 源码白盒扫描', category: '静态分析' },
  STATIC_SCA: { label: 'SCA 依赖扫描', icon: Package, description: 'OSV-Scanner 离线依赖审计', category: '静态分析' },
  DYNAMIC_DAST: { label: 'DAST 动态扫描', icon: Globe, description: 'OWASP ZAP 黑盒漏洞扫描', category: '动态测试' },
  DYNAMIC_PLAYWRIGHT: { label: 'Playwright 爬虫', icon: MousePointerClick, description: '浏览器自动化 + 全链路 TraceId', category: '动态测试' },
  MOBILE_MOBSF: { label: '移动端扫描', icon: Smartphone, description: 'MobSF APK/IPA 逆向分析', category: '移动安全' },
  API_NUCLEI: { label: 'API/基础设施', icon: Server, description: 'Nuclei YAML 模板扫描', category: 'API 安全' },
}

const severityColors: Record<RiskLevel, string> = {
  CRITICAL: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-blue-500 text-white',
  INFO: 'bg-gray-500 text-white',
}

const severityLabels: Record<RiskLevel, string> = {
  CRITICAL: '严重',
  HIGH: '高危',
  MEDIUM: '中危',
  LOW: '低危',
  INFO: '信息',
}

interface ScannerConfig {
  scanType: ScanType
  name: string
  description: string
  icon: string
  enabled: boolean
  params: Record<string, any> | null
  schedule: string | null
  lastScanAt: string | null
}

interface ScanSummary {
  totalScans: number
  latestScans: Scan[]
  findings: {
    total: number
    bySeverity: Record<string, number>
  }
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [project, setProject] = useState<Project | null>(null)
  const [configs, setConfigs] = useState<ScannerConfig[]>([])
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [scanDetailOpen, setScanDetailOpen] = useState(false)
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null)
  const [scanFindings, setScanFindings] = useState<Finding[]>([])
  const [scanDetailLoading, setScanDetailLoading] = useState(false)
  const [projectFindings, setProjectFindings] = useState<Finding[]>([])
  const [findingsLoading, setFindingsLoading] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const deleteProject = useDeleteProject()

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [projRes, cfgRes, sumRes] = await Promise.all([
        apiClient.get(`/projects/${id}`),
        apiClient.get(`/projects/${id}/scanner-configs`),
        apiClient.get(`/projects/${id}/scan-summary`),
      ])
      setProject(projRes as unknown as Project)
      setConfigs(cfgRes as unknown as ScannerConfig[])
      setSummary(sumRes as unknown as ScanSummary)
    } catch (err: any) {
      toast({ title: '加载失败', description: err?.message || '无法加载项目数据', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleScanner = async (scanType: ScanType, enabled: boolean) => {
    if (!id) return
    try {
      const updated = configs.map((c) =>
        c.scanType === scanType ? { ...c, enabled } : c
      )
      setConfigs(updated)

      await apiClient.put(`/projects/${id}/scanner-configs`, {
        configs: updated.map((c) => ({
          scanType: c.scanType,
          enabled: c.enabled,
          params: c.params,
          schedule: c.schedule,
        })),
      })

      toast({
        title: enabled ? '扫描器已启用' : '扫描器已关闭',
        description: scanTypeConfig[scanType]?.label || scanType,
      })
    } catch (err: any) {
      toast({ title: '操作失败', description: err?.message, variant: 'destructive' })
      loadData()
    }
  }

  const enabledScanners = configs.filter((c) => c.enabled)

  const loadProjectFindings = useCallback(async () => {
    if (!id) return
    setFindingsLoading(true)
    try {
      const res = await apiClient.get(`/findings?projectId=${id}&pageSize=100&sortBy=severity`)
      const data = res as unknown as { data: Finding[] }
      setProjectFindings(data.data || [])
    } catch (err: any) {
      toast({ title: '加载失败', description: err?.message, variant: 'destructive' })
    } finally {
      setFindingsLoading(false)
    }
  }, [id, toast])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'findings' && projectFindings.length === 0) {
      loadProjectFindings()
    }
  }
  const staticScanners = enabledScanners.filter((c) =>
    ['STATIC_SAST', 'STATIC_SCA'].includes(c.scanType)
  )
  const dynamicScanners = enabledScanners.filter((c) =>
    ['DYNAMIC_DAST', 'DYNAMIC_PLAYWRIGHT', 'API_NUCLEI'].includes(c.scanType)
  )
  const mobileScanners = enabledScanners.filter((c) =>
    ['MOBILE_MOBSF'].includes(c.scanType)
  )

  const readyCount = staticScanners.length
  const needUrlCount = dynamicScanners.length
  const needAppCount = mobileScanners.length

  const openScanDetail = async (scan: Scan) => {
    setSelectedScan(scan)
    setScanDetailOpen(true)
    setScanDetailLoading(true)
    try {
      const [scanRes, findingsRes] = await Promise.all([
        apiClient.get(`/scans/${scan.id}`),
        apiClient.get(`/scans/${scan.id}/findings`),
      ])
      setSelectedScan(scanRes as unknown as Scan)
      const f = findingsRes as unknown as { data: Finding[] }
      setScanFindings(f.data || [])
    } catch (err: any) {
      toast({ title: '加载失败', description: err?.message, variant: 'destructive' })
    } finally {
      setScanDetailLoading(false)
    }
  }

  const openScanDialog = () => {
    if (project?.type === 'WEB' && !targetUrl && project.gitRepo) {
      setTargetUrl(project.gitRepo.replace('.git', ''))
    }
    setScanDialogOpen(true)
  }

  const confirmScan = async () => {
    if (!id) return
    setScanning(true)
    try {
      const res = await apiClient.post(`/projects/${id}/scan`, {
        targetUrl: targetUrl || undefined,
        branch,
      })
      const data = res as unknown as { triggered: number; skipped: number; scanTasks: unknown[]; skippedScans: unknown[] }
      setScanDialogOpen(false)
      toast({
        title: `已触发 ${data.triggered} 个扫描`,
        description: data.skipped ? `${data.skipped} 个扫描器因缺少参数已跳过` : '',
      })
      setTimeout(() => loadData(), 2000)
    } catch (err: any) {
      toast({ title: '启动失败', description: err?.message, variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }

  const runScan = async () => {
    openScanDialog()
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await deleteProject.mutateAsync(id)
      toast({ title: '项目已删除', description: project?.name })
      navigate('/projects')
    } catch (err: any) {
      toast({ title: '删除失败', description: err?.message, variant: 'destructive' })
    }
  }

  const enabledCount = configs.filter((c) => c.enabled).length

  const categories = Array.from(new Set(configs.map((c) => scanTypeConfig[c.scanType]?.category || '其他')))

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </PageContainer>
    )
  }

  if (!project) {
    return (
      <PageContainer>
        <div className="text-center py-20">
          <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">项目不存在</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/projects')}>
            返回列表
          </Button>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.gitRepo} · {project.productId}</p>
        </div>
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除项目</DialogTitle>
              <DialogDescription>
                确定要删除项目「{project?.name}」吗？此操作不可撤销，所有扫描记录和漏洞数据都将被永久删除。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteProject.isPending}
              >
                {deleteProject.isPending ? '删除中...' : '确认删除'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button onClick={runScan} disabled={scanning || enabledCount === 0} className="gap-2">
          {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {scanning ? '启动中...' : '开始扫描'}
        </Button>

        <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>启动扫描</DialogTitle>
              <DialogDescription>
                以下是你已启用的扫描器。补充必要参数后点击"开始扫描"。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {staticScanners.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    可直接运行（{staticScanners.length} 个）
                  </div>
                  <div className="space-y-1 ml-6">
                    {staticScanners.map((c) => (
                      <div key={c.scanType} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {scanTypeConfig[c.scanType as ScanType]?.label || c.scanType}
                        <span className="text-xs opacity-70">
                          — 自动克隆仓库扫描
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {needUrlCount > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    需要目标 URL（{needUrlCount} 个）
                  </div>
                  <div className="ml-6 space-y-1 mb-2">
                    {dynamicScanners.map((c) => (
                      <div key={c.scanType} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {scanTypeConfig[c.scanType as ScanType]?.label || c.scanType}
                      </div>
                    ))}
                  </div>
                  <div className="ml-6 space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground">目标 URL</label>
                      <Input
                        placeholder="https://example.com"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {needAppCount > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    需要安装包文件（{needAppCount} 个）
                  </div>
                  <div className="ml-6 space-y-1 mb-2">
                    {mobileScanners.map((c) => (
                      <div key={c.scanType} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {scanTypeConfig[c.scanType as ScanType]?.label || c.scanType}
                      </div>
                    ))}
                  </div>
                  <div className="ml-6 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    移动端扫描需要上传 APK 或 IPA 文件后才能进行。
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">分支</label>
                <Input
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setScanDialogOpen(false)} disabled={scanning}>
                取消
              </Button>
              <Button onClick={confirmScan} disabled={scanning || readyCount === 0 && !targetUrl}>
                {scanning ? (
                  <><RefreshCw className="h-4 w-4 animate-spin mr-2" />启动中...</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" />开始扫描</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={scanDetailOpen} onOpenChange={setScanDetailOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-start justify-between pr-6">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    {selectedScan && (() => {
                      const cfg = scanTypeConfig[selectedScan.type as ScanType]
                      const Icon = cfg?.icon || Activity
                      return <Icon className="h-5 w-5 text-muted-foreground" />
                    })()}
                    {selectedScan ? (scanTypeConfig[selectedScan.type as ScanType]?.label || selectedScan.type) : '扫描详情'}
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {selectedScan && (
                      <>
                        <Badge variant={
                          selectedScan.status === 'COMPLETED' ? 'default' :
                          selectedScan.status === 'FAILED' ? 'destructive' :
                          selectedScan.status === 'RUNNING' ? 'secondary' : 'outline'
                        } className="h-5">
                          {selectedScan.status === 'PENDING' ? '等待中' :
                           selectedScan.status === 'RUNNING' ? '运行中' :
                           selectedScan.status === 'COMPLETED' ? '已完成' :
                           selectedScan.status === 'FAILED' ? '失败' :
                           selectedScan.status === 'CANCELLED' ? '已取消' : selectedScan.status}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">{selectedScan.id?.slice(0, 12)}...</span>
                      </>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto -mx-6 px-6">
              {scanDetailLoading ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : selectedScan ? (
                <div className="space-y-6 py-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">严重</div>
                      <div className="text-xl font-bold text-red-500 mt-1">{selectedScan.findingsCritical}</div>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">高危</div>
                      <div className="text-xl font-bold text-orange-500 mt-1">{selectedScan.findingsHigh}</div>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">中危</div>
                      <div className="text-xl font-bold text-yellow-600 mt-1">{selectedScan.findingsMedium}</div>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">低危</div>
                      <div className="text-xl font-bold text-blue-500 mt-1">{selectedScan.findingsLow + selectedScan.findingsInfo}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">触发时间</div>
                      <div className="font-medium">{formatDate(selectedScan.triggeredAt)}</div>
                    </div>
                    {selectedScan.completedAt && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">完成时间</div>
                        <div className="font-medium">{formatDate(selectedScan.completedAt)}</div>
                      </div>
                    )}
                    {selectedScan.durationSeconds != null && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">耗时</div>
                        <div className="font-medium">{selectedScan.durationSeconds} 秒</div>
                      </div>
                    )}
                    {selectedScan.branch && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">分支</div>
                        <div className="font-mono text-sm">{selectedScan.branch}</div>
                      </div>
                    )}
                    {selectedScan.targetUrl && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">目标 URL</div>
                        <div className="font-mono text-sm break-all">{selectedScan.targetUrl}</div>
                      </div>
                    )}
                    {selectedScan.traceId && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">Trace ID</div>
                        <div className="font-mono text-xs break-all">{selectedScan.traceId}</div>
                      </div>
                    )}
                    {selectedScan.errorMessage && (
                      <div className="col-span-2">
                        <div className="text-xs text-destructive mb-1">错误信息</div>
                        <div className="text-sm text-destructive bg-destructive/10 rounded p-2 break-all">
                          {selectedScan.errorMessage}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Bug className="h-4 w-4" />
                      漏洞列表（{scanFindings.length}）
                    </h3>
                    {scanFindings.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm bg-muted/30 rounded-lg">
                        本次扫描未发现漏洞
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {scanFindings.slice(0, 20).map((finding) => (
                          <div
                            key={finding.id}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer"
                          >
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              finding.severity === 'CRITICAL' ? 'bg-red-500' :
                              finding.severity === 'HIGH' ? 'bg-orange-500' :
                              finding.severity === 'MEDIUM' ? 'bg-yellow-500' :
                              finding.severity === 'LOW' ? 'bg-blue-500' : 'bg-gray-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{finding.title}</div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                {finding.description}
                              </p>
                              <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="h-4 text-[10px] px-1.5">
                                  {finding.severity === 'CRITICAL' ? '严重' :
                                   finding.severity === 'HIGH' ? '高危' :
                                   finding.severity === 'MEDIUM' ? '中危' :
                                   finding.severity === 'LOW' ? '低危' : '信息'}
                                </Badge>
                                {finding.cwe && <span className="font-mono">{finding.cwe}</span>}
                                {finding.filePath && <span className="font-mono truncate">{finding.filePath}{finding.lineStart ? `:${finding.lineStart}` : ''}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                        {scanFindings.length > 20 && (
                          <div className="text-center text-xs text-muted-foreground pt-2">
                            还有 {scanFindings.length - 20} 个漏洞，请前往漏洞管理查看完整列表
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="flex-shrink-0 pt-4">
              <Button variant="outline" onClick={() => setScanDetailOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">扫描任务</div>
            <div className="text-3xl font-bold">{summary?.totalScans || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">活跃漏洞</div>
            <div className="text-3xl font-bold">{summary?.findings.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">严重 / 高危</div>
            <div className="text-3xl font-bold text-red-600">
              {(summary?.findings.bySeverity.CRITICAL || 0) + (summary?.findings.bySeverity.HIGH || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">已启用扫描器</div>
            <div className="text-3xl font-bold text-emerald-600">{enabledCount} / {configs.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="findings">漏洞</TabsTrigger>
          <TabsTrigger value="scans">扫描记录</TabsTrigger>
          <TabsTrigger value="scanners">扫描配置</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  漏洞分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary?.findings.total === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                    暂无漏洞，状态良好
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as RiskLevel[]).map((sev) => {
                      const count = summary?.findings.bySeverity[sev] || 0
                      const total = summary?.findings.total || 1
                      return (
                        <div key={sev} className="flex items-center gap-3">
                          <Badge variant="outline" className={severityColors[sev]}>{severityLabels[sev]}</Badge>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${sev === 'CRITICAL' ? 'bg-red-500' : sev === 'HIGH' ? 'bg-orange-500' : sev === 'MEDIUM' ? 'bg-yellow-500' : sev === 'LOW' ? 'bg-blue-500' : 'bg-gray-400'}`}
                              style={{ width: `${(count / total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-10 text-right">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  最近扫描
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary?.latestScans?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    暂无扫描记录
                  </div>
                ) : (
                  <div className="space-y-2">
                    {summary?.latestScans?.slice(0, 5).map((scan) => (
                      <div key={scan.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => openScanDetail(scan)}
                      >
                        {(() => {
                          const cfg = scanTypeConfig[scan.type as ScanType]
                          const Icon = cfg?.icon || Activity
                          return <Icon className="h-4 w-4 text-muted-foreground" />
                        })()}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {scanTypeConfig[scan.type as ScanType]?.label || scan.type}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(scan.triggeredAt)}
                          </div>
                        </div>
                        <Badge variant={
                          scan.status === 'COMPLETED' ? 'default' :
                          scan.status === 'FAILED' ? 'destructive' :
                          scan.status === 'RUNNING' ? 'secondary' : 'outline'
                        }>
                          {scan.status}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="findings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bug className="h-4 w-4" />
                  漏洞汇总
                </span>
                <Button variant="outline" size="sm" onClick={loadProjectFindings} disabled={findingsLoading}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${findingsLoading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
              </CardTitle>
              <CardDescription>
                该项目所有扫描发现的漏洞汇总，按严重程度排序
              </CardDescription>
            </CardHeader>
            <CardContent>
              {findingsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : projectFindings.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Bug className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">暂无漏洞</p>
                  <p className="text-xs text-muted-foreground mt-1">运行扫描后，发现的漏洞将显示在这里</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className="p-4 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                          finding.severity === 'CRITICAL' ? 'bg-red-500' :
                          finding.severity === 'HIGH' ? 'bg-orange-500' :
                          finding.severity === 'MEDIUM' ? 'bg-yellow-500' :
                          finding.severity === 'LOW' ? 'bg-blue-500' : 'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium text-sm">{finding.title}</div>
                            <Badge variant={
                              finding.severity === 'CRITICAL' ? 'destructive' :
                              finding.severity === 'HIGH' ? 'default' :
                              finding.severity === 'MEDIUM' ? 'secondary' : 'outline'
                            } className="flex-shrink-0 h-5">
                              {finding.severity === 'CRITICAL' ? '严重' :
                               finding.severity === 'HIGH' ? '高危' :
                               finding.severity === 'MEDIUM' ? '中危' :
                               finding.severity === 'LOW' ? '低危' : '信息'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                            {finding.description}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            {finding.cwe && (
                              <span className="font-mono">{finding.cwe}</span>
                            )}
                            {finding.cve && (
                              <span className="font-mono">{finding.cve}</span>
                            )}
                            {finding.filePath && (
                              <span className="font-mono truncate max-w-xs">
                                {finding.filePath}
                                {finding.lineStart ? `:${finding.lineStart}` : ''}
                              </span>
                            )}
                            <span className="ml-auto">
                              {formatRelativeTime(finding.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scanners">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                扫描器配置
              </CardTitle>
              <CardDescription>
                选择要对此项目执行的安全扫描类型，点击"开始扫描"一键触发所有已启用的扫描器
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {categories.map((category) => (
                <div key={category}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">{category}</h3>
                  <div className="space-y-2">
                    {configs
                      .filter((c) => scanTypeConfig[c.scanType]?.category === category)
                      .map((config) => {
                        const cfg = scanTypeConfig[config.scanType]
                        const Icon = cfg?.icon || Shield
                        return (
                          <div
                            key={config.scanType}
                            className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors"
                          >
                            <div className={`p-2 rounded-lg ${config.enabled ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium flex items-center gap-2">
                                {cfg?.label || config.scanType}
                                {config.lastScanAt && (
                                  <span className="text-xs text-muted-foreground font-normal">
                                    上次：{formatRelativeTime(config.lastScanAt)}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {cfg?.description || config.description}
                              </div>
                            </div>
                            <Switch
                              checked={config.enabled}
                              onCheckedChange={(checked) => toggleScanner(config.scanType, checked)}
                            />
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </CardContent>
            <CardFooter className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setActiveTab('overview')}>
                查看概览
              </Button>
              <Button onClick={runScan} disabled={scanning || enabledCount === 0} className="gap-2">
                {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {scanning ? '启动中...' : `开始扫描 (${enabledCount})`}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="scans">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  扫描记录
                </span>
                <Button variant="outline" size="sm" onClick={loadData}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  刷新
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.latestScans?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  暂无扫描记录，点击"开始扫描"创建第一个任务
                </div>
              ) : (
                <div className="space-y-2">
                  {summary?.latestScans?.map((scan) => (
                    <div
                      key={scan.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/scans/${scan.id}`)}
                    >
                      {(() => {
                        const cfg = scanTypeConfig[scan.type as ScanType]
                        const Icon = cfg?.icon || Activity
                        return <Icon className="h-4 w-4 text-muted-foreground" />
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {scanTypeConfig[scan.type as ScanType]?.label || scan.type}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{scan.traceId?.slice(0, 16)}...</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(scan.triggeredAt)}
                      </div>
                      <Badge variant={
                        scan.status === 'COMPLETED' ? 'default' :
                        scan.status === 'FAILED' ? 'destructive' :
                        scan.status === 'RUNNING' ? 'secondary' : 'outline'
                      }>
                        {scan.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}
