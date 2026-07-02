import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import {
  FolderGit2,
  Bug,
  ScanLine,
  AlertTriangle,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useDashboardStats } from '@/hooks/useDashboard'
import { useScans } from '@/hooks/useScans'
import { formatRelativeTime, truncateId } from '@/lib/utils'
import type { ScanStatus, RiskLevel, ScanType } from '@/types'

const statusConfig: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  PENDING: { label: '等待中', variant: 'info', icon: Clock },
  RUNNING: { label: '运行中', variant: 'warning', icon: Loader2 },
  COMPLETED: { label: '已完成', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: '失败', variant: 'critical', icon: XCircle },
  CANCELLED: { label: '已取消', variant: 'outline', icon: XCircle },
}

const severityColors: Record<RiskLevel, string> = {
  CRITICAL: '#f87171',
  HIGH: '#fb923c',
  MEDIUM: '#facc15',
  LOW: '#4ade80',
  INFO: '#60a5fa',
}

const scanTypeLabels: Record<string, string> = {
  STATIC_SAST: 'SAST 静态分析',
  STATIC_SCA: 'SCA 依赖扫描',
  DYNAMIC_H5: 'H5 动态扫描',
  MOBILE_MOBSF: '移动安全扫描',
  API_NUCLEI: 'API 漏洞扫描',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: scans, isLoading: scansLoading } = useScans()

  const isLoading = statsLoading || scansLoading
  const recentScans = scans?.slice(0, 3) || []

  const trendOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0c0c10',
      borderColor: '#1f1f23',
      borderWidth: 1,
      textStyle: { color: '#fafafa', fontSize: 11 },
      padding: [6, 8],
    },
    grid: {
      left: 0,
      right: 8,
      bottom: 0,
      top: 24,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: stats?.findingsTrend.map((t) => t.date) || [],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#71717a', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#71717a', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1f1f23', type: 'dashed' } },
    },
    series: [
      {
        name: '新增漏洞',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        data: stats?.findingsTrend.map((t) => t.count) || [],
        lineStyle: { color: '#fafafa', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(250, 250, 250, 0.08)' },
              { offset: 1, color: 'rgba(250, 250, 250, 0)' },
            ],
          },
        },
        itemStyle: { color: '#fafafa' },
        emphasis: {
          focus: 'series',
          itemStyle: { borderWidth: 2, borderColor: '#0c0c10' },
        },
      },
    ],
  }

  const severityOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0c0c10',
      borderColor: '#1f1f23',
      borderWidth: 1,
      textStyle: { color: '#fafafa', fontSize: 11 },
      padding: [6, 8],
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { color: '#71717a', fontSize: 11 },
      formatter: (name: string) => name,
    },
    series: [
      {
        name: '严重程度',
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['30%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 2,
          borderColor: '#0c0c10',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: false },
        },
        data: stats ? [
          { value: stats.severityDistribution.CRITICAL, name: '严重' },
          { value: stats.severityDistribution.HIGH, name: '高危' },
          { value: stats.severityDistribution.MEDIUM, name: '中危' },
          { value: stats.severityDistribution.LOW, name: '低危' },
          { value: stats.severityDistribution.INFO, name: '信息' },
        ] : [],
        color: ['#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa'],
      },
    ],
  }

  const scanTypeOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0c0c10',
      borderColor: '#1f1f23',
      borderWidth: 1,
      textStyle: { color: '#fafafa', fontSize: 11 },
      padding: [6, 8],
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { color: '#71717a', fontSize: 11 },
    },
    series: [
      {
        name: '扫描类型',
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['30%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 2,
          borderColor: '#0c0c10',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: false },
        },
        data: stats ? [
          { value: stats.scanTypeDistribution.STATIC_SAST, name: 'SAST' },
          { value: stats.scanTypeDistribution.STATIC_SCA, name: 'SCA' },
          { value: stats.scanTypeDistribution.DYNAMIC_H5, name: 'H5' },
          { value: stats.scanTypeDistribution.MOBILE_MOBSF, name: '移动' },
          { value: stats.scanTypeDistribution.API_NUCLEI, name: 'API' },
        ] : [],
        color: ['#fafafa', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'],
      },
    ],
  }

  const statCards = [
    {
      title: '项目总数',
      value: stats?.totalProjects || 0,
      icon: FolderGit2,
      trend: '+12%',
      trendUp: true,
      navigateTo: '/projects',
    },
    {
      title: '漏洞总数',
      value: stats?.totalFindings || 0,
      icon: Bug,
      trend: '+5%',
      trendUp: true,
      navigateTo: '/findings',
    },
    {
      title: '今日扫描',
      value: stats?.scansToday || 0,
      icon: ScanLine,
      trend: '+8%',
      trendUp: true,
      navigateTo: '/scans',
    },
    {
      title: '高危漏洞',
      value: stats?.criticalFindings || 0,
      icon: AlertTriangle,
      trend: '-3%',
      trendUp: false,
      navigateTo: '/findings',
    },
  ]

  return (
    <PageContainer
      title="安全总览"
      description="监控安全态势，跟踪漏洞分布和扫描状态"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-lg border border-border bg-border overflow-hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card p-5">
                <Skeleton className="h-16 w-full" />
              </div>
            ))
          : statCards.map((stat) => {
              const Icon = stat.icon
              return (
                <div
                  key={stat.title}
                  className="bg-card p-5 transition-colors hover:bg-accent/30 cursor-pointer"
                  onClick={() => navigate(stat.navigateTo)}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{stat.title}</p>
                      <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                      <div className={`flex items-center gap-0.5 text-[11px] ${stat.trendUp ? 'text-risk-low' : 'text-risk-critical'}`}>
                        {stat.trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {stat.trend}
                        <span className="text-muted-foreground ml-1">较上周</span>
                      </div>
                    </div>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )
            })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-medium">7 天趋势</CardTitle>
                <CardDescription className="text-xs">漏洞发现趋势</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ReactECharts option={trendOption} style={{ height: '240px' }} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-medium">最近扫描</CardTitle>
                <CardDescription className="text-xs">最新的扫描任务执行情况</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/scans')} className="h-7 text-xs">
                查看全部 <ChevronRight className="ml-0.5 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="py-3">
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ))
                  : recentScans.map((scan) => {
                      const StatusIcon = statusConfig[scan.status].icon
                      return (
                        <div
                          key={scan.id}
                          className="flex items-center justify-between py-3 first:pt-0 last:pb-0 transition-colors hover:bg-accent/20 -mx-2 px-2 rounded cursor-pointer"
                          onClick={() => navigate('/scans')}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                              <StatusIcon className={`h-3.5 w-3.5 text-muted-foreground ${scan.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{scan.project.name}</p>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                {truncateId(scan.id)} · {scanTypeLabels[scan.type]}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={statusConfig[scan.status].variant as 'success' | 'warning' | 'critical' | 'info' | 'outline'} className="text-[10px] h-5">
                              {statusConfig[scan.status].label}
                            </Badge>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {scan.startedAt ? formatRelativeTime(scan.startedAt) : '-'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">风险等级分布</CardTitle>
              <CardDescription className="text-xs">按严重程度统计漏洞</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={severityOption} style={{ height: '200px' }} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">扫描类型分布</CardTitle>
              <CardDescription className="text-xs">各类型扫描数量统计</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={scanTypeOption} style={{ height: '200px' }} />
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer"
            onClick={() => navigate('/projects')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" />
                高风险项目
              </CardTitle>
              <CardDescription className="text-xs">漏洞最多的项目排名</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-3">
                {stats?.topProjectsByFindings.slice(0, 3).map((project, index) => (
                  <div key={project.projectId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-mono text-muted-foreground w-4 text-center">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{project.projectName}</p>
                        <p className="text-[11px] text-muted-foreground">{project.count} 个漏洞</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-risk-critical">{project.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
