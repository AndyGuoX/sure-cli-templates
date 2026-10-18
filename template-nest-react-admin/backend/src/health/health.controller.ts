import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator.js';

/**
 * 健康检查。真的打一次数据库（`SELECT 1`）—— 连不上就抛，让兜底过滤器回 500。
 * 健康检查就是干这个的，不要 try/catch 掉。
 *
 * ⚠️ 必须是 `@Public()`：全局 `JwtAuthGuard` 会让它需要登录，而 compose 的探针
 * 带不了 Cookie，401 会让容器被判不健康。
 */
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; time: string }> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  }
}
