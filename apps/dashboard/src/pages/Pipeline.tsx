import { useState } from 'react'
import {
  GitBranch,
  Code2,
  Shield,
  CheckCircle2,
  PlayCircle,
  FileCode,
  Terminal,
  Copy,
  ChevronRight,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { copyToClipboard, formatDate } from '@/lib/utils'
import { usePipelineExecutions, usePipelineStats } from '@/hooks/usePipeline'
import type { PipelineStage, ScanStatus, ScanType } from '@/types'

const stages = [
  {
    id: 1,
    title: '代码提交',
    description: '开发者提交代码到版本控制系统',
    icon: Code2,
    details: '触发 Git Hook 进行本地预扫描',
  },
  {
    id: 2,
    title: 'CI 构建',
    description: '持续集成流水线自动构建和测试',
    icon: PlayCircle,
    details: '运行 SAST 静态代码分析和依赖扫描',
  },
  {
    id: 3,
    title: '安全扫描',
    description: '多维度安全扫描检测漏洞',
    icon: Shield,
    details: 'SAST / DAST / 依赖扫描 / 密钥扫描',
  },
  {
    id: 4,
    title: '部署上线',
    description: '通过安全门禁后部署到生产环境',
    icon: CheckCircle2,
    details: '严重漏洞阻断发布，中低危跟踪修复',
  },
]

const ciExamples = {
  github: `name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: SecOps Scan
        uses: secops/scan-action@v1
        with:
          api-key: \${{ secrets.SECOPS_API_KEY }}
          project-id: \${{ secrets.SECOPS_PROJECT_ID }}
          scan-types: sast,dependency,secret
          fail-on: critical,high`,
  gitlab: `stages:
  - test
  - security

security_scan:
  stage: security
  image: secops/scan-cli:latest
  script:
    - secops scan 
        --project-id $SECOPS_PROJECT_ID
        --api-key $SECOPS_API_KEY
        --scan-types sast,dependency,secret
        --fail-on critical,high
  only:
    - main
    - merge_requests
  variables:
    SECOPS_API_KEY: $SECOPS_API_KEY
    SECOPS_PROJECT_ID: $SECOPS_PROJECT_ID`,
  jenkins: `pipeline {
    agent any
    
    stages {
      stage('Security Scan') {
        steps {
          sh '''
            docker run --rm \\
              -v $(pwd):/src \\
              -e SECOPS_API_KEY=$SECOPS_API_KEY \\
              -e SECOPS_PROJECT_ID=$SECOPS_PROJECT_ID \\
              secops/scan-cli:latest scan \\
                --scan-types sast,dependency,secret \\
                --fail-on critical,high
          '''
        }
      }
    }
    
    environment {
      SECOPS_API_KEY = credentials('secops-api-key')
      SECOPS_PROJECT_ID = credentials('secops-project-id')
    }
  }`,
  cli: `# 安装 CLI 工具
npm install -g @secops/scan-cli

# 配置 API Key
secops config set api-key YOUR_API_KEY
secops config set project-id YOUR_PROJECT_ID

# 运行扫描
secops scan \\
  --scan-types sast,dependency,secret \\
  --fail-on critical,high \\
  --format json \\
  --output report.json

# 在 CI 中使用退出码判断
if [ $? -ne 0 ]; then
  echo "安全扫描失败，存在高危漏洞"
  exit 1
fi`,
}

const stageLabelMap: Record<PipelineStage, string> = {
  DAY_FAST_SCAN: '日间快速扫描',
  NIGHT_DEEP_SCAN: '夜间深度扫描',
  RELEASE_AUDIT: '发布审计',
  EMERGENCY_PATROL: '应急巡检',
}

const scanTypeLabelMap: Record<ScanType, string> = {
  STATIC_SAST: 'SAST 静态分析',
  STATIC_SCA: 'SCA 依赖扫描',
  DYNAMIC_H5: 'DAST 动态扫描',
  MOBILE_MOBSF: '移动安全扫描',
  API_NUCLEI: 'API 安全扫描',
}

const statusConfig: Record<ScanStatus, { label: string; variant: 'default' | 'success' | 'destructive' | 'secondary' }> = {
  PENDING: { label: '等待中', variant: 'secondary' },
  RUNNING: { label: '运行中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'success' },
  FAILED: { label: '失败', variant: 'destructive' },
  CANCELLED: { label: '已取消', variant: 'secondary' },
}

export default function Pipeline() {
  const [activeTab, setActiveTab] = useState('overview')
  const [copied, setCopied] = useState(false)
  const [filterStage, setFilterStage] = useState<PipelineStage | ''>('')
  const [filterStatus, setFilterStatus] = useState<ScanStatus | ''>('')

  const handleCopy = async (text: string) => {
    await copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageContainer
      title="CI/CD 流水线集成"
      description="将安全扫描集成到您的持续集成流水线中"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            执行总览
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-2">
            <Terminal className="h-4 w-4" />
            集成配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <PipelineOverview
            filterStage={filterStage}
            setFilterStage={setFilterStage}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
          />
        </TabsContent>

        <TabsContent value="integration" className="mt-4">
          <IntegrationContent
            copied={copied}
            handleCopy={handleCopy}
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function PipelineOverview({
  filterStage,
  setFilterStage,
  filterStatus,
  setFilterStatus,
}: {
  filterStage: PipelineStage | ''
  setFilterStage: (v: PipelineStage | '') => void
  filterStatus: ScanStatus | ''
  setFilterStatus: (v: ScanStatus | '') => void
}) {
  const { data: stats, isLoading: statsLoading } = usePipelineStats()
  const { data: executions, isLoading: execLoading } = usePipelineExecutions({
    stage: filterStage || undefined,
    status: filterStatus || undefined,
  })

  const statCards = [
    { label: '总执行次数', value: stats?.total ?? 0, icon: Activity, color: 'text-foreground' },
    { label: '运行中', value: stats?.running ?? 0, icon: Clock, color: 'text-cyan-400' },
    { label: '已完成', value: stats?.completed ?? 0, icon: CheckCircle, color: 'text-emerald-400' },
    { label: '失败', value: stats?.failed ?? 0, icon: XCircle, color: 'text-red-400' },
    { label: '今日执行', value: stats?.todayCount ?? 0, icon: PlayCircle, color: 'text-foreground' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{card.label}</span>
              </div>
              {statsLoading ? (
                <Skeleton className="h-6 w-12 mt-1" />
              ) : (
                <p className={`text-xl font-semibold mt-1 ${card.color}`}>{card.value}</p>
              )}
            </div>
          )
        })}
      </div>

      {stats?.stageDistribution && stats.stageDistribution.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.stageDistribution.map((item) => (
            <div
              key={item.stage}
              className="rounded-lg border border-border bg-background p-3"
            >
              <p className="text-xs text-muted-foreground">
                {stageLabelMap[item.stage] || item.stage}
              </p>
              <p className="text-xl font-semibold mt-1">{item.count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">执行记录</h3>
        <div className="flex-1" />
        <Select value={filterStage} onValueChange={(v) => setFilterStage(v as PipelineStage | '')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部阶段" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部阶段</SelectItem>
            <SelectItem value="DAY_FAST_SCAN">日间快速扫描</SelectItem>
            <SelectItem value="NIGHT_DEEP_SCAN">夜间深度扫描</SelectItem>
            <SelectItem value="RELEASE_AUDIT">发布审计</SelectItem>
            <SelectItem value="EMERGENCY_PATROL">应急巡检</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ScanStatus | '')}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部状态</SelectItem>
            <SelectItem value="pending">等待中</SelectItem>
            <SelectItem value="running">运行中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="failed">失败</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {execLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : executions && executions.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                <TableHead>扫描类型</TableHead>
                <TableHead>流水线阶段</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>触发时间</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>严重/高危/中危/低危</TableHead>
                <TableHead>Trace ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((exec) => {
                const status = statusConfig[exec.status]
                return (
                  <TableRow key={exec.id}>
                    <TableCell className="font-medium">{exec.project.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {scanTypeLabelMap[exec.type] || exec.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {exec.pipelineStage
                        ? stageLabelMap[exec.pipelineStage] || exec.pipelineStage
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(exec.triggeredAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {exec.durationSeconds
                        ? `${exec.durationSeconds}s`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      <span className="text-red-400">{exec.findingsCritical}</span>
                      {' / '}
                      <span className="text-orange-400">{exec.findingsHigh}</span>
                      {' / '}
                      <span className="text-yellow-400">{exec.findingsMedium}</span>
                      {' / '}
                      <span className="text-blue-400">{exec.findingsLow}</span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {exec.traceId ? exec.traceId.slice(0, 8) + '...' : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">暂无流水线执行记录</p>
        </div>
      )}
    </div>
  )
}

function IntegrationContent({
  copied,
  handleCopy,
}: {
  copied: boolean
  handleCopy: (text: string) => void
}) {
  const [activeTab, setActiveTab] = useState('github')

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-4">四阶段安全左移流程</h2>
        <div className="relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 z-0" />
          <div className="grid grid-cols-4 gap-4 relative z-10">
            {stages.map((stage) => {
              const Icon = stage.icon
              return (
                <Card key={stage.id}>
                  <CardContent className="p-4 text-center">
                    <div className="relative inline-block">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5 border border-border mx-auto mb-3">
                        <Icon className="h-7 w-7 text-foreground" />
                      </div>
                      <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                        {stage.id}
                      </div>
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{stage.title}</h3>
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                    <p className="text-xs text-foreground mt-2">{stage.details}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                集成配置示例
              </CardTitle>
              <CardDescription>
                选择您使用的 CI/CD 平台，复制配置代码到您的项目中
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="github">GitHub Actions</TabsTrigger>
                  <TabsTrigger value="gitlab">GitLab CI</TabsTrigger>
                  <TabsTrigger value="jenkins">Jenkins</TabsTrigger>
                  <TabsTrigger value="cli">CLI 工具</TabsTrigger>
                </TabsList>
                <TabsContent value="github">
                  <CodeBlock code={ciExamples.github} onCopy={() => handleCopy(ciExamples.github)} copied={copied} />
                </TabsContent>
                <TabsContent value="gitlab">
                  <CodeBlock code={ciExamples.gitlab} onCopy={() => handleCopy(ciExamples.gitlab)} copied={copied} />
                </TabsContent>
                <TabsContent value="jenkins">
                  <CodeBlock code={ciExamples.jenkins} onCopy={() => handleCopy(ciExamples.jenkins)} copied={copied} />
                </TabsContent>
                <TabsContent value="cli">
                  <CodeBlock code={ciExamples.cli} onCopy={() => handleCopy(ciExamples.cli)} copied={copied} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5" />
                安全门禁策略
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5" />
                <div>
                  <p className="text-sm font-medium text-red-400">严重漏洞</p>
                  <p className="text-xs text-muted-foreground">直接阻断流水线，禁止合并</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5" />
                <div>
                  <p className="text-sm font-medium text-orange-400">高危漏洞</p>
                  <p className="text-xs text-muted-foreground">默认阻断，可申请 Bypass</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-500">中危漏洞</p>
                  <p className="text-xs text-muted-foreground">警告提示，跟踪修复</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                <div>
                  <p className="text-sm font-medium text-blue-400">低危漏洞</p>
                  <p className="text-xs text-muted-foreground">仅记录，不阻断</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                支持的扫描类型
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: 'SAST', desc: '静态代码安全分析' },
                { name: 'DAST', desc: '动态应用安全测试' },
                { name: 'Dependency', desc: '第三方依赖漏洞扫描' },
                { name: 'Secret', desc: '密钥和敏感信息扫描' },
                { name: 'SCA', desc: '软件成分分析' },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/30">
                  <div>
                    <p className="text-sm font-medium font-mono">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Badge variant="success">已支持</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function CodeBlock({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 z-10"
        onClick={onCopy}
      >
        {copied ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
      <pre className="p-4 rounded-lg bg-background border border-border overflow-x-auto text-sm font-mono text-muted-foreground">
        <code>{code}</code>
      </pre>
    </div>
  )
}
