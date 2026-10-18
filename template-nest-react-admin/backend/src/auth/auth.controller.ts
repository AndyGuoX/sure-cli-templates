import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE } from './auth.rules.js';
import type { UserRecord } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { SendCodeDto } from './dto/send-code.dto.js';

/** 会话 7 天。不做 refresh token，过期重新登录。 */
const SESSION_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/**
 * 只做「解析请求 → 调 service → 回响应」。Cookie 在这里签（service 不碰 `Response`）。
 *
 * `send-code` / `login` / `logout` 都标 `@Public()` —— 全局 `JwtAuthGuard`
 * 让新接口默认需要登录。
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  // POST 的默认状态码是 201，而这个接口的契约是 200
  @Public()
  @Post('send-code')
  @HttpCode(200)
  sendCode(@Body() dto: SendCodeDto) {
    return this.auth.sendCode(dto.email);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserRecord> {
    const user = await this.auth.login(dto.email, dto.code);
    res.cookie(SESSION_COOKIE, this.jwt.sign({ sub: user.id }), {
      httpOnly: true,
      // strict 而不是 lax：lax 按 site 判权，同公司的其它子域发起的写请求照样带 Cookie。
      // 代价：从邮件里点进来的直链首跳不带 Cookie（SPA 本身不受影响）。
      sameSite: 'strict',
      secure: env.cookieSecure,
      maxAge: SESSION_MAX_AGE_MS,
    });
    return user;
  }

  /**
   * ⚠️ **标 `@Public()`**：登出对没登录的人也该成功。少了它就是「会话已过期 → 点退出回 401
   * → Cookie 留在浏览器里」。
   */
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(SESSION_COOKIE);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: UserRecord): UserRecord {
    return user;
  }
}
