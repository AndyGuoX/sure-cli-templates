# Nest + React Admin Scaffold

一个可直接开工的中台脚手架：**NestJS 12 + PostgreSQL + React 19**。
登录、日志、错误处理、数据库迁移、Docker 部署这些「每个项目都要再搭一遍」的能力已经就位，
新建业务模块即可开始开发。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · Vite 8 · TypeScript 6 · Ant Design 6 · TanStack Query · axios · react-router 7 · zustand · Less |
| 后端 | NestJS 12 · TypeORM 1.x · PostgreSQL 17 · JWT（httpOnly Cookie）· nodemailer |
| 工程化 | ESM · Vitest · oxlint · Prettier · Docker Compose · Trellis spec |
| 数据 | UUIDv7 主键 · 显式迁移 · 时间戳统一 `timestamptz` |

## 目录

```
.
├── backend/                  # NestJS API（端口 3100，所有路由带 /api 前缀）
│   ├── src/
│   │   ├── common/           # 日志 / 异常过滤器 / 守卫 / 装饰器 / CSRF / 分页信封
│   │   ├── database/         # TypeORM DataSource、基类实体、UUIDv7、迁移
│   │   ├── auth/             # 邮箱验证码登录（首次登录即注册）
│   │   ├── health/           # GET /api/health（真的 SELECT 1）
│   │   ├── config/env.ts     # 环境变量收口
│   │   ├── main.ts           # 装配
│   │   └── app.module.ts
│   └── test/                 # 装配层 e2e
├── frontend/                 # React + Vite（开发端口 5173）
│   └── src/
│       ├── api/              # 唯一 axios 实例 + 错误归一化 + 按域接口
│       ├── router/           # 路由表（含 errorElement）
│       ├── layouts/          # AuthLayout / AppLayout
│       ├── components/       # LoadError / RequireAuth / PageHeader / BrandMark
│       ├── hooks/            # useCurrentUser / useLogout
│       ├── store/            # zustand（侧栏折叠）
│       ├── utils/            # formatDateTime
│       └── pages/            # Home（搭建成功自检页）/ auth/Login
├── deploy/                   # 生产：postgres + migrate + api + nginx
├── compose.dev.yml           # 本地开发用 PostgreSQL
├── dev.mjs                   # 一键：对齐 .env + 起数据库 + 迁移 + 起后端
└── .trellis/                 # 开发规范（spec）与 Trellis 工作流
```

## 环境要求

| 工具 | 版本 |
|---|---|
| Node.js | 24.x（最低 20.19+ / 22.13+） |
| npm | 10+ |
| Docker | 24+（本地数据库与生产部署都需要；也可用本机 PostgreSQL） |

## 快速开始

```bash
# 1) 起后端（首次会生成 backend/.env、起 postgres、装依赖、跑迁移）
node dev.mjs

# 2) 另开一个终端起前端
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 ：

1. 输入任意邮箱 → 点「发送验证码」；
2. 开发模式（`DEV_MODE=true`）下验证码不会真发邮件，去**运行 `node dev.mjs` 的终端**找
   `[DEV] 验证码 ... → 123456`；
3. 输入验证码登录，首次登录自动注册；
4. 首页会显示前端 / 后端 / 数据库三项自检状态。

> 本机已有 PostgreSQL？跳过 compose，把 `backend/.env` 的 `DATABASE_URL` 改成你的连接串即可。

## 环境变量

后端本地配置在 `backend/.env`（由 `dev.mjs` 生成，已 gitignore）：

| 变量 | 说明 |
|---|---|
| `PORT` | 后端端口，默认 3100 |
| `APP_NAME` | 邮件主题/落款里的应用名 |
| `DATABASE_URL` | PostgreSQL 连接串（必填） |
| `JWT_SECRET` | 会话签名密钥（必填，留空启动失败） |
| `COOKIE_SECURE` | HTTPS 环境设 true |
| `DEV_MODE` | true = 验证码打日志不真发信 |
| `SMTP_*` | 生产发信配置；`DEV_MODE=false` 时必须配 `SMTP_HOST` |

日志旋钮（`LOG_LEVEL` / `LOG_TO_FILE` / `LOG_DIR` / `LOG_SERVICE` / `LOG_RETENTION_DAYS` /
`LOG_ERROR_FILE`）见 `.trellis/spec/backend/logging-guidelines.md`。

## 数据库与迁移

```bash
cd backend
npm run migration:generate -- src/database/migrations/AddSomething
npm run migration:run
npm run migration:revert
```

- `synchronize` 永远是 `false`：schema 只由迁移改变。
- 迁移生成后**读一遍产物**，再提交。
- 约定（UUIDv7、snake_case、索引命名、事务、回填）见
  `.trellis/spec/backend/database-guidelines.md`。

## 登录

- `POST /api/auth/send-code`：发验证码，永远 200（防账号枚举），同邮箱 60 秒冷却。
- `POST /api/auth/login`：验证码登录，首次登录自动注册；会话写入 httpOnly Cookie。
- `POST /api/auth/logout`：清 Cookie。
- `GET /api/auth/me`：当前用户（需要登录）。

**没有角色/权限系统**。需要时再加，不要预埋 `role` 字段。
验证码只存 HMAC 哈希；输错 5 次作废；同邮箱 60 秒内不能重发。

## 后端基础设施

- **日志**：四列格式、六档级别、出口脱敏、按天归档 + 保留、`-error` 第二车道、访问日志
  （含健康探针降噪）。业务代码照常 `new Logger(XxxService.name)`。
- **错误**：Nest 默认信封 + additive `errors` 字段（供前端表单回填）；
  全局兜底过滤器记录堆栈、对外只回固定文案。
- **安全**：全局 `JwtAuthGuard`（新接口默认要登录）、`SameSite=Strict` + 同源中间件双闸、
  `trust proxy`、启动断言。
- **数据库**：TypeORM + 迁移 + 基类实体 + `Paged<T>` 列表信封。

## 前端基础设施

- **数据层**：单一 axios 实例、`problemOf` / `isUnauthorized` / `isServerDown` /
  `retryAfterSeconds`，页面不自己比状态码。
- **错误 UI**：四态渲染约定、统一 `LoadError`、路由 `errorElement` + `path: '*'`。
- **布局与路由**：登录前/后两套布局、`RequireAuth` 门禁、集中路由表。
- **状态**：服务端态归 react-query，全局客户端态归 zustand，两者不混用。

## 生产部署

```bash
cd deploy
cp .env.example .env
# 填 POSTGRES_PASSWORD / JWT_SECRET / SMTP_*，DEV_MODE=false
chmod 600 .env
mkdir -p /data/nest-react-admin/logs && chown 1000:1000 /data/nest-react-admin/logs
docker compose up -d --build
```

访问 `http://<服务器IP>:8000`。迁移由一次性 `migrate` 服务在 api 启动前执行。
细节与检查清单见 [`deploy/README.md`](./deploy/README.md)。

## 用 Trellis 开发

本仓库已初始化 Trellis，规范在 `.trellis/spec/`：

- `backend/index.md` 与 `frontend/index.md` 是入口（开工前清单、完成前检查、契约同步义务）；
- 新增业务模块时先读对应层的 `directory-structure.md` 与 `quality-guidelines.md`；
- 修完 bug 后把可复用的教训写回 spec（`trellis-update-spec`），别只留在对话里。

## 刻意没有内置的东西

- **角色 / 权限 / 用户管理页**：本模板只保留登录主流程。
- **文件上传 / 对象存储**：不同项目差异太大，按需接入。
- **富文本、图表、国际化**：按需加依赖。
- **refresh token**：7 天过期重新登录，这个量级的系统不值得多一套轮转逻辑。
- **前端单测框架**：本模板没有前端测试；需要时再加 Vitest。
