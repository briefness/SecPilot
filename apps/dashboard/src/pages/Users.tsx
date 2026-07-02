import { useState } from 'react'
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Shield,
  ShieldAlert,
  Eye,
  Code2,
  UserCheck,
  UserX,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { useUsers, useUserStats, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/useUsers'
import type { UserRole, User } from '@/types'

const roleConfig: Record<UserRole, { label: string; variant: 'default' | 'success' | 'warning' | 'info' | 'outline'; icon: React.ElementType }> = {
  ADMIN: { label: '管理员', variant: 'default', icon: Shield },
  AUDITOR: { label: '审计员', variant: 'warning', icon: ShieldAlert },
  DEVELOPER: { label: '开发者', variant: 'success', icon: Code2 },
  VIEWER: { label: '查看者', variant: 'info', icon: Eye },
}

export default function UsersPage() {
  const { data: usersData, isLoading } = useUsers()
  const { data: stats } = useUserStats()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    role: 'DEVELOPER' as UserRole,
  })

  const filteredUsers = usersData?.data.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  }) || []

  const handleCreate = () => {
    createUser.mutate(formData, {
      onSuccess: () => {
        setCreateOpen(false)
        setFormData({ email: '', name: '', password: '', role: 'DEVELOPER' })
      },
    })
  }

  const handleEdit = (user: User) => {
    setEditUser(user)
    setFormData({ email: user.email, name: user.name, password: '', role: user.role })
  }

  const handleUpdate = () => {
    if (!editUser) return
    const updateData: Partial<{ name: string; role: UserRole; password: string; mfaEnabled: boolean }> = {
      name: formData.name,
      role: formData.role,
    }
    if (formData.password) updateData.password = formData.password
    updateUser.mutate({ id: editUser.id, data: updateData }, {
      onSuccess: () => {
        setEditUser(null)
        setFormData({ email: '', name: '', password: '', role: 'DEVELOPER' })
      },
    })
  }

  const handleDelete = (id: string) => {
    if (confirm('确定删除该用户？此操作不可撤销。')) {
      deleteUser.mutate(id)
    }
  }

  return (
    <PageContainer
      title="用户管理"
      description="管理平台用户、角色权限和访问控制"
    >
      <div className="grid grid-cols-4 gap-3 mb-6 max-w-xl">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">用户总数</p>
          <p className="text-xl font-semibold mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">管理员</p>
          <p className="text-xl font-semibold mt-1">{stats?.byRole.ADMIN ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">开发者</p>
          <p className="text-xl font-semibold mt-1">{stats?.byRole.DEVELOPER ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">审计员</p>
          <p className="text-xl font-semibold mt-1">{stats?.byRole.AUDITOR ?? 0}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">用户列表</CardTitle>
              <CardDescription>
                管理平台所有用户及其角色权限
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              新建用户
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户名或邮箱..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                <SelectItem value="ADMIN">管理员</SelectItem>
                <SelectItem value="DEVELOPER">开发者</SelectItem>
                <SelectItem value="AUDITOR">审计员</SelectItem>
                <SelectItem value="VIEWER">查看者</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>MFA</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const { label, variant, icon: RoleIcon } = roleConfig[user.role]
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
                              <span className="text-xs font-medium">{user.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="font-medium text-sm">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={variant} className="gap-1">
                            <RoleIcon className="h-3 w-3" />
                            {label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.mfaEnabled ? (
                            <Badge variant="success" className="gap-1">
                              <UserCheck className="h-3 w-3" />
                              已启用
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <UserX className="h-3 w-3" />
                              未启用
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-border py-12 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">暂无用户</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="用户姓名"
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>初始密码</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少 8 位字符"
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select
                value={formData.role}
                onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                  <SelectItem value="DEVELOPER">开发者</SelectItem>
                  <SelectItem value="AUDITOR">审计员</SelectItem>
                  <SelectItem value="VIEWER">查看者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={createUser.isPending}>
              {createUser.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input value={formData.email} disabled />
            </div>
            <div className="space-y-2">
              <Label>新密码 <span className="text-xs text-muted-foreground">(留空不修改)</span></Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少 8 位字符"
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select
                value={formData.role}
                onValueChange={(v) => setFormData({ ...formData, role: v as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                  <SelectItem value="DEVELOPER">开发者</SelectItem>
                  <SelectItem value="AUDITOR">审计员</SelectItem>
                  <SelectItem value="VIEWER">查看者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditUser(null)}>取消</Button>
            <Button onClick={handleUpdate} disabled={updateUser.isPending}>
              {updateUser.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
