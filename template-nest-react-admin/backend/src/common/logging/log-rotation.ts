import fs from 'node:fs';
import path from 'node:path';
import { sinkWarn } from './log-format.js';

/**
 * 落盘归档的**规则**：滚动下来的文件按天收进 `archive/`，过期按文件名里的日期清掉。
 *
 * ```
 * /app/logs/
 * ├── api.log                    ← `tail -f` 的固定入口，名字永远不变
 * ├── api-error.log              ← 只有 ERROR 及以上
 * └── archive/
 *     ├── api.2026-09-13.log     ← 一天一个文件
 *     └── api.2026-09-14.log
 * ```
 *
 * 本文件只是规则与文件操作，不认识 Nest、也不认识 sink；`file-sink.ts` 在正确的时刻调它。
 */

export const ARCHIVE_DIR_NAME = 'archive';

const DATE_GROUP = String.raw`(\d{4}-\d{2}-\d{2})`;

/** 本地日期 `YYYY-MM-DD`，与日志行里的时间列同一个时区。 */
export function ymd(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/**
 * 匹配**本服务**已归档的文件名。
 *
 * 锚定服务名是隔离手段：多个服务可能共用一个 `LOG_DIR`，各自的清理只许动自己的文件。
 * 服务名与日期之间必须紧跟点号，所以 `api-error.2026-09-14.log` 不会被 `api` 的规则命中。
 */
export function archivedNameRe(service: string): RegExp {
  return new RegExp(`^${escapeRe(service)}\\.${DATE_GROUP}\\.log$`);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function topLevelFile(logDir: string, service: string): string {
  return path.join(logDir, `${service}.log`);
}

export function archivePath(
  logDir: string,
  service: string,
  day: string,
): string {
  return path.join(logDir, ARCHIVE_DIR_NAME, `${service}.${day}.log`);
}

export type OpenAction = 'fresh' | 'append' | 'archive-then-fresh';

export interface OpenPlan {
  action: OpenAction;
  /** `archive-then-fresh` 时：顶层那个遗留文件的内容属于哪一天。 */
  staleDay?: string;
}

/**
 * 进程启动（或首次写入）时该拿顶层文件怎么办：
 *
 * - 文件不存在 → 新建。
 * - mtime 就是今天 → 接着追加。**不能截断**：容器重启是常事，同一天内重启不能清空当天日志。
 * - mtime 是更早的某天 → 先按那一天归档，再新建。否则今天这几行会被并进前面那天的文件、
 *   归档时按今天的日期命名，那天的日志就被永久贴上了错误的日期。
 *
 * 判据用 mtime 而不是「文件第一行时间」：读尾巴要开文件、还可能碰上被截断的半行。
 */
export function planOpen(filePath: string, today: string): OpenPlan {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { action: 'fresh' };
  }
  const mtimeDay = ymd(stat.mtime);
  if (mtimeDay === today) return { action: 'append' };
  return { action: 'archive-then-fresh', staleDay: mtimeDay };
}

/**
 * 把顶层文件按 `day` 收进 `archive/`。返回归档后的路径；失败返回 `null`（文件留在原处）。
 *
 * **同一天的第二次归档是「追加合并」**而不是新建带序号的兄弟文件：一天一个文件这条
 * 不变量是运维 grep / 排序的前提。二进制追加，不重新解码再编码。
 *
 * **绝不抛异常**：它跑在写日志的调用栈里，漏出去会让触发滚动的那条消息丢掉。
 */
export function archiveFile(
  logDir: string,
  service: string,
  day: string,
): string | null {
  const src = topLevelFile(logDir, service);
  const dst = archivePath(logDir, service, day);
  try {
    if (!fs.existsSync(src)) return null;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.existsSync(dst)) {
      fs.appendFileSync(dst, fs.readFileSync(src));
      fs.rmSync(src);
    } else {
      fs.renameSync(src, dst);
    }
    return dst;
  } catch (error) {
    sinkWarn(`归档失败（${src} → ${dst}）：${String(error)}；文件留在原处`);
    return null;
  }
}

/**
 * 在 `archive/` 里按**文件名里的日期**删过期文件，返回被删掉的文件名。
 *
 * 四条边界：判据是文件名日期而不是 mtime；只碰 `<本服务>.<日期>.log`；
 * 名字解析不出合法日期的不碰；顶层文件永远不在清理范围内。
 */
export function sweepArchive(
  logDir: string,
  service: string,
  keepDays: number,
  today: Date = new Date(),
): string[] {
  const removed: string[] = [];
  const archiveDir = path.join(logDir, ARCHIVE_DIR_NAME);
  try {
    if (!fs.existsSync(archiveDir) || !fs.statSync(archiveDir).isDirectory()) {
      return removed;
    }
    const pattern = archivedNameRe(service);
    const todayMs = Date.parse(`${ymd(today)}T00:00:00Z`);
    for (const entry of fs.readdirSync(archiveDir).sort()) {
      const match = pattern.exec(entry);
      if (!match) continue;
      const day = match[1];
      if (!day) continue;
      const dayMs = Date.parse(`${day}T00:00:00Z`);
      if (Number.isNaN(dayMs)) continue;
      if (!fs.statSync(path.join(archiveDir, entry)).isFile()) continue;
      if ((todayMs - dayMs) / 86_400_000 <= keepDays) continue;
      try {
        fs.rmSync(path.join(archiveDir, entry));
        removed.push(entry);
      } catch (error) {
        sinkWarn(`清理归档失败（${entry}）：${String(error)}`);
      }
    }
  } catch (error) {
    sinkWarn(`清理归档目录失败（${archiveDir}）：${String(error)}`);
  }
  return removed;
}
