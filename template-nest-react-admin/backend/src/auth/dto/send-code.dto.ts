import { IsEmail } from 'class-validator';

/**
 * `POST /auth/send-code` 的请求体。
 *
 * ⚠️ 字段名 `email` 就是校验失败时 `errors` 的 key，也是前端表单 `Form.Item` 的 `name`
 * —— 两边对不上时 antd 是**静默 no-op**（用户点了没反应）。
 */
export class SendCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;
}
