import { useState } from 'react'
import {
  ShieldAlert,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  Calendar,
  FileText,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBypassRequests } from '@/hooks/useBypass'
import { useFindings } from '@/hooks/useFindings'
import { formatDate, formatRelativeTime, truncateId } from '@/lib/utils'
import type { BypassStatus, BypassRequest } from '@/types'

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'critical' | 'info' | 'outline'; icon: React.ElementType }> = {
  PENDING: { label: '待审批', variant: 'warning', icon: Clock },
  APPROVED: { label: '已通过', variant: 'success', icon: CheckCircle2 },
  REJECTED: { label: '已拒绝', variant: 'critical', icon: XCircle },
  EXPIRED: { label: '已过期', variant: 'info', icon: AlertTriangle },
}

export default function Bypass() {
  const { data: requests, isLoading } = useBypassRequests()
  const { data: findings } = useFindings()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<BypassRequest | null>(null)
  const [newBypass, setNewBypass] = useState({
    findingId: '',
    reason: '',
  })

  const filteredRequests = requests?.filter((req) => {
    const matchesSearch = req.findingTitle.toLowerCase().includes(search.toLowerCase()) ||
      req.projectName.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter
    return matchesSearch && matchesStatus
  }) || []

  const pendingCount = requests?.filter((r) => r.status === 'PENDING').length || 0
  const approvedCount = requests?.filter((r) => r.status === 'APPROVED').length || 0
  const rejectedCount = requests?.filter((r) => r.status === 'REJECTED').length || 0
  const expiredCount = requests?.filter((r) => r.status === 'EXPIRED').length || 0

  const handleSubmit = () => {
    console.log('Submitting bypass request:', newBypass)
    setDialogOpen(false)
    setNewBypass({ findingId: '', reason: '' })
  }

  const handleApprove = (id: string) => {
    console.log('Approving bypass:', id)
  }

  const handleReject = (id: string) => {
    console.log('Rejecting bypass:', id)
  }

  return (
    <PageContainer
      title="Bypass 管理"
      description="管理漏洞豁免申请，审批和跟踪 Bypass 请求"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              申请 Bypass
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>申请 Bypass 豁免</DialogTitle>
              <DialogDescription>
                申请暂不处理某个漏洞，请填写充分的理由
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="finding">漏洞</Label>
                <Select
                  value={newBypass.findingId}
                  onValueChange={(value) => setNewBypass({ ...newBypass, findingId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择漏洞" />
                  </SelectTrigger>
                  <SelectContent>
                    {findings?.filter((f) => !f.falsePositive).map((finding) => (
                      <SelectItem key={finding.id} value={finding.id}>
                        {finding.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">豁免理由</Label>
                <textarea
                  id="reason"
                  value={newBypass.reason}
                  onChange={(e) => setNewBypass({ ...newBypass, reason: e.target.value })}
                  placeholder="请详细说明为什么需要豁免此漏洞..."
                  className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={!newBypass.findingId || !newBypass.reason.trim()}>
                提交申请
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">待审批</p>
                <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已通过</p>
                <p className="text-2xl font-bold text-emerald-400">{approvedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已拒绝</p>
                <p className="text-2xl font-bold text-red-400">{rejectedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已过期</p>
                <p className="text-2xl font-bold text-blue-400">{expiredCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-blue-400/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索 Bypass 申请..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <SelectValue placeholder="状态筛选" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="PENDING">待审批</SelectItem>
            <SelectItem value="APPROVED">已通过</SelectItem>
            <SelectItem value="REJECTED">已拒绝</SelectItem>
            <SelectItem value="EXPIRED">已过期</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="pending">待审批</TabsTrigger>
          <TabsTrigger value="approved">已通过</TabsTrigger>
          <TabsTrigger value="rejected">已拒绝</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <BypassTable
            requests={filteredRequests}
            isLoading={isLoading}
            onView={setSelectedRequest}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </TabsContent>
        <TabsContent value="pending">
          <BypassTable
            requests={filteredRequests.filter((r) => r.status === 'PENDING')}
            isLoading={isLoading}
            onView={setSelectedRequest}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </TabsContent>
        <TabsContent value="approved">
          <BypassTable
            requests={filteredRequests.filter((r) => r.status === 'APPROVED')}
            isLoading={isLoading}
            onView={setSelectedRequest}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </TabsContent>
        <TabsContent value="rejected">
          <BypassTable
            requests={filteredRequests.filter((r) => r.status === 'REJECTED')}
            isLoading={isLoading}
            onView={setSelectedRequest}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-xl">
          {selectedRequest && (
            <>
              <DialogHeader>
                <DialogTitle>Bypass 申请详情</DialogTitle>
                <DialogDescription>
                  <Badge variant={statusConfig[selectedRequest.status].variant as 'warning' | 'success' | 'critical' | 'info'}>
                    {statusConfig[selectedRequest.status].label}
                  </Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label className="text-muted-foreground">漏洞</Label>
                  <p className="mt-1 font-medium">{selectedRequest.findingTitle}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {truncateId(selectedRequest.findingId)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">项目</Label>
                    <p className="mt-1">{selectedRequest.projectName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      申请人
                    </Label>
                    <p className="mt-1">{selectedRequest.requestedBy}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    申请理由
                  </Label>
                  <p className="mt-2 p-3 rounded-lg bg-background border border-border text-sm">
                    {selectedRequest.reason}
                  </p>
                </div>
                {selectedRequest.reviewedBy && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          审批人
                        </Label>
                        <p className="mt-1">{selectedRequest.reviewedBy}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          审批时间
                        </Label>
                        <p className="mt-1">{formatDate(selectedRequest.reviewedAt!)}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">审批意见</Label>
                      <p className="mt-2 p-3 rounded-lg bg-background border border-border text-sm">
                        {selectedRequest.reviewComment}
                      </p>
                    </div>
                  </>
                )}
                {selectedRequest.expiresAt && (
                  <div>
                    <Label className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      过期时间
                    </Label>
                    <p className="mt-1">{formatDate(selectedRequest.expiresAt)}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                {selectedRequest.status === 'PENDING' && (
                  <>
                    <Button variant="destructive" onClick={() => handleReject(selectedRequest.id)}>
                      拒绝
                    </Button>
                    <Button onClick={() => handleApprove(selectedRequest.id)}>
                      通过
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}

interface BypassTableProps {
  requests: BypassRequest[]
  isLoading: boolean
  onView: (req: BypassRequest) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

function BypassTable({ requests, isLoading, onView, onApprove, onReject }: BypassTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Skeleton className="h-12 w-12 mx-auto mb-4" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">暂无 Bypass 申请</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>漏洞</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>申请人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => {
              const StatusIcon = statusConfig[req.status].icon
              return (
                <TableRow key={req.id} className="cursor-pointer" onClick={() => onView(req)}>
                  <TableCell className="font-medium max-w-xs">
                    <div className="truncate">{req.findingTitle}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {truncateId(req.id)}
                    </div>
                  </TableCell>
                  <TableCell>{req.projectName}</TableCell>
                  <TableCell>{req.requestedBy}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 ${
                        req.status === 'APPROVED' ? 'text-emerald-400' :
                        req.status === 'REJECTED' ? 'text-red-400' :
                        req.status === 'PENDING' ? 'text-amber-400' :
                        'text-blue-400'
                      }`} />
                      <Badge variant={statusConfig[req.status].variant as 'warning' | 'success' | 'critical' | 'info'}>
                        {statusConfig[req.status].label}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(req.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {req.status === 'PENDING' && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); onReject(req.id) }}
                        >
                          拒绝
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); onApprove(req.id) }}
                        >
                          通过
                        </Button>
                      </div>
                    )}
                    {req.status !== 'PENDING' && (
                      <Button variant="ghost" size="sm">
                        查看详情
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
