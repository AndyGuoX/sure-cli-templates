import {
  weightOf,
  isAtLeast,
  resolveLogLevel,
  fromNestLevel,
} from './log-levels.js';
import { formatLine, formatTimestamp, toMessageText } from './log-format.js';
import { scrubWith } from './scrub.js';

describe('log-levels', () => {
  it('归一化常见写法与别名', () => {
    expect(resolveLogLevel('debug').level).toBe('DEBUG');
    expect(resolveLogLevel('warn').level).toBe('WARNING');
    expect(resolveLogLevel('fatal').level).toBe('CRITICAL');
  });

  it('认不出的值退回 INFO 并带回原值', () => {
    expect(resolveLogLevel('INFOO')).toEqual({
      level: 'INFO',
      badValue: 'INFOO',
    });
  });

  it('级别比较与 Nest 映射', () => {
    expect(weightOf('ERROR')).toBeGreaterThan(weightOf('WARNING'));
    expect(isAtLeast('CRITICAL', 'ERROR')).toBe(true);
    expect(isAtLeast('DEBUG', 'INFO')).toBe(false);
    expect(fromNestLevel('log')).toBe('INFO');
    expect(fromNestLevel('fatal')).toBe('CRITICAL');
  });
});

describe('log-format', () => {
  const fixed = new Date(2026, 8, 14, 14, 3, 21, 472);

  it('四列格式，级别左对齐', () => {
    expect(formatTimestamp(fixed)).toBe('2026-09-14 14:03:21.472');
    expect(formatLine('INFO', 'HealthController', '后端已连通', fixed)).toBe(
      '2026-09-14 14:03:21.472 | INFO     | HealthController | 后端已连通',
    );
  });

  it('Error 只取 message + stack，不泄露其它属性', () => {
    const error = Object.assign(new Error('boom'), { password: 'secret' });
    const text = toMessageText(error);
    expect(text).toContain('boom');
    expect(text).not.toContain('secret');
  });
});

describe('scrub', () => {
  it('只替换长度达标的 secret，长值优先', () => {
    const secrets = ['short', 'abcdefghijk', 'abcdefgh'];
    expect(scrubWith('x abcdefghijk abcdefgh short', secrets)).toBe(
      'x *** *** short',
    );
  });
});
