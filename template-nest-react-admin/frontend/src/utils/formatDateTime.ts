/**
 * 把后端下发的 ISO 8601 时间戳渲染成固定宽度的本地时间串。
 *
 * 手搓而**不用 `toLocaleString`**：后者的输出随运行环境 locale 变，同一份数据在不同
 * 机器上长得不一样。
 *
 * @param iso ISO 8601 时间戳。允许 `null` —— `new Date(null)` 是 epoch 0，不拦住会把
 *   「没有时间」显示成一个假时间
 * @param options.seconds 是否精确到秒，默认 false
 * @returns 解析不出的坏值返回 `null`，由调用方决定占位文案（如 `?? '—'`）
 */
export function formatDateTime(iso: string | null, options?: { seconds?: boolean }): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const minute = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return options?.seconds ? `${minute}:${pad(d.getSeconds())}` : minute;
}
