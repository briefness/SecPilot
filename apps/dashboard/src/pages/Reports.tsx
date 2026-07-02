import { useState } from 'react'
import {
  BarChart3,
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ScanLine,
  Target,
  Calendar,
  Download,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useVulnerabilityTrend,
  useSeverityDistribution,
  useProjectCompliance,
  useScanSummary,
  useTopVulnerableProjects,
} from '@/hooks/useReports'
import { formatDate } from '@/lib/utils'

function StatusBadge({ status }: { status: 'compliant' | 'warning' | 'critical' | 'unknown' }) {
  const config = {
    compliant: { label: '合规', variant: 'success' as const, icon: CheckCircle2 },
    warning: { label: '告警', variant: 'warning' as const, icon: AlertTriangle },
    critical: { label: '严重', variant: 'critical' as const, icon: XCircle },
    unknown: { label: '未评估', variant: 'outline' as const, icon: HelpCircle },
  }
  const { label, variant, icon: Icon } = config[status]
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className="w-20 text-xs text-muted-foreground shrink-0">{item.label}</div>
          <div className="flex-1 h-6 bg-accent/30 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <div className="w-10 text-right text-xs font-medium">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function TrendChart({ data }: { data: { date: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1)
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((item) => (
        <div key={item.date} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-foreground/60 rounded-t transition-all duration-300"
            style={{ height: `${(item.total / max) * 100}%`, minHeight: item.total > 0 ? '4px' : '0' }}
          />
          <span className="text-[10px] text-muted-foreground">
            {item.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Reports() {
  const { data: trend, isLoading: trendLoading } = useVulnerabilityTrend()
  const { data: severityDist, isLoading: sevLoading } = useSeverityDistribution()
  const { data: compliance, isLoading: compLoading } = useProjectCompliance()
  const { data: scanSummary, isLoading: scanLoading } = useScanSummary()
  const { data: topProjects, isLoading: topLoading } = useTopVulnerableProjects()

  const severityBarData = severityDist
    ? [
        { label: 'Critical', value: severityDist.bySeverity.CRITICAL, color: '#ef4444' },
        { label: 'High', value: severityDist.bySeverity.HIGH, color: '#f97316' },
        { label: 'Medium', value: severityDist.bySeverity.MEDIUM, color: '#eab308' },
        { label: 'Low', value: severityDist.bySeverity.LOW, color: '#22c55e' },
        { label: 'Info', value: severityDist.bySeverity.INFO, color: '#6b7280' },
      ]
    : []

  return (
    <PageContainer
      title="报表中心"
      description="安全态势分析、项目合规评估与扫描统计报表"
    >
      <div className="flex items-center justify-end mb-6">
        <Button size="sm" variant="outline">
          <Download className="h-4 w-4 mr-1.5" />
          导出报表
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            总览
          </TabsTrigger>
          <TabsTrigger value="vulnerability" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            漏洞分析
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            合规评估
          </TabsTrigger>
          <TabsTrigger value="scans" className="gap-2">
            <ScanLine className="h-4 w-4" />
            扫描统计
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-xs">漏洞总数</span>
              </div>
              {sevLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-semibold">{severityDist?.total || 0}</p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs">合规项目</span>
              </div>
              {compLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div>
                  <p className="text-2xl font-semibold">{compliance?.summary.compliant || 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    合规率 {compliance?.summary.complianceRate || 0}%
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <ScanLine className="h-4 w-4" />
                <span className="text-xs">扫描总数</span>
              </div>
              {scanLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div>
                  <p className="text-2xl font-semibold">{scanSummary?.total || 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    成功率 {scanSummary?.successRate || 0}%
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">高风险项目</span>
              </div>
              {topLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-semibold text-destructive">{topProjects?.length || 0}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">30天漏洞趋势</CardTitle>
                <CardDescription>每日新增漏洞数量</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {trendLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <TrendChart data={trend?.map((t) => ({ date: t.date, total: t.total })) || []} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">漏洞严重程度分布</CardTitle>
                <CardDescription>按 CVSS 严重等级统计</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {sevLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : (
                  <BarChart data={severityBarData} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">高风险项目 Top 10</CardTitle>
                <CardDescription>按风险评分排序</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {topLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : topProjects && topProjects.length > 0 ? (
                  <div className="space-y-2">
                    {topProjects.slice(0, 5).map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 py-1.5">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-medium ${
                          i < 3 ? 'bg-foreground text-background' : 'bg-accent text-muted-foreground'
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-destructive font-medium">{p.critical}C</span>
                          <span className="text-orange-500 font-medium">{p.high}H</span>
                          <span className="text-yellow-500 font-medium">{p.medium}M</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    暂无数据
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">项目合规状态</CardTitle>
                <CardDescription>各项目安全合规概览</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {compLoading ? (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <Skeleton className="h-16 flex-1" />
                      <Skeleton className="h-16 flex-1" />
                    </div>
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-3 rounded-lg bg-accent/30">
                      <p className="text-2xl font-semibold">{compliance?.summary.compliant || 0}</p>
                      <p className="text-xs text-emerald-400 mt-0.5">合规</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent/30">
                      <p className="text-2xl font-semibold">{compliance?.summary.warning || 0}</p>
                      <p className="text-xs text-yellow-500 mt-0.5">告警</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent/30">
                      <p className="text-2xl font-semibold">{compliance?.summary.critical || 0}</p>
                      <p className="text-xs text-destructive mt-0.5">严重</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent/30">
                      <p className="text-2xl font-semibold">{compliance?.summary.unknown || 0}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">未评估</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vulnerability">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">30天漏洞趋势</CardTitle>
                <CardDescription>每日新增漏洞数量按严重等级分布</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {trendLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : trend && trend.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-red-500" />
                        <span className="text-muted-foreground">Critical</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-orange-500" />
                        <span className="text-muted-foreground">High</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-yellow-500" />
                        <span className="text-muted-foreground">Medium</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {trend.slice(-14).map((item) => (
                        <div key={item.date} className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground w-12 shrink-0">
                            {item.date.slice(5)}
                          </span>
                          <div className="flex-1 flex h-5 rounded overflow-hidden bg-accent/30">
                            {item.CRITICAL > 0 && (
                              <div className="bg-red-500 h-full" style={{ width: `${(item.CRITICAL / Math.max(item.total, 1)) * 100}%` }} />
                            )}
                            {item.HIGH > 0 && (
                              <div className="bg-orange-500 h-full" style={{ width: `${(item.HIGH / Math.max(item.total, 1)) * 100}%` }} />
                            )}
                            {item.MEDIUM > 0 && (
                              <div className="bg-yellow-500 h-full" style={{ width: `${(item.MEDIUM / Math.max(item.total, 1)) * 100}%` }} />
                            )}
                            {item.LOW > 0 && (
                              <div className="bg-green-500 h-full" style={{ width: `${(item.LOW / Math.max(item.total, 1)) * 100}%` }} />
                            )}
                          </div>
                          <span className="text-xs font-medium w-8 text-right">{item.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    暂无数据
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">严重程度分布</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {sevLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : (
                  <BarChart data={severityBarData} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">项目合规清单</CardTitle>
              <CardDescription>所有项目的安全合规状态</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {compLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : compliance && compliance.projects.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>项目名称</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>合规状态</TableHead>
                        <TableHead className="text-center">Critical</TableHead>
                        <TableHead className="text-center">High</TableHead>
                        <TableHead className="text-center">Medium</TableHead>
                        <TableHead className="text-center">Low</TableHead>
                        <TableHead>扫描次数</TableHead>
                        <TableHead>最近扫描</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compliance.projects.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.type}</TableCell>
                          <TableCell><StatusBadge status={p.status} /></TableCell>
                          <TableCell className="text-center text-sm text-destructive font-medium">{p.findingsCount.CRITICAL}</TableCell>
                          <TableCell className="text-center text-sm text-orange-500 font-medium">{p.findingsCount.HIGH}</TableCell>
                          <TableCell className="text-center text-sm text-yellow-500 font-medium">{p.findingsCount.MEDIUM}</TableCell>
                          <TableCell className="text-center text-sm text-green-500 font-medium">{p.findingsCount.LOW}</TableCell>
                          <TableCell className="text-sm">{p.totalScans}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.lastScanAt ? formatDate(p.lastScanAt) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无项目数据
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scans">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">扫描状态分布</CardTitle>
                <CardDescription>所有扫描任务的状态统计</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {scanLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : scanSummary ? (
                  <BarChart
                    data={[
                      { label: '已完成', value: scanSummary.byStatus.completed, color: '#22c55e' },
                      { label: '运行中', value: scanSummary.byStatus.running, color: '#3b82f6' },
                      { label: '失败', value: scanSummary.byStatus.failed, color: '#ef4444' },
                      { label: '等待中', value: scanSummary.byStatus.pending, color: '#6b7280' },
                    ]}
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">扫描类型分布</CardTitle>
                <CardDescription>按扫描类型统计任务数量</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {scanLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : scanSummary ? (
                  <BarChart
                    data={scanSummary.byType.map((t, i) => ({
                      label: t.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                      value: t.count,
                      color: ['#3b82f6', '#8b5cf6', '#f97316', '#22c55e', '#06b6d4'][i % 5],
                    }))}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}
