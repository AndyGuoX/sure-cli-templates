# 前端目录结构规范

> 记录 `frontend/` 的目录组织与分层边界。新文件必须落在规定的层里。

---

## 顶层结构

```
frontend/src/
├── index.less            # 全局样式地基：reset + #root/img 兜底 + 跨页工具类
├── main.tsx              # 入口
├── App.tsx               # 主题 / antd App / react-query / router 装配
├── router/
│   └── index.tsx         # 路由表集中在这里
├── api/                  # 数据层：唯一允许直接碰 axios 的地方
│   ├── client.ts         # axios 实例 + 拦截器 + problemOf / 错误判定
│   ├── types/            # 与后端 DTO 一一对应的类型，按域拆 + index.ts barrel
│   ├── auth.ts
│   ├── health.ts
│   └── index.ts          # 只做 re-export
├── store/                # zustand：跨组件共享的非服务端状态
├── hooks/                # 自定义 hook
├── layouts/              # 布局壳（各自 index.tsx + style.less）
├── components/           # 跨页复用的薄壳
├── constants/            # 前后端共享事实的前端落点（需要时再建）
├── utils/                # 跨目录复用的纯函数
└── pages/                # 页面，按业务域分子目录
```

**不要预先建空目录 / 空抽象**：目录随功能长出来（YAGNI）。

---

## 分层职责

### `api/` —— 数据层

- `client.ts`：唯一的 axios 实例（`baseURL: '/api'`、`withCredentials: true`）+ 响应拦截器 +
  错误判定工具（`problemOf` / `isUnauthorized` / `isServerDown` / `retryAfterSeconds`）。
  **页面不许自己比状态码，也不许 `import axios`。**
- `types/`：与后端 DTO 一一对应的类型，按业务域拆文件，`types/index.ts` 只做 `export *`。
  调用方一律 `import type { X } from '@/api/types'`，不要 deep import 具体域文件。
- 按业务域拆文件，统一模式 `api.get<T>(url).then((r) => r.data)`。
- **每个导出函数必须有 JSDoc**（用途 + 参数 + 非显然的返回值语义）。
- `index.ts` **只 re-export**，不写任何函数。

### `store/` —— zustand 全局客户端状态

只放「跨组件共享 + 不来自后端 + props 传递会变成 prop drilling」三者的交集。
服务端数据一律归 react-query。判断标准见 [state-management.md](./state-management.md)。

### `hooks/` —— 自定义 hook

文件名 `useXxx.ts`，导出 `export function useXxx()`。同一 `queryKey` 在 3+ 处出现才抽 hook。
命名与模式见 [hook-guidelines.md](./hook-guidelines.md)。

### `components/` —— 跨页复用的薄壳

判据是「**被 2 个以上页面用**」，不是「这个文件太长了」。当前有：

| 组件 | 职责 | 有没有 `style.less` |
|---|---|---|
| `PageHeader` | 页面顶部：标题 + 说明 + 右侧操作区 | 有 |
| `LoadError` | 加载失败 / 路由崩溃的唯一错误页 | 没有（纯 antd） |
| `BrandMark` | 品牌记号（内联 SVG） | 没有（尺寸是 props 的函数） |
| `RequireAuth` | 登录门禁（路由 element） | 有（全屏加载页） |

页面内专用的片段**就近写在页面文件里**，不为它单独建组件目录。

### `utils/` —— 跨目录复用的纯函数

判据是「**被 2 个以上不相干的目录用**」且是**纯函数**（无 React、无 axios、无副作用）：

- ✅ 日期格式化、字符串/数字处理。
- ❌ 只有一个消费方的，留在消费方就近。
- ❌ 属于某个域的（状态机、派生 id）归 `api/` 或后端。
- ❌ 不变成杂物目录：每个文件一个明确主题，不建 `helpers.ts` / `index.ts` 垃圾桶。

### `layouts/` —— 布局壳

`AppLayout`（登录后：Sider + Header + Content）、`AuthLayout`（登录前：居中卡片 + 装饰底图）。
各自 `index.tsx` + `style.less`。布局壳必须带 `errorElement`（见 error-handling.md）。

布局壳的 `style.less` 可以嵌 `.ant-*` 内部类；页面 `style.less` 里**不要**碰 `.ant-*`。

### `pages/` —— 页面

按业务域分子目录，一个页面一个文件夹。**路由路径与目录结构无关**，路由表集中。
页面目录里可以有多个拆分件，但它们**共用一份 `style.less`**。

---

## 文件命名

| 对象 | 约定 | 示例 |
|---|---|---|
| 页面 / 布局 / 组件（默认导出） | 大驼峰文件夹，内含 `index.tsx` | `pages/auth/Login/index.tsx` |
| 页面内的拆分件（有 JSX） | 大驼峰文件，同目录 | `PolicyDetail/EditorTab.tsx` |
| 页面内的拆分件（无 JSX） | 小驼峰文件 | `columns.tsx` |
| 组件样式 | 固定叫 `style.less` | `components/PageHeader/style.less` |
| api 模块 / 类型 / hook / store | 小驼峰文件 | `api/auth.ts`、`hooks/useCurrentUser.ts` |

**拆分件里有 JSX 与没有 JSX 要分开文件**：一个文件同时导出组件与常量/函数会让 oxlint 的
`react/only-export-components` 报 warning，热更新退化成整页刷新。

---

## 样式落点：文件夹即组件（co-located Less）

| 落点 | 收什么 | 判据 |
|---|---|---|
| `src/index.less` | reset、`#root`/`img` 兜底、跨页面工具类 | 被 2 个以上**页面**用，且不属于任何组件 |
| `<组件目录>/style.less` | 该组件的全部版式 | **默认落点** |
| 页面目录共用一份 | 页面内多个拆分件的样式 | 不为每个拆分件各开一个 |

写法约定：

- 类名语义化 + 组件前缀（`.page-header`、`.login-card`），不用 CSS Modules。
- **嵌套表达归属，根类写成组件名**。我们的类与 antd 的类常常同为 `0,1,0` 特异性，
  谁赢取决于运行期样式注入顺序；加一层根类把特异性提到 `0,2,0` 才稳。
- **主题色值写不了变量** —— antd v6 没开 CSS 变量模式，`theme.useToken()` 的值在 `.less`
  里取不到。字面值要在注释里标明等价于哪个 token，换主题时一起改。
- 需要 antd 内部类名时，必须用根类限定到组件实例，并写清理由。

### 反模式

- ❌ 不写行内 `style` 表达版式。行内只允许两个例外：值是运行时计算的；值被 antd 写成
  行内样式、CSS 盖不掉。两个例外都要写注释。
- ❌ 不引入第二套样式方案（Tailwind / CSS-in-JS / CSS Modules）。
- ❌ 不新建 `styles/` 集中样式目录。

---

## 路径别名 `@/`

- `vite.config.ts` 的 `resolve.alias` 与 `tsconfig.app.json` 的 `paths` 两处必须同时存在。
- 跨目录一律使用别名；同目录可以留 `./`。
- ❌ 禁止 `../../` 这类向上回溯 —— 文件一移动就断。

---

## 团队明确避免的反模式

- ❌ 不预先建空目录 / 空抽象。
- ❌ 不在页面里散落路由配置：集中 `router/index.tsx`。
- ❌ 不把接口堆进单个文件：`api/` 按域拆，`index.ts` 只 re-export。
- ❌ 不绕过 `api/` 直接用 axios。
- ❌ 不写行内 `style` 表达版式。
- ❌ 不 deep import `api/types/` 里的具体域文件：走 barrel `@/api/types`。
