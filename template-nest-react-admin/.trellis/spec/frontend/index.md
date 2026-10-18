# 前端开发规范

> 本目录是 `frontend/` 的规范事实来源，供 trellis-implement / trellis-check 子代理加载。
> 记录的是**本项目当前真实**的约定。**语言**：中文。

---

## 技术栈

`frontend/package.json`：

| 关注点 | 选型 | 版本 |
|---|---|---|
| 框架 | React | 19.2 |
| 构建 | Vite | 8.3 |
| 语言 | TypeScript | 6.0 |
| UI | antd + @ant-design/icons | 6.x |
| 服务端状态 | @tanstack/react-query | 5.x |
| HTTP | axios（`withCredentials: true`） | 1.x |
| 路由 | react-router | 7.x |
| 全局客户端态 | zustand | 5.x |
| 样式 | **Less**（Vite 原生支持） | 4.x |
| lint | **oxlint**（不是 ESLint） | 1.8x |
| 格式化 | Prettier 3（**printWidth 120**） | 3.9 |

### 五条最容易踩的差异

1. **lint 是 oxlint**：`npm run lint`（⚠️ 在 `frontend/` 目录里跑），配置 `.oxlintrc.json`。
   不要新增 ESLint 配置，也不要写 `// eslint-disable-next-line`。
2. **Prettier `printWidth` 是 120**（后端是 80）。
3. **`strict` 已开**：`noImplicitAny` / `strictNullChecks` 生效，`any` 不再静默流出。
   它在 `tsconfig.app.json` 和 `tsconfig.node.json` **各一份**，两份都要保持。
4. **路径别名 `@/` → `src/` 已配**，跨目录导入一律用别名。两处必须同步：
   `vite.config.ts` 的 `resolve.alias` 与 `tsconfig.app.json` 的 `paths`。
   ⚠️ **不要写 `baseUrl`**：TS 6 起已废弃（TS5101）。
5. **样式是 Less + 文件夹即组件**：组件版式写在同目录的 `style.less`，**不写行内 `style`**。

---

## 规范索引

| 规范 | 内容 |
|---|---|
| [directory-structure.md](./directory-structure.md) | 目录组织、分层职责、样式落点、路径别名 |
| [component-guidelines.md](./component-guidelines.md) | 组件结构、props、antd 使用约定 |
| [hook-guidelines.md](./hook-guidelines.md) | 自定义 hook、react-query 数据获取 |
| [state-management.md](./state-management.md) | 本地态 / 服务端态 / 全局态 / URL 态 |
| [error-handling.md](./error-handling.md) | 四态渲染、promise 边界、失败态落点 |
| [quality-guidelines.md](./quality-guidelines.md) | 注释、行数上限、lint、验证深度 |
| [type-safety.md](./type-safety.md) | TS 配置、类型组织、契约同步 |

---

## 当前结构

```
frontend/src/
├── index.less         # 全局样式地基（reset + #root + 工具类）—— 必须在 main.tsx 引入
├── main.tsx           # createRoot + StrictMode
├── App.tsx            # ConfigProvider(theme) > AntdApp > QueryClientProvider > RouterProvider
├── api/               # client.ts（唯一 axios 实例）/ auth.ts / health.ts / types/
├── router/            # createBrowserRouter + 每层布局的 errorElement
├── layouts/           # AuthLayout（登录前）/ AppLayout（登录后）
├── components/        # LoadError / RequireAuth / PageHeader / BrandMark
├── hooks/             # useCurrentUser / useLogout
├── store/             # zustand（ui.ts）
├── utils/             # 跨目录复用的纯函数（formatDateTime）
└── pages/             # Home（搭建成功自检页）/ auth/Login
```

---

## 开工前检查清单

- [ ] 读过本目录规范与任务 `prd.md` 的验收清单
- [ ] 接口契约已确认：错误格式 `{ statusCode, message, error, errors? }`、
      分页形状 `{ items, total, page, pageSize }`、时间格式 ISO 8601 UTC 字符串
- [ ] 表单关键校验两端都做（前端 `Form` 规则 + 后端 DTO）
- [ ] 样式落在同目录 `style.less`，没有为版式写行内 `style`
- [ ] 新代码落在 `directory-structure.md` 规定的层里，没有新造顶层目录

---

## 完成前质量检查

1. **类型**：`npx tsc -b` 过（`npm run build` 的第一段就是它）。
2. **lint**：`npm run lint` 过。
3. **格式**：`npx prettier --check <本次改动的文件>` 过；不要直接全量 `--write`。
4. **行数**：单文件 ≤ 500 行（300 行就该考虑拆）。
5. **四态**：loading / 401 / error / empty 显式处理，且 loading 与 error **分开判断**。
6. **promise 边界**：`mutateAsync()` 和事件处理器里的裸 `await` 都 `.catch()`。
7. **构建**：走完整 Trellis 流程的任务必须 `npm run build` 全过。

> AI 不做浏览器自动化验收；静态检查 + 代码读回去核对算完成，界面由维护者自己点。

---

## 与后端契约的同步义务（没有编译器保护）

| 事实 | 后端 | 前端 |
|---|---|---|
| 错误响应形状 | `AllExceptionsFilter` / Nest 默认过滤器 | `src/api/client.ts` 的 `problemOf` |
| 字段名（字段级错误回填） | `errors` 的 key | `Form.Item` 的 `name` |
| 用户形状 | `auth/auth.types.ts` 的 `UserRecord` | `api/types/auth.ts` 的 `Me` |
| 分页参数与上限 | DTO 的 `pageSize` 上限 | 列表页的 `pageSizeOptions` |
| 时间格式 | ISO 8601 UTC 字符串 | `utils/formatDateTime` 本地化显示 |

`errors` 的 key 对不上时 antd 的 `setFields` 是**静默 no-op** —— 用户点了没反应。
