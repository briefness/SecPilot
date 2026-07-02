# API 接口文档

> SecOps Platform 完整 API 参考手册

## 目录

- [概述](#概述)
- [认证方式](#认证方式)
- [通用约定](#通用约定)
- [健康检查](#健康检查)
- [认证接口](#认证接口)
- [项目管理](#项目管理)
- [扫描管理](#扫描管理)
- [漏洞管理](#漏洞管理)
- [仪表盘](#仪表盘)
- [Bypass 管理](#bypass-管理)
- [队列状态](#队列状态)
- [数据模型](#数据模型)
- [错误码](#错误码)

## 概述

### Base URL

```
http://localhost:3000/api
```

### 协议

- 协议：HTTPS（生产环境）/ HTTP（开发环境）
- 数据格式：JSON
- 字符编码：UTF-8

### 版本

当前 API 版本：v1

所有接口都以 `/api/` 为前缀。

## 认证方式

### Bearer Token

大部分接口需要认证，使用 JWT Bearer Token：

```http
Authorization: Bearer <your-token>
```

### 获取 Token

通过登录接口获取 Token，有效期默认为 24 小时。

## 通用约定

### 请求格式

所有 POST/PUT/PATCH 请求的 Content-Type 为 `application/json`。

### 响应格式

#### 成功响应

```json
{
  "data": {},
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### 错误响应

```json
{
  "error": "Error message",
  "details": []
}
```

### 分页参数

| 参数 | 类型 | 默认值 | 范围 | 说明 |
|------|------|--------|------|------|
| page | integer | 1 | >=1 | 页码 |
| pageSize | integer | 20 | 1-100 | 每页数量 |

### 排序

部分接口支持排序参数，具体见各接口说明。

## 健康检查

### GET /api/health

获取服务健康状态。

**无需认证**

**响应示例**：

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": "healthy",
    "queue": "healthy"
  }
}
```

**响应字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 服务状态：ok / error |
| timestamp | string | 时间戳 (ISO 8601) |
| version | string | 服务版本 |
| environment | string | 运行环境 |
| services.database | string | 数据库状态 |
| services.queue | string | 队列状态 |

## 认证接口

### POST /api/auth/login

用户登录，获取访问令牌。

**无需认证**

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |
| password | string | 是 | 密码 |

**请求示例**：

```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**响应示例**：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cuid123",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "ADMIN",
    "mfaEnabled": false
  }
}
```

**响应字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | JWT 访问令牌 |
| user.id | string | 用户 ID |
| user.email | string | 用户邮箱 |
| user.name | string | 用户姓名 |
| user.role | string | 用户角色 |
| user.mfaEnabled | boolean | MFA 是否已启用 |

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 400 | 参数校验失败 |
| 401 | 凭据无效 |

---

### GET /api/auth/me

获取当前登录用户信息。

**需要认证**

**响应示例**：

```json
{
  "user": {
    "id": "cuid123",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "ADMIN",
    "mfaEnabled": false,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### GET /api/auth/mfa/status

获取当前用户的 MFA 状态。

**需要认证**

**响应示例**：

```json
{
  "mfaEnabled": false
}
```

---

### POST /api/auth/logout

用户登出。

**需要认证**

**响应示例**：

```json
{
  "success": true
}
```

## 项目管理

### GET /api/projects

获取项目列表，支持分页和筛选。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页数量，默认 20 |
| type | string | 否 | 项目类型：WEB/MOBILE/API/INFRA |
| status | string | 否 | 项目状态：ACTIVE/INACTIVE/ONBOARDING |
| search | string | 否 | 搜索关键词（名称/产品ID/仓库） |

**响应示例**：

```json
{
  "data": [
    {
      "id": "cuid123",
      "name": "电商平台",
      "productId": "PROD-001",
      "gitRepo": "https://git.example.com/ecommerce",
      "type": "WEB",
      "status": "ACTIVE",
      "onboardingStage": 5,
      "lastScanAt": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "_count": {
        "scanTasks": 50,
        "findings": 120
      },
      "findingSummary": {
        "CRITICAL": 2,
        "HIGH": 8,
        "MEDIUM": 25,
        "LOW": 60,
        "INFO": 25
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /api/projects/:id

获取单个项目详情。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 项目 ID |

**响应示例**：

```json
{
  "id": "cuid123",
  "name": "电商平台",
  "productId": "PROD-001",
  "gitRepo": "https://git.example.com/ecommerce",
  "type": "WEB",
  "status": "ACTIVE",
  "onboardingStage": 5,
  "lastScanAt": "2024-01-01T00:00:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "_count": {
    "scanTasks": 50,
    "findings": 120
  },
  "findingSummary": {
    "CRITICAL": 2,
    "HIGH": 8,
    "MEDIUM": 25,
    "LOW": 60,
    "INFO": 25
  }
}
```

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 项目不存在 |

---

### POST /api/projects

创建新项目。

**需要认证**

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 项目名称 (1-255 字符) |
| productId | string | 是 | 产品唯一标识 (1-100 字符) |
| gitRepo | string | 是 | Git 仓库地址 |
| type | string | 是 | 项目类型：WEB/MOBILE/API/INFRA |

**请求示例**：

```json
{
  "name": "移动支付 App",
  "productId": "PROD-MOBILE-001",
  "gitRepo": "https://git.example.com/mobile-pay",
  "type": "MOBILE"
}
```

**响应示例**：

```json
{
  "id": "cuid456",
  "name": "移动支付 App",
  "productId": "PROD-MOBILE-001",
  "gitRepo": "https://git.example.com/mobile-pay",
  "type": "MOBILE",
  "status": "ONBOARDING",
  "onboardingStage": 0,
  "lastScanAt": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 400 | 参数校验失败 |
| 409 | 产品 ID 已存在 |

---

### PUT /api/projects/:id

更新项目信息。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 项目 ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 项目名称 |
| gitRepo | string | 否 | Git 仓库地址 |
| type | string | 否 | 项目类型 |
| status | string | 否 | 项目状态 |
| onboardingStage | integer | 否 | 接入阶段 (0-5) |

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 项目不存在 |

---

### DELETE /api/projects/:id

删除项目。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 项目 ID |

**响应**：204 No Content

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 项目不存在 |

---

### GET /api/projects/:id/stats

获取项目统计数据。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 项目 ID |

**响应示例**：

```json
{
  "findingSummary": {
    "CRITICAL": 2,
    "HIGH": 8,
    "MEDIUM": 25,
    "LOW": 60,
    "INFO": 25
  },
  "totalScans": 50,
  "last30DaysScans": 15,
  "lastScanAt": "2024-01-01T00:00:00.000Z",
  "topFindings": [
    {
      "id": "cuid789",
      "title": "SQL 注入漏洞",
      "severity": "CRITICAL",
      "cwe": "CWE-89",
      "filePath": "src/api/user.ts"
    }
  ]
}
```

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 项目不存在 |

## 扫描管理

### GET /api/scans

获取扫描任务列表。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页数量，默认 20 |
| projectId | string | 否 | 项目 ID 筛选 |
| status | string | 否 | 状态筛选 |
| type | string | 否 | 扫描类型筛选 |
| pipelineStage | string | 否 | 流水线阶段筛选 |

**响应示例**：

```json
{
  "data": [
    {
      "id": "cuid123",
      "type": "STATIC_SAST",
      "status": "COMPLETED",
      "projectId": "cuid456",
      "pipelineStage": "DAY_FAST_SCAN",
      "targetUrl": null,
      "branch": "main",
      "commitHash": "abc123def456",
      "triggeredBy": "user123",
      "triggeredAt": "2024-01-01T00:00:00.000Z",
      "startedAt": "2024-01-01T00:01:00.000Z",
      "completedAt": "2024-01-01T00:05:00.000Z",
      "durationSeconds": 240,
      "traceId": "trace-abc123",
      "findingsCritical": 2,
      "findingsHigh": 5,
      "findingsMedium": 10,
      "findingsLow": 20,
      "findingsInfo": 8,
      "errorMessage": null,
      "project": {
        "id": "cuid456",
        "name": "电商平台",
        "productId": "PROD-001"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /api/scans/:id

获取单个扫描任务详情。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 扫描任务 ID |

**响应示例**：

```json
{
  "id": "cuid123",
  "type": "STATIC_SAST",
  "status": "COMPLETED",
  "projectId": "cuid456",
  "pipelineStage": "DAY_FAST_SCAN",
  "targetUrl": null,
  "branch": "main",
  "commitHash": "abc123def456",
  "triggeredBy": "user123",
  "triggeredAt": "2024-01-01T00:00:00.000Z",
  "startedAt": "2024-01-01T00:01:00.000Z",
  "completedAt": "2024-01-01T00:05:00.000Z",
  "durationSeconds": 240,
  "traceId": "trace-abc123",
  "findingsCritical": 2,
  "findingsHigh": 5,
  "findingsMedium": 10,
  "findingsLow": 20,
  "findingsInfo": 8,
  "errorMessage": null,
  "project": {
    "id": "cuid456",
    "name": "电商平台",
    "productId": "PROD-001"
  },
  "findings": [
    {
      "id": "find1",
      "title": "SQL 注入漏洞",
      "severity": "CRITICAL"
    }
  ],
  "_count": {
    "findings": 45
  }
}
```

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 扫描任务不存在 |

---

### POST /api/scans

创建并触发新的扫描任务。

**需要认证**

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectId | string | 是 | 项目 ID |
| type | string | 是 | 扫描类型 |
| pipelineStage | string | 否 | 流水线阶段 |
| targetUrl | string | 否 | 目标 URL (DAST 等) |
| branch | string | 否 | 代码分支 |
| commitHash | string | 否 | 提交哈希 |

**扫描类型枚举**：

| 类型 | 说明 |
|------|------|
| STATIC_SAST | 静态代码分析 |
| STATIC_SCA | 软件成分分析 |
| DYNAMIC_H5 | H5 动态扫描 |
| MOBILE_MOBSF | 移动应用扫描 |
| API_NUCLEI | Nuclei 漏洞扫描 |

**请求示例**：

```json
{
  "projectId": "cuid456",
  "type": "STATIC_SAST",
  "pipelineStage": "DAY_FAST_SCAN",
  "branch": "main",
  "commitHash": "abc123def456"
}
```

**响应示例**：

```json
{
  "id": "cuid123",
  "type": "STATIC_SAST",
  "status": "PENDING",
  "projectId": "cuid456",
  "pipelineStage": "DAY_FAST_SCAN",
  "branch": "main",
  "commitHash": "abc123def456",
  "triggeredBy": "user789",
  "triggeredAt": "2024-01-01T00:00:00.000Z",
  "traceId": "trace-uuid-123",
  "findingsCritical": 0,
  "findingsHigh": 0,
  "findingsMedium": 0,
  "findingsLow": 0,
  "findingsInfo": 0
}
```

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 400 | 参数校验失败 |
| 404 | 项目不存在 |

---

### GET /api/scans/:id/status

获取扫描任务状态（精简版）。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 扫描任务 ID |

**响应示例**：

```json
{
  "id": "cuid123",
  "status": "RUNNING",
  "startedAt": "2024-01-01T00:01:00.000Z",
  "completedAt": null,
  "durationSeconds": null,
  "findingsCritical": 0,
  "findingsHigh": 2,
  "findingsMedium": 5,
  "findingsLow": 10,
  "findingsInfo": 3,
  "errorMessage": null
}
```

---

### POST /api/scans/:id/cancel

取消扫描任务。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 扫描任务 ID |

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 400 | 当前状态无法取消 |
| 404 | 扫描任务不存在 |

---

### GET /api/scans/:id/findings

获取扫描任务的漏洞列表。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 扫描任务 ID |

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码 |
| pageSize | integer | 否 | 每页数量 |
| severity | string | 否 | 严重级别筛选 |
| falsePositive | boolean | 否 | 是否误报 |

## 漏洞管理

### GET /api/findings

获取漏洞列表，支持多维度筛选。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页数量，默认 50 |
| projectId | string | 否 | 项目 ID 筛选 |
| scanId | string | 否 | 扫描 ID 筛选 |
| severity | string | 否 | 严重级别筛选 |
| falsePositive | boolean | 否 | 是否误报筛选 |
| cwe | string | 否 | CWE 编号筛选 |
| search | string | 否 | 关键词搜索 |
| dedupHash | string | 否 | 去重哈希筛选 |
| sortBy | string | 否 | 排序字段：severity/createdAt/filePath |
| sortOrder | string | 否 | 排序方向：asc/desc |

**响应示例**：

```json
{
  "data": [
    {
      "id": "cuid123",
      "title": "SQL 注入漏洞",
      "severity": "CRITICAL",
      "cwe": "CWE-89",
      "cve": null,
      "cvss": 9.8,
      "description": "在用户查询接口中发现 SQL 注入漏洞...",
      "location": null,
      "filePath": "src/api/user.ts",
      "lineStart": 128,
      "lineEnd": 135,
      "scanId": "scan123",
      "projectId": "proj456",
      "dedupHash": "a1b2c3d4e5f6",
      "falsePositive": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "project": {
        "id": "proj456",
        "name": "电商平台",
        "productId": "PROD-001"
      },
      "scan": {
        "id": "scan123",
        "type": "STATIC_SAST",
        "status": "COMPLETED",
        "triggeredAt": "2024-01-01T00:00:00.000Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /api/findings/:id

获取单个漏洞详情。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 漏洞 ID |

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 漏洞不存在 |

---

### PATCH /api/findings/:id/false-positive

标记或取消标记误报。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 漏洞 ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| falsePositive | boolean | 是 | 是否标记为误报 |
| reason | string | 否 | 标记原因 |

**请求示例**：

```json
{
  "falsePositive": true,
  "reason": "该输入已在前置中间件中做了严格校验"
}
```

**错误码**：

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 漏洞不存在 |

---

### GET /api/findings/dedup/:hash

根据去重哈希查询所有相关漏洞。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| hash | string | 去重哈希值 |

**响应示例**：

```json
{
  "dedupHash": "a1b2c3d4e5f6",
  "totalOccurrences": 5,
  "uniqueProjects": 2,
  "uniqueScans": 4,
  "findings": [
    {
      "id": "find1",
      "title": "SQL 注入漏洞",
      "severity": "CRITICAL",
      "project": { "id": "proj1", "name": "项目 A" },
      "scan": { "id": "scan1", "type": "STATIC_SAST" }
    }
  ]
}
```

---

### POST /api/findings/dedup/compute

计算去重哈希并检查是否已存在。

**需要认证**

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cwe | string | 否 | CWE 编号 |
| filePath | string | 否 | 文件路径 |
| lineStart | integer | 否 | 起始行号 |
| location | string | 否 | 漏洞位置 |
| title | string | 否 | 漏洞标题 |
| params | object | 否 | 参数键值对 |

**响应示例**：

```json
{
  "dedupHash": "a1b2c3d4e5f6",
  "existingFindings": 3,
  "isDuplicate": true
}
```

---

### GET /api/findings/stats/summary

获取漏洞统计概览。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectId | string | 否 | 项目 ID（可选） |

**响应示例**：

```json
{
  "total": 150,
  "severityDistribution": {
    "CRITICAL": 5,
    "HIGH": 20,
    "MEDIUM": 45,
    "LOW": 60,
    "INFO": 20
  },
  "topCwes": [
    { "cwe": "CWE-89", "count": 15 },
    { "cwe": "CWE-79", "count": 12 }
  ],
  "topFiles": [
    { "filePath": "src/api/user.ts", "count": 8 }
  ]
}
```

## 仪表盘

### GET /api/dashboard/overview

获取仪表盘全局概览数据。

**需要认证**

**响应示例**：

```json
{
  "totalProjects": 10,
  "totalFindings": 500,
  "criticalFindings": 10,
  "highFindings": 50,
  "mediumFindings": 150,
  "lowFindings": 250,
  "runningScans": 3,
  "scansToday": 15,
  "findingsTrend": [
    { "date": "2024-01-01", "count": 5 },
    { "date": "2024-01-02", "count": 8 }
  ],
  "severityDistribution": {
    "CRITICAL": 10,
    "HIGH": 50,
    "MEDIUM": 150,
    "LOW": 250,
    "INFO": 40
  },
  "scanTypeDistribution": {
    "STATIC_SAST": 100,
    "STATIC_SCA": 80,
    "DYNAMIC_H5": 30,
    "MOBILE_MOBSF": 10,
    "API_NUCLEI": 20
  },
  "topProjectsByFindings": [
    { "projectId": "proj1", "projectName": "电商平台", "count": 120 }
  ]
}
```

---

### GET /api/dashboard/trends

获取趋势数据。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | integer | 否 | 天数，默认 30 (7-365) |
| metric | string | 否 | 指标类型：findings/scans，默认 findings |

**响应示例**：

```json
{
  "metric": "findings",
  "days": 30,
  "data": [
    {
      "date": "2024-01-01",
      "CRITICAL": 1,
      "HIGH": 3,
      "MEDIUM": 5,
      "LOW": 10,
      "INFO": 2,
      "total": 21
    }
  ]
}
```

---

### GET /api/dashboard/distribution/severity

获取漏洞严重级别分布。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectId | string | 否 | 项目 ID（可选） |

---

### GET /api/dashboard/scan-type-distribution

获取扫描类型分布。

**需要认证**

---

### GET /api/dashboard/recent-activity

获取最近活动。

**需要认证**

**响应示例**：

```json
{
  "recentScans": [
    {
      "id": "scan1",
      "type": "STATIC_SAST",
      "status": "COMPLETED",
      "triggeredAt": "2024-01-01T00:00:00.000Z",
      "project": { "id": "proj1", "name": "项目 A" }
    }
  ],
  "recentFindings": [...],
  "recentAuditLogs": [...]
}
```

## Bypass 管理

### GET /api/bypass

获取 Bypass 申请列表。

**需要认证**

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码 |
| pageSize | integer | 否 | 每页数量 |
| projectId | string | 否 | 项目 ID 筛选 |
| status | string | 否 | 状态筛选 |
| requestedBy | string | 否 | 申请人筛选 |

**状态枚举**：

| 状态 | 说明 |
|------|------|
| PENDING | 待审批 |
| APPROVED | 已通过 |
| REJECTED | 已拒绝 |
| EXPIRED | 已过期 |

---

### GET /api/bypass/:id

获取单个 Bypass 申请详情。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | Bypass 申请 ID |

---

### POST /api/bypass

提交 Bypass 申请。

**需要认证**

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectId | string | 是 | 项目 ID |
| reason | string | 是 | 申请原因 (10-1000 字符) |
| expiresAt | string | 是 | 过期时间 (ISO 8601) |

**请求示例**：

```json
{
  "projectId": "proj123",
  "reason": "P0 级故障紧急修复，需要临时绕过安全扫描",
  "expiresAt": "2024-01-02T00:00:00.000Z"
}
```

---

### POST /api/bypass/:id/approve

审批 Bypass 申请。

**需要认证 (ADMIN/AUDITOR 角色)**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | Bypass 申请 ID |

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 是 | 审批结果：APPROVED / REJECTED |
| comment | string | 否 | 审批意见 |

---

### GET /api/bypass/project/:projectId/active

获取项目的有效 Bypass 列表。

**需要认证**

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| projectId | string | 项目 ID |

**响应示例**：

```json
{
  "active": true,
  "count": 1,
  "bypasses": [
    {
      "id": "bypass1",
      "reason": "紧急修复",
      "expiresAt": "2024-01-02T00:00:00.000Z",
      "requester": { "name": "张三" },
      "approver": { "name": "李四" }
    }
  ]
}
```

---

### GET /api/bypass/stats/summary

获取 Bypass 统计数据。

**需要认证**

**响应示例**：

```json
{
  "total": 50,
  "pending": 3,
  "approved": 40,
  "rejected": 5,
  "expired": 2
}
```

## 队列状态

### GET /api/queue/stats

获取任务队列统计信息。

**需要认证**

**响应示例**：

```json
{
  "waiting": 5,
  "active": 2,
  "completed": 150,
  "failed": 3,
  "delayed": 0
}
```

## 数据模型

### 枚举值

#### UserRole（用户角色）

| 值 | 说明 |
|----|------|
| ADMIN | 管理员 |
| DEVELOPER | 开发者 |
| AUDITOR | 审计员 |
| VIEWER | 查看者 |

#### ProjectType（项目类型）

| 值 | 说明 |
|----|------|
| WEB | Web 应用 |
| MOBILE | 移动应用 |
| API | API 服务 |
| INFRA | 基础设施 |

#### ProjectStatus（项目状态）

| 值 | 说明 |
|----|------|
| ACTIVE | 活跃 |
| INACTIVE | 未激活 |
| ONBOARDING | 接入中 |

#### ScanType（扫描类型）

| 值 | 说明 |
|----|------|
| STATIC_SAST | 静态代码分析 |
| STATIC_SCA | 软件成分分析 |
| DYNAMIC_H5 | H5 动态扫描 |
| MOBILE_MOBSF | MobSF 移动扫描 |
| API_NUCLEI | Nuclei 漏洞扫描 |

#### ScanStatus（扫描状态）

| 值 | 说明 |
|----|------|
| PENDING | 等待中 |
| RUNNING | 运行中 |
| COMPLETED | 已完成 |
| FAILED | 失败 |
| CANCELLED | 已取消 |

#### PipelineStage（流水线阶段）

| 值 | 说明 |
|----|------|
| DAY_FAST_SCAN | 白天快扫 |
| NIGHT_DEEP_SCAN | 夜间深扫 |
| RELEASE_AUDIT | 发版审计 |
| EMERGENCY_PATROL | 应急巡检 |

#### Severity（严重级别）

| 值 | 说明 |
|----|------|
| CRITICAL | 严重 |
| HIGH | 高危 |
| MEDIUM | 中危 |
| LOW | 低危 |
| INFO | 信息 |

#### BypassStatus（Bypass 状态）

| 值 | 说明 |
|----|------|
| PENDING | 待审批 |
| APPROVED | 已通过 |
| REJECTED | 已拒绝 |
| EXPIRED | 已过期 |

## 错误码

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 204 | 删除成功（无内容） |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 500 | 服务器内部错误 |

### 常见错误

| 错误信息 | 说明 | 解决方案 |
|----------|------|----------|
| Invalid credentials | 登录凭据无效 | 检查邮箱和密码 |
| Validation Error | 参数校验失败 | 检查请求参数格式 |
| Project not found | 项目不存在 | 检查项目 ID |
| Scan not found | 扫描任务不存在 | 检查扫描 ID |
| Finding not found | 漏洞不存在 | 检查漏洞 ID |
| Bypass request not found | Bypass 申请不存在 | 检查申请 ID |
| Insufficient permissions | 权限不足 | 联系管理员授权 |
| Product ID already exists | 产品 ID 已存在 | 使用不同的产品 ID |
| Cannot cancel scan in current status | 当前状态无法取消 | 仅 PENDING/RUNNING 状态可取消 |
| Expiry date must be in the future | 过期时间必须在未来 | 检查 expiresAt 字段 |

---

**文档版本**: 1.0.0
**最后更新**: 2024-01-01
