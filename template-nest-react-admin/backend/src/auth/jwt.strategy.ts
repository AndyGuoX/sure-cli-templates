import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { env } from '../config/env.js';
import { UUID_PATTERN } from '../database/uuid7.js';
import { SESSION_COOKIE, toRecord } from './auth.rules.js';
import type { UserRecord } from './auth.types.js';
import { User } from './entities/user.entity.js';

/**
 * 从 **Cookie** 取会话 token（不是 Authorization 头）—— 登录态是 httpOnly Cookie
 * 里的 JWT，前端拿不到也不该拿到它。
 *
 * **每个请求都读一次数据库里的用户记录**，不把用户信息缓存进 JWT payload：
 * 用户改名/停用后下一个请求就生效，不需要等 token 过期。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, string> }) =>
          req?.cookies?.[SESSION_COOKIE] || null,
      ]),
      secretOrKey: env.jwtSecret,
    });
  }

  /** 返回值就是 `request.user`，是全站唯一的身份装配点。 */
  async validate(payload: { sub?: string }): Promise<UserRecord> {
    // sub 是签过名的、理论上可信，但把用户可控字符串拼进查询条件之前先卡一道形状。
    if (typeof payload.sub !== 'string' || !UUID_PATTERN.test(payload.sub)) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user) throw new UnauthorizedException();
    return toRecord(user);
  }
}
