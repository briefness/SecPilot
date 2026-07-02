import { useState } from 'react'
import {
  GitBranch,
  Plus,
  ShieldCheck,
  Key,
  RefreshCw,
  Copy,
  Trash2,
  Edit,
  Check,
  FileCode,
  ExternalLink,
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
  useGitlabIntegrations,
  useCreateGitlabIntegration,
  useUpdateGitlabIntegration,
  useDeleteGitlabIntegration,
  useRotateWebhookToken,
  useRotateBypassToken,
  useComplianceTemplate,
} from '@/hooks/useGitlabIntegrations'
import { useProjects } from '@/hooks/useProjects'
import { formatDate } from '@/lib/utils'

function copyText(text: string) {
  navigator.clipboard.writeText(text)
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function GitlabIntegration() {
  const [projectFilter, setProjectFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [form, setForm] = useState({
    projectId: '',
    groupPath: '',
    projectPath: '',
    webhookToken: '',
    complianceTemplateEnabled: false,
    securityBypassToken: '',
  })
  const [copied, setCopied] = useState<string | null>(null)

  const { data: integrations, isLoading } = useGitlabIntegrations(projectFilter || undefined)
  const { data: projects } = useProjects()
  const { data: templateData } = useComplianceTemplate()
  const create = useCreateGitlabIntegration()
  const update = useUpdateGitlabIntegration()
  const remove = useDeleteGitlabIntegration()
  const rotateWebhook = useRotateWebhookToken()
  const rotateBypass = useRotateBypassToken()

  const resetForm = () => {
    setForm({
      projectId: '', groupPath: '', projectPath: '', webhookToken: '',
      complianceTemplateEnabled: false, securityBypassToken: '',
    })
  }

  const handleCreate = async () => {
    await create.mutateAsync(form as any)
    setCreateOpen(false)
    resetForm()
  }

  const handleUpdate = async () => {
    await update.mutateAsync({ projectId: editing.projectId, data: form as any })
    setEditing(null)
    resetForm()
  }

  const handleEdit = (item: any) => {
    setEditing(item)
    setForm({
      projectId: item.projectId,
      groupPath: item.groupPath,
      projectPath: item.projectPath,
      webhookToken: item.webhookToken,
      complianceTemplateEnabled: item.complianceTemplateEnabled,
      securityBypassToken: item.securityBypassToken || '',
    })
  }

  const handleCopy = (text: string, id: string) => {
    copyText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  const availableProjects = projects?.filter(
    (p: any) => !integrations?.some((i: any) => i.projectId === p.id)
  ) || []

  return (
    <PageContainer
      title="GitLab 合规流水线"
      description="GitLab 组级合规流水线配置、Webhook 管理与安全 Bypass 令牌"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="筛选项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部项目</SelectItem>
              {projects?.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <FileCode className="h-4 w-4 mr-1.5" />
                合规流水线模板
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>合规流水线模板</DialogTitle>
                <DialogDescription>
                  GitLab 组级强制注入的安全合规流水线 YAML 模板
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="flex justify-end mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => templateData && handleCopy(templateData.template, 'template')}
                  >
                    {copied === 'template' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copied === 'template' ? '已复制' : '复制模板'}
                  </Button>
                </div>
                <pre className="p-4 rounded-lg bg-background border border-border overflow-x-auto text-xs font-mono">
{templateData?.template || '加载中...'}
                </pre>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm() }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                新建集成
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>新建 GitLab 集成</DialogTitle>
                <DialogDescription>
                  配置 GitLab 项目的合规流水线与 Webhook
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>项目</Label>
                  <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                    <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                    <SelectContent>
                      {availableProjects.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>群组路径</Label>
                    <Input value={form.groupPath} onChange={(e) => setForm({ ...form, groupPath: e.target.value })} placeholder="group-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>项目路径</Label>
                    <Input value={form.projectPath} onChange={(e) => setForm({ ...form, projectPath: e.target.value })} placeholder="project-name" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Webhook Token</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, webhookToken: generateToken() })}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      生成
                    </Button>
                  </div>
                  <Input value={form.webhookToken} onChange={(e) => setForm({ ...form, webhookToken: e.target.value })} className="font-mono text-xs" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">启用合规流水线</p>
                    <p className="text-xs text-muted-foreground">组级强制注入安全扫描模板</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={form.complianceTemplateEnabled}
                      onChange={(e) => setForm({ ...form, complianceTemplateEnabled: e.target.checked })}
                    />
                    <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>紧急 Bypass Token (可选)</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, securityBypassToken: generateToken() })}
                    >
                      <Key className="h-3.5 w-3.5 mr-1" />
                      生成
                    </Button>
                  </div>
                  <Input
                    value={form.securityBypassToken}
                    onChange={(e) => setForm({ ...form, securityBypassToken: e.target.value })}
                    placeholder="用于紧急 Hotfix 跳过安全卡点"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    ⚠️ 最高权限令牌，使用会触发 PagerDuty 报警
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm() }}>取消</Button>
                <Button onClick={handleCreate} disabled={create.isPending}>创建</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList className="mb-4">
          <TabsTrigger value="integrations" className="gap-2">
            <GitBranch className="h-4 w-4" />
            集成列表
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            合规配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : integrations && integrations.length > 0 ? (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>项目</TableHead>
                        <TableHead>GitLab 路径</TableHead>
                        <TableHead>合规流水线</TableHead>
                        <TableHead>Webhook Token</TableHead>
                        <TableHead>上次同步</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {integrations.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.project?.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.groupPath}/{item.projectPath}
                          </TableCell>
                          <TableCell>
                            {item.complianceTemplateEnabled ? (
                              <Badge variant="success" className="gap-1">
                                <Check className="h-3 w-3" />
                                已启用
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                未启用
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <code className="text-xs font-mono text-muted-foreground">
                                {item.webhookToken.slice(0, 8)}...
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopy(item.webhookToken, `wh-${item.id}`)}
                              >
                                {copied === `wh-${item.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => rotateWebhook.mutate(item.projectId)}
                                title="轮换 Token"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.lastSyncAt ? formatDate(item.lastSyncAt) : '—'}
                            {item.syncStatus && (
                              <Badge variant="outline" className="ml-2 text-[10px] h-4">
                                {item.syncStatus}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => remove.mutate(item.projectId)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无 GitLab 集成配置
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">流水线阶段</CardTitle>
                <CardDescription>四阶段错峰安全扫描策略</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {[
                  { name: '白天快扫 (Stage A)', desc: 'SAST + SCA 离线前置，Commit 触发', type: 'DAY_FAST_SCAN' },
                  { name: '夜间深扫 (Stage B)', desc: 'OWASP ZAP + Playwright，凌晨 2:00', type: 'NIGHT_DEEP_SCAN' },
                  { name: '发版审计 (Stage C)', desc: 'MobSF 逆向 + 哈希锁链，加固前', type: 'RELEASE_AUDIT' },
                  { name: '应急巡检 (Stage D)', desc: 'Nuclei 容器，0day 爆发时触发', type: 'EMERGENCY_PATROL' },
                ].map((stage) => (
                  <div key={stage.type} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                    <div className="w-8 h-8 rounded bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{stage.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{stage.desc}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5">已配置</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">熔断策略</CardTitle>
                <CardDescription>基于 CVSS 的分级熔断机制</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {[
                  { level: 'Critical', action: '强制阻断', color: 'text-destructive', desc: '立即阻断流水线，通知安全团队' },
                  { level: 'High', action: '强制阻断', color: 'text-orange-500', desc: '阻断流水线，限期 3 天内修复' },
                  { level: 'Medium', action: '告警 + 宽限期', color: 'text-yellow-500', desc: 'Slack 报警，7 天宽限期' },
                  { level: 'Low', action: '仅记录', color: 'text-emerald-500', desc: '记录漏洞，不阻断' },
                ].map((item) => (
                  <div key={item.level} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className={`text-sm font-medium ${item.color}`}>{item.level}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{item.action}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">紧急逃生通道</CardTitle>
                    <CardDescription>
                      SECURITY_BYPASS_TOKEN 高权限令牌管理
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    查看模板
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="p-4 rounded-lg border border-dashed border-border bg-accent/20">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <Key className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">Bypass 令牌使用规则</p>
                      <ul className="text-xs text-muted-foreground mt-1.5 space-y-1">
                        <li>• 仅限组级别管理员持有，禁止下发到项目级</li>
                        <li>• 每次使用触发 PagerDuty + Slack 顶格报警，抄送 CTO 团队</li>
                        <li>• 放行项目自动标记"非安全合规发布"，24 小时内必须补扫</li>
                        <li>• 令牌定期轮换，审计日志永久留存</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) { setEditing(null); resetForm() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑 GitLab 集成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>群组路径</Label>
                <Input value={form.groupPath} onChange={(e) => setForm({ ...form, groupPath: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>项目路径</Label>
                <Input value={form.projectPath} onChange={(e) => setForm({ ...form, projectPath: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Webhook Token</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm({ ...form, webhookToken: generateToken() })}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  重新生成
                </Button>
              </div>
              <Input value={form.webhookToken} onChange={(e) => setForm({ ...form, webhookToken: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">启用合规流水线</p>
                <p className="text-xs text-muted-foreground">组级强制注入安全扫描模板</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.complianceTemplateEnabled}
                  onChange={(e) => setForm({ ...form, complianceTemplateEnabled: e.target.checked })}
                />
                <div className="w-9 h-5 rounded-full bg-border peer-checked:bg-foreground/80 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-background after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bypass Token</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm({ ...form, securityBypassToken: generateToken() })}
                >
                  <Key className="h-3.5 w-3.5 mr-1" />
                  重新生成
                </Button>
              </div>
              <Input value={form.securityBypassToken || ''} onChange={(e) => setForm({ ...form, securityBypassToken: e.target.value })} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); resetForm() }}>取消</Button>
            <Button onClick={handleUpdate} disabled={update.isPending}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
