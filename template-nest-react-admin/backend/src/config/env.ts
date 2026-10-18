/**
 * 环境变量收口（规范：业务代码不散落 `process.env`，集中走 `config/`）。
 *
 * 两个**刻意的例外**：
 * - `LOG_*` 由 `common/logging` 自己读 —— logger 必须在 `NestFactory.create()` 之前建好；
 * - TypeORM 的连接参数由 `database/` 读 —— 它是数据层基础设施，不认识业务配置。
 */

/** 取必填变量。启动阶段就抛，不留一个运行期才炸的空值。 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export interface SmtpConfig {
  host: string | undefined;
  port: number;
  user: string | undefined;
  password: string | undefined;
  from: string | undefined;
}

export const env = {
  port: Number(process.env.PORT ?? 3100),

  /** 缺了直接启动失败 —— 签名密钥不能有一个「默认值」。 */
  get jwtSecret(): string {
    return required('JWT_SECRET');
  },

  /** PostgreSQL 连接串。缺了直接启动失败。 */
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },

  /** 没上 HTTPS 前必须 false，否则浏览器不回传 Cookie。 */
  get cookieSecure(): boolean {
    return process.env.COOKIE_SECURE === 'true';
  },

  /** true = 验证码打日志不真发信，本地不配 SMTP 也能走完登录。 */
  get devMode(): boolean {
    return process.env.DEV_MODE === 'true';
  },

  get smtp(): SmtpConfig {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM,
    };
  },
};
