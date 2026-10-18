import fs from 'node:fs';
import path from 'node:path';
import { sinkWarn } from './log-format.js';
import { isAtLeast, type LogLevel } from './log-levels.js';
import {
  archiveFile,
  planOpen,
  sweepArchive,
  topLevelFile,
  ymd,
} from './log-rotation.js';

/**
 * 一个「按天滚动 + 归档 + 按天保留」的文件 sink。
 *
 * 三条关键行为：
 *
 * 1. **滚动只在写入时判定**。空闲进程的文件不会在 00:00 自己滚；一旦有新写入就立刻滚走，
 *    并按**内容日期**归档（`fileDay` 记的是「当前打开的这个文件是什么时候建的」）。
 * 2. **失败只降级，不抛异常**：卷没挂上 / 权限不对 / 磁盘满时，打一条限流 warning 后
 *    退回「只走 stdout」，下一次写入自动重试。日志不该成为服务宕机的原因。
 * 3. **同步写**（`fs.writeSync`）：没有用户态缓冲，SIGTERM 时没有「队列里还没落盘的行」
 *    —— 容器重启前最后几行恰好最值钱。
 */

export interface RotatingFileSinkOptions {
  logDir: string;
  /** 文件名与归档车道的隔离键，见 log-rotation.ts。 */
  service: string;
  /** 本 sink 的级别门槛。 */
  level: LogLevel;
  retentionDays: number;
  /** 只为单测注入：跨天行为不可能靠等真实时间验证。 */
  now?: () => Date;
}

export class RotatingFileSink {
  private fd: number | null = null;
  /** 当前打开的这个文件**创建时**的日期。滚动判定的依据，不是 `now()`。 */
  private fileDay: string | null = null;
  private openFailures = 0;

  constructor(private readonly options: RotatingFileSinkOptions) {}

  get filePath(): string {
    return topLevelFile(this.options.logDir, this.options.service);
  }

  write(level: LogLevel, line: string): void {
    if (!isAtLeast(level, this.options.level)) return;
    try {
      this.ensureOpen();
      fs.writeSync(this.fd as number, `${line}\n`);
    } catch (error) {
      this.degrade(error);
    }
  }

  close(): void {
    if (this.fd === null) return;
    try {
      fs.closeSync(this.fd);
    } catch {
      // fd 会随进程退出被回收
    }
    this.fd = null;
    this.fileDay = null;
  }

  private ensureOpen(): void {
    const today = ymd(this.now());

    if (this.fd !== null) {
      if (this.fileDay === today) return;
      this.rotate(today);
      return;
    }

    fs.mkdirSync(this.options.logDir, { recursive: true });
    const plan = planOpen(this.filePath, today);
    if (plan.action === 'archive-then-fresh' && plan.staleDay) {
      archiveFile(this.options.logDir, this.options.service, plan.staleDay);
      sweepArchive(
        this.options.logDir,
        this.options.service,
        this.options.retentionDays,
        this.now(),
      );
    }
    this.fd = fs.openSync(this.filePath, 'a');
    this.fileDay = today;
    this.openFailures = 0;
  }

  private rotate(today: string): void {
    const stale = this.fileDay;
    this.close();
    if (stale) {
      archiveFile(this.options.logDir, this.options.service, stale);
    }
    this.fd = fs.openSync(this.filePath, 'a');
    this.fileDay = today;
    sweepArchive(
      this.options.logDir,
      this.options.service,
      this.options.retentionDays,
      this.now(),
    );
  }

  /** 这一行写不进去：退回「只走 stdout」，下一次写入再试。warning 限流（第 1 次 + 每 100 次）。 */
  private degrade(error: unknown): void {
    this.close();
    this.openFailures += 1;
    if (this.openFailures === 1 || this.openFailures % 100 === 0) {
      sinkWarn(
        `日志写盘失败（${path.join(this.options.logDir, `${this.options.service}.log`)}）` +
          `第 ${this.openFailures} 次：${String(error)}；本进程只走 stdout`,
      );
    }
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
}
