import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始 schema：用户 + 邮箱验证码。
 *
 * 手写 DDL 而不是用 `migration:generate` 的产物：初始迁移是后面所有迁移的基线，
 * 把它读一遍比读 autogenerate 的一长串差异更省事。后续迁移可以正常用 generate。
 *
 * 约定（见 .trellis/spec/backend/database-guidelines.md）：
 * - 表名复数蛇形、列名蛇形；
 * - 约束显式命名（`uq_` / `ix_`），不依赖 Postgres 自动命名；
 * - 时间一律 `timestamptz`；
 * - 外键必须显式 `ON DELETE`（本迁移暂时没有外键）。
 */
export class Init1792233600000 implements MigrationInterface {
  name = 'Init1792233600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"         uuid         NOT NULL,
        "email"      varchar(320) NOT NULL,
        "name"       varchar(64)  NOT NULL,
        "created_at" timestamptz  NOT NULL DEFAULT now(),
        "updated_at" timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "email_verification_codes" (
        "id"          uuid         NOT NULL,
        "email"       varchar(320) NOT NULL,
        "code_hash"   varchar(64)  NOT NULL,
        "attempts"    integer      NOT NULL DEFAULT 0,
        "expires_at"  timestamptz  NOT NULL,
        "consumed_at" timestamptz,
        "created_at"  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_verification_codes" PRIMARY KEY ("id")
      )
    `);
    // 登录时按「这个邮箱最新的一条」查，DESC 让那条查询直接走索引。
    await queryRunner.query(`
      CREATE INDEX "ix_email_codes_email_created"
        ON "email_verification_codes" ("email", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_verification_codes"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
