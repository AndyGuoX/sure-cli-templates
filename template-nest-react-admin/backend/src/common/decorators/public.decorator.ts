import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标在 handler 上 = 这个接口**不需要登录**。
 *
 * 全局 `JwtAuthGuard` 让新接口默认就需要登录，开门必须显式写它 —— 不会有人
 * 「忘记给新接口挂鉴权」。健康检查与登录相关接口是仅有的几个该标的。
 *
 * ⚠️ 只认 handler 上的标记。标在 controller 类上不生效 —— 方向是 fail-closed。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
