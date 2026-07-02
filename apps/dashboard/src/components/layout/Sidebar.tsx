import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderGit2,
  ScanLine,
  Bug,
  ShieldAlert,
  GitBranch,
  Radio,
  Rocket,
  Shield,
  Cpu,
  Users,
  FileText,
  Settings,
  BarChart3,
  Smartphone,
  Key,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Layers,
  Target,
  Workflow,
  PieChart,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface MenuItem {
  title: string
  path: string
  icon: any
}

interface MenuGroup {
  title: string
  icon: any
  children: MenuItem[]
}

const menuGroups: Array<MenuItem | { group: true; title: string; icon: any; children: MenuItem[] }> = [
  {
    title: '总览',
    path: '/',
    icon: LayoutDashboard,
  },
  {
    group: true,
    title: '项目管理',
    icon: Layers,
    children: [
      { title: '项目列表', path: '/projects', icon: FolderGit2 },
      { title: '接入向导', path: '/onboarding', icon: Rocket },
      { title: 'App 发版', path: '/app-releases', icon: Smartphone },
      { title: '渗透测试', path: '/pentests', icon: Target },
    ],
  },
  {
    group: true,
    title: '安全运营',
    icon: Shield,
    children: [
      { title: '扫描任务', path: '/scans', icon: ScanLine },
      { title: '扫描器配置', path: '/scanners', icon: Cpu },
      { title: '漏洞管理', path: '/findings', icon: Bug },
      { title: 'Bypass 管理', path: '/bypass', icon: ShieldAlert },
    ],
  },
  {
    group: true,
    title: '流水线集成',
    icon: Workflow,
    children: [
      { title: '流水线总览', path: '/pipeline', icon: GitBranch },
      { title: 'GitHub 集成', path: '/github-integration', icon: GitBranch },
      { title: 'GitLab 集成', path: '/gitlab-integration', icon: GitBranch },
      { title: '流量染色', path: '/traffic', icon: Radio },
    ],
  },
  {
    group: true,
    title: '报告审计',
    icon: PieChart,
    children: [
      { title: '报表中心', path: '/reports', icon: BarChart3 },
      { title: '审计日志', path: '/audit-logs', icon: FileText },
    ],
  },
  {
    group: true,
    title: '系统管理',
    icon: Settings,
    children: [
      { title: '用户管理', path: '/users', icon: Users },
      { title: 'API 密钥', path: '/api-keys', icon: Key },
      { title: '系统设置', path: '/settings', icon: Settings },
    ],
  },
  {
    title: '集成文档',
    path: '/integration',
    icon: BookOpen,
  },
]

function isGroup(item: any): item is { group: true; title: string; icon: any; children: MenuItem[] } {
  return item.group === true
}

export default function Sidebar() {
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '安全运营': true,
    '流水线集成': true,
  })

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  const isGroupActive = (group: { children: MenuItem[] }) => {
    return group.children.some((child) => location.pathname === child.path)
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center gap-3 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-none">SecPilot</span>
          <span className="text-[11px] text-muted-foreground mt-0.5">Security Platform</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {menuGroups.map((item) => {
          if (!isGroup(item)) {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </NavLink>
            )
          }

          const GroupIcon = item.icon
          const open = openGroups[item.title] ?? isGroupActive(item)
          const active = isGroupActive(item)
          const Chevron = open ? ChevronDown : ChevronRight

          return (
            <div key={item.title} className="space-y-0.5">
              <button
                onClick={() => toggleGroup(item.title)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">{item.title}</span>
                <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              {open && (
                <div className="space-y-0.5 pl-2">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon
                    const isActive = location.pathname === child.path
                    return (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                          isActive
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        )}
                      >
                        <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{child.title}</span>
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-md bg-accent/30 p-3">
          <p className="text-[11px] font-medium text-foreground">安全提示</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">定期扫描项目，及时修复高危漏洞</p>
        </div>
      </div>
    </aside>
  )
}
