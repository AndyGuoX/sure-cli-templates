import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  archiveFile,
  archivedNameRe,
  planOpen,
  sweepArchive,
  ymd,
} from './log-rotation.js';

describe('log-rotation', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-logs-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('文件不存在时新建，今天的 mtime 追加，旧 mtime 先归档', () => {
    const top = path.join(dir, 'api.log');
    expect(planOpen(top, '2026-10-18')).toEqual({ action: 'fresh' });

    fs.writeFileSync(top, 'today\n');
    expect(planOpen(top, ymd(new Date()))).toEqual({ action: 'append' });

    expect(planOpen(top, '2099-01-01')).toEqual({
      action: 'archive-then-fresh',
      staleDay: ymd(new Date()),
    });
  });

  it('同一天第二次归档是追加合并，不产生分片', () => {
    const top = path.join(dir, 'api.log');
    fs.writeFileSync(top, 'first\n');
    archiveFile(dir, 'api', '2026-10-17');
    fs.writeFileSync(top, 'second\n');
    archiveFile(dir, 'api', '2026-10-17');

    expect(
      fs.readFileSync(path.join(dir, 'archive', 'api.2026-10-17.log'), 'utf8'),
    ).toBe('first\nsecond\n');
    expect(fs.existsSync(top)).toBe(false);
  });

  it('清理只碰本服务、且按文件名日期判断', () => {
    const archive = path.join(dir, 'archive');
    fs.mkdirSync(archive);
    fs.writeFileSync(path.join(archive, 'api.2026-10-01.log'), 'old');
    fs.writeFileSync(
      path.join(archive, 'api-error.2026-10-01.log'),
      'other lane',
    );
    fs.writeFileSync(path.join(archive, 'web.2026-10-01.log'), 'other service');
    fs.writeFileSync(path.join(archive, 'api.2026-13-45.log'), 'bad date');

    const removed = sweepArchive(
      dir,
      'api',
      7,
      new Date('2026-10-18T12:00:00Z'),
    );

    expect(removed).toEqual(['api.2026-10-01.log']);
    expect(fs.existsSync(path.join(archive, 'api-error.2026-10-01.log'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(archive, 'web.2026-10-01.log'))).toBe(true);
  });

  it('归档文件名正则锚定服务名', () => {
    expect(archivedNameRe('api').test('api.2026-10-18.log')).toBe(true);
    expect(archivedNameRe('api').test('api-error.2026-10-18.log')).toBe(false);
  });
});
