import { Bell, Search, User, LogOut, Settings, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { getUser, clearAuth } from '@/lib/auth'

export default function Topbar() {
  const navigate = useNavigate()
  const user = getUser()
  const [notifications] = useState(3)

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索项目、漏洞、扫描..."
            className="h-8 pl-8 text-sm bg-transparent border-border/50 focus:border-border"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                {notifications > 0 && (
                  <Badge
                    variant="critical"
                    className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] p-0 flex items-center justify-center text-[9px] font-medium"
                  >
                    {notifications}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">通知</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-8 px-1.5 hover:bg-accent">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex flex-col items-start gap-0 hidden sm:flex">
                <span className="text-xs font-medium leading-none">{user?.name || '用户'}</span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                  {user?.role === 'admin' ? '管理员' : user?.role === 'security' ? '安全团队' : '开发者'}
                </span>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="flex items-center gap-2.5 p-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || '用户'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email || 'user@example.com'}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
              <Settings className="h-3.5 w-3.5" />
              <span>设置</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-destructive focus:text-destructive text-sm"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
