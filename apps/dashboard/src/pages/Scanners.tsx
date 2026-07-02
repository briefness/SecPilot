import { useState } from 'react'
import {
  Cpu,
  Code2,
  Package,
  Globe,
  Smartphone,
  Zap,
  Settings,
  Edit,
  Save,
  AlertCircle,
  Power,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { useScanners, useScanner, useUpdateScanner, useToggleScanner, useScannerStats } from '@/hooks/useScanners'
import type { ScannerType, ScannerConfig } from '@/types'

const iconMap: Record<string, React.ElementType> = {
  Code2,
  Package,
  Globe,
  Smartphone,
  Zap,
}

const scannerCategoryMap: Record<ScannerType, string> = {
  STATIC_SAST: '静态分析',
  STATIC_SCA: '静态分析',
  DYNAMIC_DAST: '动态分析',
  DYNAMIC_PLAYWRIGHT: '动态分析',
  MOBILE_MOBSF: '移动安全',
  API_NUCLEI: '基础设施',
}

export default function Scanners() {
  const { data: scanners, isLoading } = useScanners()
  const { data: stats } = useScannerStats()
  const [selectedType, setSelectedType] = useState<ScannerType | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  return (
    <PageContainer
      title="扫描器配置"
      description="管理和配置平台支持的各类安全扫描器"
    >
      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">扫描器总数</p>
          <p className="text-xl font-semibold mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">已启用</p>
          <p className="text-xl font-semibold mt-1 text-emerald-400">{stats?.enabled ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">已禁用</p>
          <p className="text-xl font-semibold mt-1 text-muted-foreground">{stats?.disabled ?? 0}</p>
        </div>
      </div>

      {/* 扫描器列表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">扫描器列表</CardTitle>
          <CardDescription>
            平台集成的各类安全扫描引擎，支持启用/禁用和参数配置
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : scanners && scanners.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>扫描器名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最后更新</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanners.map((scanner) => {
                    const Icon = iconMap[scanner.icon || 'Cpu'] || Cpu
                    return (
                      <TableRow key={scanner.id}>
                        <TableCell>
                          <div className={`flex h-8 w-8 items-center justify-center rounded-md ${
                            scanner.enabled ? 'bg-foreground text-background' : 'bg-accent/50 text-muted-foreground'
                          }`}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{scanner.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {scanner.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs font-mono text-muted-foreground">
                            {scanner.type}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {scannerCategoryMap[scanner.type] || '其他'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={scanner.enabled ? 'success' : 'secondary'}>
                            {scanner.enabled ? '已启用' : '已禁用'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(scanner.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedType(scanner.type)
                              setEditOpen(true)
                            }}
                          >
                            <Settings className="h-3.5 w-3.5 mr-1" />
                            配置
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">暂无扫描器配置</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 配置对话框 */}
      {selectedType && (
        <ScannerConfigDialog
          type={selectedType}
          open={editOpen}
          onClose={() => {
            setEditOpen(false)
            setSelectedType(null)
          }}
        />
      )}
    </PageContainer>
  )
}

function ScannerConfigDialog({
  type,
  open,
  onClose,
}: {
  type: ScannerType
  open: boolean
  onClose: () => void
}) {
  const { data: scanner, isLoading } = useScanner(type)
  const updateMutation = useUpdateScanner(type)
  const toggleMutation = useToggleScanner(type)
  const [form, setForm] = useState<Partial<ScannerConfig> & { defaultParams?: string | Record<string, unknown> }>({})
  const [isEditing, setIsEditing] = useState(false)

  const currentData = isEditing ? form : scanner

  const handleEdit = () => {
    if (scanner) {
      setForm({
        name: scanner.name,
        description: scanner.description,
        defaultParams: scanner.defaultParams,
        docUrl: scanner.docUrl ?? '',
      })
      setIsEditing(true)
    }
  }

  const handleSave = async () => {
    if (!form.defaultParams) {
      updateMutation.mutate(
        {
          name: form.name,
          description: form.description,
          docUrl: form.docUrl || null,
        },
        { onSuccess: () => setIsEditing(false) }
      )
      return
    }

    try {
      const params = typeof form.defaultParams === 'string'
        ? JSON.parse(form.defaultParams)
        : form.defaultParams
      updateMutation.mutate(
        {
          name: form.name,
          description: form.description,
          defaultParams: params,
          docUrl: form.docUrl || null,
        },
        { onSuccess: () => setIsEditing(false) }
      )
    } catch {
      alert('默认参数格式错误，请输入有效的 JSON')
    }
  }

  const handleToggle = () => {
    toggleMutation.mutate()
  }

  if (!scanner && !isLoading) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {scanner?.name || '扫描器配置'}
              {scanner && (
                <Badge variant={scanner.enabled ? 'success' : 'secondary'}>
                  {scanner.enabled ? '已启用' : '已禁用'}
                </Badge>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : scanner ? (
          <div className="space-y-5 py-2">
            {/* 启用/禁用开关 */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
              <div>
                <p className="text-sm font-medium">启用扫描器</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  禁用后，该扫描器将不会出现在新建扫描任务的选项中
                </p>
              </div>
              <Button
                variant={scanner.enabled ? 'default' : 'secondary'}
                size="sm"
                onClick={handleToggle}
                disabled={toggleMutation.isPending || isEditing}
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                {scanner.enabled ? '已启用' : '已禁用'}
              </Button>
            </div>

            {/* 基本信息 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">基本信息</h4>

              <div className="space-y-1.5">
                <Label>扫描器名称</Label>
                {isEditing ? (
                  <Input
                    value={form.name ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm">{scanner.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>扫描器类型</Label>
                <code className="text-xs font-mono text-muted-foreground bg-accent/30 px-2 py-1.5 rounded block">
                  {scanner.type}
                </code>
              </div>

              <div className="space-y-1.5">
                <Label>描述</Label>
                {isEditing ? (
                  <textarea
                    value={form.description ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{scanner.description}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>文档链接</Label>
                {isEditing ? (
                  <Input
                    value={form.docUrl ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, docUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                ) : scanner.docUrl ? (
                  <a
                    href={scanner.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-foreground hover:underline break-all"
                  >
                    {scanner.docUrl}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>

            {/* 默认参数 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>默认参数配置 (JSON)</Label>
                {!isEditing && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    系统默认
                  </Badge>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={typeof form.defaultParams === 'string'
                    ? form.defaultParams
                    : JSON.stringify(form.defaultParams ?? scanner.defaultParams ?? {}, null, 2)}
                  onChange={(e) => setForm((prev) => ({ ...prev, defaultParams: e.target.value }) as Partial<ScannerConfig> & { defaultParams?: string | Record<string, unknown> })}
                  rows={12}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs resize-y focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              ) : (
                <pre className="p-3 rounded-lg bg-accent/20 border border-border overflow-x-auto text-xs font-mono text-muted-foreground max-h-64 overflow-y-auto">
                  {JSON.stringify(scanner.defaultParams, null, 2)}
                </pre>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                修改参数前请确认您了解各参数的含义，错误配置可能导致扫描任务失败
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {isEditing ? (
            <>
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-1.5" />
                保存配置
              </Button>
            </>
          ) : (
            <Button onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-1.5" />
              编辑配置
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
