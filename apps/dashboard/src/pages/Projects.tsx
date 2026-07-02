import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderGit2,
  Search,
  Clock,
  ChevronRight,
  Github,
  Gitlab,
  Globe,
  Smartphone,
  Server,
  Layers,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useProjects } from '@/hooks/useProjects'
import { formatRelativeTime } from '@/lib/utils'
import type { ProjectType } from '@/types'

const projectTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  WEB: { label: 'Web 应用', icon: Globe, color: 'text-foreground' },
  MOBILE: { label: '移动应用', icon: Smartphone, color: 'text-foreground' },
  API: { label: 'API 服务', icon: Layers, color: 'text-foreground' },
  INFRA: { label: '基础设施', icon: Server, color: 'text-foreground' },
}

export default function Projects() {
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjects()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const filteredProjects = projects?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.gitRepo.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || p.type === typeFilter
    return matchesSearch && matchesType
  }) || []

  const getTypeIcon = (type: ProjectType) => {
    const config = projectTypeConfig[type]
    const Icon = config.icon
    return <Icon className={`h-3.5 w-3.5 ${config.color}`} />
  }

  return (
    <PageContainer
      title="项目管理"
      description="管理安全扫描项目，查看项目详情和漏洞情况"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索项目..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={typeFilter === 'all' ? 'default' : 'outline'} className="cursor-pointer h-6" onClick={() => setTypeFilter('all')}>
            全部
          </Badge>
          {(Object.keys(projectTypeConfig) as ProjectType[]).map((type) => (
            <Badge
              key={type}
              variant={typeFilter === type ? 'default' : 'outline'}
              className="cursor-pointer h-6"
              onClick={() => setTypeFilter(type)}
            >
              {projectTypeConfig[type].label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))
          : filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="transition-colors hover:bg-accent/30 cursor-pointer group"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium group-hover:text-foreground transition-colors">
                          {project.name}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-1">
                          {getTypeIcon(project.type)}
                          <span className="text-[11px] text-muted-foreground">
                            {projectTypeConfig[project.type].label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5 mb-4">
                    <a
                      href={project.gitRepo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.gitRepo.includes('github') ? (
                        <Github className="h-3 w-3" />
                      ) : project.gitRepo.includes('gitlab') ? (
                        <Gitlab className="h-3 w-3" />
                      ) : (
                        <FolderGit2 className="h-3 w-3" />
                      )}
                      <span className="truncate max-w-[180px] font-mono">
                        {project.gitRepo.replace(/^https?:\/\//, '')}
                      </span>
                    </a>
                  </div>

                  <div className="grid grid-cols-4 gap-px rounded-md bg-border overflow-hidden">
                    <div className="bg-card p-2 text-center">
                      <p className="text-sm font-semibold text-risk-critical">{project.findingSummary.CRITICAL}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">严重</p>
                    </div>
                    <div className="bg-card p-2 text-center">
                      <p className="text-sm font-semibold text-risk-high">{project.findingSummary.HIGH}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">高危</p>
                    </div>
                    <div className="bg-card p-2 text-center">
                      <p className="text-sm font-semibold text-risk-medium">{project.findingSummary.MEDIUM}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">中危</p>
                    </div>
                    <div className="bg-card p-2 text-center">
                      <p className="text-sm font-semibold text-risk-low">{project.findingSummary.LOW}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">低危</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {project.lastScanAt ? formatRelativeTime(project.lastScanAt) : '未扫描'}
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {project.findingSummary.CRITICAL + project.findingSummary.HIGH > 10 ? '高风险' : '正常'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {!isLoading && filteredProjects.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <FolderGit2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || typeFilter !== 'all' ? '未找到匹配的项目' : '暂无项目'}
            </p>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}
