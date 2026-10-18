# 后端错误处理规范

> 记录 `backend/` 的错误模型、抛出方式与响应契约。
> 前端消费方式见 [../frontend/error-handling.md](../frontend/error-handling.md)。

---

## 契约：Nest 默认错误信封

```json
{ "statusCode": 400, "message": "验证码错误或已过期，请重新获取", "error": "Bad Request" }
```

直接用 Nest 默认异常过滤器输出，**不额外包一层** `{ code, data, msg }` 信封。
唯一允许的 additive 扩展是字段级错误的 `errors` 键：

```json
{
  "statusCode": 400,
  "message": "请检查表单填写",
  "error": "Bad Request",
  "errors": { "email": ["邮箱格式不正确"] }
}
```

---

## 怎么抛：用 Nest 内置的 `HttpException` 子类

```ts
throw new BadRequestException('验证码错误或已过期，请重新获取'); // 400
throw new UnauthorizedException();                               // 401
throw new ForbiddenException('跨站请求被拒绝');                   // 403
throw new NotFoundException('资源不存在');                        // 404
throw new ConflictException('操作冲突，请重试');                  // 409
throw new HttpException('发送太频繁，请 60 秒后再试', 429);        // 429
```

- **抛异常，不要返回**：不写 `res.status(400).json(...)`，controller 的返回类型是成功时的形状。
- **`message` 是给用户看的**：中文、能指导下一步动作。
- **不要抛裸 `Error`**：会被兜底过滤器变成 500，用户看到的是服务故障，而实际可能是他填错了。

---

## 状态码约定

| 码 | 含义 | 典型场景 |
|---|---|---|
| `400` | 参数错误 | DTO 校验失败、验证码错误、业务规则不满足 |
| `401` | 未登录 | Cookie 缺失/失效 |
| `403` | 无权限 | 同源中间件拦下的跨站写请求；将来有角色时的权限不足 |
| `404` | 资源不存在 | id 合法但对象不存在 |
| `409` | 与当前状态冲突 / 唯一性冲突 | 并发写冲突、唯一键重复 |
| `429` | 限流 | 验证码发送过频（带 `Retry-After`） |
| `500` | 未预期错误 | 兜底：不向用户泄露任何细节 |

### 参数格式错（400）与资源不存在（404）必须分开

数字型 query 走 DTO 的 `@Type(() => Number)` + `@IsInt()`，**不要在 controller 里手搓
`Number()`** —— `Number('abc')` 是 `NaN`，永远匹配不上，400 会塌成 404：

```ts
// ❌ ?page=abc → Number('abc') = NaN → 查不到 → 404
// ✅ DTO 校验 → 400
```

判据：**这个值不合法时，调用方改一下请求就能成功吗？** 能 → 400；不能 → 404。

### `POST` 但不创建资源的接口要显式 `@HttpCode(200)`

Nest 对 `@Post()` 默认返回 **201 Created**。登录、发码、登出都写着 `@HttpCode(200)`。
判据：**这个接口有没有让数据库多出一行？** 没有就加 `@HttpCode(200)`。
不写不会报错，axios 把 2xx 都当成功 —— 只有真的发一次请求才看得出来。

---

## 字段级错误（与前端的关键契约）

`ValidationPipe` 的 `exceptionFactory` 把校验结果按字段归并：

```ts
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        message: '请检查表单填写',
        error: 'Bad Request',
        errors: Object.fromEntries(
          errors.map((e) => [e.property, Object.values(e.constraints ?? {})]),
        ),
      }),
  }),
);
```

两条硬约束：

1. **`errors` 的 key 就是前端 `Form.Item` 的 `name`**。两边对不上时 antd 的 `setFields`
   是**静默 no-op** —— 用户点了保存毫无反应。
2. **落不到字段的错误要给 `message`**。只给 `errors` 且 key 不在表单里，就是彻底静默。

手写业务错误同理：能落到字段就带 `errors`，落不到就只给 `message`。

---

## 兜底过滤器

`common/filters/all-exceptions.filter.ts`，在 `main.ts` 里 `app.useGlobalFilters(...)` 注册。

**为什么必须有**：Nest 内置过滤器能把未捕获异常变成 500，但**不打日志** ——
出问题时只剩一条空白的「服务器内部错误」。

四条约定：

1. 不向客户端泄露堆栈 / SQL / 内部路径。
2. 用 `logger.error(msg, stack)` 记录根因。
3. `5xx` 记堆栈，`4xx` 不记（业务预期路径，记堆栈只会刷屏）。
4. 对齐 Nest 信封形状；对象形式的异常原样透传并补 `statusCode`。

### `HttpException.getResponse()` 的三种形态（已实测）

| 构造方式 | `getResponse()` | 过滤器输出 |
|---|---|---|
| `new BadRequestException('x')` | `{ message, error, statusCode }` | 原样透传 |
| `new HttpException('x', 502)` | `'x'`（裸字符串） | `{ message: 'x', statusCode: 502 }` |
| `new HttpException({ message, errors }, 400)` | `{ message, errors }` | 补 `statusCode: 400` |

所以过滤器里「字符串包成 `{ message }`、对象展开」的分支是**必需的**，不是防御性代码。

---

## 限流：429 + `Retry-After`

限流返回 **429** 且**必须带 `Retry-After` 响应头**，前端倒计时读它：

```ts
throw new HttpExceptionWithHeaders('发送太频繁，请 60 秒后再试', 429, {
  'Retry-After': String(retryAfterSeconds),
});
```

`HttpExceptionWithHeaders` 把头挂在异常上，由 `AllExceptionsFilter` 统一写到响应 ——
service 仍然不碰 `Response`。

---

## 第三方故障 ≠ 用户错误

第三方依赖不可用（SMTP 连接失败等）要翻译成明确的业务错误，而不是冒泡成 500：

```ts
try {
  await transporter.sendMail({ ... });
} catch (e) {
  this.logger.error(`发送验证码邮件失败 email=${email}`, e instanceof Error ? e.stack : String(e));
  throw new HttpException('邮件发送失败，请稍后重试', 502);
}
```

- **翻译时把原异常用日志留下来**。
- **不要 catch 后静默 return**：发信失败却回「已发送」，用户会一直等一封永远不来的邮件。
- **不要 catch 成 4xx**：那会把运维配置错误伪装成用户填错。

---

## 团队明确避免的反模式

- ❌ 不手写 `res.status().json(...)`。
- ❌ 不额外包一层响应信封。
- ❌ 不 `catch (e) {}` 空吞异常。
- ❌ 不把第三方故障报成用户错误，也不把用户错误报成 500。
- ❌ 不向客户端泄露堆栈 / 内部路径 / 凭证。
- ❌ 不省略 `errors` 的 key 与前端表单字段名的对齐。
- ❌ 不给「POST 但不创建资源」的接口省略 `@HttpCode(200)`。
- ❌ 不按直觉假设第三方库的异常树：先确认它真的在你 catch 的那个基类下。
