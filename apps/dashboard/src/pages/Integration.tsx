import { useState } from 'react'
import PageContainer from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useApiKeys } from '@/hooks/useApiKeys'
import { useProjects } from '@/hooks/useProjects'

const codeStyles = 'bg-muted font-mono text-sm p-4 rounded-lg overflow-x-auto'

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 flex gap-2">
        <span className="text-xs text-muted-foreground">{language}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre className={codeStyles}><code>{code}</code></pre>
    </div>
  )
}

export default function IntegrationPage() {
  const { data: apiKeys } = useApiKeys()
  const { data: projects } = useProjects()

  const activeKeys = apiKeys || []
  const sampleProject = projects?.[0]
  const apiBase = typeof window !== 'undefined' ? window.location.origin : 'https://secpilot.example.com'

  return (
    <PageContainer
      title="集成文档"
      description="外部系统接入指南"
      actions={
        <Badge variant="outline">API v1</Badge>
      }
    >
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="scanner">扫描器接入</TabsTrigger>
          <TabsTrigger value="cicd">CI/CD 卡点</TabsTrigger>
          <TabsTrigger value="compliance">强制合规流水线</TabsTrigger>
          <TabsTrigger value="gateway">网关染色验签</TabsTrigger>
          <TabsTrigger value="mock-stub">Mock Stub SDK</TabsTrigger>
          <TabsTrigger value="defectdojo">DefectDojo</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>鉴权方式</CardTitle>
                <CardDescription>使用 API 密钥进行身份验证</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>所有集成接口通过 <code className="bg-muted px-1.5 py-0.5 rounded">X-API-Key</code> 请求头进行身份验证。</p>
                <div>
                  <p className="font-medium mb-2">请求头格式：</p>
                  <CodeBlock code={`X-API-Key: secp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} />
                </div>
                <div>
                  <p className="font-medium mb-2">或使用 Bearer 方式：</p>
                  <CodeBlock code={`Authorization: Bearer secp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>当前密钥</CardTitle>
                <CardDescription>已创建 {activeKeys.length} 个 API 密钥</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeKeys.slice(0, 5).map((k) => (
                    <div key={k.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium text-sm">{k.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{k.keyPrefix}***</p>
                      </div>
                      <Badge variant="outline">{k.scope}</Badge>
                    </div>
                  ))}
                  {activeKeys.length === 0 && (
                    <p className="text-sm text-muted-foreground">暂无密钥，请先在 API 密钥管理中创建</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>集成接口总览</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left font-medium px-4 py-3">接口</th>
                      <th className="text-left font-medium px-4 py-3">方法</th>
                      <th className="text-left font-medium px-4 py-3">所需权限</th>
                      <th className="text-left font-medium px-4 py-3">用途</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { method: 'POST', path: '/api/integrations/scanner/report', scope: 'SCANNER', desc: '扫描结果上报' },
                      { method: 'POST', path: '/api/scans/gate-check', scope: 'CI_CD', desc: 'CI/CD 安全卡点判定' },
                      { method: 'POST', path: '/api/scans/trigger', scope: 'CI_CD', desc: '触发扫描任务' },
                      { method: 'POST', path: '/api/integrations/gateway/dye-verify', scope: 'GATEWAY', desc: '流量染色验签' },
                      { method: 'POST', path: '/api/integrations/gitlab/webhook', scope: 'WEBHOOK', desc: 'GitLab 事件回调' },
                      { method: 'POST', path: '/api/integrations/github/webhook', scope: 'WEBHOOK', desc: 'GitHub 事件回调' },
                      { method: 'POST', path: '/api/app-releases', scope: 'CI_CD', desc: '发版资产哈希上报' },
                      { method: 'GET', path: '/api/findings', scope: 'READ_ONLY', desc: '漏洞列表查询' },
                      { method: 'GET', path: '/api/scans/:id', scope: 'READ_ONLY', desc: '扫描任务状态' },
                      { method: 'POST', path: '/api/bypass/validate', scope: 'CI_CD', desc: '紧急 Bypass 校验' },
                      { method: 'GET', path: '/api/dashboard/summary', scope: 'READ_ONLY', desc: '仪表盘数据' },
                    ].map((row, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono">{row.path}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {row.method}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{row.scope}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scanner">
          <Card>
            <CardHeader>
              <CardTitle>扫描器接入指南</CardTitle>
              <CardDescription>将扫描结果统一上报到漏洞管理平台</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">1. 创建扫描器 API 密钥</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  在 API 密钥管理中创建一个 <code>SCANNER</code> 范围的密钥，可绑定到特定项目。
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">2. 上报扫描结果</h3>
                <p className="text-sm text-muted-foreground mb-2">扫描完成后，将结果通过 POST 接口上报：</p>
                <CodeBlock
                  language="bash"
                  code={`curl -X POST ${apiBase}/api/integrations/scanner/report \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: secp_your_api_key_here" \\
  -d '{
    "scanType": "static_sast",
    "projectId": "${sampleProject?.id || 'proj_xxx'}",
    "pipelineStage": "DAY_FAST_SCAN",
    "targetUrl": "https://gitlab.example.com/group/project",
    "branch": "main",
    "commitHash": "a1b2c3d4e5f6",
    "scanDurationSeconds": 180,
    "traceId": "scan-20240101-001",
    "findings": [
      {
        "title": "SQL Injection in login form",
        "severity": "CRITICAL",
        "cwe": "CWE-89",
        "cve": "CVE-2024-0001",
        "cvss": 9.8,
        "description": "User input is directly concatenated into SQL query...",
        "location": "/api/login",
        "filePath": "src/auth/login.py",
        "lineStart": 42,
        "lineEnd": 45,
        "falsePositive": false
      }
    ]
  }'`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">3. 响应示例</h3>
                <CodeBlock
                  language="json"
                  code={`{
  "scanId": "scan_task_id",
  "status": "COMPLETED",
  "findings": {
    "total": 1,
    "created": 1,
    "duplicates": 0,
    "bySeverity": {
      "CRITICAL": 1,
      "HIGH": 0,
      "MEDIUM": 0,
      "LOW": 0,
      "INFO": 0
    }
  }
}`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">支持的扫描类型</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                  {[
                    { type: 'STATIC_SAST', name: '静态代码扫描 (SonarQube)', desc: '源码白盒扫描' },
                    { type: 'STATIC_SCA', name: '依赖成分分析 (OSV-Scanner)', desc: '离线依赖审计' },
                    { type: 'DYNAMIC_DAST', name: '动态渗透测试 (ZAP)', desc: '黑盒漏洞扫描' },
                    { type: 'DYNAMIC_PLAYWRIGHT', name: '爬虫扫描 (Playwright)', desc: '浏览器自动化 + TraceId' },
                    { type: 'MOBILE_MOBSF', name: '移动端扫描 (MobSF)', desc: 'APK/IPA 逆向' },
                    { type: 'API_NUCLEI', name: 'API/基础设施 (Nuclei)', desc: 'YAML 模板扫描' },
                  ].map((s) => (
                    <div key={s.type} className="p-3 rounded-lg border border-border">
                      <code className="text-xs font-mono">{s.type}</code>
                      <p className="text-sm font-medium mt-1">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">TraceId 全链路追踪</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Playwright / ZAP 动态扫描自动注入标准 W3C Trace Context + B3 TraceId，
                  配合业务系统日志可端到端定位问题。
                </p>
                <CodeBlock
                  language="http"
                  code={`# 扫描器自动注入的请求头
X-B3-TraceId: 4bf92f3577b34da6a3ce929d0e0e4736
X-B3-SpanId: 00f067aa0ba902b7
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
X-SecOps-Simulation: True
X-SecOps-Sign: <hmac_sha256>
X-SecOps-Timestamp: 1704067200`}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cicd">
          <Card>
            <CardHeader>
              <CardTitle>CI/CD 卡点集成</CardTitle>
              <CardDescription>在发布流水线中根据安全扫描结果判断是否放行</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">1. 创建 CI/CD API 密钥</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  创建 <code>CI_CD</code> 范围的密钥，建议绑定到对应项目。
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">2. 卡点判定接口</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  发布前调用此接口，根据返回的 <code>passed</code> 字段决定是否继续：
                </p>
                <CodeBlock
                  language="bash"
                  code={`curl -X POST ${apiBase}/api/scans/gate-check \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer secp_your_api_token" \\
  -d '{
    "project_id": "${sampleProject?.id || 'proj_xxx'}",
    "branch": "main",
    "commit_hash": "a1b2c3d4"
  }'`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">3. GitLab CI 集成示例</h3>
                <CodeBlock
                  language="yaml"
                  code={`security_gate:
  stage: security_gate
  image: curlimages/curl:latest
  script:
    - |
      RESPONSE=$(curl -s -w "\\nHTTP_STATUS:%{http_code}" -X POST "$SECPILOT_URL/api/scans/gate-check" \\
        -H "Content-Type: application/json" \\
        -H "Authorization: Bearer $SECPILOT_API_TOKEN" \\
        -d "{
          \"project_id\": \"$SECURITY_PRODUCT_ID\",
          \"branch\": \"$CI_COMMIT_REF_NAME\",
          \"commit_hash\": \"$CI_COMMIT_SHA\"
        }")
      HTTP_CODE=$(echo "$RESPONSE" | tail -1 | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)
      BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS:.*//')
      echo "$BODY"

      if [ "$HTTP_CODE" != "200" ]; then
        echo "::error::Security gate request failed (HTTP $HTTP_CODE)"
        exit 1
      fi

      PASSED=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('passed', False))" 2>/dev/null || echo "True")
      if [ "$PASSED" = "False" ]; then
        echo "::error::Security gate failed. Critical/High findings detected."
        exit 1
      fi

      echo "Security gate passed."
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">4. GitHub Actions 集成示例</h3>
                <CodeBlock
                  language="yaml"
                  code={`name: SecPilot Security Gate

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  security-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run SAST Scan
        run: |
          curl -X POST "$SECPILOT_URL/api/scans/trigger" \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer \${{ secrets.SECPILOT_API_TOKEN }}" \\
            -d "{
              \"project_id\": \"\${{ vars.SECPILOT_PRODUCT_ID }}\",
              \"type\": \"STATIC_SAST\",
              \"pipeline_stage\": \"DAY_FAST_SCAN\",
              \"ref\": \"\${{ github.ref_name }}\",
              \"commit\": \"\${{ github.sha }}\"
            }"

      - name: Security Gate Check
        run: |
          RESP=$(curl -s -w "\\nHTTP_STATUS:%{http_code}" -X POST "$SECPILOT_URL/api/scans/gate-check" \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer \${{ secrets.SECPILOT_API_TOKEN }}" \\
            -d "{
              \"project_id\": \"\${{ vars.SECPILOT_PRODUCT_ID }}\",
              \"branch\": \"\${{ github.ref_name }}\",
              \"commit_hash\": \"\${{ github.sha }}\"
            }")
          echo "$RESP" | head -n -1
          HTTP_CODE=$(echo "$RESP" | tail -1 | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)
          if [ "$HTTP_CODE" != "200" ]; then
            echo "::error::Security gate failed"
            exit 1
          fi`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">5. 四阶段分层错峰</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">阶段</th>
                        <th className="text-left font-medium px-4 py-3">触发</th>
                        <th className="text-left font-medium px-4 py-3">扫描器</th>
                        <th className="text-left font-medium px-4 py-3">阻断</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['白天快扫', 'Commit / PR', 'SonarQube + OSV-Scanner', 'Critical/High 阻断'],
                        ['夜间深扫', '凌晨 2:00 Cron', 'ZAP + Playwright', '报警 + 3-7 天宽限'],
                        ['发版审计', 'Tag / 加固前', 'MobSF + 哈希链', '全部阻断'],
                        ['应急巡检', '0day 爆发时', 'Nuclei', '按 CVE 等级'],
                      ].map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {row.map((cell, j) => (
                            <td key={j} className="px-4 py-3">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">6. 紧急 Bypass</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  组级别 <code>SECURITY_BYPASS_TOKEN</code> 可紧急跳过。
                  <strong className="text-amber-700"> 触发顶格报警 + 全审计，24h 内必须复核。</strong>
                </p>
                <CodeBlock
                  language="bash"
                  code={`# GitLab: push 时携带
git push -o ci.variable="SECURITY_BYPASS_TOKEN=your_token" origin hotfix

# GitHub: workflow_dispatch 或 Secrets 中配置
# 在 PR 评论中输入 /bypass <token> 触发（需 Webhook 已配置）`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">7. 响应字段说明</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">字段</th>
                        <th className="text-left font-medium px-4 py-3">类型</th>
                        <th className="text-left font-medium px-4 py-3">说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['passed', 'boolean', '是否通过卡点'],
                        ['reason', 'string', '判定原因'],
                        ['totalFindings', 'number', '未关闭漏洞总数'],
                        ['blockingFindings', 'number', '达到阈值的阻断性漏洞数'],
                        ['bySeverity', 'object', '按严重程度统计'],
                        ['topBlocking', 'array', '前 10 个阻断性漏洞'],
                      ].map(([f, t, d]) => (
                        <tr key={f} className="border-t border-border">
                          <td className="px-4 py-3 font-mono">{f}</td>
                          <td className="px-4 py-3 text-muted-foreground">{t}</td>
                          <td className="px-4 py-3">{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>强制合规流水线</CardTitle>
              <CardDescription>
                Org / Group 级别强制注入安全流水线，项目无法通过删除配置逃避审计
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">GitHub Required Workflows</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Org 级别配置必需工作流，所有仓库 PR 必须通过才能合并。
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Org 级管理员权限</li>
                    <li>指定 workflow 所在仓库</li>
                    <li>scope: all 或 selected_repositories</li>
                    <li>项目无法删除或绕过</li>
                  </ul>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">GitLab Compliance Pipelines</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Group 级别合规框架，项目被打标后自动注入安全流水线。
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Group 级 Ultimate / Premium 版本</li>
                    <li>Compliance Framework 绑定 pipeline</li>
                    <li>项目级无法关闭</li>
                    <li>支持按项目批量打标</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">GitHub Org 级启用步骤</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>在「集成 → GitHub Org 集成」中创建配置，填入 Personal Access Token</li>
                  <li>指定存放 workflow 的仓库（如 <code>org/.github</code>）</li>
                  <li>点击「启用强制工作流」，系统自动：
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>写入 security-compliance.yml 模板到指定仓库</li>
                      <li>调用 Org API 创建 Required Workflow</li>
                      <li>批量应用到选中仓库（或全部）</li>
                    </ul>
                  </li>
                  <li>项目侧仅需配置 2 个变量：
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li><code>SECPILOT_PRODUCT_ID</code> - 项目 ID</li>
                      <li><code>SECPILOT_API_TOKEN</code> - 扫描器 API Key（Secrets）</li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div>
                <h3 className="font-medium mb-2">GitLab Group 级启用步骤</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>在「集成 → GitLab Group 集成」中配置 Access Token</li>
                  <li>点击「启用合规框架」，系统自动：
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>GraphQL API 创建 Compliance Framework</li>
                      <li>关联 pipeline 配置路径</li>
                      <li>批量给项目打框架标签</li>
                    </ul>
                  </li>
                  <li>项目 CI 仅需定义 <code>SECURITY_PRODUCT_ID</code> 变量即可</li>
                </ol>
              </div>

              <div>
                <h3 className="font-medium mb-2">相关 API 端点</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">方法</th>
                        <th className="text-left font-medium px-4 py-3">路径</th>
                        <th className="text-left font-medium px-4 py-3">说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['POST', '/api/github-org-integrations', '创建 GitHub Org 集成'],
                        ['POST', '/api/github-org-integrations/:id/required-workflows', '启用强制工作流'],
                        ['DELETE', '/api/github-org-integrations/:id/required-workflows/:wfId', '移除强制工作流'],
                        ['POST', '/api/gitlab-group-integrations', '创建 GitLab Group 集成'],
                        ['POST', '/api/gitlab-group-integrations/:id/enable-compliance', '启用合规框架'],
                        ['POST', '/api/gitlab-group-integrations/:id/disable-compliance', '禁用合规框架'],
                      ].map(([m, p, d], i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{m}</Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{p}</td>
                          <td className="px-4 py-3 text-muted-foreground">{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateway">
          <Card>
            <CardHeader>
              <CardTitle>网关流量染色验签</CardTitle>
              <CardDescription>网关层调用此接口验证染色流量的合法性</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">1. 网关集成流程</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>请求到达网关，检测是否包含染色 Header（X-SecOps-Simulation: True）</li>
                  <li>若包含染色标记，调用验签接口验证 HMAC 签名</li>
                  <li>验签通过：将请求路由到影子环境（影子库/影子队列）</li>
                  <li>验签失败：直接拦截，返回 403</li>
                </ol>
              </div>

              <div>
                <h3 className="font-medium mb-2">2. 验签接口</h3>
                <CodeBlock
                  language="bash"
                  code={`curl -X POST ${apiBase}/api/integrations/gateway/dye-verify \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: secp_your_gateway_key" \\
  -d '{
    "headers": {
      "X-SecOps-Simulation": "True",
      "X-SecOps-Sign": "hmac_sha256_signature",
      "X-SecOps-Timestamp": "1704067200",
      "X-SecOps-Trace-Id": "trace-abc123"
    },
    "clientIp": "10.0.1.100",
    "path": "/api/users",
    "method": "POST"
  }'`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">3. 验签通过响应</h3>
                <CodeBlock
                  language="json"
                  code={`{
  "isSimulated": true,
  "action": "SANDBOX_ROUTE",
  "shadowConfig": {
    "redisPrefix": "secops:shadow:",
    "mqSuffix": "-shadow"
  },
  "traceId": "trace-abc123"
}`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">4. 验签失败响应</h3>
                <CodeBlock
                  language="json"
                  code={`{
  "isSimulated": false,
  "reason": "HMAC signature verification failed",
  "action": "BLOCK"
}`}
                />
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <strong>性能提示：</strong> 网关层建议将验签逻辑本地化实现（共享 salt），
                仅将审计日志异步上报到平台，避免每次请求增加网络延迟。
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defectdojo">
          <Card>
            <CardHeader>
              <CardTitle>DefectDojo 集成</CardTitle>
              <CardDescription>
                以 DefectDojo 为漏洞资产管理中台，支持 Push 上报 + Pull 拉取双模式
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">Push 模式</h4>
                  <p className="text-sm text-muted-foreground">
                    扫描完成后实时推送结果到 DefectDojo。延迟低，适合 CI/CD 卡点。
                  </p>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">Pull 模式（兜底）</h4>
                  <p className="text-sm text-muted-foreground">
                    定时 Cron 从 DefectDojo 拉取漏报数据，防网络抖动丢包。默认每小时一次。
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">配置步骤</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>部署 DefectDojo（推荐 Docker Compose）</li>
                  <li>在 DefectDojo 中创建 API Key（全局管理员权限）</li>
                  <li>在「系统配置 → DefectDojo 集成」中填入 URL 和 API Key</li>
                  <li>点击「测试连接」验证</li>
                  <li>启用 Pull 兜底同步（每小时定时拉取）</li>
                </ol>
              </div>

              <div>
                <h3 className="font-medium mb-2">支持的扫描器导入</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    'SonarQube Scan',
                    'OSV Scanner',
                    'ZAP Scan',
                    'MobSF Scan',
                    'Nuclei Scan',
                    'Generic Findings Import',
                  ].map((s) => (
                    <div key={s} className="p-3 rounded-lg border border-border text-sm">
                      {s}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">去重引擎</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  DefectDojo 原生去重 + 平台二次去重，基于 CWE + 文件路径 + 参数哈希。
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>相同 CWE + 相同文件路径 + 相同参数名 → 自动合并</li>
                  <li>跨扫描器同一漏洞自动关联，保留首次发现时间</li>
                  <li>误报标记跨工具同步，避免重复审核</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mock-stub">
          <Card>
            <CardHeader>
              <CardTitle>Mock Stub & 影子区 SDK</CardTitle>
              <CardDescription>
                业务系统接入流量染色，实现消息接口拦截、金融扣款 Mock、影子 Redis/MQ 全链路隔离
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">1. 安装</h3>
                <CodeBlock
                  language="bash"
                  code={`# pnpm
pnpm add @secops/traffic-dye

# npm
npm install @secops/traffic-dye

# yarn
yarn add @secops/traffic-dye`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">2. Express / Fastify 中间件</h3>
                <CodeBlock
                  language="typescript"
                  code={`import { createDyeMiddleware } from '@secops/traffic-dye';

// Express
app.use(createDyeMiddleware({
  salt: process.env.SECURITY_DYE_SALT!,
  timeWindowSeconds: 300,
  ipWhitelist: ['10.0.1.0/24', '10.0.2.100'],
  mockRoutes: [
    // 消息接口：直接拦截返回 200
    {
      method: 'POST',
      path: '/api/sms/send',
      responseBody: { code: 0, message: 'ok', simulated: true },
    },
    // 邮件接口：同上
    {
      method: 'POST',
      path: '/api/email/send',
      responseBody: { code: 0, simulated: true },
    },
    // 金融扣款：自定义 handler 走内存桩
    {
      method: 'POST',
      path: /^\\/api\\/wallet\\/(deduct|deposit)/,
      handler: (req, res, dyeResult) => {
        console.log('[SIMULATED] Wallet op, traceId:', dyeResult.traceId);
        res.json({
          status: 'success',
          transactionId: \`sim_\${Date.now()}\`,
          simulated: true,
        });
      },
    },
  ],
}).express);`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">3. 影子 Redis（自动加 secops: 前缀）</h3>
                <CodeBlock
                  language="typescript"
                  code={`import { createShadowRedis } from '@secops/traffic-dye';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// 染色流量使用影子 Redis
const shadowRedis = req.isSimulated
  ? createShadowRedis(redis, 'secops:')
  : redis;

// 使用方式完全一致，key 自动加前缀
await shadowRedis.set('user:123:balance', '1000');
// 真实: user:123:balance
// 影子: secops:user:123:balance`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">4. 影子 MQ（自动路由到影子队列）</h3>
                <CodeBlock
                  language="typescript"
                  code={`import { createShadowMq } from '@secops/traffic-dye';

// 支持任意 MQ 客户端（RabbitMQ / Kafka / BullMQ 等）
const producer = getMqProducer();

const shadowProducer = req.isSimulated
  ? createShadowMq(producer, '-shadow', 'publish')
  : producer;

// 发送消息自动路由到影子队列
await shadowProducer.publish('order.created', { id: '123' });
// 真实: order.created
// 影子: order.created-shadow`}
                />
              </div>

              <div>
                <h3 className="font-medium mb-2">5. 染色请求生成（扫描器侧）</h3>
                <CodeBlock
                  language="typescript"
                  code={`import { TrafficDye } from '@secops/traffic-dye';

const dye = new TrafficDye({
  salt: process.env.SECURITY_DYE_SALT!,
  timeWindowSeconds: 300,
});

const traceId = crypto.randomBytes(16).toString('hex');
const headers = dye.generateHeaders(traceId);
// headers = {
//   'X-SecOps-Simulation': 'True',
//   'X-SecOps-Sign': '<hmac_sha256>',
//   'X-SecOps-Timestamp': '1704067200',
//   'X-B3-TraceId': '<traceId>',
// }

// 扫描器发出的每个请求带上这些 headers
fetch(targetUrl, { headers });`}
                />
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <strong>最佳实践：</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>网关层优先做 Header Sanitization（清洗所有 X-SecOps-*），再做验签</li>
                  <li>验签建议本地化（共享 salt），减少每请求 RTT</li>
                  <li>影子 Redis 设置独立 TTL，定期清理不占存储</li>
                  <li>TraceId 全链路透传，日志中统一打印</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook">
          <Tabs defaultValue="gitlab" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="gitlab">GitLab Webhook</TabsTrigger>
              <TabsTrigger value="github">GitHub Webhook</TabsTrigger>
            </TabsList>

            <TabsContent value="gitlab">
              <Card>
                <CardHeader>
                  <CardTitle>GitLab Webhook 集成</CardTitle>
                  <CardDescription>接收 GitLab 事件触发安全扫描流水线</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-2">1. 配置步骤</h3>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>在「GitLab 集成」页面创建项目级集成</li>
                      <li>复制 Webhook URL 和 Token</li>
                      <li>在 GitLab 项目 Settings → Webhooks 中添加</li>
                      <li>勾选 Push events / Merge Request events 触发</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">2. Webhook URL</h3>
                    <CodeBlock
                      language="text"
                      code={`${apiBase}/api/integrations/gitlab/webhook`}
                    />
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">3. 支持的事件</h3>
                    <div className="space-y-3 mt-3">
                      {[
                        { event: 'Push Hook', desc: '代码推送触发快速扫描（SAST + SCA）' },
                        { event: 'Merge Request Hook', desc: 'MR 时触发深度扫描 + 卡点评论' },
                        { event: 'Tag Push Hook', desc: '发版标签时触发全量审计 + MobSF' },
                      ].map((e) => (
                        <div key={e.event} className="p-3 rounded-lg border border-border">
                          <p className="font-medium">{e.event}</p>
                          <p className="text-sm text-muted-foreground">{e.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">4. Payload 校验</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      使用 <code>X-Gitlab-Token</code> Header 与配置的 webhookToken 比对。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="github">
              <Card>
                <CardHeader>
                  <CardTitle>GitHub Webhook 集成</CardTitle>
                  <CardDescription>接收 GitHub 事件触发安全扫描流水线</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-medium mb-2">1. 配置步骤</h3>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>在「GitHub 集成」页面创建项目级集成</li>
                      <li>复制 Webhook URL 和 Secret</li>
                      <li>在 GitHub 仓库 Settings → Webhooks → Add webhook</li>
                      <li>Content type 选 application/json</li>
                      <li>勾选 Let me select individual events: Pull requests + Pushes</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">2. Webhook URL</h3>
                    <CodeBlock
                      language="text"
                      code={`${apiBase}/api/integrations/github/webhook`}
                    />
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">3. 支持的事件</h3>
                    <div className="space-y-3 mt-3">
                      {[
                        { event: 'push', desc: '代码推送触发快速扫描（SAST + SCA）' },
                        { event: 'pull_request (opened/synchronize)', desc: 'PR 创建/更新触发深度扫描 + 评论' },
                        { event: 'pull_request_review_comment', desc: 'PR 评论中 /bypass 命令触发紧急绕过' },
                        { event: 'release', desc: '发版时触发全量审计 + MobSF' },
                      ].map((e) => (
                        <div key={e.event} className="p-3 rounded-lg border border-border">
                          <p className="font-medium">{e.event}</p>
                          <p className="text-sm text-muted-foreground">{e.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">4. 签名校验</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      使用 <code>X-Hub-Signature-256</code> HMAC-SHA256 签名验证。
                    </p>
                    <CodeBlock
                      language="bash"
                      code={`# 签名格式
X-Hub-Signature-256: sha256=<hex_encoded_hmac>

# 验证方式
echo -n "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET"`}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}
