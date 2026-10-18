import { randomBytes } from 'node:crypto';

/**
 * 生成 UUIDv7（RFC 9562）。
 *
 * 48 位毫秒时间戳 + 80 位随机数 —— 时间有序，对 btree 索引与「按 id 排序即按创建时间排序」
 * 都友好。Node 内置的 `crypto.randomUUID()` 是 v4（完全随机），拿它当主键会让
 * 索引页频繁分裂。数据库端也有 `gen_random_uuid()`，但它同样不保证 v7；统一在应用侧生成。
 */
export function uuid7(): string {
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  randomBytes(10).copy(bytes, 6);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // variant RFC 4122

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** 只用于「形状是否像我们生成的 id」的快速判断（不校验时间/版本位）。 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
