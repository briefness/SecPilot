import { useState } from 'react'
import {
  Bug,
  Search,
  Filter,
  Copy,
  FileCode,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'
import { useFindings, useMarkFalsePositive } from '@/hooks/useFindings'
import { formatDate, formatRelativeTime, truncateId, copyToClipboard } from '@/lib/utils'
import type { RiskLevel, Finding } from '@/types'

const severityConfig: Record<RiskLevel, { label: string; variant: 'critical' | 'high' | 'medium' | 'low' | 'info'; color: string }> = {
  CRITICAL: { label: '严重', variant: 'critical', color: 'text-risk-critical' },
  HIGH: { label: '高危', variant: 'high', color: 'text-risk-high' },
  MEDIUM: { label: '中危', variant: 'medium', color: 'text-risk-medium' },
  LOW: { label: '低危', variant: 'low', color: 'text-risk-low' },
  INFO: { label: '信息', variant: 'info', color: 'text-risk-info' },
}

export default function Findings() {
  const { data: findings, isLoading } = useFindings()
  const markFalsePositive = useMarkFalsePositive()
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [falsePositiveFilter, setFalsePositiveFilter] = useState<string>('all')
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [bypassDialogOpen, setBypassDialogOpen] = useState(false)
  const [bypassReason, setBypassReason] = useState('')

  const filteredFindings = findings?.filter((finding) => {
    const matchesSearch = finding.title.toLowerCase().includes(search.toLowerCase()) ||
      finding.project.name.toLowerCase().includes(search.toLowerCase()) ||
      finding.id.toLowerCase().includes(search.toLowerCase())
    const matchesSeverity = severityFilter === 'all' || finding.severity === severityFilter
    const matchesFalsePositive = falsePositiveFilter === 'all' ||
      (falsePositiveFilter === 'false_positive' && finding.falsePositive) ||
      (falsePositiveFilter === 'active' && !finding.falsePositive)
    return matchesSearch && matchesSeverity && matchesFalsePositive
  }) || []

  const handleCopyId = async (id: string) => {
    await copyToClipboard(id)
  }

  const handleMarkFalsePositive = async (finding: Finding) => {
    try {
      await markFalsePositive.mutateAsync({ id: finding.id, falsePositive: !finding.falsePositive })
      setSelectedFinding({ ...finding, falsePositive: !finding.falsePositive })
    } catch (err) {
      console.error('Failed to mark false positive:', err)
    }
  }

  const handleBypass = () => {
    setBypassDialogOpen(true)
  }

  const submitBypass = () => {
    console.log('Submitting bypass:', { findingId: selectedFinding?.id, reason: bypassReason })
    setBypassDialogOpen(false)
    setBypassReason('')
  }

  const getStatusDisplay = (finding: Finding) => {
    if (finding.falsePositive) {
      return { label: '误报', icon: XCircle, color: 'text-muted-foreground' }
    }
    return { label: '待处理', icon: AlertTriangle, color: 'text-risk-medium' }
  }

  return (
    <PageContainer
      title="漏洞管理"
      description="查看和管理安全漏洞，跟踪修复进度"
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索漏洞..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3 w-3" />
                <SelectValue placeholder="严重程度" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">全部严重程度</SelectItem>
              <SelectItem value="critical" className="text-xs">严重</SelectItem>
              <SelectItem value="high" className="text-xs">高危</SelectItem>
              <SelectItem value="medium" className="text-xs">中危</SelectItem>
              <SelectItem value="low" className="text-xs">低危</SelectItem>
              <SelectItem value="info" className="text-xs">信息</SelectItem>
            </SelectContent>
          </Select>

          <Select value={falsePositiveFilter} onValueChange={setFalsePositiveFilter}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3 w-3" />
                <SelectValue placeholder="状态" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">全部状态</SelectItem>
              <SelectItem value="active" className="text-xs">活跃</SelectItem>
              <SelectItem value="false_positive" className="text-xs">误报</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 h-9"></TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">漏洞标题</TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">项目</TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">严重程度</TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">状态</TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">CWE/CVE</TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">发现时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : filteredFindings.map((finding) => {
                    const statusDisplay = getStatusDisplay(finding)
                    const StatusIcon = statusDisplay.icon
                    return (
                      <TableRow
                        key={finding.id}
                        className={`cursor-pointer hover:bg-accent/40 ${finding.falsePositive ? 'opacity-60' : ''}`}
                        onClick={() => setSelectedFinding(finding)}
                      >
                        <TableCell>
                          <div className={`w-1.5 h-1.5 rounded-full ${severityConfig[finding.severity].color.replace('text-', 'bg-')}`} />
                        </TableCell>
                        <TableCell className="font-medium max-w-xs">
                          <div className="truncate text-sm">{finding.title}</div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {truncateId(finding.id)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{finding.project.name}</TableCell>
                        <TableCell>
                          <Badge variant={severityConfig[finding.severity].variant} className="h-5">
                            {severityConfig[finding.severity].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={`h-3.5 w-3.5 ${statusDisplay.color}`} />
                            <span className="text-xs">{statusDisplay.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-[11px]">
                          {finding.cwe || finding.cve || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatRelativeTime(finding.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isLoading && filteredFindings.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <Bug className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || severityFilter !== 'all' || falsePositiveFilter !== 'all'
                ? '未找到匹配的漏洞'
                : '暂无漏洞数据'}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedFinding} onOpenChange={(open) => !open && setSelectedFinding(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedFinding && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between pr-6">
                  <div className="flex-1">
                    <DialogTitle className="text-base font-semibold">{selectedFinding.title}</DialogTitle>
                    <DialogDescription className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{truncateId(selectedFinding.id)}</span>
                      <Badge variant={severityConfig[selectedFinding.severity].variant} className="h-5">
                        {severityConfig[selectedFinding.severity].label}
                      </Badge>
                      {selectedFinding.cvss && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          CVSS: {selectedFinding.cvss}
                        </span>
                      )}
                      {selectedFinding.falsePositive && (
                        <Badge variant="outline" className="h-5">误报</Badge>
                      )}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 py-2">
                <div>
                  <Label className="text-xs text-muted-foreground">描述</Label>
                  <p className="mt-1.5 text-sm leading-relaxed">{selectedFinding.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">项目</Label>
                    <p className="mt-1 text-sm font-medium">{selectedFinding.project.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">CWE</Label>
                    <p className="mt-1 text-sm font-mono">{selectedFinding.cwe || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">CVE</Label>
                    <p className="mt-1 text-sm font-mono">{selectedFinding.cve || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">状态</Label>
                    <div className="mt-1 flex items-center gap-1.5">
                      {(() => {
                        const statusDisplay = getStatusDisplay(selectedFinding)
                        const StatusIcon = statusDisplay.icon
                        return (
                          <>
                            <StatusIcon className={`h-3.5 w-3.5 ${statusDisplay.color}`} />
                            <span className="text-sm">{statusDisplay.label}</span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {(selectedFinding.filePath || selectedFinding.location) && (
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <FileCode className="h-3 w-3" />
                      位置
                    </Label>
                    <div className="mt-1.5 p-3 rounded-md bg-muted font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground">{selectedFinding.filePath || selectedFinding.location}</span>
                        {selectedFinding.lineStart && (
                          <span className="text-muted-foreground">
                            行 {selectedFinding.lineStart}
                            {selectedFinding.lineEnd && selectedFinding.lineEnd !== selectedFinding.lineStart && `-${selectedFinding.lineEnd}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      发现时间
                    </Label>
                    <p className="mt-1 text-sm">{formatDate(selectedFinding.createdAt)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      更新时间
                    </Label>
                    <p className="mt-1 text-sm">{formatDate(selectedFinding.updatedAt)}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">操作</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          更改状态
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-40">
                        <DropdownMenuLabel className="text-xs">漏洞状态</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {!selectedFinding.falsePositive && (
                          <DropdownMenuItem onClick={() => handleMarkFalsePositive(selectedFinding)} className="text-xs gap-2 cursor-pointer">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            标记为误报
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={handleBypass} className="text-xs gap-2 cursor-pointer">
                          <ShieldAlert className="h-3.5 w-3.5 text-risk-info" />
                          申请豁免
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCopyId(selectedFinding.id)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">复制 ID</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedFinding(null)} className="h-8">
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bypassDialogOpen} onOpenChange={setBypassDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">申请 Bypass 豁免</DialogTitle>
            <DialogDescription className="text-xs">
              申请暂不处理此漏洞，请填写充分的理由
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-xs">豁免理由</Label>
              <textarea
                id="reason"
                value={bypassReason}
                onChange={(e) => setBypassReason(e.target.value)}
                placeholder="请说明为什么需要豁免此漏洞..."
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBypassDialogOpen(false)} className="h-8">
              取消
            </Button>
            <Button size="sm" onClick={submitBypass} disabled={!bypassReason.trim()} className="h-8">
              提交申请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
