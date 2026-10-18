import type { App as AntdApp } from 'antd';
import axios from 'axios';

/**
 * 唯一的 axios 实例（页面/组件里不许出现 `import axios`，也不许自己比状态码）。
 * `baseURL: '/api'` + `withCredentials` —— 会话是 httpOnly Cookie，靠它带上。
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

/** 后端错误响应归一化后的形状：Nest 默认信封 + additive 的 `errors`。 */
export interface ApiError {
  /** 0 = 请求压根没拿到响应（后端没起 / 网络断） */
  statusCode: number;
  /** 已经是字符串：class-validator 的数组形式在这里 join 成一句 */
  message: string;
  error?: string;
  /** 字段名 → 消息。key 必须与 `Form.Item` 的 `name` 逐字一致 */
  errors?: Record<string, string[]>;
}

/** 401 不触发跳登录的三个路径 —— 它们的 401 是「确实没登录」这个正常状态。 */
const AUTH_401_EXEMPT = ['/auth/me', '/auth/login', '/auth/send-code'];

type MessageInstance = ReturnType<typeof AntdApp.useApp>['message'];

/** 拦截器在 React 之外，拿不到 `App.useApp()`；由 App.tsx 的 MessageBridge 注入。 */
let notify: MessageInstance | null = null;

export function bindMessageApi(instance: MessageInstance) {
  notify = instance;
}

/** 把任意异常归一化成 ApiError（页面据此分流，不要自己读 error.response）。 */
export function problemOf(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Partial<ApiError> | undefined;
    return {
      statusCode: data?.statusCode ?? error.response?.status ?? 0,
      message: Array.isArray(data?.message) ? data.message.join('；') : (data?.message ?? error.message),
      error: data?.error,
      errors: data?.errors,
    };
  }
  return { statusCode: 0, message: error instanceof Error ? error.message : String(error) };
}

/** 401：会话失效，拦截器已经在跳登录（所以页面这一帧可以什么都不渲染）。 */
export const isUnauthorized = (error: unknown): boolean => problemOf(error).statusCode === 401;

/** 服务不可用：>=500，或压根没有响应（后端没起 / 网络断）。4xx 是业务错误，重试对它无效。 */
export const isServerDown = (error: unknown): boolean => {
  const status = problemOf(error).statusCode;
  return status === 0 || status >= 500;
};

/** 429 的 `Retry-After`（秒）。解析不出返回 null —— 登录页的倒计时初值取它，不硬编码 60。 */
export function retryAfterSeconds(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const seconds = Number(error.response?.headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    // 主动取消的请求（组件卸载）不是错误，也不该弹提示
    if (error.code === 'ERR_CANCELED') return Promise.reject(error);

    const status = error.response?.status;
    if (status === 401) {
      if (!AUTH_401_EXEMPT.includes(error.config?.url ?? '')) {
        // 拦截器在 React 之外，拿不到 useNavigate。整页跳转换来「只有一处实现」。
        const here = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?redirect=${here}`);
      }
    } else if (isServerDown(error)) {
      // 「没有 response」命中不了 status >= 500 分支 —— 不单独处理就是彻底静默失败
      notify?.error('服务暂时不可用，请稍后重试');
    }
    // 400/403/404/409/429 不在拦截器提示，交调用方按业务语义处理
    return Promise.reject(error);
  },
);
