import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { env } from '../config/env.js';

/**
 * 数据库连接。只做装配，不放业务。
 *
 * `autoLoadEntities: true`：实体跟着各业务模块的 `TypeOrmModule.forFeature()` 注册，
 * 新增模块时不用回来改这里。**迁移路径不依赖它** —— CLI 用的 `data-source.ts`
 * 有自己显式的实体清单，两处都要登记新实体（`synchronize: false` 时漏登记的表现是
 * 「表建得出来、查询报 EntityMetadataNotFound」）。
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        url: env.databaseUrl,
        autoLoadEntities: true,
        // schema 只由迁移改变，见 data-source.ts 的注释。
        synchronize: false,
        // 启动时自动跑迁移会让多副本同时启动时互相争抢 DDL 锁；迁移在 compose 的
        // 独立 migrate 服务里跑一次，应用只负责连上来。
        migrationsRun: false,
        retryAttempts: 10,
        retryDelay: 3_000,
        extra: {
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
