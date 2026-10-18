import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  IsNull,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { EmailCode } from './entities/email-code.entity.js';
import { User } from './entities/user.entity.js';
import { EmailService } from './email.service.js';
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  RESEND_INTERVAL_MS,
  codeMatches,
  generateCode,
  hashCode,
  normalizeEmail,
  secondsUntilResend,
  toRecord,
} from './auth.rules.js';
import type { UserRecord } from './auth.types.js';
import { HttpExceptionWithHeaders } from '../common/exceptions/http-exception-with-headers.js';

/**
 * 登录业务。分层硬规则：**不碰 `Request` / `Response`** —— IP 等信息由 controller 取好传进来，
 * Cookie 由 controller 签，业务只回「用户是谁」。
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(EmailCode) private readonly codes: Repository<EmailCode>,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 发验证码。**永远返回 200**（邮件上游故障除外）—— 不区分「邮箱是否已注册」是防账号枚举。
   */
  async sendCode(email: string): Promise<{ ok: true }> {
    const normalized = normalizeEmail(email);

    // 60 秒闸门必须与插入放在同一个事务里，并用 advisory lock 按邮箱串行化：
    // 两个并发请求各自读到同一个 lastSentAt 再各自插入，限流就会被刷穿。
    // 锁在事务结束时自动释放，不需要显式 unlock。
    const code = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `send-code:${normalized}`,
      ]);
      const repo = manager.getRepository(EmailCode);
      const latest = await repo.findOne({
        where: { email: normalized },
        order: { createdAt: 'DESC' },
      });
      if (
        latest &&
        Date.now() - latest.createdAt.getTime() < RESEND_INTERVAL_MS
      ) {
        throw tooFrequent(latest.createdAt);
      }

      const fresh = generateCode();
      // 用 save 而不是 insert：`@BeforeInsert`（UUIDv7 主键）只在实体生命周期钩子里执行，
      // `insert()` 走的是裸 QueryBuilder，不会触发它 —— 表现是 id 为 NULL、违反非空约束。
      await repo.save(
        repo.create({
          email: normalized,
          codeHash: hashCode(normalized, fresh),
          attempts: 0,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
          consumedAt: null,
        }),
      );
      return fresh;
    });

    // 先落库、再发信：反了会出现「码还没进库，邮件已经发出去」。
    await this.emailService.sendVerificationCode(normalized, code);
    return { ok: true };
  }

  /**
   * 校验验证码 → 找到或建用户。失败一律同一句文案：不区分「码不存在 / 过期 / 错了」，
   * 防止探测某个邮箱当前的验证码状态。
   */
  async login(email: string, code: string): Promise<UserRecord> {
    const normalized = normalizeEmail(email);
    const record = await this.codes.findOne({
      where: {
        email: normalized,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    const fail = () =>
      new BadRequestException('验证码错误或已过期，请重新获取');

    if (!record || record.attempts >= MAX_CODE_ATTEMPTS) throw fail();
    if (!codeMatches(record.codeHash, hashCode(normalized, code))) {
      // 原子自增，避免并发猜码把计数读改写丢。
      await this.codes.increment({ id: record.id }, 'attempts', 1);
      throw fail();
    }

    const user = await this.dataSource.transaction(async (manager) => {
      const codes = manager.getRepository(EmailCode);
      const now = new Date();
      // 同邮箱其它未消费的码一并作废，避免旧码还能用。
      await codes.update(
        { email: normalized, consumedAt: IsNull() },
        { consumedAt: now },
      );
      return findOrCreateUser(manager.getRepository(User), normalized);
    });

    return toRecord(user);
  }
}

/**
 * 首登自动注册。并发首次登录只有一个 `INSERT` 能成功，另一个撞唯一约束后重读 ——
 * 没有「先查后写」的窗口，也**不把 409 报给用户**（那是竞态，不是他的错）。
 */
async function findOrCreateUser(
  users: Repository<User>,
  email: string,
): Promise<User> {
  const existing = await users.findOneBy({ email });
  if (existing) return existing;

  const user = users.create({ email, name: email.split('@')[0] });
  try {
    return await users.save(user);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await users.findOneBy({ email });
      if (again) return again;
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { driverError?: { code?: string } })
      .driverError?.code === '23505'
  );
}

/** 同邮箱 60 秒闸门没过：带 `Retry-After` 的 429（前端倒计时读的就是它）。 */
function tooFrequent(lastSentAt: Date): HttpExceptionWithHeaders {
  return new HttpExceptionWithHeaders('发送太频繁，请 60 秒后再试', 429, {
    'Retry-After': String(secondsUntilResend(lastSentAt)),
  });
}
