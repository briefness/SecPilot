import { useState } from 'react'
import {
  FileText,
  Search,
  Calendar,
  User,
  FolderGit2,
  Activity,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { useAuditLogs, useAuditLogStats, useAuditLogActions } from '@/hooks/useAuditLogs'
import type { AuditLogEntry } from '@/types'

const actionLabels: Record<string, string> = {
  'user.create': '创建用户',
  'user.update': '更新用户',
  'user.delete': '删除用户',
  'bypass.request': '申请Bypass',
  'bypass.approve': '批准Bypass',
  'bypass.reject': '拒绝Bypass',
  'project.create': '创建项目',
  'project.update': '更新项目',
  'scan.start': '启动扫描',
  'scan.complete': '扫描完成',
  'finding.update': '更新漏洞',
}

function ActionBadge({ action }: { action: string }) {
  const label = actionLabels[action] || action
  let variant: 'default' | 'success' | 'warning' | 'critical' | 'info' | 'outline' = 'outline'
  if (action.startsWith('user.') || action.startsWith('project.create')) variant = 'success'
  if (action.startsWith('bypass.')) variant = 'warning'
  if (action.includes('delete') || action.includes('reject')) variant = 'critical'
  return (
    <Badge variant={variant} className="font-mono text-xs">
      {label}
    </Badge>
  )
}

function LogDetail({ log }: { log: AuditLogEntry }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-accent/30" onClick={() => setOpen(!open)}>
        <TableCell className="w-8">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="w-40">
          <ActionBadge action={log.action} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
              <User className="h-3 w-3" />
            </div>
            <span className="text-sm">{log.user?.name || 'Unknown'}</span>
            <span className="text-xs text-muted-foreground">{log.user?.email}</span>
          </div>
        </TableCell>
        <TableCell>
          {log.project ? (
            <div className="flex items-center gap-1.5 text-sm">
              <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />
              {log.project.name}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground">
          {formatRelativeTime(log.createdAt)}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5} className="p-0">
            <div className="mx-8 mb-3 rounded-md border border-border bg-accent/20 p-3">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground mb-1">操作类型</p>
                  <p className="font-mono">{log.action}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">时间</p>
                  <p>{formatDate(log.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">用户ID</p>
                  <p className="font-mono">{log.userId}</p>
                </div>
                {log.project && (
                  <div>
                    <p className="text-muted-foreground mb-1">项目ID</p>
                    <p className="font-mono">{log.projectId}</p>
                  </div>
                )}
              </div>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">元数据</p>
                  <pre className="text-xs font-mono bg-background/50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function AuditLogs() {
  const { data: logsData, isLoading } = useAuditLogs()
  const { data: stats } = useAuditLogStats()
  const { data: actions } = useAuditLogActions()

  const [actionFilter, setActionFilter] = useState<string>('all')

  const filteredLogs = logsData?.data.filter((l) => {
    return actionFilter === 'all' || l.action === actionFilter
  }) || []

  return (
    <PageContainer
      title="审计日志"
      description="记录平台所有操作行为，满足合规审计要求"
    >
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-lg">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">总操作数</p>
          <p className="text-xl font-semibold mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">今日</p>
          <p className="text-xl font-semibold mt-1">{stats?.today ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">近7天</p>
          <p className="text-xl font-semibold mt-1">{stats?.last7Days ?? 0}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">操作记录</CardTitle>
              <CardDescription>
                所有用户操作的完整审计追踪
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="搜索操作..." className="pl-9" />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="全部操作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部操作</SelectItem>
                {actions?.map((a) => (
                  <SelectItem key={a.action} value={a.action}>
                    {actionLabels[a.action] || a.action} ({a.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredLogs.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-40">操作类型</TableHead>
                    <TableHead>操作人</TableHead>
                    <TableHead>关联项目</TableHead>
                    <TableHead className="text-right">时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <LogDetail key={log.id} log={log} />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-border py-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">暂无审计日志</p>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
