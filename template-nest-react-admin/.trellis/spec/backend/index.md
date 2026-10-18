# 后端开发规范

> 本目录是 `backend/` 的规范事实来源，供 trellis-implement / trellis-check 子代理加载。
> 记录的是**本项目当前真实**的约定，不是理想化模板。
> **语言**：中文。

---

## 技术栈

`backend/package.json` / `backend/tsconfig.json`：

| 关注点 | 选型 | 版本 |
|---|---|---|
| 框架 | NestJS | 12 |
| 数据层 | **PostgreSQL + TypeORM**（`pg` 驱动），`synchronize: false` | TypeORM 1.x / pg 8.x |
| 模块系统 | **ESM**（`"type": "module"` + `module/moduleResolution: nodenext`） | — |
| 测试 | Vitest 4（`vitest.config.ts` / `vitest.config.e2e.ts`） | 4.1 |
| lint | **oxlint**（不是 ESLint） | 1.5x |
| 格式化 | Prettier 3（**默认 80 列**） | 3.4 |
| TS | TypeScript 6（`strict: true`，`strictPropertyInitialization: false`） | 6.0 |

### 五条最容易踩的差异

1. **ESM：相对导入必须带 `.js` 后缀**。`import { AppModule } from './app.module.js'`
   —— 写 `'./app.module'` 会**运行期**报 `ERR_MODULE_NOT_FOUND`（`nodenext` 不做后缀补全）。
2. **lint 是 oxlint**：命令 `npm run lint`（⚠️ **在 `backend/` 目录里跑**）。配置文件必须叫
   `.oxlintrc.json` —— oxlint 只自动发现这个名字。仓库里没有 ESLint 配置，不要新增，
   也不要写 `// eslint-disable-next-line`。
3. **Prettier `printWidth` 默认 80**（前端是 120）。
4. **`synchronize: false` 永远不为 true**：schema 只由迁移改变。实体变了就写迁移，
   不要指望 TypeORM 自动改表。
5. **`repo.insert()` 不触发 `@BeforeInsert`**：UUIDv7 主键在实体钩子里生成，用 `insert()`
   会写入 `NULL`。所有新建实体走 `repo.save(repo.create({...}))`，或显式给 `id`。

---

## 规范索引

| 规范 | 内容 |
|---|---|
| [directory-structure.md](./directory-structure.md) | 模块组织、分层边界、ESM 导入规则、配置 |
| [database-guidelines.md](./database-guidelines.md) | TypeORM、UUIDv7、命名、索引、事务、迁移 |
| [error-handling.md](./error-handling.md) | 错误信封契约、状态码、字段级错误、兜底过滤器 |
| [logging-guidelines.md](./logging-guidelines.md) | 四列格式、级别、脱敏、落盘归档、访问日志 |
| [quality-guidelines.md](./quality-guidelines.md) | 结构红线、测试、安全红线、注释 |

---

## 当前结构（写代码前先看这一节）

```
backend/src/
├── main.ts                    # 装配：日志 / 访问日志 / 同源中间件 / 前缀 / cookie / 管道 / 过滤器 / listen
├── app.module.ts              # 只做装配：DatabaseModule + HealthModule + AuthModule + 全局守卫
├── config/env.ts              # 环境变量收口 + 启动断言
├── common/                    # 横切能力（与业务领域无关）
│   ├── logging/               # 日志：格式 / 级别 / 脱敏 / 落盘归档 / 访问日志
│   ├── filters/               # all-exceptions.filter.ts
│   ├── guards/                # jwt-auth.guard.ts（全局守卫）
│   ├── decorators/            # @Public() · @CurrentUser()
│   ├── exceptions/            # HttpExceptionWithHeaders（429 的 Retry-After）
│   ├── security/              # same-origin.middleware.ts（CSRF 第二道闸）
│   └── paged.ts               # 列表信封 { items, total, page, pageSize }
├── database/
│   ├── database.module.ts     # TypeOrmModule.forRootAsync
│   ├── data-source.ts         # 迁移 CLI 与运行时共用的 DataSource
│   ├── uuid7.ts               # UUIDv7 生成（应用侧）
│   ├── entities/base.entity.ts# id + created_at（+ updated_at 的子类）
│   └── migrations/            # 手写 DDL，按时间戳排序
├── auth/                      # 邮箱验证码登录（首次登录即注册）
│   ├── auth.controller.ts     # send-code / login / logout / me
│   ├── auth.service.ts        # 发码、校验、找到或建用户
│   ├── auth.rules.ts          # 无 IO 规则：归一化 / 验证码 / 哈希 / 倒计时
│   ├── auth.types.ts          # UserRecord（对外形状）
│   ├── jwt.strategy.ts        # 从 Cookie 读 JWT，每请求查一次用户
│   ├── email.service.ts       # SMTP 封装；DEV_MODE 下打日志
│   ├── entities/              # User / EmailCode
│   └── dto/
└── health/                    # GET /api/health（真的 SELECT 1）
```

**用户与角色**：本模板**没有角色/权限系统**。需要时再建，不要预埋 `role` 字段和守卫。
`JwtAuthGuard` 是唯一全局守卫：新接口默认需要登录，开放必须显式 `@Public()`。

---

## 开工前检查清单

- [ ] 读过本目录的规范与当前任务 `prd.md` 的验收清单
- [ ] 接口契约已确认：错误信封 `{ statusCode, message, error, errors? }`、
      分页形状 `{ items, total, page, pageSize }`、时间格式 ISO 8601 UTC 字符串
- [ ] 新接口默认需要登录；开放接口标了 `@Public()`
- [ ] 相对导入写了 `.js` 后缀
- [ ] 实体改动配了迁移（`npm run migration:generate` 或手写）
- [ ] 日志用 `new Logger(XxxService.name)`，且这一行里没有 secret
- [ ] `errors` 的 key 与前端 `Form.Item` 的 `name` 逐字一致

---

## 完成前质量检查

1. **类型**：`npm run build` 过。
2. **lint**：`npm run lint` 过（oxlint）。
3. **格式**：`npx prettier --check <本次改动的文件>` 过；不要直接全量 `--write`。
4. **测试**：`npm test` 过；纯函数配单测。走完整 Trellis 流程的任务再跑 `npm run test:e2e`。
5. **分层**：Controller 里没有业务逻辑、没有直接注入 Repository。
6. **错误**：抛的是 Nest `HttpException` 子类，没有手写 `res.status().json()`、没有吞异常。
7. **日志**：没有 `console.log`；没有把 secret / 验证码 / Cookie / 完整请求体写进日志。

---

## 与前端契约的同步义务（没有编译器保护）

| 事实 | 后端落点 | 前端落点 |
|---|---|---|
| 错误信封形状 | `AllExceptionsFilter` / Nest 默认过滤器 | `src/api/client.ts` 的 `problemOf` |
| 字段级错误的 key | DTO 字段名 / `errors` 的 key | `Form.Item` 的 `name` |
| 用户形状 | `auth/auth.types.ts` 的 `UserRecord` | `api/types/auth.ts` 的 `Me` |
| 时间格式 | ISO 8601 UTC 字符串 | `utils/formatDateTime` 本地化显示 |
| 分页参数与上限 | DTO 的 `pageSize` 上限 | 列表页的 `pageSizeOptions` |
| 登录相关接口的 401 语义 | `send-code` / `login` / `logout` / `me` | `client.ts` 的 `AUTH_401_EXEMPT` |

改一处必须改另一处；`errors` 的 key 对不上时 antd 的 `setFields` 是**静默 no-op**。
