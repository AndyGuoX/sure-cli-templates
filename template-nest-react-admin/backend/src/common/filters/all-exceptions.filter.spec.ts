import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function hostFor(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader: vi.fn() }),
      getRequest: () => ({ method: 'GET', url: '/api/test' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  // 未预期异常会正常打一条 ERROR 日志；测试里不需要真的打到控制台。
  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('4xx 原样透传，不记录堆栈', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostFor();

    filter.catch(new BadRequestException('参数错误'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: '参数错误' }),
    );
  });

  it('对象形式的异常保留 errors 字段', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = hostFor();

    filter.catch(
      new BadRequestException({
        message: '请检查表单填写',
        error: 'Bad Request',
        errors: { email: ['邮箱格式不正确'] },
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        errors: { email: ['邮箱格式不正确'] },
      }),
    );
  });

  it('未预期异常只回固定文案，不泄露原始信息', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = hostFor();

    filter.catch(new Error('数据库密码是 hunter2'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: '服务器内部错误',
      error: 'Internal Server Error',
    });
  });

  it('404 保留 Nest 信封', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = hostFor();
    filter.catch(new NotFoundException('不存在'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});
