import type { LoggerService } from '@nestjs/common';
import { RotatingFileSink } from './file-sink.js';
import { formatLine, sinkWarn, toMessageText } from './log-format.js';
import {
  ERROR_LANE_LEVEL,
  fromNestLevel,
  isAtLeast,
  resolveLogLevel,
  type LogLevel,
  type NestLogLevel,
} from './log-levels.js';
import { scrub } from './scrub.js';

/**
 * Nest 的日志出口：**stdout 是主线，落盘是可选副本**。
 *
 * 把 Nest 的调用形态（`Logger.log(msg, ctx)` / `Logger.error(msg, stack, ctx)`）
 * 还原成四列的一行；按 `LOG_LEVEL` 过滤；分发到 stdout 与（可选的）两个文件 sink。
 *
 * ## 为什么是自定义 LoggerService 而不是改调用点
 *
 * `app.useLogger(new AppLoggerService())` 之后，**业务代码继续
 * `new Logger(XxxService.name)`，一行不用动**。Nest 自身与第三方模块也走这条路。
 *
 * ## 接入时机
 *
 * `main.ts` 里 `NestFactory.create(AppModule, { bufferLogs: true })` + `app.useLogger(...)`：
 * 不缓冲的话，Nest 在 `create()` 期间就已经用自带的 `ConsoleLogger` 打掉了一批启动日志。
 *
 * ## 两个文件 sink 的关系
 *
 * - **主文件 == stdout**（完整时间线，任何行都在）；
 * - **error 文件 ⊆ 主文件**（只有 ERROR 及以上）。
 *
 * ERROR 行会在两个文件里各出现一次 —— 刻意的：主文件保住完整时间线，
 * error 文件小到可以一眼扫完「今天出过什么事」。
 */

/** 找不到上下文时的 logger 名。 */
export const DEFAULT_LOGGER_NAME = 'app';

export interface AppLoggerConfig {
  level: LogLevel;
  /** 要落盘（`LOG_TO_FILE`）。**默认 false**。 */
  toFile: boolean;
  dir: string;
  service: string;
  retentionDays: number;
  /** 额外开一个只收 ERROR+ 的 `{service}-error.log`（`LOG_ERROR_FILE`）。 */
  errorFile: boolean;
  /** 配置里认不出来的值，装配完成后统一告警一次。 */
  warnings: string[];
}

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/**
 * 从环境变量读日志配置。**这是全项目唯一读这些变量的地方**（业务代码不碰 `process.env`）。
 *
 * ⚠️ `LOG_TO_FILE` 默认 **false**：`LOG_DIR` 是容器内路径，本机直连跑服务时
 * 默认开会在盘根建出 `/app/logs`。容器里由 compose 显式打开。
 *
 * `LOG_SERVICE` **必须按进程给**（`deploy/docker-compose.yml` 的 `environment:` 里），
 * 不能放共享 `.env`：两个进程写同一个文件会互相截断，而且归档车道的隔离键也是它。
 */
export function loggingConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AppLoggerConfig {
  const warnings: string[] = [];
  const { level, badValue } = resolveLogLevel(env.LOG_LEVEL);
  if (badValue) {
    warnings.push(
      `LOG_LEVEL=${JSON.stringify(badValue)} 不是合法级别名，已退回 ${level}`,
    );
  }

  const service = (env.LOG_SERVICE ?? '').trim() || 'api';
  if (service.includes('.')) {
    warnings.push(
      `LOG_SERVICE=${JSON.stringify(service)} 含点号，归档文件名会多出一段（约定是 archive/<服务>.<日期>.log）；新增服务请用连字符`,
    );
  }

  const rawRetention = (env.LOG_RETENTION_DAYS ?? '').trim();
  let retentionDays = 7;
  if (rawRetention !== '') {
    const parsed = Number.parseInt(rawRetention, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      retentionDays = parsed;
    } else {
      warnings.push(
        `LOG_RETENTION_DAYS=${JSON.stringify(rawRetention)} 不是非负整数，已退回 ${retentionDays}`,
      );
    }
  }

  return {
    level,
    toFile: readBool(env.LOG_TO_FILE, false),
    dir: (env.LOG_DIR ?? '').trim() || '/app/logs',
    service,
    retentionDays,
    errorFile: readBool(env.LOG_ERROR_FILE, false),
    warnings,
  };
}

interface ParsedCall {
  message: string;
  context?: string;
  stack?: string;
}

/** 与 Nest 的 `ConsoleLogger.isStackFormat` 同一条正则。 */
const STACK_RE = /^(.)+\n\s+at .+:\d+:\d+/;

/** 比 Nest 那条正则宽一格：**含换行也算**（多行诊断信息应独占行，不与消息拼在一起）。 */
function isStackFormat(value: unknown): boolean {
  return (
    typeof value === 'string' && (STACK_RE.test(value) || value.includes('\n'))
  );
}

/** 把位置参数拆成「上下文 + 其余」。**只有一个参数时它是消息，不是上下文**（对齐 Nest）。 */
function splitContext(args: unknown[]): { rest: unknown[]; context?: string } {
  if (args.length <= 1) return { rest: args };
  const last = args[args.length - 1];
  if (typeof last === 'string')
    return { rest: args.slice(0, -1), context: last };
  return { rest: args };
}

/** 其余参数 → 一条消息（可选带 stack）。 */
function composeCall(rest: unknown[], context?: string): ParsedCall {
  const items: unknown[] = [];
  let stack: string | undefined;
  rest.forEach((value, index) => {
    if (index === 0) {
      items.push(value);
      return;
    }
    if (value === undefined) return;
    if (stack === undefined && isStackFormat(value)) {
      stack = value as string;
      return;
    }
    items.push(value);
  });
  return { message: items.map(toMessageText).join(' '), context, stack };
}

function parseCall(args: unknown[]): ParsedCall {
  const { rest, context } = splitContext(args);
  return composeCall(rest, context);
}

/** `error` 与 `parseCall` 的区别是两参数且第 2 个是栈这一支（此时没有上下文）。 */
function parseError(args: unknown[]): ParsedCall {
  if (args.length === 2 && isStackFormat(args[1])) {
    return { message: toMessageText(args[0]), stack: args[1] as string };
  }
  return parseCall(args);
}

export interface AppLoggerOptions extends Partial<AppLoggerConfig> {
  /** 只为单测注入。 */
  now?: () => Date;
  /** 只为单测注入：默认写 `process.stdout`。 */
  stdout?: (text: string) => void;
}

export class AppLoggerService implements LoggerService {
  private readonly config: AppLoggerConfig;
  private readonly now: () => Date;
  private readonly stdout: (text: string) => void;
  private readonly mainSink: RotatingFileSink | null;
  private readonly errorSink: RotatingFileSink | null;
  /** Nest 那侧再收紧一层（`app.useLogger(['error'])` 之类）。两边取交集，「严的说了算」。 */
  private nestLevels: Set<LogLevel> | null = null;

  constructor(options: AppLoggerOptions = {}) {
    const base = loggingConfigFromEnv();
    this.config = { ...base, ...options };
    this.now = options.now ?? (() => new Date());
    this.stdout = options.stdout ?? ((text) => void process.stdout.write(text));

    const sinkOptions = {
      logDir: this.config.dir,
      service: this.config.service,
      retentionDays: this.config.retentionDays,
      now: this.now,
    };
    this.mainSink = this.config.toFile
      ? new RotatingFileSink({ ...sinkOptions, level: this.config.level })
      : null;
    this.errorSink =
      this.config.toFile && this.config.errorFile
        ? new RotatingFileSink({
            ...sinkOptions,
            service: `${this.config.service}-error`,
            // 固定 ERROR，不跟 LOG_LEVEL 走：这个文件存在的意义就是「只有 ERROR」。
            level: ERROR_LANE_LEVEL,
          })
        : null;

    // 告警放在 sink 装好之后：这样它既进 stdout，也进日志文件。
    for (const warning of this.config.warnings) this.warn(warning);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('INFO', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('WARNING', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.dispatch('ERROR', parseError([message, ...optionalParams]));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('DEBUG', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('TRACE', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.dispatch('CRITICAL', parseError([message, ...optionalParams]));
  }

  /** Nest 通过这个接口再收一层级别。与 `LOG_LEVEL` 取交集。 */
  setLogLevels(levels: NestLogLevel[]): void {
    this.nestLevels = new Set(levels.map(fromNestLevel));
  }

  close(): void {
    this.mainSink?.close();
    this.errorSink?.close();
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    this.dispatch(level, parseCall([message, ...optionalParams]));
  }

  private dispatch(level: LogLevel, parsed: ParsedCall): void {
    if (this.isSuppressed(level)) return;

    // 脱敏在最后统一做一次：异常堆栈、第三方报错都从这一处过。
    const payload = parsed.stack
      ? `${parsed.message}\n${parsed.stack}`
      : parsed.message;
    const line = formatLine(
      level,
      parsed.context ?? DEFAULT_LOGGER_NAME,
      scrub(payload),
      this.now(),
    );

    try {
      this.stdout(`${line}\n`);
    } catch {
      sinkWarn('stdout 写入失败，本行只留下这条 stderr 痕迹');
    }
    this.mainSink?.write(level, line);
    this.errorSink?.write(level, line);
  }

  private isSuppressed(level: LogLevel): boolean {
    if (!isAtLeast(level, this.config.level)) return true;
    return this.nestLevels !== null && !this.nestLevels.has(level);
  }
}
