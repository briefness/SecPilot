import { useState } from 'react'
import {
  Smartphone,
  Plus,
  Search,
  ShieldCheck,
  Hash,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Play,
  Download,
  Copy,
  Eye,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useAppReleases,
  useCreateRelease,
  useUpdateRelease,
  useTriggerReleaseScan,
  useVerifyHash,
  useHashChain,
} from '@/hooks/useAppReleases'
import { useProjects } from '@/hooks/useProjects'
import { formatDate } from '@/lib/utils'
import type { ReleaseStatus } from '@/types'

const statusConfig: Record<ReleaseStatus, { label: string; variant: string; icon: any }> = {
  PENDING_SCAN: { label: '待扫描', variant: 'outline', icon: Clock },
  SCANNING: { label: '扫描中', variant: 'secondary', icon: Play },
  SCAN_FAILED: { label: '扫描失败', variant: 'destructive', icon: XCircle },
  SCAN_PASSED: { label: '扫描通过', variant: 'success', icon: CheckCircle2 },
  HARDENED: { label: '已加固', variant: 'secondary', icon: ShieldCheck },
  PUBLISHED: { label: '已发布', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: '失败', variant: 'destructive', icon: XCircle },
}

function StatusBadge({ status }: { status: ReleaseStatus }) {
  const { label, variant, icon: Icon } = statusConfig[status]
  return (
    <Badge variant={variant as any} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
}

export default function AppReleases() {
  const [projectId, setProjectId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<ReleaseStatus | ''>('')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyHash, setVerifyHash] = useState('')
  const [verifyResult, setVerifyResult] = useState<any>(null)
  const [form, setForm] = useState({
    projectId: '',
    version: '',
    buildNumber: '',
    platform: 'android',
    artifactUrl: '',
    preHardeningHash: '',
  })

  const { data: releases, isLoading } = useAppReleases({
    projectId: projectId || undefined,
    status: statusFilter || undefined,
    platform: platformFilter || undefined,
    pageSize: 20,
  })

  const { data: projects } = useProjects()
  const createRelease = useCreateRelease()
  const updateRelease = useUpdateRelease()
  const triggerScan = useTriggerReleaseScan()
  const verifyMutation = useVerifyHash()
  const { data: hashChain } = useHashChain(projectId)

  const filtered = releases?.data.filter(r =>
    r.version.toLowerCase().includes(search.toLowerCase()) ||
    r.buildNumber.includes(search)
  ) || []

  const handleCreate = async () => {
    await createRelease.mutateAsync(form)
    setCreateOpen(false)
    setForm({ projectId: '', version: '', buildNumber: '', platform: 'android', artifactUrl: '', preHardeningHash: '' })
  }

  const handleVerify = async () => {
    const result = await verifyMutation.mutateAsync({ hash: verifyHash })
    setVerifyResult(result)
  }

  return (
    <PageContainer
      title="App 发版管理"
      description="移动端发版哈希链管理、MobSF 扫描与加固流程追踪"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部项目</SelectItem>
              {projects?.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部状态</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="平台" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部平台</SelectItem>
              <SelectItem value="android">Android</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
              <SelectItem value="harmony">HarmonyOS</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索版本 / 构建号"
              className="w-64 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                哈希校验
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>SHA-256 哈希校验</DialogTitle>
                <DialogDescription>
                  校验发版包哈希值，确认资产未被篡改
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>文件哈希值</Label>
                  <Input
                    placeholder="输入 SHA-256 哈希值"
                    value={verifyHash}
                    onChange={(e) => setVerifyHash(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                {verifyResult && (
                  <div className={`p-3 rounded-lg border ${verifyResult.valid ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-destructive/10 border-destructive/30'}`}>
                    <div className="flex items-center gap-2 font-medium">
                      {verifyResult.valid ? (
                        <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 校验通过</>
                      ) : (
                        <><XCircle className="h-4 w-4 text-destructive" /> 校验失败</>
                      )}
                    </div>
                    {verifyResult.reason && (
                      <p className="text-xs text-muted-foreground mt-1">{verifyResult.reason}</p>
                    )}
                    {verifyResult.release && (
                      <div className="mt-2 pt-2 border-t border-border text-xs space-y-1">
                        <p>版本：{verifyResult.release.version} ({verifyResult.release.buildNumber})</p>
                        <p>匹配：{verifyResult.matches === 'preHardening' ? '加固前' : verifyResult.matches === 'postHardening' ? '加固后' : '—'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setVerifyResult(null); setVerifyHash('') }}>
                  重置
                </Button>
                <Button onClick={handleVerify} disabled={!verifyHash || verifyMutation.isPending}>
                  校验
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                新建发版
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>新建发版记录</DialogTitle>
                <DialogDescription>
                  记录加固前版本哈希并触发 MobSF 扫描
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <Label>项目</Label>
                  <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择项目" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.filter((p: any) => p.type === 'MOBILE').map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>版本号</Label>
                  <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0.0" />
                </div>
                <div className="space-y-2">
                  <Label>构建号</Label>
                  <Input value={form.buildNumber} onChange={(e) => setForm({ ...form, buildNumber: e.target.value })} placeholder="123" />
                </div>
                <div className="space-y-2">
                  <Label>平台</Label>
                  <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="android">Android</SelectItem>
                      <SelectItem value="ios">iOS</SelectItem>
                      <SelectItem value="harmony">HarmonyOS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>加固前 SHA-256</Label>
                  <Input value={form.preHardeningHash} onChange={(e) => setForm({ ...form, preHardeningHash: e.target.value })} placeholder="哈希值" className="font-mono text-xs" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>制品地址 (可选)</Label>
                  <Input value={form.artifactUrl} onChange={(e) => setForm({ ...form, artifactUrl: e.target.value })} placeholder="https://..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
                <Button onClick={handleCreate} disabled={createRelease.isPending}>创建</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {projectId && hashChain && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">哈希链验证</CardTitle>
                <CardDescription>
                  链长度 {hashChain.chainLength} · {hashChain.chainValid ? <span className="text-emerald-500">完整</span> : <span className="text-destructive">存在断链</span>}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {hashChain.releases.slice(0, 10).map((r, i) => (
                <div key={r.id} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[60px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      i === 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-accent text-muted-foreground border border-border'
                    }`}>
                      <Hash className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] mt-1 text-muted-foreground truncate w-full text-center">{r.version}</span>
                  </div>
                  {i < hashChain.releases.slice(0, 10).length - 1 && (
                    <div className="w-4 h-px bg-border mx-1" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="list">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-2">
            <Smartphone className="h-4 w-4" />
            发版列表
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2">
            <Play className="h-4 w-4" />
            流水线视图
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtered.length > 0 ? (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>版本 / 构建</TableHead>
                        <TableHead>项目</TableHead>
                        <TableHead>平台</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-center">Critical</TableHead>
                        <TableHead className="text-center">High</TableHead>
                        <TableHead className="text-center">Medium</TableHead>
                        <TableHead>加固前哈希</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{r.version}</div>
                            <div className="text-xs text-muted-foreground">Build {r.buildNumber}</div>
                          </TableCell>
                          <TableCell className="text-sm">{r.project?.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="uppercase text-xs">
                              {r.platform}
                            </Badge>
                          </TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-center text-sm font-medium text-destructive">{r.findingsCritical}</TableCell>
                          <TableCell className="text-center text-sm font-medium text-orange-500">{r.findingsHigh}</TableCell>
                          <TableCell className="text-center text-sm font-medium text-yellow-500">{r.findingsMedium}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <code className="text-xs font-mono text-muted-foreground max-w-[100px] truncate">
                                {r.preHardeningHash.slice(0, 12)}...
                              </code>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(r.preHardeningHash)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {r.status === 'PENDING_SCAN' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => triggerScan.mutate(r.id)}
                                  disabled={triggerScan.isPending}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  扫描
                                </Button>
                              )}
                              {r.status === 'SCAN_PASSED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateRelease.mutate({ id: r.id, data: { status: 'HARDENED' as any } })}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  加固
                                </Button>
                              )}
                              {r.status === 'HARDENED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateRelease.mutate({ id: r.id, data: { status: 'PUBLISHED' as any } })}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  发布
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无发版记录
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">发版流水线</CardTitle>
              <CardDescription>源码编译 → 加固前扫描 → 商业加固 → 发布</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between py-4">
                {['待扫描', '扫描中', '扫描通过', '已加固', '已发布'].map((stage, i) => (
                  <div key={stage} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                        i <= 2 ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-border bg-accent text-muted-foreground'
                      }`}>
                        {i === 0 && <Clock className="h-4 w-4" />}
                        {i === 1 && <Play className="h-4 w-4" />}
                        {i === 2 && <CheckCircle2 className="h-4 w-4" />}
                        {i === 3 && <ShieldCheck className="h-4 w-4" />}
                        {i === 4 && <Download className="h-4 w-4" />}
                      </div>
                      <span className="text-xs mt-2">{stage}</span>
                    </div>
                    {i < 4 && <div className="h-px flex-1 bg-border -mt-6" />}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
                <div className="p-3 rounded-lg bg-accent/30">
                  <p className="text-xs text-muted-foreground">SHA-256 校验</p>
                  <p className="text-lg font-semibold mt-1 text-emerald-400">启用</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/30">
                  <p className="text-xs text-muted-foreground">MobSF 扫描</p>
                  <p className="text-lg font-semibold mt-1 text-emerald-400">启用</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/30">
                  <p className="text-xs text-muted-foreground">加固前卡点</p>
                  <p className="text-lg font-semibold mt-1 text-emerald-400">强制</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/30">
                  <p className="text-xs text-muted-foreground">哈希链追踪</p>
                  <p className="text-lg font-semibold mt-1 text-emerald-400">启用</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}
