# CI/CD 安全合规流水线模板

> 企业级 DevSecOps 流水线模板集合，支持 GitLab CI 和 GitHub Actions

## 目录

- [概述](#概述)
- [流水线阶段](#流水线阶段)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [GitLab CI 集成](#gitlab-ci-集成)
- [GitHub Actions 集成](#github-actions-集成)
- [工具脚本](#工具脚本)
- [配置变量](#配置变量)
- [最佳实践](#最佳实践)

## 概述

本模板提供了一套完整的四阶段安全合规流水线方案，覆盖从代码提交到发版审计的全链路安全检测。

### 核心特性

- **四阶段扫描策略**：白天快扫、夜间深扫、发版审计、应急巡检
- **多工具集成**：OSV、SonarQube、ZAP、Nuclei、MobSF、Playwright
- **紧急逃生通道**：BYPASS_TOKEN 机制，应对紧急发版场景
- **统一上报**：扫描结果自动上报到安全合规平台和 DefectDojo
- **多平台支持**：同时支持 GitLab CI 和 GitHub Actions

## 流水线阶段

### 阶段 A：白天快扫 (Day Fast Scan)

**触发条件**：代码提交、Pull Request / Merge Request

**目标**：在开发阶段快速发现明显的安全问题，不阻塞开发效率

| 工具 | 类型 | 说明 |
|------|------|------|
| OSV Scanner | SCA | 开源组件漏洞扫描 |
| SonarQube | SAST | 静态代码安全分析 |

### 阶段 B：夜间深扫 (Night Deep Scan)

**触发条件**：Cron 定时任务（每日凌晨 2:00）

**目标**：进行更全面的深度扫描，不占用工作时间

| 工具 | 类型 | 说明 |
|------|------|------|
| OWASP ZAP | DAST | 动态应用安全测试 |
| Playwright | E2E | 浏览器端安全测试 |

### 阶段 C：发版审计 (Release Audit)

**触发条件**：Tag 创建、Release 发布

**目标**：确保发版产物的安全性和完整性

| 工具 | 类型 | 说明 |
|------|------|------|
| MobSF | 移动安全 | 移动应用安全扫描 |
| SHA256 Verify | 完整性 | 发版产物哈希校验 |

### 阶段 D：应急巡检 (Emergency Patrol)

**触发条件**：手动触发、重大 0day 漏洞响应

**目标**：快速验证特定漏洞的影响范围

| 工具 | 类型 | 说明 |
|------|------|------|
| Nuclei | 漏洞扫描 | 应急漏洞快速检测 |

## 目录结构

```
packages/ci-templates/
├── package.json              # 包定义
├── README.md                 # 本文档
├── gitlab/
│   └── security-compliance.yml  # GitLab CI 模板
├── github-actions/
│   └── security-compliance.yml  # GitHub Actions 模板
└── scripts/
    ├── report.sh             # 结果上报脚本
    └── verify-hash.sh        # SHA-256 哈希校验脚本
```

## 快速开始

### GitLab CI

1. 将 `gitlab/security-compliance.yml` 复制到项目根目录，并重命名为 `.gitlab-ci.yml`
2. 在 GitLab 项目中配置 CI/CD 变量
3. 提交代码触发流水线

### GitHub Actions

1. 将 `github-actions/security-compliance.yml` 复制到项目的 `.github/workflows/` 目录
2. 在 GitHub 项目的 Secrets 中配置必要变量
3. 提交代码触发工作流

## GitLab CI 集成

### 基础用法

在项目的 `.gitlab-ci.yml` 中引入模板：

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/secops-platform/ci-templates/main/gitlab/security-compliance.yml'

variables:
  SECURITY_PRODUCT_ID: "your-product-id"
  SCAN_TARGET_URL: "https://your-app.example.com"
```

### 夜间扫描 Cron 配置

在 GitLab 项目中配置定时任务：

- **Cron 表达式**：`0 2 * * *`
- **目标分支**：`main`
- **变量**：`NIGHT_SCAN=true`

### 变量配置

进入项目 `Settings > CI/CD > Variables`，添加以下变量：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `SECURITY_PRODUCT_ID` | 是 | 安全产品唯一标识 |
| `SECURITY_API_TOKEN` | 否 | 安全平台 API Token |
| `SONAR_HOST_URL` | 否 | SonarQube 服务地址 |
| `SONAR_TOKEN` | 否 | SonarQube 访问令牌 |
| `SCAN_TARGET_URL` | 否 | 动态扫描目标地址 |
| `DEFECTDOJO_API_KEY` | 否 | DefectDojo API Key |
| `BYPASS_TOKEN` | 否 | 紧急逃生通道 Token |

## GitHub Actions 集成

### 基础用法

将模板文件复制到 `.github/workflows/security-compliance.yml`。

### 手动触发

在 GitHub 项目的 Actions 页面，选择 "Security Compliance Pipeline"，点击 "Run workflow"，选择需要运行的扫描阶段。

### Secrets 配置

进入项目 `Settings > Secrets and variables > Actions`，添加以下 Secrets：

| Secret 名称 | 必填 | 说明 |
|-------------|------|------|
| `SECURITY_PRODUCT_ID` | 是 | 安全产品唯一标识 |
| `SECURITY_API_TOKEN` | 否 | 安全平台 API Token |
| `SONAR_HOST_URL` | 否 | SonarQube 服务地址 |
| `SONAR_TOKEN` | 否 | SonarQube 访问令牌 |
| `SCAN_TARGET_URL` | 否 | 动态扫描目标地址 |

## 工具脚本

### report.sh - 结果上报脚本

将各类扫描工具的结果统一上报到安全平台。

```bash
# 基本用法
./scripts/report.sh security-reports/

# 环境变量方式
SECURITY_PRODUCT_ID=my-product \
SECURITY_API_TOKEN=xxx \
SECURITY_PLATFORM_URL=https://secops.example.com/api/v1 \
./scripts/report.sh ./reports/
```

**功能**：
- 自动识别多种扫描工具的结果格式
- 生成统一的漏洞统计汇总
- 上报到安全合规平台
- 上报到 DefectDojo
- 生成 Markdown 格式的汇总报告

### verify-hash.sh - 哈希校验脚本

生成和校验文件的 SHA-256 哈希值。

```bash
# 生成目录哈希清单
./scripts/verify-hash.sh -m generate -o SHA256SUMS ./dist/

# 排除指定目录
./scripts/verify-hash.sh -m generate -x 'node_modules/*' -x '.git/*' ./

# 校验哈希
./scripts/verify-hash.sh -m verify -e SHA256SUMS ./dist/

# 校验单个文件
./scripts/verify-hash.sh -m verify -e expected.txt app-v1.0.0.tar.gz
```

**功能**：
- 生成目录/文件的 SHA-256 哈希清单
- 支持排除特定文件/目录模式
- 校验文件完整性
- 详细的通过/失败统计
- 支持 GPG 签名（可选）

## 配置变量

### 核心变量

| 变量名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `SECURITY_PRODUCT_ID` | string | 是 | - | 安全产品唯一标识 |
| `SECURITY_API_TOKEN` | string | 否 | - | 安全平台 API 令牌 |
| `SECURITY_PLATFORM_URL` | string | 否 | `https://secops.example.com/api/v1` | 安全平台地址 |
| `FAIL_ON_CRITICAL` | boolean | 否 | `false` | 发现严重漏洞时是否使流水线失败 |
| `BYPASS_TOKEN` | string | 否 | - | 紧急逃生通道令牌 |
| `EMERGENCY_BYPASS_TOKEN` | string | 否 | - | 紧急逃生通道密钥 |

### 工具配置

| 变量名 | 对应工具 | 说明 |
|--------|----------|------|
| `SONAR_HOST_URL` | SonarQube | SonarQube 服务地址 |
| `SONAR_TOKEN` | SonarQube | SonarQube 访问令牌 |
| `SCAN_TARGET_URL` | ZAP / Nuclei | 动态扫描目标 URL |
| `MOBSF_URL` | MobSF | MobSF 服务地址 |
| `MOBSF_API_KEY` | MobSF | MobSF API Key |
| `MOBILE_APP_PATH` | MobSF | 移动应用文件路径 |
| `RELEASE_ARTIFACT_DIR` | SHA256 | 发版产物目录 |
| `EXPECTED_HASH_FILE` | SHA256 | 预期哈希文件路径 |
| `DEFECTDOJO_URL` | DefectDojo | DefectDojo 地址 |
| `DEFECTDOJO_API_KEY` | DefectDojo | DefectDojo API Key |

## 最佳实践

### 1. 渐进式接入

1. **第一周**：仅启用白天快扫，观察误报率
2. **第二周**：启用夜间深扫，评估扫描时长
3. **第三周**：启用发版审计，完善基线
4. **稳定后**：配置质量门禁，阻断严重漏洞

### 2. 质量门禁策略

- **开发环境**：仅报告，不阻断
- **测试环境**：高危及以上阻断
- **生产环境**：中危及以上阻断，需审批

### 3. 紧急逃生通道使用规范

- 仅允许在 P0 级故障修复时使用
- 使用前必须获得安全团队负责人审批
- 使用后 24 小时内必须补充完整扫描
- 审批记录需存档备查

### 4. 结果治理

- 定期（每周）审计误报并优化规则
- 建立漏洞修复 SLA：严重 24h / 高危 72h / 中危 7d / 低危 30d
- 误报标记需两人复核确认

## 许可证

MIT License
