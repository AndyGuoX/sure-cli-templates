import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Post,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsEmail } from 'class-validator';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { Public } from '../src/common/decorators/public.decorator.js';
import { sameOriginMiddleware } from '../src/common/security/same-origin.middleware.js';
import { HealthController } from '../src/health/health.controller.js';

/**
 * 装配层 e2e：不起数据库、不起完整 AppModule，只把「全局守卫 + ValidationPipe +
 * 同源中间件 + Cookie 解析」这四件在 main.ts 里手工装配的东西复刻一遍，验证它们真的生效。
 *
 * ⚠️ `createNestApplication()` 不会带上 main.ts 里的全局管道 —— 不复刻的话，
 * 「参数不合法 → 400」这类用例会**假通过**（DTO 校验根本没跑）。
 */

const SECRET = 'e2e-secret';

class ProbeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;
}

@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  @Get('secure')
  secure() {
    return { ok: true };
  }

  @Public()
  @Post('validate')
  @HttpCode(200)
  validate(@Body() dto: ProbeDto) {
    return dto;
  }
}

@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, string> }) =>
          req?.cookies?.session ?? null,
      ]),
      secretOrKey: SECRET,
    });
  }

  validate(payload: { sub?: string }) {
    return {
      id: payload.sub,
      email: 'e2e@example.com',
      name: 'e2e',
      createdAt: new Date().toISOString(),
    };
  }
}

describe('app assembly (e2e)', () => {
  let app: INestApplication<Server>;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [HealthController, ProbeController],
      providers: [
        TestJwtStrategy,
        {
          provide: DataSource,
          useValue: { query: async () => [{ '?column?': 1 }] },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.use(sameOriginMiddleware);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            message: '请检查表单填写',
            error: 'Bad Request',
            errors: Object.fromEntries(
              errors.map((e) => [
                e.property,
                Object.values(e.constraints ?? {}),
              ]),
            ),
          }),
      }),
    );
    // main.ts 里装了兜底过滤器，这里必须复刻：它负责把对象形式的 HttpException
    // 补齐 `statusCode`（Nest 默认过滤器对对象响应体不补）。
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    token = app.get(JwtService).sign({ sub: 'e2e-user-id' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('健康检查是公开的', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('未登录访问受保护路由返回 401', async () => {
    await request(app.getHttpServer()).get('/api/probe/secure').expect(401);
  });

  it('带会话 Cookie 可访问受保护路由', async () => {
    await request(app.getHttpServer())
      .get('/api/probe/secure')
      .set('Cookie', `session=${token}`)
      .expect(200);
  });

  it('DTO 校验失败返回 400 + 字段级 errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/probe/validate')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.errors.email).toEqual(['邮箱格式不正确']);
  });

  it('跨站写请求被同源中间件拒绝', async () => {
    await request(app.getHttpServer())
      .post('/api/probe/validate')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'a@b.com' })
      .expect(403);
  });
});
