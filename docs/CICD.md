# CI/CD 集成指南

> 将安全合规流水线集成到您的开发工作流中

## 目录

- [概述](#概述)
- [流水线阶段说明](#流水线阶段说明)
- [GitLab CI 集成](#gitlab-ci-集成)
- [GitHub Actions 集成](#github-actions-集成)
- [工具脚本使用](#工具脚本使用)
- [配置最佳实践](#配置最佳实践)
- [排障指南](#排障指南)

## 概述

SecOps Platform 提供了开箱即用的 CI/CD 安全合规流水线模板，支持主流的 GitLab CI 和 GitHub Actions 平台。通过简单的配置，即可将安全扫描左移到开发流程中，实现 DevSecOps 自动化。

### 模板位置

```
packages/ci-templates/
├── gitlab/
│   └── security-compliance.yml       # GitLab CI 模板
├── github-actions/
│   └── security-compliance.yml       # GitHub Actions 模板
├── scripts/
│   ├── report.sh                     # 结果上报脚本
│   └── verify-hash.sh                # 哈希校验脚本
└── README.md                         # 模板详细文档
```

### 核心价值

| 价值 | 说明 |
|------|------|
| 左移安全 | 在开发早期发现安全问题，降低修复成本 |
| 自动化 | 无需人工干预，扫描自动触发 |
| 标准化 | 所有项目使用统一的安全基线 |
| 可追溯 | 所有扫描结果统一上报，便于审计 |
| 灵活性 | 支持紧急绕过，应对特殊场景 |

## 流水线阶段说明

### 阶段一：白天快扫 (Day Fast Scan)

**触发条件**：代码提交、PR/MR 创建

**扫描工具**：
- **OSV Scanner** - 开源组件漏洞扫描（SCA）
- **SonarQube** - 静态代码安全分析（SAST）

**设计目标**：
- 快速反馈，不阻塞开发效率
- 覆盖明显的安全问题
- 扫描时长控制在 5-10 分钟

### 阶段二：夜间深扫 (Night Deep Scan)

**触发条件**：Cron 定时（每日凌晨 2:00）

**扫描工具**：
- **OWASP ZAP** - 动态应用安全测试（DAST）
- **Playwright** - 浏览器端安全测试

**设计目标**：
- 深度扫描，发现更多潜在问题
- 不占用工作时间
- 扫描时长 30-60 分钟

### 阶段三：发版审计 (Release Audit)

**触发条件**：Tag 创建、Release 发布

**扫描工具**：
- **MobSF** - 移动应用安全扫描
- **SHA256 Verify** - 发版产物完整性校验

**设计目标**：
- 确保发版安全
- 保障产物完整性
- 留存发版审计证据

### 阶段四：应急巡检 (Emergency Patrol)

**触发条件**：手动触发、重大 0day 响应

**扫描工具**：
- **Nuclei** - 快速漏洞检测

**设计目标**：
- 快速验证特定漏洞影响
- 支持 0day 应急响应
- 按需触发，灵活高效

## GitLab CI 集成

### 前置条件

1. GitLab 项目已创建
2. 有项目 Maintainer 及以上权限
3. 已获取安全平台的 Product ID 和 API Token

### 快速接入

#### 步骤 1：引入模板

在项目根目录创建 `.gitlab-ci.yml`：

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/secops-platform/ci-templates/main/gitlab/security-compliance.yml'

variables:
  SECURITY_PRODUCT_ID: "your-product-id"
  SCAN_TARGET_URL: "https://your-app.example.com"
  FAIL_ON_CRITICAL: "true"
```

或者直接复制模板文件到项目中：

```bash
cp packages/ci-templates/gitlab/security-compliance.yml .gitlab-ci.yml
```

#### 步骤 2：配置 CI/CD 变量

进入 GitLab 项目：
`Settings` → `CI/CD` → `Variables` → `Add variable`

配置以下变量：

| 变量名 | 保护 | 掩码 | 说明 |
|--------|------|------|------|
| `SECURITY_PRODUCT_ID` | 否 | 否 | 安全产品唯一标识（必填） |
| `SECURITY_API_TOKEN` | 是 | 是 | 安全平台 API Token |
| `SONAR_HOST_URL` | 否 | 否 | SonarQube 服务地址 |
| `SONAR_TOKEN` | 是 | 是 | SonarQube 访问令牌 |
| `SCAN_TARGET_URL` | 否 | 否 | 动态扫描目标地址 |
| `DEFECTDOJO_API_KEY` | 是 | 是 | DefectDojo API Key |
| `EMERGENCY_BYPASS_TOKEN` | 是 | 是 | 紧急逃生通道密钥 |

#### 步骤 3：配置夜间扫描定时任务

进入 GitLab 项目：
`Build` → `Pipeline schedules` → `New schedule`

| 配置项 | 值 |
|--------|-----|
| Description | 夜间安全深扫 |
| Interval Pattern | Custom |
| Cron | `0 2 * * *` |
| Cron Timezone | 选择您的时区 |
| Target branch | main / master |
| Variables | `NIGHT_SCAN` = `true` |

点击 `Save pipeline schedule` 保存。

#### 步骤 4：验证流水线

提交代码到仓库，观察流水线是否正常触发：

```bash
git add .gitlab-ci.yml
git commit -m "feat: add security compliance pipeline"
git push
```

进入 GitLab 项目的 `Build` → `Pipelines` 查看流水线状态。

### 高级配置

#### 自定义扫描规则

根据项目类型调整扫描策略：

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/secops-platform/ci-templates/main/gitlab/security-compliance.yml'

# 前端项目：跳过某些扫描
osv-scanner:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push"'
      changes:
        - package.json
        - pnpm-lock.yaml
      when: on_success
    - when: never

# 后端项目：启用全部扫描
```

#### 质量门禁配置

根据安全等级调整质量门禁：

```yaml
variables:
  # 生产项目：严重漏洞阻断
  FAIL_ON_CRITICAL: "true"
  
  # 内部项目：仅告警
  # FAIL_ON_CRITICAL: "false"
```

#### 多环境部署

```yaml
stages:
  - validate
  - day-fast-scan
  - test-deploy
  - night-deep-scan
  - release-audit
  - report

# 添加部署阶段
deploy-to-test:
  stage: test-deploy
  script:
    - echo "部署到测试环境"
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule" && $NIGHT_SCAN == "true"'
      when: on_success
```

### 查看结果

- **流水线页面**：查看各阶段执行状态
- **Artifacts**：下载扫描报告（保留 90 天）
- **安全平台**：登录 SecOps Platform 查看统一视图

## GitHub Actions 集成

### 前置条件

1. GitHub 仓库已创建
2. 有仓库 Write 及以上权限
3. 已获取安全平台的 Product ID 和 API Token

### 快速接入

#### 步骤 1：添加 Workflow 文件

在项目中创建 `.github/workflows/security-compliance.yml`：

```bash
mkdir -p .github/workflows
cp packages/ci-templates/github-actions/security-compliance.yml .github/workflows/
```

或者直接从模板引用（待发布到 GitHub Marketplace 后）。

#### 步骤 2：配置 Secrets

进入 GitHub 项目：
`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

配置以下 Secrets：

| Secret 名称 | 说明 |
|-------------|------|
| `SECURITY_PRODUCT_ID` | 安全产品唯一标识（必填） |
| `SECURITY_API_TOKEN` | 安全平台 API Token |
| `SONAR_HOST_URL` | SonarQube 服务地址 |
| `SONAR_TOKEN` | SonarQube 访问令牌 |
| `SCAN_TARGET_URL` | 动态扫描目标地址 |
| `DEFECTDOJO_API_KEY` | DefectDojo API Key |
| `BYPASS_TOKEN` | 紧急逃生通道 Token |
| `EMERGENCY_BYPASS_TOKEN` | 紧急逃生通道密钥 |

#### 步骤 3：验证工作流

提交代码触发工作流：

```bash
git add .github/workflows/security-compliance.yml
git commit -m "feat: add security compliance workflow"
git push
```

进入 GitHub 项目的 `Actions` 标签页，查看工作流运行状态。

### 手动触发

进入 GitHub 项目：
`Actions` → `Security Compliance Pipeline` → `Run workflow`

可选择运行的扫描阶段：
- 运行夜间深扫
- 运行发版审计
- 运行应急巡检
- 指定目标 URL
- 填写应急原因和 CVE ID

### 高级配置

#### 分支策略

```yaml
on:
  push:
    branches: [main, develop, 'feature/*']
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * 1-5'  # 工作日凌晨 2 点
```

#### 条件扫描

根据文件变化决定是否运行扫描：

```yaml
jobs:
  osv-scan:
    runs-on: ubuntu-latest
    if: |
      contains(github.event.head_commit.message, 'deps') ||
      contains(github.event.pull_request.labels.*.name, 'dependencies')
```

#### 自托管 Runner

对于需要访问内网资源的扫描，使用自托管 Runner：

```yaml
jobs:
  zap-scan:
    runs-on: [self-hosted, security]
    steps:
      - uses: actions/checkout@v4
      # ...
```

### 查看结果

- **Actions 页面**：查看工作流运行状态
- **Artifacts**：下载扫描报告（保留 90 天）
- **Security 标签**：查看 Code Scanning 结果（如启用）
- **安全平台**：登录 SecOps Platform 查看统一视图

## 工具脚本使用

### report.sh - 结果上报脚本

将各类扫描工具的结果上报到安全平台。

#### 使用方法

```bash
# 基本用法
./scripts/report.sh <报告目录>

# 完整示例
SECURITY_PRODUCT_ID="my-product" \
SECURITY_API_TOKEN="xxx" \
SECURITY_PLATFORM_URL="https://secops.example.com/api/v1" \
./scripts/report.sh ./security-reports/
```

#### 支持的扫描结果格式

| 工具 | 文件名 | 类型 |
|------|--------|------|
| OSV Scanner | `osv-results.json` | SCA |
| SonarQube | `sonarqube-report.json` | SAST |
| OWASP ZAP | `zap/zap-results.json` | DAST |
| Nuclei | `nuclei-results.json` | 漏洞扫描 |
| MobSF | `mobsf-results.json` | 移动安全 |
| Playwright | `playwright-results.json` | E2E |

#### 功能特性

- 自动识别扫描结果格式
- 生成漏洞统计汇总
- 上报到 SecOps Platform
- 上报到 DefectDojo（可选）
- 生成 Markdown 汇总报告

### verify-hash.sh - 哈希校验脚本

生成和校验文件/目录的 SHA-256 哈希值。

#### 生成哈希

```bash
# 生成目录哈希清单
./scripts/verify-hash.sh -m generate -o SHA256SUMS ./dist/

# 排除指定目录
./scripts/verify-hash.sh -m generate \
  -x 'node_modules/*' \
  -x '.git/*' \
  -o release-hashes.txt \
  ./release/

# 单文件哈希
./scripts/verify-hash.sh -m generate app-v1.0.0.tar.gz
```

#### 校验哈希

```bash
# 校验目录
./scripts/verify-hash.sh -m verify -e SHA256SUMS ./dist/

# 校验单个文件
./scripts/verify-hash.sh -m verify -e expected.txt app-v1.0.0.tar.gz

# 详细输出
./scripts/verify-hash.sh -m verify -e SHA256SUMS -v ./dist/
```

#### 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 校验全部通过 |
| 1 | 存在不匹配或缺失的文件 |
| 2 | 参数错误或文件不存在 |

## 配置最佳实践

### 1. 渐进式接入策略

**第一周：观察期**
- 启用白天快扫
- 不设置质量门禁（仅告警）
- 观察误报率，调整规则

**第二周：试运行**
- 启用夜间深扫
- 设置高危漏洞告警
- 验证扫描覆盖率

**第三周：正式接入**
- 启用发版审计
- 设置严重漏洞阻断
- 建立修复 SLA

### 2. 变量分级管理

| 级别 | 变量类型 | 管理方式 |
|------|----------|----------|
| 项目级 | Product ID, 目标 URL | 项目 CI/CD 变量 |
| 团队级 | API Token, Sonar Token | Group 级变量 |
| 企业级 | 平台地址, 全局密钥 | Instance 级变量 |

### 3. 质量门禁策略

| 环境 | 严重 | 高危 | 中危 | 低危 |
|------|------|------|------|------|
| 开发环境 | 告警 | 告警 | 忽略 | 忽略 |
| 测试环境 | 阻断 | 阻断 | 告警 | 忽略 |
| 生产环境 | 阻断 | 阻断 | 阻断 | 告警 |

### 4. 紧急逃生通道使用规范

#### 启用条件

仅限以下场景使用：
- P0 级线上故障紧急修复
- 重大业务活动保障期
- 经安全团队负责人批准

#### 审批流程

1. 申请人提交 Bypass 申请（说明原因和时长）
2. 安全负责人审批
3. 配置 BYPASS_TOKEN 临时生效
4. 24 小时内补充完整扫描
5. 记录存档备查

### 5. 扫描频率建议

| 项目类型 | 白天快扫 | 夜间深扫 | 发版审计 | 应急巡检 |
|----------|----------|----------|----------|----------|
| 核心业务 | ✅ 每次提交 | ✅ 每日 | ✅ 每次发版 | 按需 |
| 一般业务 | ✅ 每次提交 | ✅ 每周 | ✅ 每次发版 | 按需 |
| 内部工具 | ✅ 每日 | ❌ | ✅ 每季度 | 按需 |

## 排障指南

### 常见问题

#### 1. 流水线报 `SECURITY_PRODUCT_ID 未配置`

**原因**：未配置产品 ID 变量

**解决方案**：
- GitLab：在 CI/CD Variables 中添加 `SECURITY_PRODUCT_ID`
- GitHub：在 Secrets 中添加 `SECURITY_PRODUCT_ID`

#### 2. OSV Scanner 执行失败

**可能原因**：
- 项目中没有依赖文件（package.json, go.mod 等）
- 网络问题无法访问漏洞库

**排查步骤**：
```bash
# 本地测试 OSV Scanner
osv-scanner -r ./
```

#### 3. SonarQube 连接超时

**可能原因**：
- SonarQube 地址配置错误
- 网络不通
- Token 无效

**排查步骤**：
```bash
# 测试连接
curl -I $SONAR_HOST_URL

# 验证 Token
curl -u $SONAR_TOKEN: $SONAR_HOST_URL/api/authentication/validate
```

#### 4. ZAP 扫描目标不可达

**可能原因**：
- 目标地址配置错误
- 网络策略限制
- 目标服务未启动

**排查步骤**：
```bash
# 测试目标可达性
curl -I $SCAN_TARGET_URL

# 检查 DNS
nslookup $(echo $SCAN_TARGET_URL | awk -F/ '{print $3}')
```

#### 5. 结果上报失败

**可能原因**：
- API Token 无效
- 平台地址错误
- 网络不通

**排查步骤**：
```bash
# 测试 API 连通性
curl -H "Authorization: Bearer $SECURITY_API_TOKEN" \
  $SECURITY_PLATFORM_URL/health
```

### 日志查看

#### GitLab CI

进入流水线页面：
`Build` → `Pipelines` → 点击具体 Pipeline → 点击 Job → 查看日志

#### GitHub Actions

进入 Actions 页面：
`Actions` → 点击具体 Workflow run → 点击具体 Job → 展开步骤查看日志

### 联系支持

如遇无法解决的问题，请提供以下信息：

1. 项目名称和 Product ID
2. 流水线/工作流 ID
3. 完整的错误日志
4. 复现步骤

---

**相关文档**：
- [CI 模板详细文档](../packages/ci-templates/README.md)
- [架构设计](ARCHITECTURE.md)
- [API 文档](API.md)
- [快速开始](QUICKSTART.md)
