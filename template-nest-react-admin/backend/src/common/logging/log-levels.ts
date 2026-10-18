/**
 * 日志级别词表与归一化。
 *
 * 词表沿用 Python logging 的六档（TRACE…CRITICAL），不改成 Node 生态常见的
 * `fatal` / `verbose` 那一套：多语言服务混跑时，运维只需要记一份词表，
 * `grep -F ' | ERROR '` 在哪个服务上都能用。
 */

export const LOG_LEVELS = [
  'TRACE',
  'DEBUG',
  'INFO',
  'WARNING',
  'ERROR',
  'CRITICAL',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** 数值权重，沿用 Python logging 的取值（10 起步、间隔 10）。 */
const WEIGHT: Record<LogLevel, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARNING: 40,
  ERROR: 50,
  CRITICAL: 60,
};

/** 常见同义写法 → 词表。用户是手填 `.env` 的，`WARN` / `FATAL` 必须容忍。 */
const ALIASES: Record<string, LogLevel> = {
  WARN: 'WARNING',
  FATAL: 'CRITICAL',
};

export const DEFAULT_LEVEL: LogLevel = 'INFO';

/** 级别列的左对齐宽度（`WARNING` 后补一个空格）。 */
export const LEVEL_WIDTH = 8;

/** `-error.log` 那条车道的固定级别：只收 ERROR 及以上，不开放配置。 */
export const ERROR_LANE_LEVEL: LogLevel = 'ERROR';

export interface ResolvedLevel {
  level: LogLevel;
  /** 认不出来时带回原值，好让装配阶段补一条 warning。 */
  badValue?: string;
}

/**
 * 归一化 `LOG_LEVEL`，**认不出就退回 INFO 并带回原值**（fail-soft）。
 *
 * 这是可观测性旋钮，不是安全闸门：写错时直接抛异常会让容器起不来，而此刻日志系统
 * 往往还没装好，traceback 只能裸打到 stderr。退回默认值 + 一条 warning 才是有用的行为。
 */
export function resolveLogLevel(raw: string | undefined): ResolvedLevel {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return { level: DEFAULT_LEVEL };

  const upper = trimmed.toUpperCase();
  if ((LOG_LEVELS as readonly string[]).includes(upper)) {
    return { level: upper as LogLevel };
  }
  const alias = ALIASES[upper];
  if (alias) return { level: alias };

  return { level: DEFAULT_LEVEL, badValue: trimmed };
}

export function weightOf(level: LogLevel): number {
  return WEIGHT[level];
}

/** `level` 是否达到 `threshold`（含等于）。 */
export function isAtLeast(level: LogLevel, threshold: LogLevel): boolean {
  return WEIGHT[level] >= WEIGHT[threshold];
}

/** Nest 的六个级别名 → 本词表。`verbose` 映射到 TRACE。 */
export type NestLogLevel =
  'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal';

const NEST_TO_OURS: Record<NestLogLevel, LogLevel> = {
  verbose: 'TRACE',
  debug: 'DEBUG',
  log: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export function fromNestLevel(level: NestLogLevel): LogLevel {
  return NEST_TO_OURS[level];
}
