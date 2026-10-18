/**
 * 对外可见的用户形状。**不要直接把 TypeORM 实体返回给前端**：
 * 实体上将来加内部字段时不该自动泄露。
 */
export interface UserRecord {
  /** UUIDv7 */
  id: string;
  email: string;
  name: string;
  /** ISO 8601 UTC 字符串 */
  createdAt: string;
}
