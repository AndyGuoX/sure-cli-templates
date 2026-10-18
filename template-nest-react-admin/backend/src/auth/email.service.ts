import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { CODE_TTL_MS } from './auth.rules.js';

/**
 * 发验证码邮件。
 *
 * **一个类里 if/else，不做「邮件发送器接口 + SMTP 实现 + 日志实现」** ——
 * 本模板只有这一种发信方式，多一层抽象只会增加阅读成本。
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  /**
   * `DEV_MODE=true` 或没配 `SMTP_HOST` 时把验证码打进日志 —— 这是本地开发的正常路径，
   * 不是错误（不配 SMTP 时它是唯一能拿到验证码的方式），所以走 warning、不抛异常。
   *
   * ⚠️ 生产必须 `DEV_MODE=false` 且 SMTP 配好；`main.ts` 的启动断言挡掉二者都不满足的
   * 组合，否则验证码会随日志落盘而看不出任何异常。
   * ⚠️ 这是全项目**唯一**允许打验证码明文的地方。
   */
  async sendVerificationCode(email: string, code: string): Promise<void> {
    if (env.devMode || !env.smtp.host) {
      this.logger.warn(`[DEV] 验证码 ${email} → ${code}`);
      return;
    }

    const ttlMinutes = CODE_TTL_MS / 60_000;
    const appName = process.env.APP_NAME?.trim() || 'Nest React Admin';

    try {
      await this.transport().sendMail({
        from: env.smtp.from || env.smtp.user,
        to: email,
        subject: `${appName} 登录验证码`,
        text:
          `您好！您正在进行「账号注册 / 登录」操作。\n\n` +
          `您的验证码是：${code}\n\n` +
          `该验证码有效时间为 ${ttlMinutes} 分钟，请在页面中输入完成验证。` +
          `如非本人操作，请忽略本邮件。\n\n` +
          `[${appName}]`,
        html:
          `<html>\n` +
          `  <body style="font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.8;color:#333">\n` +
          `    <p>您好！您正在进行「账号注册 / 登录」操作。</p>\n` +
          `    <p>您的验证码是：<strong style="font-size:20px;letter-spacing:2px">${code}</strong></p>\n` +
          `    <p>该验证码有效时间为 <strong>${ttlMinutes} 分钟</strong>，请在页面中输入完成验证。\n` +
          `       如非本人操作，请忽略本邮件。</p>\n` +
          `    <p>[${appName}]</p>\n` +
          `  </body>\n` +
          `</html>\n`,
      });
    } catch (e) {
      // 第三方不可用是上游故障，不是用户填错；翻译成 502，但原异常要留在日志里。
      this.logger.error(
        `发送验证码邮件失败 email=${email}`,
        e instanceof Error ? e.stack : String(e),
      );
      throw new HttpException('邮件发送失败，请稍后重试', 502);
    }
  }

  /** 惰性建 transport：DEV 分支下不建连接、也不要求 SMTP_* 齐全。 */
  private transport(): Transporter {
    this.transporter ??= createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    });
    return this.transporter;
  }
}
