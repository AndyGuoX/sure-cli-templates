import { inspect } from 'node:util';
import { LEVEL_WIDTH, type LogLevel } from './log-levels.js';

/**
 * 一行日志的形态与「日志系统自身故障」的出口。
 *
 * 四列：**时间（到毫秒） | 级别 | logger 名 | 消息**
 *
 * ```
 * 2026-09-14 14:03:21.472 | INFO     | HealthController | 后端已连通
 * ```
 *
 * - **补毫秒**：并发请求的排序只靠秒分不出先后。
 * - **`|` 分隔**：`grep -F ' | ERROR '` 比匹配裸 `ERROR` 准。
 * - **stdout 与文件共用这一个 format**：落盘内容与 `docker logs` 可以直接 diff。
 *
 * ⚠️ 堆栈会破坏「每行四列」：消息里带换行时（Error.stack），第 2 行起没有前缀。
 * 代价是 `grep ' | ERROR '` 只命中堆栈首行；好处是堆栈不做转义，粘出来直接能读。
 */

/** 日志系统自身告警用的 logger 名。固定值，好让人一眼认出这不是业务日志。 */
export const LOGGING_SELF_LOGGER = 'common.logging';

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** 本地时间 `YYYY-MM-DD HH:mm:ss.SSS`。用本地时区：运维是在容器时区里读日志的。 */
export function formatTimestamp(now: Date): string {
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
    `${pad(now.getMilliseconds(), 3)}`
  );
}

export function formatLine(
  level: LogLevel,
  loggerName: string,
  message: string,
  now: Date,
): string {
  return `${formatTimestamp(now)} | ${level.padEnd(LEVEL_WIDTH)} | ${loggerName} | ${message}`;
}

/**
 * 把 Nest 传下来的 message 变成一个字符串。
 *
 * - 字符串原样返回。
 * - **Error 只取 `message` + `stack`，不 dump 其它自有属性**：异常对象上挂着的往往是
 *   请求体、配置对象、凭证上下文 —— 正是日志里不该出现的东西。要记额外信息就在调用点显式传。
 * - 其它值走 `inspect`（限深度），再由 `scrub()` 兜一道。
 */
export function toMessageText(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) {
    const stack = message.stack;
    return stack && stack.includes(message.message)
      ? stack
      : `${message.name}: ${message.message}${stack ? `\n${stack}` : ''}`;
  }
  if (message === undefined || message === null) return String(message);
  return inspect(message, { depth: 1, breakLength: Infinity });
}

/**
 * **日志系统自身**的 warning 出口：直写 stderr，**绝不回调 logger**。
 *
 * 这些告警产生的时刻，正是「文件 sink 正处于旧文件已关、新文件未建」或
 * 「归档刚失败」—— 再往同一个 sink 里写，轻则丢行、重则自噬成递归。
 * 故障的报告通道必须独立于故障的对象。
 */
export function sinkWarn(message: string, now: Date = new Date()): void {
  try {
    process.stderr.write(
      `${formatLine('WARNING', LOGGING_SELF_LOGGER, message, now)}\n`,
    );
  } catch {
    // 这是报告日志系统故障的最后一条通道，它失败时没有第二条路可用。
  }
}
