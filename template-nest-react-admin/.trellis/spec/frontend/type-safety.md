# 前端类型安全

---

## TS 配置

- `tsconfig.app.json`：`strict: true`、`noUnusedLocals`、`noUnusedParameters`、
  `verbatimModuleSyntax`、`paths: { "@/*": ["./src/*"] }`。
- `tsconfig.node.json` 同样 `strict: true`，只管 `vite.config.ts`。
- **不写 `baseUrl`**（TS 6 已废弃，TS5101）。
- 类型检查是 `tsc -b`（`npm run build` 的第一段）。

---

## 类型组织

| 类型 | 位置 |
|---|---|
| 后端 DTO / 响应体 | `src/api/types/<域>.ts`，`types/index.ts` 做 barrel |
| 组件 props | 组件文件内 `interface <组件名>Props` |
| store 状态 | store 文件内 `interface <域>State` |
| 纯函数参数 / 返回值 | 函数签名上直接标注 |

- **`type` 用于联合/别名，`interface` 用于对象形状**；两者不要混着表达同一件事。
- **不用 `any`**：用 `unknown` + 类型守卫，或泛型。
- **不用 `@ts-ignore`**：真需要时 `@ts-expect-error` + 写清原因。

---

## 契约同步（没有编译器保护）

前后端各有一份「同一个事实」，改一处必须改另一处：

| 事实 | 后端 | 前端 |
|---|---|---|
| 用户形状 | `auth/auth.types.ts` 的 `UserRecord` | `api/types/auth.ts` 的 `Me` |
| 错误信封 | `AllExceptionsFilter` | `api/client.ts` 的 `ApiError` / `problemOf` |
| 字段级错误 key | DTO 字段名 | `Form.Item` 的 `name` |
| 时间格式 | ISO 8601 UTC 字符串 | `formatDateTime` 的入参 |

- **枚举值逐字一致**：将来加状态枚举时，后端的联合类型与前端 `api/types/` 的联合类型
  要同时改；label / 颜色表只能有一份实现（放 `constants/`）。
- **不要在前端重算后端规则**：角色、权限、状态机判断读后端下发的值。
- **实体 id 只当字符串透传**，不要在前端校验成 uuid / 数字。

---

## 类型收窄

- `problemOf` 返回的 `errors` 是 `Record<string, string[]>`；回填前用
  `FIELDS.filter((field) => field in errors)` 收窄。
- `catch (e)` 里 `e` 是 `unknown`：先 `problemOf(e)` / `e instanceof Error`，不要直接读属性。
- API 响应的可选字段用 `?` 表达，不要用 `!` 断言绕过。
