/**
 * auth 模块的**无 IO 规则与常量**：归一化、验证码生成与哈希、倒计时计算。
 *
 * 拆出来的理由：规则可以直接单测，不需要数据库、不需要 mock Repository。
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import type { UserRecord } from './auth.types.js';
import type { User } from './entities/user.entity.js';

/**
 * 会话 Cookie 名。controller 写它、`JwtStrategy` 读它 —— 两处必须是同一个值。
 */
export const SESSION_COOKIE = 'session';

/** 同一个邮箱两次发码的最小间隔（60 秒闸门）。 */
export const RESEND_INTERVAL_MS = 60_000;

/** 验证码有效期 10 分钟。 */
export const CODE_TTL_MS = 10 * 60_000;

/** 同一个码最多错几次（到 5 次作废）。 */
export const MAX_CODE_ATTEMPTS = 5;

/** 邮箱归一化。**任何比较与入库之前都必须先走它**，否则 `Foo@x.com` 与 `foo@x.com` 是两个用户。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 距离「可以再次发码」还差几秒 —— 给 429 的 `Retry-After` 头用。
 * 已过期时返回 1，不返回 0 或负数（`Retry-After: 0` 语义上是「立刻可以」）。
 */
export function secondsUntilResend(
  lastSentAt: Date,
  now: number = Date.now(),
): number {
  const elapsed = now - lastSentAt.getTime();
  return Math.max(1, Math.ceil((RESEND_INTERVAL_MS - elapsed) / 1000));
}

/**
 * 6 位数字验证码，**必须是 CSPRNG**（`crypto.randomInt`）。
 * 别退回 `Math.random`：V8 的 xorshift128+ 能从少量连续输出恢复状态。
 */
export function generateCode(): string {
  return String(randomInt(100000, 1_000_000));
}

/**
 * 验证码哈希：`HMAC-SHA256(JWT_SECRET, email + ':' + code)`。
 * 绑定邮箱，防止一个邮箱的码被拿去登录另一个邮箱。
 */
export function hashCode(email: string, code: string): string {
  return createHmac('sha256', env.jwtSecret)
    .update(`${normalizeEmail(email)}:${code}`)
    .digest('hex');
}

/** 恒定时间比较。两边都是固定长度的十六进制串，长度本身不是秘密。 */
export function codeMatches(expectedHash: string, actualHash: string): boolean {
  const a = Buffer.from(expectedHash);
  const b = Buffer.from(actualHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 实体 → 对外形状。不要直接返回实体（见 auth.types.ts 的注释）。 */
export function toRecord(user: User): UserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}
