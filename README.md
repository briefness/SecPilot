# SecPilot - 统一安全自动化管理平台

> 企业级 DevSecOps 平台，基于 DefectDojo 中台，整合 SAST/SCA/DAST/移动安全/API 安全全链路扫描能力，支持 GitHub / GitLab 强制合规流水线，内置流量染色与影子区隔离机制，确保生产环境零侵入的金融级安全测试。

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)
![DefectDojo](https://img.shields.io/badge/DefectDojo-2.x-orange)
![SonarQube](https://img.shields.io/badge/SonarQube-10.x-green)
![OWASP ZAP](https://img.shields.io/badge/OWASP%20ZAP-2.14-blue)
![MobSF](https://img.shields.io/badge/MobSF-3.x-purple)
![Nuclei](https://img.shields.io/badge/Nuclei-3.x-red)

## 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [API 文档](#api-文档)
- [CI/CD 集成](#cicd-集成)
- [安全加固](#安全加固)
- [开发指南](#开发指南)
- [相关文档](#相关文档)

## 项目概述

SecPilot 是一款企业级统一安全自动化管理平台，基于 **DefectDojo 中台** 构建，整合 SAST / SCA / DAST / 移动安全 / API 安全全链路扫描能力。平台采用**控制面与数据面分离**的微服务架构，通过**流量染色 + 影子区隔离**实现生产环境零侵入的安全测试，支持 **GitHub Required Workflows** 和 **GitLab Compliance Pipelines** 两种强制合规模式，项目无法绕过。

### 解决的核心痛点

1. **工具碎片化**：多套安全工具各自为战，数据不互通
2. **误报率高**：重复漏洞告警，运营效率低下
3. **测试风险**：安全测试可能影响生产环境稳定性 / 造成资损
4. **项目绕过**：传统 include 模式下项目可随意删除安全扫描步骤
5. **合规压力**：缺乏统一的审计追踪和合规报告
6. **链路不可见**：黑盒扫描导致服务异常时无法快速定位根因

## 核心功能

### 🔐 DefectDojo 中台核心

- **统一漏洞资产流水账**：所有扫描器结果统一汇聚到 DefectDojo，全局漏洞生命周期管理
- **Pull + Push 双模式**：支持主动上报（Push）与定时拉取（Pull）兜底，双保险防漏报
- **去重引擎**：基于 CWE + 路径 + 参数散列的多维去重，大幅降低误报运营成本
- **Slack / PagerDuty 通知**：关键事件实时告警，紧急 Bypass 顶格推送

### 🛡️ 六类扫描器真实接入

| 类型     | 扫描器      | 触发方式         | 说明                                    |
| -------- | ----------- | ---------------- | --------------------------------------- |
| SAST     | SonarQube   | 代码提交         | 源码白盒扫描                            |
| SCA      | OSV-Scanner | 代码提交         | 离线依赖审计，无网确定性防御            |
| DAST     | OWASP ZAP   | 凌晨定时         | 动态黑盒漏洞扫描                        |
| 浏览器   | Playwright  | 动态扫描辅助     | 爬虫驱动跨越登录墙 + TraceId 全链路染色 |
| 移动安全 | MobSF       | 发版构建         | APK/IPA 逆向 + 隐私合规审计             |
| API/架构 | Nuclei      | 周末 / 0day 爆发 | YAML 模板高速撞库扫描                   |

### 🎨 金融级流量染色与影子区

- **HMAC 动态签名**：`X-SecOps-Sign` + 时间窗口（±5min），防重放防伪造
- **Header Sanitization**：边缘网关清洗 `X-SecOps-*` 前缀，防标头走私
- **IP 白名单**：仅允许指定执行机网段的染色流量
- **影子 Redis**：染色流量自动加 `secops:` key 前缀，零污染
- **影子 MQ**：自动路由到影子队列 / 死信队列，不影响真实业务
- **Mock Stub 中间件**：消息接口直接拦截返回 200，金融扣款路由到内存桩，零资损

### 🔒 强制合规流水线（项目无法绕过）

- **GitHub Required Workflows**：Org 级别强制工作流，所有 PR 必须通过安全门禁
- **GitLab Compliance Pipelines**：Group 级别合规框架，项目无法通过删除 include 逃避审计
- **SECURITY_PRODUCT_ID 强校验**：上报时二次校验项目绑定关系，防"李代桃僵"
- **四阶段分层错峰**：白天快扫 / 夜间深扫 / 发版审计 / 应急巡检
- **SHA-256 哈希链**：发版资产二进制签名，防篡改防绕过

### 🚨 紧急逃生通道（Bypass）

- **组级别 Token 放行**：`SECURITY_BYPASS_TOKEN` 紧急跳过
- **实时顶格告警**：触发 PagerDuty + Slack 抄送 CTO 团队
- **审计追溯**：全程留痕，"非安全合规发布"标签，24h 内必须复核
- **分级熔断**：Critical/High 阻断，Medium 报警 + 3~7 天宽限期

### 🛠️ 安全加固

- **MFA 多因素认证**：TOTP 二次验证，控制面强制开启
- **应用层字段加密**：AES-256-GCM 敏感字段落盘加密（API Key / Token）
- **容器化隔离**：所有扫描节点 Docker 非特权模式死隔离
- **审计日志**：所有操作全程留痕

### 📊 安全运营仪表盘

- **全局态势总览**：所有项目安全状态一览
- **趋势分析**：漏洞变化趋势追踪
- **TOP 风险**：高危漏洞 / 高频问题快速定位
- **多维统计**：严重级别 / CWE / 文件 / 项目多维度分析

### 🎛️ 项目级扫描配置（一键扫描）

- **每项目独立配置**：6 类扫描器可分别开关，互不影响
- **一键触发扫描**：项目详情页一键启动所有已启用扫描器
- **参数自定义**：每扫描器支持独立参数配置
- **定时调度**：支持按项目设置扫描计划

### 🧪 第三方渗透测试管理

- PenTest 项目全生命周期管理
- 第三方机构与报告归档
- 合规审计期自动提醒

## 系统架构

### 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 Dashboard                           │
│              (React + TypeScript + TailwindCSS)                 │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS / REST API
┌────────────────────────────────▼────────────────────────────────┐
│                    控制面 (Control Plane)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  DefectDojo  │  │  Fastify API │  │  BullMQ / Redis      │  │
│  │  中台 (Django)│  │  编排引擎    │  │  异步削峰队列        │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬────────────┘  │
│         │                 │                     │               │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼────────────┐  │
│  │  去重引擎    │  │  项目/扫描   │  │  通知 (Slack/PD)     │  │
│  │  MFA / 加密  │  │  Bypass 管理 │  │  Pull 兜底 Cron      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────┘
                                    │ 异步队列
┌───────────────────────────────────▼──────────────────────────────┐
│                      数据面 (Data Plane)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ SonarQube│ │ OSV      │ │ ZAP      │ │Playwright│ │ MobSF  │ │
│  │ SAST     │ │ SCA      │ │ DAST     │ │ 浏览器爬虫│ │ 移动端 │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────┐                                                   │
│  │ Nuclei   │                                                   │
│  │ API      │                                                   │
│  └──────────┘                                                   │
│                                                                  │
│  流量染色 → 影子 Redis (secops:*) → 影子 MQ (-shadow)             │
└─────────────────────────────────────────────────────────────────┘
```

### 控制面 / 数据面分离

- **控制面**：负责任务编排、状态管理、用户交互，运行在安全环境
- **数据面**：执行实际扫描和流量处理，可水平扩展，支持边界部署

### 流量染色工作流

```
 安全测试端                    业务系统                   数据面
     │                            │                         │
     │ 1. 生成染色请求             │                         │
     │    (HMAC签名+时间戳)        │                         │
     ├───────────────────────────►│                         │
     │                            │  2. 染色标识校验         │
     │                            ├────────────────────────►│
     │                            │                         │ 3. 影子路由
     │                            │  4. 返回结果            │
     │◄───────────────────────────┤◄────────────────────────┤
     │                            │                         │
```

更多架构细节请参考 [架构文档](docs/ARCHITECTURE.md)。

## 技术栈

### 后端

| 技术       | 用途        |
| ---------- | ----------- |
| Node.js    | 运行时      |
| Fastify    | Web 框架    |
| TypeScript | 类型安全    |
| Prisma     | ORM         |
| PostgreSQL | 主数据库    |
| Redis      | 缓存 / 队列 |
| BullMQ     | 任务队列    |
| Zod        | 参数校验    |
| JWT        | 身份认证    |

### 前端

| 技术         | 用途     |
| ------------ | -------- |
| React        | UI 框架  |
| TypeScript   | 类型安全 |
| Vite         | 构建工具 |
| Tailwind CSS | 样式框架 |
| React Query  | 数据获取 |

### 后端安全能力

| 技术        | 用途                               |
| ----------- | ---------------------------------- |
| DefectDojo  | 漏洞生命周期管理中台               |
| SonarQube   | SAST 静态代码扫描                  |
| OSV-Scanner | SCA 离线依赖审计                   |
| OWASP ZAP   | DAST 动态应用扫描                  |
| Playwright  | 浏览器自动化 + 爬虫 + TraceId 注入 |
| MobSF       | 移动应用安全逆向分析               |
| Nuclei      | API / 基础架构漏洞扫描             |
| AES-256-GCM | 应用层敏感字段加密                 |
| TOTP        | MFA 多因素认证                     |

### DevOps

| 技术                        | 用途                           |
| --------------------------- | ------------------------------ |
| Docker                      | 容器化                         |
| Docker Compose              | 本地编排                       |
| Nginx                       | 反向代理 + Header Sanitization |
| pnpm                        | 包管理器                       |
| GitHub Required Workflows   | Org 级强制合规流水线           |
| GitLab Compliance Pipelines | Group 级强制合规框架           |

## 快速开始

### 环境要求

- Node.js >= 18.x
- pnpm >= 9.x
- Docker & Docker Compose (本地开发)
- PostgreSQL >= 14
- Redis >= 7

### 快速安装

```bash
# 1. 克隆仓库
git clone <repository-url>
cd secops-platform

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要配置

# 4. 启动基础设施 (PostgreSQL + Redis)
# 注意：若本地已有其他 PostgreSQL 容器占用 5432，infra/docker-compose.yml
# 已将 secpilot-postgres 映射到 5434，secpilot-redis 映射到 6378，与 apps/api/.env 一致
pnpm infra:up

# 5. 初始化数据库
pnpm db:push
pnpm db:seed

# 6. 启动开发服务
pnpm dev
```

服务启动后：

- API 服务: http://localhost:3000
- 前端仪表盘: http://localhost:5173
- 健康检查: http://localhost:3000/api/health

更详细的快速开始指南请参考 [快速上手指南](docs/QUICKSTART.md)。

### Docker 一键部署

最简单的部署方式，一条命令启动全部服务。

```bash
# 1. 克隆仓库
git clone <repository-url>
cd secpilot

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 修改密码和密钥（生产环境必须修改）

# 3. 启动核心服务（API + 前端 + Postgres + Redis）
cd infra
docker compose up -d

# 4. （可选）启动全部扫描器
docker compose --profile scanners up -d
```

**服务清单：**

| 服务       | 端口 | 说明                            |
| ---------- | ---- | ------------------------------- |
| 前端仪表盘 | 8080 | http://localhost:8080           |
| API 服务   | 3000 | http://localhost:3000           |
| PostgreSQL | 5434 | 数据库                          |
| Redis      | 6378 | 队列 + 缓存                     |
| SonarQube  | 9000 | SAST 扫描 (scanners profile)    |
| OWASP ZAP  | 8081 | DAST 扫描 (scanners profile)    |
| Playwright | —    | 浏览器爬虫扫描，内置 API 镜像   |
| MobSF      | 8000 | 移动安全扫描 (scanners profile) |

**仅用基础服务（不含扫描器）：**

```bash
docker compose up -d
```

**带全部扫描器：**

```bash
docker compose --profile scanners up -d
```

**首次启动需要初始化管理员账号，执行以下命令后使用默认账号登录：**

```bash
pnpm db:seed
```

默认账号：`admin@secops.local` / `admin123`（生产环境请立即修改密码并开启 MFA）

## 项目结构

```
secops-platform/
├── apps/
│   ├── api/                    # API 服务 (控制面)
│   │   ├── src/
│   │   │   ├── routes/         # API 路由
│   │   │   ├── plugins/        # Fastify 插件
│   │   │   ├── lib/            # 核心库
│   │   │   ├── utils/          # 工具函数
│   │   │   └── workers/        # 扫描 Worker
│   │   └── prisma/             # 数据库 Schema
│   └── dashboard/              # 前端仪表盘
│       └── src/
│           ├── pages/          # 页面组件
│           ├── components/     # 通用组件
│           ├── hooks/          # 自定义 Hooks
│           └── lib/            # 前端工具库
├── packages/
│   ├── shared-types/           # 共享类型定义
│   ├── traffic-dye/            # 流量染色模块
│   └── ci-templates/           # CI/CD 流水线模板
├── infra/
│   ├── docker-compose.yml      # 本地基础设施编排
│   └── nginx/                  # Nginx 配置
├── docs/                       # 项目文档
├── package.json                # 根 package.json
├── pnpm-workspace.yaml         # pnpm 工作区配置
└── .env.example                # 环境变量示例
```

## API 文档

完整的 API 接口文档请参考 [API 文档](docs/API.md)。

### 主要接口

| 模块         | 端点前缀                            | 说明                       |
| ------------ | ----------------------------------- | -------------------------- |
| 认证         | `/api/auth/*`                       | 登录、MFA、Token 管理      |
| 用户         | `/api/users/*`                      | 用户 CRUD、角色管理        |
| 项目         | `/api/projects/*`                   | 项目 CRUD、统计、扫描配置  |
| 扫描         | `/api/scans/*`                      | 扫描任务管理、门禁检查     |
| 项目扫描配置 | `/api/projects/:id/scanner-configs` | 项目级扫描器开关与参数配置 |
| 一键扫描     | `/api/projects/:id/scan`            | 触发项目所有已启用扫描器   |
| 漏洞         | `/api/findings/*`                   | 漏洞查询、去重、误报标记   |
| 仪表盘       | `/api/dashboard/*`                  | 仪表盘统计数据             |
| Bypass       | `/api/bypass/*`                     | 紧急绕过管理、审批         |
| GitHub 集成  | `/api/github-integrations/*`        | 项目级 GitHub 集成         |
| GitHub Org   | `/api/github-org-integrations/*`    | Org 级强制合规流水线       |
| GitLab 集成  | `/api/gitlab-integrations/*`        | 项目级 GitLab 集成         |
| GitLab Group | `/api/gitlab-group-integrations/*`  | Group 级强制合规框架       |
| DefectDojo   | `/api/integrations/defectdojo/*`    | DD 同步、配置              |
| 系统配置     | `/api/system-config/*`              | 全局配置管理               |
| 审计日志     | `/api/audit-logs/*`                 | 操作审计追溯               |
| API Keys     | `/api/api-keys/*`                   | API 凭证管理               |
| 应用发布     | `/api/app-releases/*`               | 发版哈希链、MobSF 审计     |
| 流水线       | `/api/pipeline/*`                   | 四阶段流水线配置           |
| 渗透测试     | `/api/pentests/*`                   | 第三方 PenTest 管理        |
| 健康检查     | `/api/health`                       | 服务健康状态               |

## CI/CD 集成

平台提供完整的 CI/CD 流水线模板，支持 **GitHub Required Workflows** 和 **GitLab Compliance Pipelines** 两种强制合规模式，项目无法绕过。

### 强制合规模式

| 平台   | 机制                 | 级别     | 说明                                          |
| ------ | -------------------- | -------- | --------------------------------------------- |
| GitHub | Required Workflows   | Org 级   | Org 级别强制工作流，所有 PR 必须通过          |
| GitLab | Compliance Pipelines | Group 级 | Group 级别合规框架，项目无法删除 include 逃避 |

### 四阶段流水线

| 阶段     | 触发           | 扫描器           | 阻断策略           |
| -------- | -------------- | ---------------- | ------------------ |
| 白天快扫 | Commit / PR    | SonarQube + OSV  | Critical/High 阻断 |
| 夜间深扫 | 凌晨 2:00 Cron | ZAP + Playwright | 报警 + 宽限期      |
| 发版审计 | Tag / 加固前   | MobSF + 哈希链   | 全部阻断           |
| 应急巡检 | 0day 爆发时    | Nuclei           | 按 CVE 等级        |

### 流水线模板位置

```
packages/ci-templates/
├── gitlab/
│   └── security-compliance.yml       # GitLab CI 模板
├── github-actions/
│   └── security-compliance.yml        # GitHub Actions 模板
└── scripts/
    ├── report.sh                       # 结果上报脚本
    └── verify-hash.sh                  # 哈希校验脚本
```

### Mock Stub 中间件 SDK（业务侧接入）

业务系统接入流量染色与影子区隔离：

```typescript
import {
  createDyeMiddleware,
  createShadowRedis,
  createShadowMq,
} from "@secops/traffic-dye";

// Express/Fastify 中间件：自动识别染色流量 + Mock 路由
const dyeMiddleware = createDyeMiddleware({
  salt: process.env.SECURITY_DYE_SALT!,
  mockRoutes: [
    { path: "/api/sms/send", responseBody: { ok: true, simulated: true } },
    {
      path: "/api/wallet/deduct",
      handler: (req, res) => res.json({ status: "mock" }),
    },
  ],
});

// 影子 Redis：自动加 secops: 前缀
const shadowRedis = createShadowRedis(redis);

// 影子 MQ：自动路由到 -shadow 队列
const shadowProducer = createShadowMq(mqProducer);
```

## 开发指南

### 常用命令

```bash
# 安装依赖
pnpm install

# 启动所有服务
pnpm dev

# 仅启动 API 服务
pnpm dev:api

# 仅启动前端
pnpm dev:dashboard

# 构建
pnpm build

# 数据库操作
pnpm db:push      # 推送 Schema
pnpm db:seed      # 种子数据
pnpm db:generate  # 生成 Prisma Client

# 基础设施
pnpm infra:up     # 启动
pnpm infra:down   # 停止
```

### 代码规范

- TypeScript 严格模式
- 统一的 ESLint / Prettier 配置
- 使用 Zod 进行运行时参数校验

### 提交规范

采用 Conventional Commits 规范：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具链相关
```

## 相关文档

- [架构设计文档](docs/ARCHITECTURE.md) - 详细的系统架构说明
- [快速上手指南](docs/QUICKSTART.md) - 环境搭建和本地运行指南
- [API 接口文档](docs/API.md) - 完整的 API 接口说明
- [CI/CD 集成指南](docs/CICD.md) - 流水线接入方式
- [流量染色中间件使用文档](packages/traffic-dye/README.md) - Mock Stub / 影子区 SDK 使用说明
- [CI 模板 README](packages/ci-templates/README.md) - 流水线模板使用说明

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交 PR 流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

MIT License

## 联系我们

如有问题或建议，欢迎通过以下方式联系：

- 提交 Issue
- 发送邮件至 [lzyagi@agent.qq.com]
