import { HttpException } from '@nestjs/common';

/**
 * 能带响应头的 `HttpException`。
 *
 * Nest 的 `HttpException` 没有设置响应头的途径，而 429 限流**必须**带 `Retry-After`：
 * 前端登录页的倒计时读的就是这个头，不带它就是让前端硬编码 60。
 *
 * 头挂在异常上，由 `AllExceptionsFilter`（全局唯一的异常出口）统一写到响应 ——
 * 这样 service 仍然不碰 `Response`。
 */
export class HttpExceptionWithHeaders extends HttpException {
  constructor(
    message: string,
    status: number,
    readonly headers: Record<string, string>,
  ) {
    super(message, status);
  }
}
