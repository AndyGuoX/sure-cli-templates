# 前端错误处理规范

> 记录前端的**错误呈现方式与 promise 边界约定**。后端契约见
> [../backend/error-handling.md](../backend/error-handling.md)。

---

## 第一原则：任何失败都必须在界面上有交代

界面永远不能出现这三种「什么都不告诉用户」的状态：

| 反模式 | 表现 | 成因 |
|---|---|---|
| **白屏** | 整页空白 | 数据没拿到时 `return null` |
| **永久骨架屏** | 一直转圈，永不结束 | `if (isLoading \|\| !data) return <Skeleton />` |
| **假空态** | 「还没有数据」 | 加载失败落到了空数组分支 |

三者都源自同一个错误：**把「请求失败」和「还没加载完」当成同一件事**。必须分开判断。

---

## 四态渲染（强制）

每个取数的页面/组件按**固定顺序**处理四态，早返回，不嵌套：

```tsx
if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
if (isUnauthorized(error)) return null;              // 拦截器正在跳登录，这一帧不闪任何东西
if (isError || !data) return <LoadError onRetry={() => refetch()} />;
return <正常内容 />;                                  // 空数据由 Empty 在内容区处理
```

顺序有讲究：

1. **loading 最先** —— 还在飞的请求不是错误。
2. **401 第二** —— `client.ts` 拦截器已经在跳登录，此时渲染错误页会闪一下再跳走。
   `isUnauthorized(error)` 是**唯一允许 `return null` 的场合**。
3. **其余失败一律 `LoadError`** —— 后端挂了、500、网络断、超时。必须给重试出口。
4. **空数据 ≠ 失败** —— 走 `Empty`（带引导操作），不显示错误页。

> **反例（真实事故形态）**：布局壳曾写 `if (!me) return null; // 401 已由拦截器跳转`。
> 注释里的假设是错的 —— `!me` 不只有 401 一种成因。后端一停就 `data === undefined` 走到
> `return null`，而布局壳是**所有** app 路由的父级 element，等于整棵应用树不渲染 → 整站白屏，
> 500 的 toast 弹在一片空白上。本模板的 `AppLayout` 就是那个位置，别重犯。

---

## 失败态该落在哪一层（强制）

`LoadError` 存在的理由是避免白屏。但把它铺满整页、连页头和 Tab 一起换掉，用户就失去了这个
页面所有的功能入口 —— 那和白屏没有实质区别。

**每条 `useQuery` 都要先回答一个问题：我是这个页面的主资源，还是页面里某一块的内容？**

| 角色 | 失败时渲染 | 本模板例子 |
|---|---|---|
| **主资源**（页面就是这个资源，页头要用它的字段） | 整页 `LoadError` | 布局壳的 `me`、`RequireAuth` |
| **分区内容**（一张 Card / 一个 Tab 面板 / 一个弹窗） | `LoadError` **关在那一块里** | 首页的 `health` 卡片（用 `Alert`，不夺走整页） |
| **选项来源**（某个下拉的 options） | 不夺走页面；别让空下拉读成「你没有可选项」 | 筛选器 / 抽屉里的下拉 |

### ❌ 次要请求的失败不许夺走整页

版本历史只是页面里的一块，它失败不该让用户连「编辑」「审核」都点不到。

### ❌ 每个 `onRetry` 必须重取它自己那条查询

多条 `useQuery` 就要有多个 `refetch`。按钮在、但修不好，比没有按钮更糟。

### ❌ 参数错误（4xx）不是「服务不可用」

`LoadError` 的默认文案是「服务暂时不可用，请稍后重试」。403 / 404 / 409 / 400 都不是那回事，
而且**重试对它们无效**。用 `isServerDown(error)` 分流：

```tsx
if (isUnauthorized(error)) return null;                        // 拦截器在跳登录
if (isError && isServerDown(error)) return <LoadError onRetry={() => refetch()} />;
// 其余 4xx：toast 一次 + 保留可交互的界面（或 Result 页说清业务事实）
```

把后端 500 显示成「资源不存在或你没有权限」会让用户去找管理员要权限 —— 排查方向全错。
反过来把 400 说成「服务暂时不可用」，用户会一直点重试。

### ❌ 筛选栏 / 参数控件不许随失败态一起消失

参数错误时保留筛选栏与「重置」按钮 —— 被用户改坏的参数只能靠那些控件自救。

---

## 统一兜底组件：`LoadError`

`src/components/LoadError/index.tsx` —— 加载失败 / 渲染崩溃的唯一错误页。

```tsx
interface LoadErrorProps {
  title?: ReactNode;        // 默认「加载失败」
  subTitle?: ReactNode;     // 默认「服务暂时不可用，请稍后重试」
  onRetry?: () => void;     // 不传则 window.location.reload()
}
```

- **失败态一律用它**，不自己拼 `Result` + 重试按钮。
- 有 `refetch` 就传 `onRetry={() => refetch()}`（就地重试，不刷整页）；
  路由 `errorElement` 场景没有 `refetch`，省略即走整页刷新。
- 文案可覆盖，但**别把服务故障说成业务问题**。

---

## 渲染期崩溃：`errorElement` + `path: '*'`

四态只能拦住 promise 里的失败。渲染期抛错（读了 `undefined` 的属性等）不在任何 promise 里，
try/catch 拦不到，**只有 ErrorBoundary 能拦** —— react-router 的 `errorElement` 就是它。

```tsx
const crashed = <LoadError title="页面出错了" subTitle="刷新一下通常就好，反复出现请联系管理员" />;

createBrowserRouter([
  { element: <AuthLayout />, errorElement: crashed, children: [...] },
  { element: <RequireAuth />, errorElement: crashed, children: [...] },
  { path: '*', element: <LoadError title="页面不存在" subTitle="地址可能已失效" /> },
]);
```

- **每个顶层布局路由必须带 `errorElement`**，否则 react-router 会渲染它自带的无样式默认错误页。
- **必须有 `path: '*'` 兜底**，否则乱输 URL 也是白页。

---

## try/catch 与 react-query 的边界

| 调用方式 | 要不要 catch | 为什么 |
|---|---|---|
| `useQuery` / `useMutation` | ❌ 不要 | react-query 内部就是那个 try/catch |
| `queryFn` / `mutationFn` 内部 | ❌ 不要 | 吞掉错误后 `isError` 永远 false |
| `mutate()` / `refetch()` / `invalidateQueries()` | ❌ 不要 | 它们不 reject |
| `mutateAsync()` | ✅ 要 | 会 reject，且常交给 antd 的 `onOk` |
| 事件处理器里裸 `await apiFn()` | ✅ 要 | 没有任何人接 |

### 在 `queryFn` 里 try/catch 是有害的

```tsx
// ❌ 吞掉错误再返回 undefined —— isError 永远 false，页面退化成永久骨架屏
queryFn: async () => {
  try { return await fetchPolicies(); } catch { return undefined; }
}
```

### `mutateAsync` 必须 catch

antd 的 `Modal.confirm({ onOk })` 靠返回的 promise 控制按钮 loading、并且只在 resolve 时关弹窗，
所以这里**必须**用 `mutateAsync`。但 antd 在 reject 分支会 `return Promise.reject(e)` 转抛，
没人接就是一条未处理拒绝（控制台一条 `Uncaught (in promise)`）。

```tsx
modal.confirm({
  onOk: () => publish.mutateAsync({ id }).catch(() => {}),
});
```

`.catch(() => {})` 在这里不是「吞异常」—— `onError` 已经完整处理过了，这只是掐断一条没人订阅的链。

### 裸 `await`：本地动作优先

```tsx
// ❌ 后端挂了或 500 → reject → 后面两行永不执行
await logout();
qc.clear();
navigate('/login', { replace: true });

// ✅ 服务端清 cookie 失败也必须放人走
await logout().catch(() => {});
qc.clear();
navigate('/login', { replace: true });
```

判断标准：`await` 之后的代码是不是「无论服务端成功与否都该做」的本地清理？
是 → 必须 catch。退出登录、关弹窗、清表单都属于这类。

### 浏览器 API 的「存在性」也是失败源

`navigator.clipboard` **只在安全上下文**（HTTPS / localhost）才存在。内网 HTTP 部署时它整个是
`undefined`，`navigator.clipboard.writeText(...)` 抛的是**同步 TypeError**，`.then(onRejected)`
接不住。凡是在事件处理器里调浏览器 API（剪贴板、全屏、通知），先假定它可能不存在，
`await` + `try/catch` 是默认写法。有降级通路（剪贴板 → `execCommand`）就先走降级。

---

## 拦截器负责什么 / 页面负责什么

`src/api/client.ts` 的响应拦截器统一处理三类：

| 情况 | 拦截器行为 |
|---|---|
| `401` | 跳 `/login?redirect=<当前路径>`，用 `replace` 防后退；**排除 `/auth/me`、`/auth/login`、`/auth/send-code`** |
| `>= 500` | `message.error(...)`（统一提示，不把详情抛给业务层） |
| **无 response**（后端没起 / 网络断 / 超时） | `message.error(...)`；排除主动取消的请求（`ERR_CANCELED`） |

第三条容易漏：后端完全没起时压根没有 `response`，`status >= 500` 分支命中不了 ——
不单独处理就是**彻底静默失败**。

**排除 `/auth/*` 是关键**：`/auth/me` 的 401 是「确实没登录」这个正常状态，
不是「登录过期」。不排除会导致还没显示登录页就先跳了一次，或者登录页自己请求 401 时死循环。

**400 / 403 / 404 / 409 / 429 不在拦截器提示**，交调用方按业务语义处理
（字段回填、`Result` 页、验证码倒计时读 `Retry-After`）。

---

## 字段级错误

后端 `ValidationPipe` 的 `exceptionFactory` 归并出 `errors`：

```json
{ "statusCode": 400, "message": "请检查表单填写", "error": "Bad Request",
  "errors": { "email": ["邮箱格式不正确"] } }
```

登录页的回填写法：

```tsx
const errors = problem.errors ?? {};
const landed = FIELDS.filter((field) => field in errors);
form.setFields(landed.map((name) => ({ name, errors: errors[name] })));
// 判「错误有没有落到字段上」，不是判「有没有 errors」：
// 落不到就必须给提示条，否则用户点了没反应。
if (landed.length === 0 && !isServerDown(e)) setError(problem.message);
```

⚠️ **`errors` 的 key 与 `Form.Item` 的 `name` 之间没有编译器保护**，antd 对不存在的字段名
是**静默 no-op**。两边对不上，用户点了保存毫无反应（既没有字段红字，也没有 toast）。

---

## 团队明确避免的反模式

- ❌ 数据没拿到不许 `return null`：只有 `isUnauthorized(error)` 例外。
- ❌ 不许 `if (isLoading || !data) return <Skeleton />`：两个条件必须分开。
- ❌ 加载失败不许落到空态。
- ❌ 不许把 5xx / 网络故障显示成 404 或权限问题。
- ❌ 次要请求的失败不许夺走整页。
- ❌ 参数错误（4xx）不许说成「服务暂时不可用」。
- ❌ `onRetry` 不许重取别人那条查询。
- ❌ 不在 `queryFn` / `mutationFn` 里 try/catch 吞错。
- ❌ `mutateAsync` 不许不 catch；裸 `await apiFn()` 不许不 catch。
- ❌ 顶层布局路由不许漏 `errorElement`，也不许漏 `path: '*'`。
- ❌ 不自己拼失败态 UI：统一 `LoadError`。
- ❌ 字段名不许与后端 `errors` 的 key 不一致。
