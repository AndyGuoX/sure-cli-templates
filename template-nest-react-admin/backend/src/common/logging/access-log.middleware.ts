import type { Request, RequestHandler } from 'express';
import type { AppLoggerService } from './app-logger.service.js';

/**
 * 请求级访问日志（状态码 + 耗时）—— 一条请求一行。
 *
 * 只走 INFO，**5xx 也走 INFO**：异常过滤器已经为 5xx 单独打了一条带堆栈的 ERROR，
 * 这里再打一条 ERROR 就是把同一件事记两遍。顺带保住一个更好用的不变量 ——
 * 一条请求一行，`grep -c 'AccessLog'` 就是请求数。
 */
export const ACCESS_LOG_NAME = 'AccessLog';

/**
 * compose 健康检查路径（`deploy/docker-compose.yml` 的 `healthcheck.test`）。
 * 改那条 test 时同步改这里。
 */
const HEALTH_PATH = '/api/health';

/**
 * 「来源是容器自己的探测」的判据：对端是回环地址。
 *
 * ⚠️ 光看回环不够：本地开发时浏览器请求经 vite 代理打到后端，对端也是回环。
 * 必须与路径一起判断 —— 少了路径那一半，本地会把全部业务请求一起没收。
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** 形态认不出来（对端地址拿不到）时放过 —— 这个判据的错误方向只许是「多留一行」。 */
function isHealthProbe(req: Request): boolean {
  const peer = req.socket.remoteAddress;
  return req.path === HEALTH_PATH && peer !== undefined && LOOPBACK.has(peer);
}

/**
 * 挂在 `app.use()` 上（main.ts），要**排在最前**才能计到整条链路的耗时。
 *
 * 记 `finish` 而不是 `close`：客户端中断的请求不发 `finish`，那一刻的 `statusCode`
 * 还是没发出去的默认值，记下来是错的。宁可少一行，不要一行错的。
 */
export function accessLogMiddleware(logger: AppLoggerService): RequestHandler {
  return (req, res, next) => {
    if (isHealthProbe(req)) {
      next();
      return;
    }

    const startedAt = Date.now();
    res.once('finish', () => {
      logger.log(
        `${req.method} ${req.originalUrl} → ${res.statusCode} ${Date.now() - startedAt}ms`,
        ACCESS_LOG_NAME,
      );
    });
    next();
  };
}
