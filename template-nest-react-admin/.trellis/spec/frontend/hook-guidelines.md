# 前端 Hook 规范

---

## 自定义 hook

- 文件名 `useXxx.ts`，导出 `export function useXxx()`。
- **同一 `queryKey` 在 3+ 处出现才抽 hook**（YAGNI）。只被一个页面用的查询直接写在页面里。
- hook 只封装「状态 + 副作用 + 数据获取」，不返回 JSX。
- hook 内部不要做导航跳转以外的隐式全局副作用；退出登录这类动作见 `useLogout`。

---

## react-query 约定

### queryKey

- 统一用数组：`['me']`、`['health']`、`['policies', { page }]`。
- **用户态只有一个 key `['me']`**：登录成功后 `qc.setQueryData(['me'], user)`，
  退出时 `qc.clear()`。不要另存一份到 zustand。

### 默认配置

`App.tsx` 的 `QueryClient`：

```ts
queries: { refetchOnWindowFocus: false, retry: 1 }
```

- `refetchOnWindowFocus: false`：中台系统切回标签页不重拉。
- **401 类查询显式覆盖 `retry: false`**（`useCurrentUser`）：401 是正常状态，重试没有意义。

### queryFn

- 直接 `return apiFn()`，**不要 try/catch**。吞错会让 `isError` 永远 false。
- 需要转换数据就在 `queryFn` 里转换，不要放到渲染里。
- 依赖参数的查询把参数放进 `queryKey`，否则切换参数不会重新取数。

### mutation

- 成功后 `invalidateQueries({ queryKey: [...] })` 或就地 `setQueryData`。
- 交给 antd `onOk` 的用 `mutateAsync().catch(() => {})`，错误本身在 `onError` 里处理。
- 不要用 `mutate` 的 `onSuccess` 做导航 —— 导航属于调用方。

### 失败态

- `isPending` / `isError` / `data` 三者分开判断，见 [error-handling.md](./error-handling.md)。
- 不是主资源的查询（`health` 卡片）失败时只影响自己那一块。
