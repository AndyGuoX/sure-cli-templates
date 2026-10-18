import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { EmailCode } from '../auth/entities/email-code.entity.js';
import { User } from '../auth/entities/user.entity.js';
import { env } from '../config/env.js';
import { Init1792233600000 } from './migrations/1792233600000-init.js';

// TypeORM CLI 不会替我们加载 backend/.env；容器里则由 compose 注入，不存在文件也正常。
try {
  process.loadEnvFile();
} catch {
  // 文件不存在是正常情况
}

/**
 * TypeORM CLI 与运行时共用的 DataSource。
 *
 * `synchronize: false` **永远为 false**：schema 只能由迁移改变。`synchronize: true`
 * 在开发时看起来省事，但它会按实体差异直接改表，和迁移文件变成两套事实，
 * 而且生产上没人敢开 —— 没有第二种模式能让两边的行为一致。
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  entities: [User, EmailCode],
  migrations: [Init1792233600000],
  synchronize: false,
  logging: false,
});
