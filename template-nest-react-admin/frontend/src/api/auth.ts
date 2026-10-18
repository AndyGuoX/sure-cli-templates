import { api } from './client';
import type { LoginPayload, Me } from '@/api/types';

/**
 * 请求登录验证码。
 * @param email 目标邮箱
 * @returns 成功**永远** 200 —— 后端刻意不区分邮箱是否已注册（反账号枚举）
 * @throws 429 限流（响应头带 `Retry-After`，登录页倒计时取它）
 */
export async function sendCode(email: string): Promise<void> {
  await api.post('/auth/send-code', { email });
}

/**
 * 用验证码登录（该邮箱首次登录会自动注册）。
 * @param payload email + 6 位验证码
 * @returns 当前用户；会话 Cookie 由后端的 `Set-Cookie` 写入，前端不碰
 * @throws 400 验证码错误 / 已过期 / 错误次数超限（三者共用同一句文案）
 */
export async function login(payload: LoginPayload): Promise<Me> {
  return (await api.post<Me>('/auth/login', payload)).data;
}

/** 退出登录：后端清会话 Cookie。前端缓存由调用方 `qc.clear()` 清（见 `useLogout`）。 */
export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

/** 读当前登录用户。未登录返回 401 —— 拦截器对这个路径刻意不跳转，由 `RequireAuth` 自己处理。 */
export async function fetchMe(): Promise<Me> {
  return (await api.get<Me>('/auth/me')).data;
}
