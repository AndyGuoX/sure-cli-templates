# 后端日志规范

> 本文件是日志的唯一规范。实现落在 [`backend/src/common/logging/`](../../../backend/src/common/logging/)。

---

## 一句话：业务代码怎么写

**什么都不用改。**

```ts
import { Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationCode(email: string, code: string) {
    this.logger.warn(`[DEV] 验证码 ${email} → ${code}`);
  }
}
```

`main.ts` 里 `app.useLogger(new AppLoggerService())` 之后，**所有** `Logger` 用法（含 Nest
自身、第三方模块）都自动走本项目的格式与落盘。桥接装在出口，不改调用点。

新的环境变量、级别、文件位置都**不要**在业务代码里碰；要调就调 `.env`。

---

## 行格式：四列

```
2026-09-14 14:03:21.472 | INFO     | HealthController | 后端已连通
```

**时间（到毫秒） | 级别 | logger 名 | 消息**

- **补毫秒**：并发请求的排序只靠秒分不出先后。
- **`|` 分隔**：`grep -F ' | ERROR '` 比匹配裸 `ERROR` 准。
- **stdout 与文件共用同一份 format**：`主文件 == stdout` 可以直接 `cmp` 验证。
- **用 stdout 而不是 stderr**：两条流混着走，`docker logs` 的行序不可靠。

级别词表沿用 Python logging 的六档：

| 词表 | 权重 | Nest 对应 |
|---|---|---|
| `TRACE` | 10 | `verbose` |
| `DEBUG` | 20 | `debug` |
| `INFO` | 30 | `log` |
| `WARNING` | 40 | `warn` |
| `ERROR` | 50 | `error` |
| `CRITICAL` | 60 | `fatal` |

⚠️ 堆栈会破坏「每行四列」：消息里带换行时（`Error.stack`），第 2 行起没有前缀。
代价是 `grep ' | ERROR '` 只命中堆栈首行；好处是堆栈不做转义，粘出来直接能读。

---

## 环境变量（唯一读取点：`loggingConfigFromEnv`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `LOG_LEVEL` | `INFO` | 六档之一，大小写不敏感，`WARN`/`FATAL` 也认 |
| `LOG_TO_FILE` | **`false`** | 是否落盘。**容器里由 compose 显式打开** |
| `LOG_DIR` | `/app/logs` | 落盘目录（只在 `LOG_TO_FILE=true` 时有意义） |
| `LOG_SERVICE` | `api` | 文件名与归档车道的隔离键 |
| `LOG_RETENTION_DAYS` | `7` | 归档保留天数，`0` 合法 |
| `LOG_ERROR_FILE` | `false` | 是否额外写一份只收 ERROR+ 的 `{服务}-error.log` |

**写错不会让服务起不来**（fail-soft）：`LOG_LEVEL=INFOO` 会退回 `INFO` 并打一条 warning。
可观测性旋钮不是安全闸门 —— 直接抛异常会让容器起不来，而那时日志系统往往还没装好。

**`LOG_SERVICE` 必须按进程给**（compose 的 `environment:` 里），不能放共享 `.env`：
两个进程写同一个文件会互相覆盖，而且它还是归档/清理车道的隔离键。服务名用连字符、不带点号。

**`LOG_TO_FILE` 默认 false**：`LOG_DIR` 是容器内路径，本机直连默认开会在盘根建出
`/app/logs`（Windows 上是 `D:\app\logs`）。容器里显式打开。

---

## 落盘形态

```
/app/logs/
├── api.log                      ← tail -f 的固定入口，名字永远不变（完整时间线）
├── api-error.log                ← 只有 ERROR 及以上
└── archive/
    ├── api.2026-09-13.log       ← 一天一个文件
    └── api.2026-09-14.log
```

- **主文件 == stdout**（完整时间线，任何行都在）；
- **error 文件 ⊆ 主文件**（ERROR 行在两个文件里各出现一次）。

四条必须知道的行为：

1. **滚动只在写入时判定**。空闲进程的文件不会在 00:00 自己滚 —— 一旦有新写入就立刻滚走，
   并按**内容日期**归档。刻意不引入定时器 / 心跳日志。
2. **进程重启不截断当天日志**；上一个进程留下的是「昨天」的文件时先归档再新建。
3. **清理与归档挂在同一个时机（滚动）**，判据是归档文件名里的日期，不是 mtime。
4. **失败只降级，不抛异常**：卷没挂上 / 权限不对 / 磁盘满时打一条限流 warning，
   退回「只走 stdout」，下一次写入自动重试。日志不该成为服务宕机的原因。

### 日志系统自身的告警走 stderr

实现里的 `sinkWarn`。它产生的时刻正是「旧文件已关、新文件未建」或「归档刚失败」——
再往同一个 sink 里写会自噬成递归。**故障的报告通道必须独立于故障的对象。**

---

## 脱敏：出口统一过一遍

`scrub.ts`。日志里最容易漏 secret 的地方不是我们自己写的那几行，而是**别人给的字符串**：
第三方库回显凭据、错误信息里的签名 URL、`Error.stack` 里的 token。

- 变量名以 `_PASSWORD` / `_PASS` / `_SECRET` / `_TOKEN` / `_KEY` 结尾的，值是 secret。
  `*_ACCESS_KEY_ID` 故意不命中（结尾 `_ID`）：AK 是标识符不是凭证。
- **短于 8 个字符的值不脱敏** —— 拿 3~4 个字符去全局替换会把日志打得面目全非。
- **在出口统一做一次**，而不是要求每个调用点记得。

新增「值里内嵌密码」的环境变量（如带凭证的连接串）时，加一条显式名单 —— 后缀规则抓不到。

---

## 什么该记 / 什么绝不能记

### 该记

- **未捕获异常**：`logger.error(msg, error.stack)`，带堆栈。
- **上游依赖降级**：SMTP 未配置、发信失败、数据库不可达。
- **启动失败**：`main.ts` 的 `try/catch` 把 bootstrap 的失败用本格式记一条再退。
- **配置旋钮写错**：由 `loggingConfigFromEnv` 收集、装配完成后统一告警一次。

**不要用日志刷屏**：业务日志只记节点 —— 请求级的「谁在什么时候调了什么、多久、什么状态码」
归访问日志，业务代码不要自己再记一遍。

### 绝不能记（安全红线）

- ❌ 任何 secret 值：`JWT_SECRET`、`SMTP_PASSWORD`、数据库密码。
- ❌ **JWT / session token 原文**。
- ❌ **邮件验证码的明文**（唯一例外见下）。
- ❌ **完整的请求体**。
- ❌ **异常的附加属性 / 局部变量**：`toMessageText` 对 `Error` 只取 `message` + `stack`，
  不 dump 对象上的其它属性。

### 唯一允许打验证码的地方

`DEV_MODE=true` 或没有配置 SMTP 时，`EmailService` 把验证码打进日志 —— 这是本地开发的
正常路径。生产必须 `DEV_MODE=false` **且** SMTP 配好（`main.ts` 启动断言挡掉二者都不满足的
组合），部署检查项：`docker compose logs api | grep '\[DEV\]'` 应该是空的。

---

## 访问日志与健康探针降噪

`common/logging/access-log.middleware.ts`，一条请求一行：

```
2026-09-16 10:44:51.580 | INFO     | AccessLog | GET /api/auth/me → 401 2ms
```

- 挂在 `main.ts` 的 `app.use()` 上、**排在所有中间件之前**，计的才是整条链路的耗时。
- 只记方法 / 路径（含 query）/ 状态码 / 耗时。请求体、用户身份、UA 都不记。
- **5xx 也走 INFO**：异常过滤器已经为 5xx 打了一条带堆栈的 ERROR，这里再打一条就是记两遍。
  换来一个更好用的不变量 —— 一条请求一行，`grep -c AccessLog` 就是请求数。
- 客户端中断的请求不记（只听 `finish`）。宁可少一行，不要一行错的。

**健康探针降噪**：判据是「路径是 `/api/health` **且**对端是回环」，两条缺一不可。
光看回环会把本地经 vite 代理的全部业务请求一起没收；只按路径滤挡不住 nginx 转进来的真实请求。

---

## 反模式

- ❌ 不用 `console.log` / `console.error`：`new Logger(XxxService.name)`。
- ❌ 不在业务代码里碰 `LOG_*` 环境变量。
- ❌ 不在 hot path 打 `logger.log` 刷屏。
- ❌ 不记 secret / token / 验证码明文（DEV_MODE 是唯一受控例外）。
- ❌ 不记完整请求体。
- ❌ 不往日志里传对象当「顺便记一下」；`Error` 只取 message + stack。
- ❌ 不在日志调用点手写脱敏：出口统一做。
- ❌ 不让日志系统成为服务挂掉的原因：落盘失败只降级 + warning，永不抛。
- ❌ 不在归档/清理路径里回调 logger：走 `sinkWarn`。
