# 后端目录结构规范

> 记录 `backend/` 的目录组织与分层边界。新文件必须落在规定的层里。

---

## 技术栈

见 [index.md](./index.md)：NestJS 12 + PostgreSQL/TypeORM + ESM + Vitest + oxlint + Prettier 80 列。

---

## 分层职责

依赖方向**只允许向下**：

```
Controller ──▶ Service ──▶ Repository (TypeORM) ──▶ PostgreSQL
     │            │
     └──▶ common  └──▶ config / common / database
```

| 层 | 位置 | 职责 | 禁止 |
|---|---|---|---|
| **Controller** | `src/<域>/*.controller.ts` | HTTP 边界：解析请求、调 service、返回响应 | ❌ 写业务逻辑 ❌ 直接注入 Repository ❌ 手写 `res.status().json()` |
| **Service** | `src/<域>/*.service.ts` | 业务编排、事务边界、抛业务异常 | ❌ 感知 HTTP（不碰 `Request`/`Response`） |
| **Repository** | `@InjectRepository(Entity)` | 数据访问 | ❌ 写业务规则 |
| **纯规则** | 各模块内的 `*.rules.ts` / `*.state.ts` | 无 IO 的判断与计算 | ❌ 碰 Repository / 数据库 |
| **common** | `src/common/` | 横切能力：守卫、装饰器、过滤器、日志、中间件 | ❌ 引用具体业务模块 |
| **config** | `src/config/` | 环境变量读取与启动断言 | ❌ 业务代码散落 `process.env` |
| **database** | `src/database/` | 连接、基类实体、迁移 | ❌ 业务规则 |

### 三条硬规则

1. **Controller 里不出现 Repository。** 所有数据访问都在 service。
2. **Service 里不碰 `Request` / `Response`。** 需要 IP、Cookie 等信息时由 controller 取好传进来。
3. **事务边界在 service。** 一次业务操作要么整体成功、要么整体回滚；不要在 controller 里开事务。

> **要不要 repository 层？** 不强制。判据：某个域的查询散落在多处、或同一段查询被复制
> 3 次以上时，才抽同模块的 `<域>.repository.ts`。TypeORM 的 `Repository<T>` 已经是数据访问层，
> 不要为它再包一层没有行为的空洞抽象。

---

## ESM 导入规则（最容易犯的错）

`package.json` 是 `"type": "module"`，`tsconfig.json` 是 `module/moduleResolution: "nodenext"`。
**相对导入必须写 `.js` 后缀**（源码是 `.ts`，运行时是 `.js`）：

```ts
// ✅
import { AppModule } from './app.module.js';
import { AuthService } from '../auth/auth.service.js';

// ❌ 编译期不报错，运行期 ERR_MODULE_NOT_FOUND
import { AppModule } from './app.module';
```

- 包导入照常写包名（`import { Injectable } from '@nestjs/common'`），不需要后缀。
- 目录导入（`./dto`）不要用，直接指向具体文件。

---

## 命名约定

| 对象 | 约定 | 示例 |
|---|---|---|
| 模块 | 小写单数（业务域） | `auth`、`health` |
| 文件 | kebab-case，后缀表明角色 | `auth.controller.ts`、`jwt-auth.guard.ts` |
| 类 | PascalCase + 角色后缀 | `AuthController`、`JwtAuthGuard`、`SendCodeDto` |
| DTO | `<动作><资源>Dto` | `SendCodeDto`、`LoginDto` |
| 纯函数模块 | 名词短语 | `auth.rules.ts`、`log-rotation.ts` |
| 测试 | 与被测文件同名 + `.spec.ts`（同目录） | `health.controller.spec.ts` |

**纯函数与 IO 分开成文件**：规则可以直接单测，不需要 mock 数据库。

---

## 配置：`config/env.ts` 与启动断言

**业务代码不读 `process.env`**（两个刻意的例外：`LOG_*` 由日志模块读，`DATABASE_URL` 由
`database/` 读）。集中读取 + 惰性 getter + 启动即验证：

```ts
// src/config/env.ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const env = {
  get jwtSecret() { return required('JWT_SECRET'); },
  get databaseUrl() { return required('DATABASE_URL'); },
};
```

`main.ts` 里主动 `void env.jwtSecret; void env.databaseUrl;` —— 缺值在**启动时**失败，
而不是第一次请求才炸。新增环境变量时同步更新 `backend/.env.example` 与 `deploy/.env.example`。

---

## `main.ts` 与 `app.module.ts` 只做装配

`main.ts` 只做：加载 `.env`、建 logger、`bufferLogs` + `useLogger`、`trust proxy`、
访问日志、同源中间件、全局前缀、`cookieParser`、`ValidationPipe`、兜底过滤器、`listen`。

`app.module.ts` 只做：`imports` 各模块 + `APP_GUARD` 注册全局守卫。

**全局守卫的收益**：新 Controller 默认就需要登录，想开放必须显式写 `@Public()`。

---

## 团队明确避免的反模式

- ❌ 不在 Controller 写业务逻辑、不注入 Repository。
- ❌ 不在 service 里碰 `Request` / `Response`。
- ❌ 不散落 `process.env`。
- ❌ 不省略相对导入的 `.js` 后缀。
- ❌ 不新建 `utils/` 杂物目录：横切能力归 `common/`，纯领域函数放各自模块内。
- ❌ 不预先建空模块 / 空抽象（YAGNI）。
- ❌ 不为单个实现建接口 / 抽象基类 / 工厂。
- ❌ 不做全局的 `api → services → repositories → models` 四层：module/controller/service 三层就够。
