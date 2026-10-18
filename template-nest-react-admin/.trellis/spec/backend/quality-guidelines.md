# 后端质量规范

> 记录 `backend/` 的代码标准、结构红线、测试要求与安全约定。

---

## 工具链

| 关注点 | 工具 | 配置 |
|---|---|---|
| lint | **oxlint** | 必须叫 `backend/.oxlintrc.json` |
| 格式化 | Prettier 3.4 | `backend/.prettierrc`，**printWidth 默认 80** |
| 类型检查 | `tsc` | `strict: true`、`strictPropertyInitialization: false`、`module: nodenext` |
| 构建 | Nest CLI + `tsc` | `npm run build` → `dist/` |
| 开发启动 | Nest CLI + SWC | `start:dev` = `nest start --watch -b swc --type-check` + `.swcrc` |
| 测试 | Vitest 4 | `vitest.config.ts` / `vitest.config.e2e.ts` |

⚠️ **oxlint 不拦 `any`，也不拦浮动的 promise** —— 两条都没有工具兜底，靠本规范和 review。

### 脚本

| 命令 | 作用 |
|---|---|
| `npm run start:dev` | watch 模式开发启动（日常请用根目录 `node dev.mjs`） |
| `npm run build` | `nest build` → `dist/`（发版走这条） |
| `npm test` | 单测 |
| `npm run test:e2e` | 装配层 e2e |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migration:*` | 生成 / 执行 / 回滚迁移 |

### SWC 的三条坑

`.swcrc` 不能省（Nest CLI 给 SWC 写死 CommonJS，ESM 项目不加 `module.type=es6` 会
`exports is not defined`）；`--type-check` 必须显式写（默认是关的）；只有 `start:dev`
换 SWC，`build` 仍走 tsc —— 类型检查在镜像构建那道闸门还在。

---

## 验证深度按任务路径分级

| 任务路径 | 验证范围 |
|---|---|
| 走完整 Trellis 流程（有 task、有 `implement.md`） | 按 `implement.md` 全跑，**含 `npm run build`** |
| 用户说「直接改」的小任务 | `npx oxlint <改动文件>` + `npx prettier --check <改动文件>` + `npx vitest run <相关测试>` |

**例外：这三种情况小任务也要 build**：改了 `tsconfig*.json` / `nest-cli.json` / `.swcrc`；
需要确认 ESM 产物形态；新增或升级依赖。

> **ESM 的坑让这条更值得守**：漏写 `.js` 后缀**编译期不报错**，只有跑起来才
> `ERR_MODULE_NOT_FOUND`。改动 import 路径时至少跑一次 `npm test` 或 `npm run build`。

---

## 代码风格

- 函数参数与返回值都标类型；DTO 用 `class-validator` 装饰器。
- `strict: true` 下写代码：不用 `any`、不用 `@ts-ignore`（真需要时 `@ts-expect-error` + 原因）。
- ESM 相对导入带 `.js`。
- async/await 优先，不用 `.then()` 链。
- **不要漏 `await`**：一个没 await 的写库会让请求在写入完成前返回。
- **不要用 `interface` 做 DTO**：`class` 才有元数据。
- `whitelist: true` 会剥掉 DTO 没声明的字段 —— 加字段要同时改 DTO。

---

## 注释约定：重要逻辑必须写「为什么」

注释解释**为什么**，不复述**做什么**。

**必须写注释的六种情形**：

1. **反直觉的写法**：看起来能简化，实则不能。
2. **安全 / 防数据丢失的设计**：`send-code` 永远 200、Cookie 的 `httpOnly` / `sameSite`、
   `@Public()` 的显式标记。删掉不报错，但会出事。
3. **踩过的坑**：写清现象（如「`insert()` 不触发 `@BeforeInsert`，id 为 NULL」）。
4. **绕过第三方库/运行时行为**：说明是哪个库的哪个行为逼你这么写。
5. **业务规则来源**：标出规范位置。
6. **刻意的不做**：为什么没做显而易见的那件事。

风格：中文；模块/类用 JSDoc 说明用途与存在理由；注释和代码一起改。

---

## 代码结构硬规则

1. **单文件 ≤ 500 行**（300 行就该考虑拆）。
2. **单函数 ≤ 50 行**（超过 100 行必须评估拆分）。
3. **一个 module 只负责一个明确领域**。
4. **Controller 不写业务逻辑、不注入 Repository**。
5. **service 不碰 `Request` / `Response`**。
6. **第三方调用统一封装**（发信在 `EmailService`）。
7. **纯领域逻辑与 IO 分离**（`auth.rules.ts` 只收原始类型、无 IO）。
8. **常量与文案集中**，不散落在各个 service 里。
9. **配置集中**，业务代码不读 `process.env`。

---

## 测试约定

```
backend/src/common/logging/logging.spec.ts                  # 级别 / 格式 / 脱敏
backend/src/common/logging/log-rotation.spec.ts             # 归档与清理规则
backend/src/common/filters/all-exceptions.filter.spec.ts    # 兜底过滤器三种形态
backend/src/common/security/same-origin.middleware.spec.ts  # CSRF 判据
backend/src/auth/auth.rules.spec.ts                         # 归一化 / 哈希 / 倒计时
backend/src/health/health.controller.spec.ts                # 健康检查
backend/test/app.e2e-spec.ts                                # 装配层：守卫 / 管道 / 同源
```

### ⚠️ e2e 必须手工复刻 `main.ts` 的全局管道

`createNestApplication()` **不会**带上 `main.ts` 里装的全局 `ValidationPipe` /
`cookieParser` / 兜底过滤器。后果不是「用例失败」，而是**假通过**：DTO 校验没跑，
本该 400 的请求返回 200。

判据：任何测「参数不合法 → 400」的用例都是哨兵 —— 它若返回 200，说明管道没复刻。

### ⚠️ 不要用 `supertest/types` 取 `App` 类型

在 `moduleResolution: nodenext` 下解析不到（`tsc --noEmit` 报 TS2307；vitest 靠 esbuild
丢掉类型导入，运行期照常通过）。用 `node:http` 的 `Server`：

```ts
import type { Server } from 'node:http';
let app: INestApplication<Server>;
```

### 规则

- **纯函数必须配单测**：归一化、哈希、倒计时、日志归档、CSRF 判据。
- **service 单测 mock Repository**，不要连真数据库。
- **e2e 测「装配起来是通的」**：公开路由 200、受保护路由 401、DTO 校验 400、跨站 403。
- **测试不依赖执行顺序**，不共享可变状态。
- **假数据只许用生产里可能存在的形态**：造一个真实运行期永远到不了的状态，测出来的通过
  毫无意义。
- **`npm test` 全绿 ≠ 类型正确**：vitest 走 esbuild，只擦类型、不做类型检查。
  走完整流程的任务必须跑 `npm run build`。

---

## 安全红线（不可简化）

### 1. 会话

- JWT 存在 **httpOnly Cookie**（`session`），不用 localStorage + Bearer。
- `sameSite: 'strict'`，`secure` 由 `COOKIE_SECURE` 控制。
- **`JWT_SECRET` 为空时启动直接失败**。
- 不做 refresh token：7 天过期重新登录（刻意简化）。
- `JwtStrategy.validate` **每次请求查一次用户**，不把用户信息塞进 token 快照。

### 2. 登录与反轰炸

- **`send-code` 永远返回 200**，不区分邮箱是否已注册（防账号枚举）。
- **同邮箱 60 秒闸门**：后端强制，前端只做倒计时提示。60 秒闸门用
  `pg_advisory_xact_lock` 按邮箱串行化，并发发码刷不穿。
- **验证码只存 HMAC 哈希**，不存明文；比对用 `timingSafeEqual`。
- **同一个码最多错 5 次**；成功后同邮箱其它未消费的码一并作废。
- **验证码 6 位必须用 CSPRNG**（`crypto.randomInt`），不要 `Math.random`。

### 3. CSRF 与其他

- `SameSite=Strict` + `sameOriginMiddleware` 两道闸。
- 全局守卫：新接口默认需要登录，开放必须显式 `@Public()`。
- **不向日志、错误 message、响应体写 secret / 验证码 / token**。
- 生产必须 `DEV_MODE=false` 且 SMTP 配好，否则启动失败。

### 4. 错误信息

- 验证码错误 / 过期 / 次数超限**共用同一句文案**，不区分失败原因（防探测）。
- 不向客户端泄露堆栈 / SQL / 内部路径。

---

## 代码审查要点

1. **分层**：Controller 不写业务、不注入 Repository；service 不碰 `Request`/`Response`；
   第三方调用有封装；纯函数与 IO 分离。
2. **错误**：抛 `HttpException` 子类；状态码按 error-handling.md；没吞异常；
   `errors` 的 key 与前端表单字段一致。
3. **数据**：实体改动配了迁移；并发写有唯一索引 / 原子更新 / advisory lock；
   事务里没有外部副作用；没有用 `insert()` 写业务实体。
4. **导入**：相对导入带 `.js` 后缀。
5. **安全**：`send-code` 永远 200；60 秒闸门在；验证码只存哈希；`JWT_SECRET` 启动断言；
   凭证不进日志/响应。
6. **契约同步**：DTO 字段名 → 前端 `api/types/` + `Form.Item` 的 `name`；
   `UserRecord` → 前端 `Me`。
7. **结构**：单文件 ≤ 500 行 / 单函数 ≤ 50 行。
8. **测试**：纯函数有单测；e2e 复刻了 main.ts 的管道。
9. **注释**：重要逻辑写「为什么」；改行为时同步改注释。

---

## 团队明确避免的反模式

- ❌ **不引入未在 `package.json` 里的依赖**：优先用 Nest / 内置能力解决。
- ❌ **不用 `any`**：用 `unknown` + 类型守卫，或泛型。
- ❌ **不用 `@ts-ignore`**：真需要时 `@ts-expect-error` + 原因。
- ❌ **不 `catch (e) {}` 空吞异常**。
- ❌ **不在异步上下文里做同步阻塞 IO**。
- ❌ **不为单个实现建接口 / 工厂 / 抽象基类**。
- ❌ **不在实体上写业务方法**。
- ❌ **不手写 `res.status().json()`**。
- ❌ **不写复述代码的注释，也不留描述旧行为的注释**。
- ❌ **不为 MVP 阶段预先搭建设计模式基础设施**（Repository 基类、事件总线、CQRS）。
