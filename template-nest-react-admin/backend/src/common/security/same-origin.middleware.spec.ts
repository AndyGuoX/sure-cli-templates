import { isCrossSite } from './same-origin.middleware.js';

describe('same-origin', () => {
  it('安全方法一律放行', () => {
    expect(isCrossSite('GET', 'a.com', 'https://evil.com', undefined)).toBe(
      false,
    );
  });

  it('同 host（含端口）放行', () => {
    expect(
      isCrossSite('POST', '1.2.3.4:8001', 'http://1.2.3.4:8001', undefined),
    ).toBe(false);
  });

  it('跨站写请求拒绝，缺 Origin/Referer 时放行', () => {
    expect(isCrossSite('POST', 'a.com', 'https://evil.com', undefined)).toBe(
      true,
    );
    expect(isCrossSite('POST', 'a.com', undefined, undefined)).toBe(false);
    expect(isCrossSite('POST', 'a.com', 'null', undefined)).toBe(true);
  });
});
