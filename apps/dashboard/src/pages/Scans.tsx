import { useState } from 'react'
import {
  ScanLine,
  Plus,
  Search,
  PlayCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  RefreshCw,
  GitBranch,
  Target,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useScans, useTriggerScan } from '@/hooks/useScans'
import { useProjects } from '@/hooks/useProjects'
import { formatDate, formatRelativeTime, truncateId } from '@/lib/utils'
import type { ScanStatus, ScanType, Scan } from '@/types'

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'critical' | 'info' | 'outline'; icon: React.ElementType }> = {
  PENDING: { label: '等待中', variant: 'info', icon: Clock },
  RUNNING: { label: '运行中', variant: 'warning', icon: Loader2 },
  COMPLETED: { label: '已完成', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: '失败', variant: 'critical', icon: XCircle },
  CANCELLED: { label: '已取消', variant: 'outline', icon: XCircle },
}

const scanTypes: { value: ScanType; label: string }[] = [
  { value: 'STATIC_SAST', label: 'SAST - 静态代码分析' },
  { value: 'STATIC_SCA', label: 'SCA - 软件成分分析' },
  { value: 'DYNAMIC_H5', label: 'H5 - 动态应用安全测试' },
  { value: 'MOBILE_MOBSF', label: 'Mobile - 移动安全扫描' },
  { value: 'API_NUCLEI', label: 'API - Nuclei 漏洞扫描' },
]

export default function Scans() {
  const { data: scans, isLoading, refetch } = useScans()
  const { data: projects } = useProjects()
  const triggerScan = useTriggerScan()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newScan, setNewScan] = useState<{ projectId: string; type: ScanType; targetUrl: string; branch: string; commitHash: string }>({
    projectId: '',
    type: 'STATIC_SAST',
    targetUrl: '',
    branch: '',
    commitHash: '',
  })

  const filteredScans = scans?.filter((scan) => {
    const matchesSearch = scan.project.name.toLowerCase().includes(search.toLowerCase()) ||
      scan.id.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || scan.status === statusFilter
    const matchesType = typeFilter === 'all' || scan.type === typeFilter
    return matchesSearch && matchesStatus && matchesType
  }) || []

  const handleTriggerScan = async () => {
    try {
      await triggerScan.mutateAsync({
        projectId: newScan.projectId,
        type: newScan.type,
        targetUrl: newScan.targetUrl || undefined,
        branch: newScan.branch || undefined,
        commitHash: newScan.commitHash || undefined,
      })
      setDialogOpen(false)
      setNewScan({ projectId: '', type: 'STATIC_SAST', targetUrl: '', branch: '', commitHash: '' })
    } catch (err) {
      console.error('Failed to trigger scan:', err)
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
    return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`
  }

  const getScanTypeLabel = (type: string) => {
    return scanTypes.find((t) => t.value === type)?.label || type
  }

  const needsTargetUrl = (type: string) => {
    return type === 'DYNAMIC_H5' || type === 'API_NUCLEI'
  }

  const totalFindings = (scan: Scan) => {
    return scan.findingsCritical + scan.findingsHigh + scan.findingsMedium + scan.findingsLow + scan.findingsInfo
  }

  return (
    <PageContainer
      title="扫描任务"
      description="管理和查看所有安全扫描任务，触发新的扫描"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                触发扫描
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>触发新扫描</DialogTitle>
                <DialogDescription>为项目启动一次新的安全扫描任务</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project">项目</Label>
                  <Select
                    value={newScan.projectId}
                    onValueChange={(value) => setNewScan({ ...newScan, projectId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择项目" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">扫描类型</Label>
                  <Select
                    value={newScan.type}
                    onValueChange={(value) => setNewScan({ ...newScan, type: value as ScanType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择扫描类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {scanTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {needsTargetUrl(newScan.type) && (
                  <div className="space-y-2">
                    <Label htmlFor="targetUrl" className="flex items-center gap-2">
                      <Target className="h-3 w-3" />
                      目标地址
                    </Label>
                    <Input
                      id="targetUrl"
                      placeholder="https://example.com"
                      value={newScan.targetUrl}
                      onChange={(e) => setNewScan({ ...newScan, targetUrl: e.target.value })}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="branch" className="flex items-center gap-2">
                    <GitBranch className="h-3 w-3" />
                    分支 (可选)
                  </Label>
                  <Input
                    id="branch"
                    placeholder="main"
                    value={newScan.branch}
                    onChange={(e) => setNewScan({ ...newScan, branch: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commitHash">Commit Hash (可选)</Label>
                  <Input
                    id="commitHash"
                    placeholder="a1b2c3d4e5f6"
                    value={newScan.commitHash}
                    onChange={(e) => setNewScan({ ...newScan, commitHash: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleTriggerScan} disabled={triggerScan.isPending || !newScan.projectId}>
                  {triggerScan.isPending ? '触发中...' : '开始扫描'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索扫描任务..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <SelectValue placeholder="类型筛选" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {scanTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label.split(' - ')[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <SelectValue placeholder="状态筛选" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="PENDING">等待中</SelectItem>
            <SelectItem value="RUNNING">运行中</SelectItem>
            <SelectItem value="COMPLETED">已完成</SelectItem>
            <SelectItem value="FAILED">失败</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>扫描 ID</TableHead>
                <TableHead>项目</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>漏洞数</TableHead>
                <TableHead>触发者</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : filteredScans.map((scan) => {
                    const StatusIcon = statusConfig[scan.status].icon
                    return (
                      <TableRow key={scan.id} className="cursor-pointer hover:bg-muted/30">
                        <TableCell className="font-mono text-sm">
                          {truncateId(scan.id)}
                        </TableCell>
                        <TableCell className="font-medium">{scan.project.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {getScanTypeLabel(scan.type).split(' - ')[0]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`h-4 w-4 ${
                              scan.status === 'RUNNING' ? 'text-amber-400 animate-spin' :
                              scan.status === 'COMPLETED' ? 'text-emerald-400' :
                              scan.status === 'FAILED' ? 'text-red-400' :
                              'text-blue-400'
                            }`} />
                            <Badge variant={statusConfig[scan.status].variant}>
                              {statusConfig[scan.status].label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {scan.status === 'COMPLETED' ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{totalFindings(scan)}</span>
                              <div className="flex gap-1">
                                {scan.findingsCritical > 0 && (
                                  <span className="text-xs text-risk-critical font-mono">
                                    C:{scan.findingsCritical}
                                  </span>
                                )}
                                {scan.findingsHigh > 0 && (
                                  <span className="text-xs text-risk-high font-mono">
                                    H:{scan.findingsHigh}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {scan.triggeredBy}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono">
                          {formatDuration(scan.durationSeconds)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatRelativeTime(scan.triggeredAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isLoading && filteredScans.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ScanLine className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              {search || statusFilter !== 'all' || typeFilter !== 'all' ? '未找到匹配的扫描任务' : '暂无扫描任务'}
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <PlayCircle className="mr-2 h-4 w-4" />
              触发扫描
            </Button>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}
