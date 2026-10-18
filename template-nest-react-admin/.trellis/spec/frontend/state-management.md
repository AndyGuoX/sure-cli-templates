# 前端状态管理

> 判据先于工具：先问「这份状态属于哪一类」，再决定放哪里。四类状态不要混用。

---

## 四类状态

| 类型 | 例子 | 放哪 |
|---|---|---|
| **本地态** | 弹窗开关、输入框中间值、倒计时 | `useState` / `Form` |
| **服务端态** | 当前用户、列表、详情、健康检查 | **react-query** |
| **全局客户端态** | 侧栏折叠、主题偏好 | **zustand** |
| **URL 态** | 分页、筛选、tab、搜索词 | `useSearchParams` / 路由参数 |

### 服务端态不进 zustand

`useCurrentUser` 是用户态的唯一来源。多存一份到 store 会让退出登录必须清两处，
漏一处就是「下一个用户看到上一个用户的名字」。

### 全局客户端态的判据

同时满足三条才进 `store/`：跨组件共享、不来自后端、props 传递会变成 prop drilling。
本模板只有 `store/ui.ts`（侧栏折叠）。

### URL 态优先

分页、筛选、tab 放 URL：可刷新、可分享、可后退。不要为了「省一次请求」把它们塞进
全局 store —— 那样刷新就丢。

---

## zustand 写法

```ts
interface UiState {
  siderCollapsed: boolean;
  toggleSider: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  siderCollapsed: false,
  toggleSider: () => set((state) => ({ siderCollapsed: !state.siderCollapsed })),
}));
```

- store 只放状态与动作，不放派生数据（派生在组件里算）。
- **不把 store 当事件总线**：跨页面的动作走路由或 react-query 的缓存失效。
- 持久化只在确实需要时用 `persist` 中间件（如主题偏好），不要默认开启。
