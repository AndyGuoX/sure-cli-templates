import {
  BeforeInsert,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { uuid7 } from '../uuid7.js';

/**
 * 所有业务表的基类：UUIDv7 主键 + 创建时间。
 *
 * 列名显式写成 snake_case：数据库里统一蛇形，代码里统一驼峰，**不做自动命名转换**。
 * 自动转换看起来省事，实际会让「实体里写什么名字」变成一件要查文档的事，而且迁移里
 * 手写的 DDL 与实体之间多了一层黑盒映射。
 */
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @BeforeInsert()
  protected ensureId(): void {
    this.id ??= uuid7();
  }
}

/** 需要 `updated_at` 的表用它。纯追加型的数据（验证码、审计）用 `BaseEntity` 就够。 */
export abstract class TimestampedEntity extends BaseEntity {
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
