# 前端质量规范

---

## 工具链

| 关注点 | 工具 | 配置 |
|---|---|---|
| lint | **oxlint** | `frontend/.oxlintrc.json`（react / typescript / oxc） |
| 格式化 | Prettier 3 | `frontend/.prettierrc`，**printWidth 120** |
| 类型检查 | `tsc -b` | `strict: true` |
| 构建 | Vite 8 | `npm run build` |
| 测试 | **本模板未内置**（YAGNI） | 需要时再加 Vitest |

⚠️ **配置文件必须叫 `.oxlintrc.json`**，别的名字不会被发现，而且不报错。

---

## 验证深度按任务路径分级

| 任务路径 | 验证范围 |
|---|---|
| 走完整 Trellis 流程 | 按 `implement.md` 全跑，**含 `npm run build`** |
| 用户说「直接改」的小任务 | `npx oxlint <改动文件>` + `npx prettier --check <改动文件>` + `npx tsc -b` |

新增依赖、改 `tsconfig*.json` / `vite.config.ts` 时必须跑完整 build。

---

## 代码风格

- 函数参数与返回值都标类型；组件 props 用 `interface`。
- `strict: true` 下写代码：不用 `any`、不用 `@ts-ignore`。
- 跨目录导入用 `@/`；同目录用 `./`。
- async/await 优先，不用 `.then()` 链（`logout().catch().then()` 这种需要 catch 的除外）。
- **不要漏 `await`**；事件处理器里的裸 `await` 必须 `.catch()`。
- 单文件 ≤ 500 行（300 行就该考虑拆）；单函数 ≤ 50 行。

---

## 注释约定

注释解释**为什么**，不复述**做什么**。必须写注释的情形：

1. **反直觉的写法**：看起来能简化，实则不能（如 `AppLayout` 里 `isUnauthorized` 才 `return null`）。
2. **安全 / 防数据丢失的设计**：`redirect` 只接受站内路径、会话 Cookie 是 httpOnly。
3. **踩过的坑**：写清现象（如 antd `setFields` 对不存在的 name 静默 no-op）。
4. **绕过第三方库/运行时行为**：说明是哪个行为逼你这么写。
5. **刻意的不做**：为什么没做显而易见的那件事。

风格：中文；模块/组件用 JSDoc 说明用途与存在理由；注释和代码一起改。

---

## 审查要点

1. **四态**：loading / 401 / error / empty 显式处理，loading 与 error 分开判断。
2. **失败落点**：主资源整页 `LoadError`，分区内容关在块内。
3. **promise 边界**：`mutateAsync` 与裸 `await` 都 catch；`queryFn` 里没有 try/catch。
4. **路由**：每个顶层布局有 `errorElement`，有 `path: '*'`。
5. **契约**：`api/types` 与后端一致；`errors` key 与表单 name 一致。
6. **样式**：版式在 `style.less`；没有为版式写行内 style。
7. **结构**：没有新造顶层目录；没有空目录 / 空抽象。
8. **注释**：重要决定写了「为什么」；没有描述旧行为的注释。
