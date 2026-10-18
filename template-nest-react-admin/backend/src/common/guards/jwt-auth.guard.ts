import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * 全局守卫（`AppModule` 的 `APP_GUARD`）：**一处开门**，新接口默认就要登录。
 *
 * 未登录时 passport 抛 `UnauthorizedException`（401），由兜底过滤器统一输出信封。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.get<boolean>(
      IS_PUBLIC_KEY,
      context.getHandler(),
    );
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
