# 快速上手指南

> 从零开始搭建 SecOps Platform 开发环境

## 目录

- [环境要求](#环境要求)
- [安装步骤](#安装步骤)
- [本地运行](#本地运行)
- [验证安装](#验证安装)
- [常见问题](#常见问题)

## 环境要求

### 必备软件

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.x | 推荐使用 LTS 版本 |
| pnpm | >= 9.x | 包管理器 |
| Docker | >= 20.x | 容器运行时 |
| Docker Compose | >= 2.x | 容器编排 |
| Git | 最新版 | 版本控制 |

### 可选软件

| 软件 | 说明 |
|------|------|
| PostgreSQL 客户端 | 直接查看数据库 |
| Redis 客户端 | 直接查看 Redis |
| Postman / curl | API 调试 |

### 系统要求

- **macOS**: 12.x 及以上
- **Linux**: Ubuntu 20.04+, CentOS 8+
- **Windows**: WSL2 + Ubuntu
- **内存**: 最低 4GB，推荐 8GB+
- **磁盘**: 至少 10GB 可用空间

### 端口占用

本地开发会占用以下端口，请确保端口未被占用：

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | API 服务 | Fastify HTTP |
| 5173 | 前端仪表盘 | Vite Dev Server |
| 5434 | PostgreSQL | 数据库（避免与其他容器冲突） |
| 6378 | Redis | 缓存与队列（避免与其他容器冲突） |
| 8080 | Nginx | 反向代理（可选） |

## 安装步骤

### 步骤 1：克隆仓库

```bash
git clone <repository-url>
cd secops-platform
```

### 步骤 2：安装 Node.js 和 pnpm

如果还没有安装 Node.js 和 pnpm：

**使用 nvm（推荐）**：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装 Node.js LTS
nvm install --lts
nvm use --lts

# 安装 pnpm
corepack enable
corepack prepare pnpm@9 --activate
```

**验证安装**：

```bash
node --version  # 应输出 v18.x 或更高
pnpm --version  # 应输出 9.x 或更高
```

### 步骤 3：安装项目依赖

```bash
pnpm install
```

这会安装所有 workspace 包的依赖，包括：
- `apps/api` - API 服务
- `apps/dashboard` - 前端仪表盘
- `packages/shared-types` - 共享类型
- `packages/traffic-dye` - 流量染色模块
- `packages/ci-templates` - CI/CD 模板

### 步骤 4：配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少配置以下内容：

```env
# 基础配置
NODE_ENV=development
API_PORT=3000

# 数据库配置（对应 infra/docker-compose.yml 中 secpilot-postgres 的端口映射）
DATABASE_URL="postgresql://secops:secops_secure_pass_2024@localhost:5434/secops_platform?schema=public"

# Redis 配置（对应 infra/docker-compose.yml 中 secpilot-redis 的端口映射）
REDIS_URL="redis://:secops_redis_pass_2024@localhost:6378"

# JWT 配置
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="24h"

# 安全配置
SECOPS_SALT="your-secops-salt-key-for-traffic-dye"
```

> **注意**：生产环境必须使用强随机密钥。

### 步骤 5：启动基础设施

使用 Docker Compose 启动 PostgreSQL 和 Redis：

```bash
pnpm infra:up
```

或者手动执行：

```bash
docker compose -f infra/docker-compose.yml up -d
```

验证服务是否启动：

```bash
# 查看容器状态
docker compose -f infra/docker-compose.yml ps

# 预期输出：
# NAME                  STATUS
# secpilot-postgres     Up (healthy)
# secpilot-redis        Up (healthy)
```

### 步骤 6：初始化数据库

```bash
# 推送数据库 Schema
pnpm db:push

# 填充种子数据
pnpm db:seed
```

种子数据会创建：
- 默认管理员账户（`admin@secops.local` / `admin123`）

## 本地运行

### 启动所有服务

```bash
pnpm dev
```

这会并行启动：
- API 服务（端口 3000）
- 前端仪表盘（端口 5173）
- 扫描 Worker（如有）

### 单独启动服务

**仅启动 API 服务**：

```bash
pnpm dev:api
```

**仅启动前端**：

```bash
pnpm dev:dashboard
```

**启动扫描 Worker**：

```bash
cd apps/api
pnpm worker
```

## 验证安装

### 1. 健康检查

访问 http://localhost:3000/api/health

预期返回：

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "services": {
    "database": "healthy",
    "queue": "healthy"
  }
}
```

使用命令行验证：

```bash
curl http://localhost:3000/api/health | jq .
```

### 2. 前端访问

在浏览器中打开 http://localhost:5173

应该能看到登录页面。

### 3. 登录系统

使用种子数据创建的默认账户：

| 字段 | 值 |
|------|-----|
| 邮箱 | admin@secops.local |
| 密码 | admin123 |

> **重要**：首次登录后请立即修改默认密码并开启 MFA！

### 4. 验证 API

获取 Token：

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@secops.local",
    "password": "admin123"
  }' | jq .
```

使用 Token 访问受保护接口：

```bash
TOKEN="your-token-here"

curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 5. 验证流量染色

```bash
cd packages/traffic-dye
pnpm build
node dist/index.js
```

## 常用命令速查

### 开发相关

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动所有开发服务 |
| `pnpm dev:api` | 仅启动 API 服务 |
| `pnpm dev:dashboard` | 仅启动前端 |
| `pnpm build` | 构建所有包 |

### 数据库相关

| 命令 | 说明 |
|------|------|
| `pnpm db:push` | 推送 Schema 到数据库 |
| `pnpm db:seed` | 填充种子数据 |
| `pnpm db:generate` | 生成 Prisma Client |

### 基础设施

| 命令 | 说明 |
|------|------|
| `pnpm infra:up` | 启动基础设施（Docker） |
| `pnpm infra:down` | 停止基础设施 |
| `pnpm infra:down -v` | 停止并删除数据卷 |

### 其他

| 命令 | 说明 |
|------|------|
| `pnpm lint` | 代码检查 |
| `pnpm test` | 运行测试 |
| `pnpm typecheck` | 类型检查 |

## 常见问题

### 1. pnpm install 失败

**问题**：安装依赖时网络超时或失败

**解决方案**：

```bash
# 设置国内镜像源
pnpm config set registry https://registry.npmmirror.com

# 或使用代理
pnpm config set proxy http://your-proxy:port
```

### 2. 数据库连接失败

**问题**：启动时报 `Connection refused` 或认证失败

**排查步骤**：

1. 检查 PostgreSQL 容器是否运行：
   ```bash
   docker ps | grep postgres
   ```

2. 检查端口是否正确（secpilot-postgres 映射到宿主机 5434）：
   ```bash
   lsof -i :5434  # macOS
   netstat -tlnp | grep 5434  # Linux
   ```

3. 验证 `DATABASE_URL` 配置是否正确（用户名 secops，端口 5434，库名 secops_platform）

4. 手动连接测试：
   ```bash
   docker exec -it secpilot-postgres psql -U secops -d secops_platform
   ```

### 3. Redis 连接失败

**问题**：队列服务报 Redis 连接错误

**排查步骤**：

1. 检查 Redis 容器状态
2. 验证 `REDIS_URL` 配置
3. 手动测试连接（需带密码）：
   ```bash
   docker exec -it secpilot-redis redis-cli -a secops_redis_pass_2024 ping
   # 应返回 PONG
   ```

### 4. 端口被占用

**问题**：启动时报端口已被占用

**解决方案**：

查找占用端口的进程：

```bash
# macOS / Linux
lsof -i :3000

# 结束进程
kill -9 <PID>
```

或者修改 `.env` 中的端口配置：

```env
PORT=3001
```

### 5. Prisma 相关错误

**问题**：`Prisma Client could not be found`

**解决方案**：

```bash
# 重新生成 Prisma Client
pnpm db:generate

# 或重新推送 Schema
pnpm db:push
```

**问题**：数据库迁移失败

**解决方案**：

```bash
# 重置数据库（会丢失所有数据！）
pnpm db:push --force

# 或删除容器重新初始化
pnpm infra:down -v
pnpm infra:up
pnpm db:push
pnpm db:seed
```

### 6. 前端热更新不生效

**问题**：修改代码后页面不自动刷新

**排查**：

1. 确认 Vite 正在运行
2. 检查浏览器控制台是否有 WebSocket 连接错误
3. 尝试硬刷新页面（Ctrl+Shift+R）

### 7. TypeScript 类型错误

**问题**：编辑器报大量类型错误

**解决方案**：

```bash
# 重新安装依赖
rm -rf node_modules
pnpm install

# 生成类型
pnpm build
```

如果使用 VS Code，尝试重启 TypeScript Server：
- 按 `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
- 输入 "TypeScript: Restart TS Server"

### 8. Docker 启动失败

**问题**：Docker 服务未运行或权限不足

**解决方案**：

- macOS：检查 Docker Desktop 是否启动
- Linux：检查 Docker 服务状态：
  ```bash
  sudo systemctl status docker
  sudo systemctl start docker
  ```
- 权限问题：将当前用户加入 docker 组
  ```bash
  sudo usermod -aG docker $USER
  # 重新登录后生效
  ```

### 9. 登录失败

**问题**：输入正确账号密码但登录失败

**排查步骤**：

1. 检查 API 服务是否正常运行
2. 查看 API 日志是否有错误
3. 确认种子数据已执行：
   ```bash
   pnpm db:seed
   ```
4. 检查 JWT_SECRET 是否配置

### 10. 扫描任务一直 PENDING

**问题**：创建的扫描任务状态不更新

**原因**：扫描 Worker 未启动

**解决方案**：

```bash
cd apps/api
pnpm worker
```

Worker 会从 Redis 队列中拉取任务并执行。

## 获取帮助

如果以上方案都无法解决问题：

1. 查看详细的错误日志
2. 检查 `.env` 配置是否正确
3. 确认所有依赖服务都已启动
4. 参考 [架构文档](ARCHITECTURE.md) 了解系统设计
5. 查看 [API 文档](API.md) 了解接口详情

## 下一步

完成本地环境搭建后，你可以：

- 浏览 [API 文档](API.md) 了解所有接口
- 阅读 [架构文档](ARCHITECTURE.md) 深入理解系统设计
- 查看 [CI/CD 集成指南](CICD.md) 了解流水线接入
- 开始开发新功能 🚀
