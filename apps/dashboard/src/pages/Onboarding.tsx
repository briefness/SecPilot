import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe,
  Smartphone,
  Layers,
  Server,
  Rocket,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Code2,
  Shield,
  PlayCircle,
  FileCode,
  Zap,
  Target,
} from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { copyToClipboard } from '@/lib/utils'
import { useCreateProject } from '@/hooks/useProjects'
import type { ProjectType } from '@/types'

const projectTypes: Array<{
  id: ProjectType
  label: string
  description: string
  icon: React.ElementType
  features: string[]
}> = [
  {
    id: 'WEB',
    label: 'Web 应用',
    description: 'H5 单页应用、前端网站',
    icon: Globe,
    features: ['SAST 静态扫描', 'DAST 动态扫描', '依赖漏洞检测'],
  },
  {
    id: 'API',
    label: 'API 服务',
    description: '后端接口、微服务网关',
    icon: Layers,
    features: ['API 安全扫描', 'Nuclei 漏洞检测', '基础架构审计'],
  },
  {
    id: 'MOBILE',
    label: '移动应用',
    description: 'iOS / Android 客户端安装包',
    icon: Smartphone,
    features: ['MobSF 静态逆向', '隐私合规检测', '密钥泄露扫描'],
  },
  {
    id: 'INFRA',
    label: '基础设施',
    description: '云服务、容器、K8s 集群',
    icon: Server,
    features: ['基础设施 CVE 扫描', '配置合规审计', '容器安全检测'],
  },
]

const scanPlans = [
  {
    id: 'fast',
    name: '快速扫描',
    description: '仅运行 SAST 和依赖扫描，耗时 1-3 分钟',
    icon: Zap,
    scanners: ['SAST 静态分析', 'SCA 依赖扫描'],
    duration: '1-3 分钟',
    recommended: false,
  },
  {
    id: 'standard',
    name: '标准扫描',
    description: '包含静态 + 动态扫描，推荐用于日常开发',
    icon: Shield,
    scanners: ['SAST 静态分析', 'SCA 依赖扫描', 'DAST 动态扫描'],
    duration: '10-30 分钟',
    recommended: true,
  },
  {
    id: 'deep',
    name: '深度扫描',
    description: '全量扫描 + 业务逻辑遍历，用于发版前',
    icon: Target,
    scanners: ['SAST 静态分析', 'SCA 依赖扫描', 'DAST 深度扫描', '业务逻辑遍历'],
    duration: '30-60 分钟',
    recommended: false,
  },
]

const steps = [
  { id: 1, title: '选择类型', description: '选择项目类型' },
  { id: 2, title: '项目信息', description: '填写基本信息' },
  { id: 3, title: '扫描配置', description: '选择扫描方案' },
  { id: 4, title: '完成接入', description: '获取接入配置' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [projectType, setProjectType] = useState<ProjectType | null>(null)
  const [projectInfo, setProjectInfo] = useState({
    name: '',
    gitRepo: '',
    targetUrl: '',
  })
  const [scanPlan, setScanPlan] = useState('standard')
  const [createdProject, setCreatedProject] = useState<{
    id: string
    name: string
    productId: string
  } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const createMutation = useCreateProject()

  const generateProductId = (name: string): string => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
    if (slug) return slug
    const random = Math.random().toString(36).slice(2, 10)
    return `project-${random}`
  }

  const handleCopy = async (text: string, field: string) => {
    await copyToClipboard(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return projectType !== null
      case 2:
        return projectInfo.name.trim() !== '' && projectInfo.gitRepo.trim() !== ''
      case 3:
        return scanPlan !== ''
      default:
        return false
    }
  }

  const handleNext = async () => {
    if (currentStep < 4) {
      if (currentStep === 3) {
        const productId = generateProductId(projectInfo.name)
        try {
          const project = await createMutation.mutateAsync({
            name: projectInfo.name,
            productId,
            gitRepo: projectInfo.gitRepo,
            type: projectType as ProjectType,
          })
          setCreatedProject({
            id: project.id,
            name: project.name,
            productId: project.productId,
          })
          setCurrentStep(4)
        } catch {
          // 错误由 mutation 处理
        }
      } else {
        setCurrentStep(currentStep + 1)
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const selectedType = projectTypes.find((t) => t.id === projectType)
  const selectedPlan = scanPlans.find((p) => p.id === scanPlan)

  const ciConfig = createdProject
    ? generateCIConfig(createdProject.productId, projectType as ProjectType, scanPlan)
    : ''

  return (
    <PageContainer
      title="接入向导"
      description="四步完成安全扫描接入，保护您的项目安全"
    >
      <div className="max-w-3xl mx-auto">
        {/* 步骤指示器 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                      currentStep > step.id
                        ? 'border-emerald-500 bg-emerald-500 text-background'
                        : currentStep === step.id
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      step.id
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-xs font-medium">{step.title}</p>
                    <p className="text-[10px] text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`h-0.5 w-16 mx-2 ${
                    currentStep > step.id ? 'bg-emerald-500' : 'bg-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 步骤内容 */}
        <Card>
          <CardContent className="p-6">
            {/* 步骤 1：选择项目类型 */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">选择项目类型</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    选择您要接入的项目类型，我们将为您推荐最适合的扫描方案
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {projectTypes.map((type) => {
                    const Icon = type.icon
                    const isSelected = projectType === type.id
                    return (
                      <div
                        key={type.id}
                        onClick={() => setProjectType(type.id)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-foreground bg-accent/30'
                            : 'border-border hover:border-foreground/50 hover:bg-accent/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-md ${
                            isSelected ? 'bg-foreground text-background' : 'bg-accent/50'
                          }`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm">{type.label}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {type.features.map((f) => (
                                <Badge key={f} variant="secondary" className="text-[10px] h-4 px-1.5">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 步骤 2：填写项目信息 */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">填写项目信息</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    填写项目的基本信息，用于创建项目和配置扫描任务
                  </p>
                </div>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label>项目名称 *</Label>
                    <Input
                      value={projectInfo.name}
                      onChange={(e) => setProjectInfo((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="例如：支付网关服务"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>代码仓库地址 *</Label>
                    <Input
                      value={projectInfo.gitRepo}
                      onChange={(e) => setProjectInfo((prev) => ({ ...prev, gitRepo: e.target.value }))}
                      placeholder="例如：https://github.com/your-org/payment-service"
                    />
                  </div>
                  {projectType === 'WEB' || projectType === 'API' ? (
                    <div className="space-y-1.5">
                      <Label>目标地址（可选）</Label>
                      <Input
                        value={projectInfo.targetUrl}
                        onChange={(e) => setProjectInfo((prev) => ({ ...prev, targetUrl: e.target.value }))}
                        placeholder="例如：https://staging.yourdomain.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        用于动态黑盒扫描的测试环境地址
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg bg-accent/20 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      产品 ID 将自动生成：
                    </span>
                    <code className="text-xs font-mono text-foreground">
                      {projectInfo.name ? generateProductId(projectInfo.name) : 'your-project-id'}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {/* 步骤 3：选择扫描方案 */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">选择扫描方案</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    根据项目类型和安全需求，选择合适的扫描方案
                  </p>
                </div>
                <div className="space-y-3">
                  {scanPlans.map((plan) => {
                    const Icon = plan.icon
                    const isSelected = scanPlan === plan.id
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setScanPlan(plan.id)}
                        className={`relative p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-foreground bg-accent/30'
                            : 'border-border hover:border-foreground/50 hover:bg-accent/20'
                        }`}
                      >
                        {plan.recommended && (
                          <Badge className="absolute top-3 right-3 text-[10px] h-5">
                            推荐
                          </Badge>
                        )}
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-md ${
                            isSelected ? 'bg-foreground text-background' : 'bg-accent/50'
                          }`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">{plan.name}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {plan.scanners.map((s) => (
                                <Badge key={s} variant="secondary" className="text-[10px] h-4 px-1.5">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">预计耗时</p>
                            <p className="text-sm font-medium">{plan.duration}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 步骤 4：完成接入 */}
            {currentStep === 4 && createdProject && selectedType && selectedPlan && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 mx-auto mb-3">
                    <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                  </div>
                  <h2 className="text-lg font-semibold">项目创建成功！</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    复制以下配置到您的 CI/CD 流水线中，即可开启安全扫描
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    接入凭证
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">项目 ID</Label>
                      <div className="flex">
                        <Input
                          value={createdProject.productId}
                          readOnly
                          className="font-mono text-xs h-8 rounded-r-none"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 rounded-l-none border-l-0"
                          onClick={() => handleCopy(createdProject.productId, 'productId')}
                        >
                          {copiedField === 'productId' ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">项目类型</Label>
                      <div className="h-8 px-3 rounded-md border border-border flex items-center text-sm">
                        {selectedType.label}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-accent/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      💡 API Key 功能开发中，当前请使用登录账号的 JWT Token 进行 API 调用。
                      正式环境建议使用独立的 API Key，敬请期待。
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <PlayCircle className="h-4 w-4" />
                    CI/CD 配置（GitHub Actions）
                  </h3>
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 z-10"
                      onClick={() => handleCopy(ciConfig, 'ciConfig')}
                    >
                      {copiedField === 'ciConfig' ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <pre className="p-4 pt-8 rounded-lg bg-background border border-border overflow-x-auto text-xs font-mono text-muted-foreground max-h-80 overflow-y-auto">
                      <code>{ciConfig}</code>
                    </pre>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate('/projects')}
                  >
                    返回项目列表
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => navigate(`/projects/${createdProject.id}`)}
                  >
                    查看项目详情
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 底部按钮 */}
        {currentStep < 4 && (
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一步
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed() || createMutation.isPending}
            >
              {currentStep === 3 ? (
                createMutation.isPending ? '创建中...' : '创建项目'
              ) : (
                <>
                  下一步
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

function generateCIConfig(productId: string, type: ProjectType, plan: string): string {
  const scannerFlags: Record<string, string> = {
    fast: 'sast,dependency',
    standard: 'sast,dependency,dast',
    deep: 'sast,dependency,dast,secret',
  }
  const scanners = scannerFlags[plan] || 'sast,dependency'

  return `name: Security Scan

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

      - name: SecOps 安全扫描
        uses: secops/scan-action@v1
        with:
          api-key: \${{ secrets.SECOPS_API_KEY }}
          project-id: ${productId}
          scan-types: ${scanners}
          fail-on: critical,high
          project-type: ${type.toLowerCase()}

      - name: 上传扫描报告
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: secops-report
          path: secops-report.json`
}
