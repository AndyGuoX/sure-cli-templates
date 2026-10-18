/**
 * 与后端 `backend/src/auth/auth.types.ts` 一一对应的类型。
 * 同步义务（无编译器保护）：字段名与 `errors` 的 key 必须两边一致。
 */

/** `GET /auth/me` 与 `POST /auth/login` 的响应体。 */
export interface Me {
  /** UUIDv7 字符串，只当字符串透传 */
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** `POST /auth/login` 的请求体。字段名与后端 `LoginDto` 一致。 */
export interface LoginPayload {
  email: string;
  code: string;
}
