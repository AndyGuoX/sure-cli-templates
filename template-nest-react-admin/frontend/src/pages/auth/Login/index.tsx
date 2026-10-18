import { Alert, App, Button, Card, Flex, Form, Input, Typography } from 'antd';
import type { OTPRef } from 'antd/es/input/OTP';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { login, sendCode } from '@/api';
import { isServerDown, problemOf, retryAfterSeconds } from '@/api/client';
import BrandMark from '@/components/BrandMark';
import './style.less';

interface LoginForm {
  email: string;
  code: string;
}

/**
 * 表单字段名 —— 必须与后端 `errors` 的 key（DTO 字段名）**逐字**一致：
 * 对不上的 key 让 antd 的 `setFields` 变成静默 no-op，用户点了登录毫无反应。
 */
const FIELDS = ['email', 'code'] as const;

/**
 * 邮箱验证码登录页。首次登录即注册。
 *
 * 交互约定：
 * - 验证码填满 6 位自动提交（按钮保留：重发后手动提交的兜底）；
 * - 429 的倒计时初值取自响应头 `Retry-After`，不硬编码 60；
 * - 失败优先落到字段上，落不到字段的才用卡片内 Alert。
 */
export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<LoginForm>();
  const otpRef = useRef<OTPRef>(null);
  const [left, setLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** 卡片内的失败提示。只承载错误 —— 发送成功走全局 toast，不重复。 */
  const [error, setError] = useState<string | null>(null);

  // 倒计时：`left` 是唯一状态，秒数只是显示。
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  const redirectParam = searchParams.get('redirect');
  // 只接受站内绝对路径：挡掉 ?redirect=//evil.com 这类开放重定向
  const redirect = redirectParam?.startsWith('/') && !redirectParam.startsWith('//') ? redirectParam : '/';

  const onSendCode = async () => {
    let email: string;
    try {
      email = (await form.validateFields(['email'])).email.trim();
    } catch {
      return; // 邮箱不合规，Form 自己已经标红
    }

    setSending(true);
    setError(null);
    try {
      await sendCode(email);
      // 成功给全局 toast：光把按钮变成倒计时，用户看不出「发出去了没有」
      message.success('验证码已发送，请查看邮箱');
      setLeft(60);
    } catch (e) {
      const problem = problemOf(e);
      // 429 的等待秒数取自响应头，不硬编码 60
      if (problem.statusCode === 429) setLeft(retryAfterSeconds(e) ?? 60);
      // 5xx / 网络断已经由拦截器弹了全局 toast，不重复
      if (!isServerDown(e)) setError(problem.message);
    } finally {
      setSending(false);
    }
  };

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true);
    setError(null);
    try {
      const user = await login({ email: values.email.trim(), code: values.code });
      // 登录后的用户态只有这一份来源，与 useCurrentUser 的 queryKey 一致
      qc.setQueryData(['me'], user);
      navigate(redirect, { replace: true });
    } catch (e) {
      const problem = problemOf(e);
      const errors = problem.errors ?? {};
      // 只回填本表单认识的字段：antd 对不存在的 name 是静默 no-op
      const landed = FIELDS.filter((field) => field in errors);
      form.setFields(landed.map((name) => ({ name, errors: errors[name] })));
      // 判「错误有没有落到字段上」，不是判「有没有 errors」：
      // 落不到就必须给提示条（如 400「验证码错误或已过期」只有 message）
      if (landed.length === 0 && !isServerDown(e)) setError(problem.message);
      form.setFieldValue('code', '');
      otpRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="login-card" styles={{ body: { padding: '32px 32px 24px' } }}>
      <Flex className="login-brand" vertical align="center">
        <div className="login-logo">
          <BrandMark />
        </div>
        <div className="login-name">Nest React Admin</div>
        <div className="login-sub">邮箱验证码登录 · 首次登录自动注册</div>
      </Flex>

      {error && <Alert className="login-alert" type="error" showIcon title={error} />}

      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        validateTrigger={['onBlur', 'onSubmit']}
        onFinish={onFinish}
      >
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input placeholder="you@example.com" autoComplete="email" />
        </Form.Item>

        <Form.Item>
          <Button onClick={onSendCode} loading={sending} disabled={left > 0}>
            {left > 0 ? `${left}s 后重新发送` : '发送验证码'}
          </Button>
        </Form.Item>

        <Form.Item
          name="code"
          label="验证码"
          className="otp-lg"
          extra="6 位数字，10 分钟内有效"
          rules={[
            { required: true, message: '请输入验证码' },
            { len: 6, message: '验证码是 6 位数字' },
          ]}
        >
          {/* 填满 6 位即提交，不用再点登录按钮。`submitting` 判断防连点/重复提交。 */}
          <Input.OTP
            length={6}
            ref={otpRef}
            onChange={(value) => {
              if (value.length === 6 && !submitting) form.submit();
            }}
          />
        </Form.Item>

        <Button type="primary" block size="large" htmlType="submit" loading={submitting}>
          登录
        </Button>
      </Form>

      <Typography.Text className="login-footer" type="secondary">
        内网系统 · 无需密码，验证码即凭证
      </Typography.Text>
    </Card>
  );
}
