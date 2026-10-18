import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { HttpExceptionWithHeaders } from '../exceptions/http-exception-with-headers.js';

/**
 * 全局兜底异常过滤器。
 *
 * Nest 内置过滤器能把未捕获异常变成 500，但**不打日志** —— 出问题时只剩一条空白的
 * 「服务器内部错误」。这里补上带堆栈的 error 日志，同时确保对外绝不泄露堆栈 / SQL / 内部路径。
 *
 * 响应体保持 Nest 默认信封 `{ statusCode, message, error }`，只做规范化补齐，不改形状。
 * 它也是唯一能写响应头的地方：`HttpExceptionWithHeaders` 把头挂在异常上，这里统一写出去。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // 5xx 才是「出事了」，记堆栈；4xx 是业务预期路径，记堆栈只会把日志刷满。
      if (status >= 500) {
        this.logger.error(
          `${request.method} ${request.url} → ${status}`,
          exception.stack,
        );
      }

      if (exception instanceof HttpExceptionWithHeaders) {
        for (const [name, value] of Object.entries(exception.headers)) {
          response.setHeader(name, value);
        }
      }

      response.status(status).json({
        // HttpException 传字符串时 getResponse() 给的是字符串，传对象时给对象。
        ...(typeof body === 'string' ? { message: body } : body),
        // 放在展开之后：保证信封在任何构造方式下都有 statusCode。
        statusCode: status,
      });
      return;
    }

    this.logger.error(
      `未处理异常 ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      statusCode: 500,
      message: '服务器内部错误',
      error: 'Internal Server Error',
    });
  }
}
