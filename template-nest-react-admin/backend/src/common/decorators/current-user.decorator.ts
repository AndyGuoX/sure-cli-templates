import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRecord } from '../../auth/auth.types.js';

/**
 * 取当前登录用户（`JwtStrategy.validate` 挂在 `request.user` 上的那个对象）。
 *
 * 它是本请求现读数据库拿到的最新记录，不是 token 里的快照。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserRecord =>
    ctx.switchToHttp().getRequest<{ user: UserRecord }>().user,
);
