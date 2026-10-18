import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 跨站写请求判定（CSRF 的第二道闸，第一道是会话 Cookie 的 `SameSite=Strict`）。
 *
 * 判据：非安全方法 + `Origin`（缺了退到 `Referer`）的 host ≠ 请求的 `Host`。
 * ⚠️ 两者**都缺**时放行：浏览器发跨站写请求必带 `Origin`，不带的只有 curl / 运维脚本
 * 这类非浏览器客户端 —— 它们不带 Cookie 就过不了登录，本来就不是 CSRF 的载体。
 *
 * ⚠️ 比的是 host（含端口），不比协议：TLS 常在前置 LB 终止。nginx 转发时必须带原始
 * `Host`（`proxy_set_header Host $http_host`，`$host` 会吃掉端口）。
 */
export function isCrossSite(
  method: string,
  host: string | undefined,
  origin: string | undefined,
  referer: string | undefined,
): boolean {
  if (SAFE_METHODS.has(method)) return false;
  const source = origin ?? referer;
  if (!source) return false;
  try {
    return new URL(source).host !== host;
  } catch {
    // `Origin: null`（沙箱 iframe / file://）或畸形值：不是本站发起的
    return true;
  }
}

export function sameOriginMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    isCrossSite(
      req.method,
      req.headers.host,
      req.headers.origin,
      req.headers.referer,
    )
  ) {
    // 与全局异常过滤器同一个信封（中间件在 Nest 的过滤器链之外，自己写）
    res.status(403).json({
      statusCode: 403,
      message: '跨站请求被拒绝',
      error: 'Forbidden',
    });
    return;
  }
  next();
}
