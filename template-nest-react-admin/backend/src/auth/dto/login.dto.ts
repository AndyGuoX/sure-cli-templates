import { IsEmail, Matches } from 'class-validator';

/**
 * `POST /auth/login` 的请求体。
 *
 * ⚠️ `errors` 的 key（`email` / `code`）与前端表单的 `Form.Item` name 必须逐字一致。
 */
export class LoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  // 一条规则给一条文案：拆成 @Length + @Matches 会让 errors 里出现两句同义的话。
  @Matches(/^\d{6}$/, { message: '验证码是 6 位数字' })
  code: string;
}
