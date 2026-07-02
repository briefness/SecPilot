import { useState } from 'react'
import {
  Radio,
  Plus,
  Settings,
  ListChecks,
  FileText,
  Wand2,
  ShieldCheck,
  ShieldX,
  Copy,
  CheckCircle2,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  X,
  Play,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { copyToClipboard, formatDate } from '@/lib/utils'
import {
  useDyeRules,
  useDyeRule,
  useCreateDyeRule,
  useUpdateDyeRule,
  useDeleteDyeRule,
  useAddWhitelist,
  useRemoveWhitelist,
  useDyeLogs,
  useDyeStats,
  useGenerateDyeHeaders,
  useVerifyDyeHeaders,
} from '@/hooks/useTrafficDye'
import type { DyeRule, DyeLogAction, DyeLogResult } from '@/types'

export default function TrafficDye() {
  const [activeTab, setActiveTab] = useState('rules')
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [showSalt, setShowSalt] = useState<Record<string, boolean>>({})

  return (
    <PageContainer
      title="流量染色管理"
      description="管理染色规则、IP白名单和染色日志"
    >
      <StatsCards />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" />
            规则管理
          </TabsTrigger>
          <TabsTrigger value="whitelist" className="gap-2">
            <ListChecks className="h-4 w-4" />
            IP白名单
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileText className="h-4 w-4" />
            染色日志
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-2">
            <Wand2 className="h-4 w-4" />
            在线工具
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <RulesTab
            selectedRuleId={selectedRuleId}
            onSelectRule={setSelectedRuleId}
            showSalt={showSalt}
            onToggleSalt={(id) => setShowSalt((prev) => ({ ...prev, [id]: !prev[id] }))}
          />
        </TabsContent>

        <TabsContent value="whitelist" className="mt-4">
          <WhitelistTab selectedRuleId={selectedRuleId} onSelectRule={setSelectedRuleId} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogsTab />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <ToolsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function StatsCards() {
  const { data: stats, isLoading } = useDyeStats()

  const cards = [
    { label: '规则总数', value: stats?.totalRules ?? 0, color: 'text-foreground' },
    { label: '启用规则', value: stats?.enabledRules ?? 0, color: 'text-emerald-400' },
    { label: '今日调用', value: stats?.todayLogs ?? 0, color: 'text-cyan-400' },
    { label: '累计调用', value: stats?.totalLogs ?? 0, color: 'text-foreground' },
    { label: '验证成功', value: stats?.successLogs ?? 0, color: 'text-emerald-400' },
    { label: '验证失败', value: stats?.failedLogs ?? 0, color: 'text-red-400' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-background p-3"
        >
          <p className="text-xs text-muted-foreground">{card.label}</p>
          {isLoading ? (
            <Skeleton className="h-6 w-12 mt-1" />
          ) : (
            <p className={`text-xl font-semibold mt-1 ${card.color}`}>{card.value}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function RulesTab({
  selectedRuleId,
  onSelectRule,
  showSalt,
  onToggleSalt,
}: {
  selectedRuleId: string | null
  onSelectRule: (id: string) => void
  showSalt: Record<string, boolean>
  onToggleSalt: (id: string) => void
}) {
  const { data: rules, isLoading } = useDyeRules()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">染色规则列表</h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              新建规则
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CreateRuleDialog onClose={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>规则名称</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间窗口</TableHead>
                <TableHead>白名单</TableHead>
                <TableHead>调用次数</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <Badge variant={rule.enabled ? 'success' : 'secondary'}>
                      {rule.enabled ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>{rule.timeWindowSeconds}s</TableCell>
                  <TableCell>{rule._count?.whitelistEntries ?? 0}</TableCell>
                  <TableCell>{rule._count?.dyeLogs ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(rule.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectRule(rule.id)}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">暂无染色规则，点击上方按钮创建</p>
        </div>
      )}

      {selectedRuleId && (
        <RuleDetailDialog
          ruleId={selectedRuleId}
          showSalt={showSalt[selectedRuleId] ?? false}
          onToggleSalt={() => onToggleSalt(selectedRuleId)}
          onClose={() => onSelectRule('')}
        />
      )}
    </div>
  )
}

function CreateRuleDialog({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateDyeRule()
  const [form, setForm] = useState({
    name: '',
    description: '',
    salt: '',
    timeWindowSeconds: 300,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form, { onSuccess: () => onClose() })
  }

  const generateSalt = () => {
    const arr = new Uint8Array(32)
    crypto.getRandomValues(arr)
    const salt = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
    setForm((prev) => ({ ...prev, salt }))
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>新建染色规则</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label>规则名称</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="例如：默认染色规则"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>描述（可选）</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="规则用途说明"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>盐值 (Salt)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={generateSalt}
              className="text-xs h-7"
            >
              随机生成
            </Button>
          </div>
          <Input
            value={form.salt}
            onChange={(e) => setForm((prev) => ({ ...prev, salt: e.target.value }))}
            placeholder="至少8位"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>时间窗口 (秒)</Label>
          <Input
            type="number"
            min={60}
            max={86400}
            value={form.timeWindowSeconds}
            onChange={(e) => setForm((prev) => ({ ...prev, timeWindowSeconds: Number(e.target.value) }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? '创建中...' : '创建'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function RuleDetailDialog({
  ruleId,
  showSalt,
  onToggleSalt,
  onClose,
}: {
  ruleId: string
  showSalt: boolean
  onToggleSalt: () => void
  onClose: () => void
}) {
  const { data: rule, isLoading } = useDyeRule(ruleId)
  const updateMutation = useUpdateDyeRule(ruleId)
  const deleteMutation = useDeleteDyeRule()
  const [form, setForm] = useState<Partial<DyeRule>>({})
  const [isEditing, setIsEditing] = useState(false)

  if (isLoading || !rule) {
    return null
  }

  const currentForm = isEditing ? form : rule
  const allFields: Array<{ key: keyof DyeRule; label: string; type?: string }> = [
    { key: 'name', label: '规则名称' },
    { key: 'description', label: '描述' },
    { key: 'salt', label: '盐值' },
    { key: 'timeWindowSeconds', label: '时间窗口(秒)', type: 'number' },
    { key: 'headerSimulation', label: '模拟Header' },
    { key: 'headerSign', label: '签名Header' },
    { key: 'headerTimestamp', label: '时间戳Header' },
    { key: 'headerTraceId', label: 'TraceId Header' },
    { key: 'shadowRedisPrefix', label: '影子Redis前缀' },
    { key: 'shadowMqSuffix', label: '影子MQ后缀' },
  ]

  const handleSave = () => {
    updateMutation.mutate(form, { onSuccess: () => setIsEditing(false) })
  }

  const handleDelete = () => {
    if (confirm('确定要删除此规则吗？')) {
      deleteMutation.mutate(ruleId, { onSuccess: () => onClose() })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>规则详情 - {rule.name}</DialogTitle>
            <Badge variant={rule.enabled ? 'success' : 'secondary'}>
              {rule.enabled ? '启用' : '禁用'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {allFields.map(({ key, label, type }) => (
            <div key={key} className="grid grid-cols-4 gap-3 items-center">
              <Label className="text-right text-muted-foreground">{label}</Label>
              <div className="col-span-3 relative">
                {isEditing ? (
                  <Input
                    type={type || 'text'}
                    value={String(currentForm[key] ?? '')}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                      }))
                    }
                  />
                ) : key === 'salt' ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-accent/30 px-2 py-1.5 rounded font-mono">
                      {showSalt ? rule.salt : '••••••••••••'}
                    </code>
                    <Button variant="ghost" size="sm" onClick={onToggleSalt}>
                      {showSalt ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ) : (
                  <code className="text-sm bg-accent/30 px-2 py-1.5 rounded font-mono block">
                    {String(rule[key] ?? '-')}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            删除
          </Button>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  保存
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1.5" />
                编辑
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WhitelistTab({
  selectedRuleId,
  onSelectRule,
}: {
  selectedRuleId: string | null
  onSelectRule: (id: string) => void
}) {
  const { data: rules } = useDyeRules()
  const { data: ruleDetail } = useDyeRule(selectedRuleId)
  const addMutation = useAddWhitelist()
  const removeMutation = useRemoveWhitelist(selectedRuleId || '')
  const [newIp, setNewIp] = useState('')
  const [newNote, setNewNote] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const handleAdd = () => {
    if (!selectedRuleId || !newIp) return
    addMutation.mutate(
      { ruleId: selectedRuleId, ip: newIp, note: newNote || undefined },
      { onSuccess: () => { setNewIp(''); setNewNote(''); setAddDialogOpen(false) } }
    )
  }

  const handleRemove = (id: string) => {
    if (confirm('确定要移除此IP吗？')) {
      removeMutation.mutate(id)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">选择规则：</span>
          <Select value={selectedRuleId || ''} onValueChange={onSelectRule}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="请选择规则" />
            </SelectTrigger>
            <SelectContent>
              {rules?.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedRuleId && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                添加IP
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>添加白名单IP</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label>IP 地址</Label>
                  <Input
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder="例如：192.168.1.1 或 10.0.0.0/24"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>备注（可选）</Label>
                  <Input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="用途说明"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>取消</Button>
                <Button onClick={handleAdd} disabled={addMutation.isPending}>添加</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!selectedRuleId ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">请先选择一个染色规则</p>
        </div>
      ) : ruleDetail?.whitelistEntries && ruleDetail.whitelistEntries.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP 地址</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>添加时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ruleDetail.whitelistEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-sm">{entry.ip}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.note || '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(entry.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(entry.id)}
                      className="text-red-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      移除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">暂无白名单IP</p>
        </div>
      )}
    </div>
  )
}

function LogsTab() {
  const [filterRule, setFilterRule] = useState<string>('')
  const [filterAction, setFilterAction] = useState<DyeLogAction | ''>('')
  const [filterResult, setFilterResult] = useState<DyeLogResult | ''>('')
  const { data: rules } = useDyeRules()
  const { data: logs, isLoading } = useDyeLogs({
    ruleId: filterRule || undefined,
    action: filterAction || undefined,
    result: filterResult || undefined,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterRule} onValueChange={setFilterRule}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="全部规则" />
          </SelectTrigger>
          <SelectContent>
            {rules?.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAction} onValueChange={(v) => setFilterAction(v as DyeLogAction | '')}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部动作" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GENERATE">生成</SelectItem>
            <SelectItem value="VERIFY">验证</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterResult} onValueChange={(v) => setFilterResult(v as DyeLogResult | '')}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部结果" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SUCCESS">成功</SelectItem>
            <SelectItem value="FAILED">失败</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>规则</TableHead>
                <TableHead>动作</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>Trace ID</TableHead>
                <TableHead>客户端IP</TableHead>
                <TableHead>失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </TableCell>
                  <TableCell>{log.rule?.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{log.action === 'GENERATE' ? '生成' : '验证'}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.result === 'SUCCESS' ? (
                      <Badge variant="success">成功</Badge>
                    ) : (
                      <Badge variant="destructive">失败</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.traceId || '-'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.clientIp || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.reason || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">暂无染色日志</p>
        </div>
      )}
    </div>
  )
}

function ToolsTab() {
  const [toolMode, setToolMode] = useState<'generate' | 'verify'>('generate')
  const [selectedRuleId, setSelectedRuleId] = useState('')
  const [traceId, setTraceId] = useState('')
  const [verifyHeaders, setVerifyHeaders] = useState('')
  const [clientIp, setClientIp] = useState('')
  const [copied, setCopied] = useState(false)
  const { data: rules } = useDyeRules()
  const generateMutation = useGenerateDyeHeaders()
  const verifyMutation = useVerifyDyeHeaders()

  const handleGenerate = () => {
    if (!selectedRuleId) return
    generateMutation.mutate({
      ruleId: selectedRuleId,
      traceId: traceId || undefined,
    })
  }

  const handleVerify = () => {
    if (!selectedRuleId || !verifyHeaders) return
    try {
      const headers = JSON.parse(verifyHeaders)
      verifyMutation.mutate({
        ruleId: selectedRuleId,
        headers,
        clientIp: clientIp || undefined,
      })
    } catch {
      alert('请输入有效的 JSON 格式')
    }
  }

  const handleCopy = async () => {
    if (!generateMutation.data?.headers) return
    await copyToClipboard(JSON.stringify(generateMutation.data.headers, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant={toolMode === 'generate' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setToolMode('generate')}
          >
            <Play className="h-4 w-4 mr-1.5" />
            生成染色Header
          </Button>
          <Button
            variant={toolMode === 'verify' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setToolMode('verify')}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            验证染色Header
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>选择规则</Label>
          <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
            <SelectTrigger>
              <SelectValue placeholder="请选择染色规则" />
            </SelectTrigger>
            <SelectContent>
              {rules?.filter((r) => r.enabled).map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {toolMode === 'generate' ? (
          <div className="space-y-1.5">
            <Label>Trace ID（可选）</Label>
            <Input
              value={traceId}
              onChange={(e) => setTraceId(e.target.value)}
              placeholder="留空则不携带 Trace ID"
            />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>请求 Headers (JSON)</Label>
              <textarea
                className="w-full h-40 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                value={verifyHeaders}
                onChange={(e) => setVerifyHeaders(e.target.value)}
                placeholder={`{\n  "X-SecOps-Simulation": "True",\n  "X-SecOps-Sign": "...",\n  "X-SecOps-Timestamp": "..."\n}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>客户端 IP（可选）</Label>
              <Input
                value={clientIp}
                onChange={(e) => setClientIp(e.target.value)}
                placeholder="用于IP白名单校验"
              />
            </div>
          </>
        )}

        <Button
          onClick={toolMode === 'generate' ? handleGenerate : handleVerify}
          disabled={!selectedRuleId || (toolMode === 'verify' && !verifyHeaders)}
        >
          {toolMode === 'generate' ? '生成 Header' : '验证 Header'}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            {toolMode === 'generate' ? '生成结果' : '验证结果'}
          </h4>
          {toolMode === 'generate' && generateMutation.data?.headers && (
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {toolMode === 'generate' ? (
          generateMutation.isPending ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : generateMutation.data?.headers ? (
            <div className="rounded-lg border border-border p-4 bg-background">
              <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(generateMutation.data.headers, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">点击左侧按钮生成染色Header</p>
            </div>
          )
        ) : verifyMutation.isPending ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : verifyMutation.data ? (
          <div className={`rounded-lg border p-4 ${
            verifyMutation.data.valid
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {verifyMutation.data.valid ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <span className="font-medium text-emerald-400">验证通过</span>
                </>
              ) : (
                <>
                  <ShieldX className="h-5 w-5 text-red-400" />
                  <span className="font-medium text-red-400">验证失败</span>
                </>
              )}
            </div>
            <div className="space-y-2 text-sm">
              {verifyMutation.data.traceId && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Trace ID:</span>
                  <code className="font-mono">{verifyMutation.data.traceId}</code>
                </div>
              )}
              {verifyMutation.data.reason && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">失败原因:</span>
                  <span>{verifyMutation.data.reason}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">输入Headers并点击验证</p>
          </div>
        )}
      </div>
    </div>
  )
}
