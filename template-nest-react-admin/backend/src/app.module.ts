import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [DatabaseModule, HealthModule, AuthModule],
  providers: [
    // 全局守卫：新接口**默认需要登录**，开放必须显式 @Public()。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
