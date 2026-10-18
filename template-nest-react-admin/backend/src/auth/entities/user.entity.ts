import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity } from '../../database/entities/base.entity.js';

/** 用户。邮箱唯一，登录即注册；没有角色/权限字段 —— 需要时再加。 */
@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
export class User extends TimestampedEntity {
  /** 归一化（trim + 小写）后的邮箱。原始大小写不保留，展示名用 `name`。 */
  @Column({ type: 'varchar', length: 320 })
  email: string;

  /** 展示名。首登时取邮箱 `@` 前面那段，之后可由个人设置页改写。 */
  @Column({ type: 'varchar', length: 64 })
  name: string;
}
