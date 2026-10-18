import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity.js';

/**
 * 邮箱验证码。**只存 HMAC 哈希，不存明文**：库被拖走时拿不到可用的验证码。
 *
 * 每个邮箱每次发码插入一条新记录；登录只认「最新的一条未消费记录」，
 * 所以旧码在发新码的瞬间自然失效，不需要额外的作废写。
 */
@Entity('email_verification_codes')
@Index('ix_email_codes_email_created', ['email', 'createdAt'])
export class EmailCode extends BaseEntity {
  @Column({ type: 'varchar', length: 320 })
  email: string;

  /** `HMAC-SHA256(JWT_SECRET, email + ':' + code)` 的十六进制。 */
  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  /** 输错一次 +1，到上限后这条码作废。 */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** 登录成功时写上，用过即废。 */
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;
}
