# 后端数据库规范

> 记录 `backend/` 的 ORM、迁移、查询与命名约定。数据层是 **PostgreSQL + TypeORM 1.x**。
> 规则取自参考工程（FastAPI + SQLAlchemy）的通用部分，按 TypeORM 的形态重写。

---

## ORM 与驱动

- **TypeORM 1.x** + `pg` 驱动，全部走 Nest 的 `@nestjs/typeorm`。
- 连接配置在 [`src/database/database.module.ts`](../../../backend/src/database/database.module.ts)：
  `synchronize: false`、`migrationsRun: false`、连接池 `max: 10`。
- 迁移 CLI 用 [`src/database/data-source.ts`](../../../backend/src/database/data-source.ts)，
  它与运行时**共用同一个 DataSource 定义**。

### `synchronize` 永远是 false

schema 只由迁移改变。`synchronize: true` 在开发时看起来省事，但它会按实体差异直接改表，
和迁移文件变成两套事实；生产上没人敢开 —— 没有第二种模式能让两边行为一致。

### 启动不跑迁移

应用只负责连上来。迁移由 compose 的 `migrate` 服务在 api 启动前跑一次 ——
多副本同时执行 DDL 会互相争抢锁。本地 `node dev.mjs` 会在起服务前跑一次迁移。

---

## 主键：UUIDv7

[`src/database/uuid7.ts`](../../../backend/src/database/uuid7.ts)：

- 48 位毫秒时间戳 + 80 位随机数，时间有序，对 btree 索引友好。
- 所有业务表主键 `@PrimaryColumn({ type: 'uuid' })`，**在实体生命周期里生成**。
- 不用自增整数（泄露规模、分库难），不用 UUIDv4（完全随机，索引页频繁分裂）。

```ts
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
```

⚠️ **`repo.insert()` 不会触发 `@BeforeInsert`**（它走裸 QueryBuilder，不走实体生命周期）。
用 `repo.insert` 写业务数据会得到 `null value in column "id"`。统一用
`repo.save(repo.create({ ... }))`。

---

## 时间戳

- 需要 `updated_at` 的表继承 `TimestampedEntity`（`BaseEntity` + `@UpdateDateColumn`）。
- 纯追加型数据（验证码、审计）只继承 `BaseEntity`，不要多一个永远不变的 `updated_at`。
- 一律 `timestamptz`，不要 `timestamp`（后者丢时区）。
- 实体里是 `Date`，对外 API 用 `toISOString()` 转 ISO 8601 UTC 字符串。

---

## 命名约定

| 对象 | 约定 | 示例 |
|---|---|---|
| 表名 | 复数蛇形 | `users`、`email_verification_codes` |
| 列名 | 蛇形 | `created_at`、`code_hash`、`expires_at` |
| 主键约束 | `pk_<表>` | `pk_users` |
| 唯一约束 | `uq_<表>_<列>` | `uq_users_email` |
| 普通索引 | `ix_<表>_<列>` | `ix_email_codes_email_created` |
| 外键列 | `<引用表单数>_id` | `user_id`、`project_id` |
| 实体类 | 大驼峰单数 | `User`、`EmailCode` |

**列名显式写 snake_case**（`@Column({ name: 'code_hash' })`），不做自动命名转换。
自动转换会让「实体里写什么名字」变成要查文档的事，迁移里的手写 DDL 与实体之间也多一层黑盒。

---

## 约束与索引

- **唯一约束显式命名**：`@Index('uq_users_email', ['email'], { unique: true })`，
  迁移里写 `CONSTRAINT "uq_users_email" UNIQUE ("email")`。不要依赖 Postgres/TypeORM 自动命名。
- **同一张表里不同类型的行有不同唯一规则时，用部分唯一索引**（`WHERE` 只能写 immutable 条件）：

```sql
-- 一个用户每种非 gitlab 凭证只能有一条；gitlab 凭证按实例地址唯一
CREATE UNIQUE INDEX uq_user_credential_type
  ON user_credentials (user_id, cred_type)
  WHERE cred_type <> 'gitlab_token';
```

  TypeORM 迁移里用 `queryRunner.query()` 直接写 SQL；实体的 `@Index` 只做文档，
  `synchronize: false` 时它不会改表。
- **不要用 `UniqueConstraint(user_id, cred_type, url)` 去表达两条不同的唯一规则** ——
  那样「某类型只能有一条」这个事实就从 DB 层消失了。
- **外键必须显式 `ondelete`**：创建者/归属关系用 `RESTRICT`（删用户前先转交），
  从属关系用 `CASCADE`。TypeORM：`@ManyToOne(..., { onDelete: 'CASCADE' })`。

---

## 事务与并发

- **事务边界在 service**：`dataSource.transaction(async (manager) => { ... })`。
  一次业务操作要么整体成功、要么整体回滚。
- **不要在事务里发邮件 / 调第三方 / 写别的系统**：外部副作用不会跟着回滚。
  先落库提交，再发信（本模板的发码流程就是这样）。
- **读-改-写要防并发**：
  - 计数用原子 SQL：`repo.increment({ id }, 'attempts', 1)`，不要先读再写。
  - 「同时只能有一个」用唯一约束兜底，捕获 `23505` 后重读，不要先查后写。
  - 需要跨多行串行化时用 `pg_advisory_xact_lock(hashtext($1))`（本模板的 60 秒发码闸门），
    锁随事务结束自动释放。
- **默认隔离级别（Read Committed）就够**：不要随手上 `SERIALIZABLE`，它带来重试成本，
  而大多数业务约束用唯一索引/原子更新表达更便宜。

---

## 查询模式

- **只查需要的列**：大表列表页用 `select: { id: true, name: true }`，不要 `find()` 全字段。
- **列表分页统一信封**：`{ items, total, page, pageSize }`（见 `common/paged.ts`）。
  `total` 是筛完之后的条数，不是本页条数。
- **避免 N+1**：需要关联数据时用 `relations` / `leftJoinAndSelect`，或在一次查询里取出 id 集合
  再批量查。不要循环里逐条查询。
- **列表默认排序必须确定**：`order: { createdAt: 'DESC', id: 'DESC' }`。
  只按非唯一列排序时，相同值的行顺序不稳定，分页会重复/漏行。
- **搜索用 `ILIKE` 时注意索引**：小数据量可直接扫；数据量起来后加 `pg_trgm` 表达式索引。

---

## 迁移（TypeORM）

### 生成与执行

```bash
cd backend
npm run migration:generate -- src/database/migrations/AddSomething
npm run migration:run
npm run migration:revert
```

- 生成后**必须读一遍产物**：TypeORM 的 diff 有时会生成破坏性语句（drop column / 改类型）。
- 初始迁移与涉及数据回填的迁移建议**手写 DDL**（参考 `1792233600000-init.ts`）。
- 迁移文件按时间戳排序，类名与文件名一致。
- **迁移里不要 import 运行时业务 service**；需要的纯规则（如哈希）可以 import 纯函数文件。
- 应用启动不跑迁移（见上）。

### 给存量表加 NOT NULL 列：三步

```
1. addColumn(nullable: true)
2. 逐行回填（值因行而异时必须一行一个 UPDATE，不能所有行写同一个值）
3. alterColumn(nullable: false)
```

直接建 NOT NULL 必然失败（存量行是 NULL）。

### 给存量表加派生列 + 唯一索引：五步

```
1. addColumn(nullable: true)
2. 逐行回填
3. 自查重复并带清单 raise        ← 必须在建索引之前
4. alterColumn(nullable: false)
5. createUniqueConstraint
```

第 3 步失败会回滚整个迁移，清理完重复行可以直接重跑，不会留下「列加了一半」的中间态。
**存量重复由人清理**，迁移不代劳 —— 删哪一行是业务决定。

### 改唯一性约束：顺序即正确性

```
1. add_column × N（新列全 nullable）
2. 回填数据
3. 自查重复并 raise
4. drop 旧 unique 约束
5. drop 其它冲突的 unique
6. create_index（unique=True + WHERE）
```

新索引与旧约束同名时，必须先 drop 再 create —— Postgres 的 unique 约束自带一个同名索引，
不先删就是 `relation "uq_xxx" already exists`。

### downgrade 允许失败

数据已经不兼容旧结构时（如已经产生多条凭证），downgrade 因建不回旧唯一约束而失败是
**预期行为**。不要为了「downgrade 一定能跑」在迁移里加 `DELETE`。

---

## 团队明确避免的反模式

- ❌ **不 `synchronize: true`**：schema 只由迁移改变。
- ❌ **不用 `repo.insert()` 写业务实体**：不触发 UUIDv7 钩子。用 `save(create(...))`。
- ❌ **不在实体里写业务方法**：实体只描述结构；规则放 service / `*.rules.ts`。
- ❌ **不裸写 `any` 查询绕过类型**：需要复杂查询时用 QueryBuilder 并标注返回类型。
- ❌ **不在事务里做外部副作用**（发信、调第三方）。
- ❌ **不先查后写表达唯一性**：并发下会漏。用唯一索引 + 捕获 `23505`。
- ❌ **不给每张表都加 `updated_at`**：纯追加数据不需要。
- ❌ **不在迁移里静默删数据**：失败好过悄悄删行。
- ❌ **不把凭证明文落库**：需要存第三方 key 时加密存储 + 前端只回显末 4 位。
