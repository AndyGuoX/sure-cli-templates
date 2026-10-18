# 前端组件规范

---

## 组件形态

- 页面 / 布局 / 组件默认导出，文件夹即组件：`components/PageHeader/index.tsx`。
- **props 用 `interface` 命名 `<组件名>Props`**，每个非显然字段写一行注释。
- 组件只做渲染与交互；数据获取放 hook / 页面，业务规则放后端或 `utils/`。
- **不为单个实现建抽象**：不要 `BaseCard` / `HOC` / render props，除非确实有两个以上消费方。

---

## props 约定

- **透传 antd 的能力时优先组合而不是重造**（如 `PageHeader` 的 `extra` 直接收 `ReactNode`）。
- **可空值的占位由调用方决定**：工具函数返回 `null`，表格里统一 `?? '—'`。
- **不要用 `React.FC`**：它隐式带 `children`，且对泛型不友好。直接写函数签名。
- 事件的命名：`onXxx` 是回调属性，`handleXxx` 是内部处理函数。

---

## antd 使用约定

1. **静态方法禁用**：用 `App.useApp()` 拿 `message` / `modal` / `notification`。
   静态 `message.error(...)` 拿不到 `ConfigProvider` 的 theme / locale。
2. **表单字段名与后端 `errors` 的 key 逐字一致**；`Form.setFields` 对不存在的 name 是静默 no-op。
3. **受控组件的错误回填**：`Input.OTP` 这类回填后要 `form.setFieldValue(name, '')` +
   `ref.focus()` 才有反馈，否则只是把红字挂上去。
4. **危险/不可逆操作**用 `modal.confirm` 二次确认。
5. **`Modal.confirm` 的 `onOk` 返回 promise 时**：只有 resolve 才关弹窗，所以异步动作要用
   `mutateAsync`，并按 error-handling.md 的规则 `.catch()`。
6. **`message` 只用于反馈结果**，不要把错误文案塞进 toast 就完事 —— 能落到字段的必须落到字段。

---

## loading / empty / error

- 页面级 loading 用 `Skeleton`；**全屏启动等待**用 `Spin`（避免外壳闪现）。
- 分区 loading 只占那一块，不要把整页换成骨架。
- 空态用 `Empty`，带引导操作（「新建」按钮）。
- 失败态统一 `LoadError` 或分区 `Alert`，见 [error-handling.md](./error-handling.md)。

---

## 样式

- 版式写在同目录 `style.less`，组件根类名与组件同名（`.page-header`）。
- **不写行内 `style`**，两个例外：值是运行时计算的；值被 antd 写成行内样式、CSS 盖不掉。
  两个例外都必须写注释说明原因。
- 需要 antd 内部类名时，用根类限定到组件实例，并写清为什么 antd 的 props 表达不了。
- 主题色值在 `.less` 里是字面值（antd v6 没开 CSS 变量模式），注释里标明等价 token。

---

## 可访问性

- 图标按钮必须有 `aria-label`（如侧栏折叠按钮）。
- 表单控件用 `label` 或 `aria-label`，不要只靠 placeholder。
- 颜色不能是唯一的信息载体：状态同时给文字（Tag 的 `success` / `error` 有文字）。
