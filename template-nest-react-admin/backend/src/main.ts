import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { AppLoggerService } from './common/logging/app-logger.service.js';
import { accessLogMiddleware } from './common/logging/access-log.middleware.js';
import { sameOriginMiddleware } from './common/security/same-origin.middleware.js';
import { env } from './config/env.js';

/**
 * 加载 `backend/.env`（本地开发那份）。**必须排在 `new AppLoggerService()` 之前** ——
 * 它构造期就读 `LOG_*`。容器里环境变量由 compose 注入，没有文件是正常情况。
 */
try {
  process.loadEnvFile();
} catch {
  // 文件不存在
}

/**
 * 启动日志的接线。logger 在 `NestFactory.create` **之前**建好，因为启动失败也要有一条
 * 像样的日志 —— 否则 Node 会把裸错误打到 stderr：没有时间戳、没有级别、也不进日志文件。
 */
const logger = new AppLoggerService();

async function bootstrap(): Promise<void> {
  // 主动触发惰性 getter：缺密钥/连接串时**启动即失败**，而不是第一次请求才炸。
  // 放在 bootstrap 里而不是模块顶层，是为了让这条失败也走下面的 catch（有堆栈、进日志文件）。
  void env.jwtSecret;
  void env.databaseUrl;

  // `DEV_MODE=false` 意味着「真发信」，此时没有 SMTP 就没有任何投递途径 ——
  // 而 EmailService 的兜底是把验证码明文打进日志。那份兜底一旦在生产生效，
  // 验证码就随日志落盘，且**看不出任何异常**，所以在这里做成启动即失败。
  if (!env.devMode && !env.smtp.host) {
    throw new Error(
      'DEV_MODE=false 时必须配置 SMTP_HOST（否则验证码只会被打进日志，不会真发信）',
    );
  }

  // bufferLogs：Nest 在 create() 期间就会打掉一批启动日志。不缓冲的话那几行走的是
  // Nest 自带的 ConsoleLogger —— 既不是我们的四列格式、也不会进日志文件。
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(logger);
  app.flushLogs();

  // 生产上 req.ip 默认是 nginx 容器的内网地址、本地经 vite 代理时是回环，都不是真实客户端。
  // 取 1（信一跳）而不是 true：true 取 XFF 最左边那段（客户端可伪造），1 取最右边。
  app.set('trust proxy', 1);

  // 访问日志挂在最前：它要计的是整条链路的耗时。
  app.use(accessLogMiddleware(logger));
  // 跨站写请求在这里就挡掉（CSRF）—— 早于 Cookie 解析与一切业务。
  app.use(sameOriginMiddleware);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // 全局 DTO 校验。whitelist 剥掉 DTO 没声明的字段；transform 按 DTO 类型转换。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // 字段级错误：Nest 默认给的是 `message` 字符串数组，而 antd 的 Form.setFields 要的是
      // 「字段名 → 消息」的映射。归并成 additive 的 `errors` 键，外层信封不变。
      // ⚠️ `errors` 的 key 就是前端 Form.Item 的 name，两边对不上时 antd 是静默 no-op。
      // ⚠️ `error: 'Bad Request'` 必须显式给：给 BadRequestException 传对象时 Nest 原样当响应体。
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: '请检查表单填写',
          error: 'Bad Request',
          errors: Object.fromEntries(
            errors.map((e) => [e.property, Object.values(e.constraints ?? {})]),
          ),
        }),
    }),
  );
  // 兜底异常过滤器：未捕获异常留带堆栈的日志，对外只回固定文案。
  app.useGlobalFilters(new AllExceptionsFilter());
  // SIGTERM 时停止接新连接、等在途请求跑完；宽限期在 compose 的 stop_grace_period。
  app.enableShutdownHooks();
  await app.listen(env.port);
}

/**
 * 进入事件循环之后的兜底：漏 `await` 的 Promise 拒绝 / 同步回调里的异常。
 * Node 默认会直接崩，且裸错误走 stderr。这里记全再退出，交给 compose 的 restart 拉起。
 */
for (const event of ['unhandledRejection', 'uncaughtException'] as const) {
  process.on(event, (error: unknown) => {
    logger.fatal(
      `${event}，进程退出`,
      error instanceof Error ? error.stack : String(error),
      'Process',
    );
    logger.close();
    process.exit(1);
  });
}

try {
  await bootstrap();
} catch (error) {
  // 用 exitCode 而不是 process.exit()：让 stdout/stderr 写完再退，日志不会缺尾巴。
  logger.error(
    '服务启动失败，进程退出',
    error instanceof Error ? error.stack : String(error),
    'Bootstrap',
  );
  logger.close();
  process.exitCode = 1;
}
