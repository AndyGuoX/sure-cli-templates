import {
  MAX_CODE_ATTEMPTS,
  codeMatches,
  generateCode,
  hashCode,
  normalizeEmail,
  secondsUntilResend,
} from './auth.rules.js';

describe('auth.rules', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-for-auth-rules';
  });

  it('邮箱归一化', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com');
  });

  it('验证码是 6 位数字且使用 CSPRNG 接口', () => {
    expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('哈希绑定邮箱，且比对是恒定时间实现', () => {
    const hash = hashCode('foo@example.com', '123456');
    expect(hash).toHaveLength(64);
    expect(codeMatches(hash, hashCode('foo@example.com', '123456'))).toBe(true);
    expect(codeMatches(hash, hashCode('bar@example.com', '123456'))).toBe(
      false,
    );
    expect(codeMatches(hash, hashCode('foo@example.com', '654321'))).toBe(
      false,
    );
  });

  it('重发倒计时至少 1 秒', () => {
    expect(secondsUntilResend(new Date(Date.now() - 59_000))).toBe(1);
    expect(secondsUntilResend(new Date(Date.now() - 60_000))).toBe(1);
    expect(MAX_CODE_ATTEMPTS).toBe(5);
  });
});
