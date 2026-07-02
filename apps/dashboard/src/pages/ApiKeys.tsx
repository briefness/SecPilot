import { useState } from 'react'
import PageContainer from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys'
import { useProjects } from '@/hooks/useProjects'
import { useUsers } from '@/hooks/useUsers'
import type { ApiKeyScope, ApiKey } from '@/types'

const scopeConfig: Record<ApiKeyScope, { label: string; color: string; desc: string }> = {
  SCANNER: { label: '扫描器', color: 'bg-blue-500', desc: '扫描结果上报' },
  CI_CD: { label: 'CI/CD', color: 'bg-purple-500', desc: '流水线卡点校验' },
  GATEWAY: { label: '网关', color: 'bg-amber-500', desc: '流量染色验签' },
  WEBHOOK: { label: 'Webhook', color: 'bg-green-500', desc: '事件回调接收' },
  READ_ONLY: { label: '只读', color: 'bg-slate-500', desc: '数据读取' },
  ADMIN: { label: '管理员', color: 'bg-red-500', desc: '全部权限' },
}

export default function ApiKeysPage() {
  const [projectFilter, setProjectFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ApiKeyScope | ''>('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [showKey, setShowKey] = useState<ApiKey | null>(null)
  const [form, setForm] = useState({
    name: '',
    scope: 'READ_ONLY' as ApiKeyScope,
    projectId: '',
    expiresAt: '',
  })

  const { data: apiKeys, isLoading } = useApiKeys({
    projectId: projectFilter || undefined,
    scope: scopeFilter || undefined,
  })

  const { data: projects } = useProjects()
  const { data: users } = useUsers()
  const createMutation = useCreateApiKey()
  const revokeMutation = useRevokeApiKey()

  const filtered = (apiKeys || []).filter(
    (k) =>
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      k.keyPrefix.toLowerCase().includes(search.toLowerCase())
  )

  const resetForm = () => {
    setForm({ name: '', scope: 'READ_ONLY', projectId: '', expiresAt: '' })
  }

  const handleCreate = async () => {
    if (!form.name) return
    const result = await createMutation.mutateAsync({
      name: form.name,
      scope: form.scope,
      projectId: form.projectId || undefined,
      expiresAt: form.expiresAt || undefined,
    })
    setShowKey(result)
    setCreateOpen(false)
    resetForm()
  }

  const getUserName = (id: string) => {
    return users?.data?.find((u: any) => u.id === id)?.name || id.slice(0, 8)
  }

  return (
    <PageContainer
      title="API 密钥管理"
      description="管理外部系统接入的 API 密钥"
      actions={
        <Button onClick={() => setCreateOpen(true)}>
          <span className="mr-2">+</span>新建密钥
        </Button>
      }
    >
      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>搜索</Label>
            <Input
              placeholder="名称 / 前缀..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>项目</Label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="全部项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部项目</SelectItem>
                {projects?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>权限范围</Label>
            <Select
              value={scopeFilter}
              onValueChange={(v) => setScopeFilter(v as ApiKeyScope | '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="全部范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部范围</SelectItem>
                {Object.entries(scopeConfig).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left font-medium px-4 py-3">名称</th>
                <th className="text-left font-medium px-4 py-3">前缀</th>
                <th className="text-left font-medium px-4 py-3">范围</th>
                <th className="text-left font-medium px-4 py-3">项目</th>
                <th className="text-left font-medium px-4 py-3">创建人</th>
                <th className="text-left font-medium px-4 py-3">最后使用</th>
                <th className="text-left font-medium px-4 py-3">过期时间</th>
                <th className="text-right font-medium px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">加载中...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">暂无 API 密钥</td>
                </tr>
              ) : (
                filtered.map((k) => (
                  <tr key={k.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {k.keyPrefix}***
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={scopeConfig[k.scope].color + ' text-white border-0'}>
                        {scopeConfig[k.scope].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.project?.name || '全局'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{getUserName(k.createdBy)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('zh-CN') : '未使用'}
                    </td>
                    <td className="px-4 py-3">
                      {k.expiresAt
                        ? (
                          <span className={new Date(k.expiresAt) < new Date() ? 'text-red-500' : ''}>
                            {new Date(k.expiresAt).toLocaleDateString('zh-CN')}
                          </span>
                        )
                        : '永不过期'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('确定要吊销此 API 密钥吗？此操作不可撤销。')) {
                            revokeMutation.mutate(k.id)
                          }
                        }}
                      >
                        吊销
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>新建 API 密钥</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>密钥名称 *</Label>
              <Input
                placeholder="例如：SonarQube 扫描器"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>权限范围</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as ApiKeyScope })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(scopeConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <div className="flex flex-col">
                        <span>{v.label}</span>
                        <span className="text-xs text-muted-foreground">{v.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>绑定项目（可选）</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger><SelectValue placeholder="全局 - 可访问所有项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全局 - 可访问所有项目</SelectItem>
                  {projects?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>过期时间（可选）</Label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">留空表示永不过期</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); resetForm() }}>取消</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.name}>
              {createMutation.isPending ? '创建中...' : '创建密钥'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showKey} onOpenChange={(open) => !open && setShowKey(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>API 密钥已创建</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <strong>重要：</strong> 此密钥只会显示一次，请立即保存到安全的地方。关闭此对话框后将无法再次查看完整密钥。
            </div>
            <div className="space-y-2">
              <Label>密钥</Label>
              <div className="flex gap-2">
                <Input value={showKey?.rawKey || ''} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(showKey?.rawKey || '')}
                >
                  复制
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">名称</p>
                <p className="font-medium">{showKey?.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">范围</p>
                <p className="font-medium">{showKey ? scopeConfig[showKey.scope].label : ''}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKey(null)}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
