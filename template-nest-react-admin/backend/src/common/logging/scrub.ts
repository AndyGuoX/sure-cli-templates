/**
 * 外部文本脱敏：**往日志里写任何来自外部进程 / 异常 / 第三方库的原始文本之前，先过这里。**
 *
 * 日志里最容易漏 secret 的地方不是我们自己写的那几行，而是别人给的字符串：
 * 第三方库回显的凭据、异常堆栈里带 token 的 URL、连接串。
 */

/**
 * 值短于这个长度的不脱敏：拿一个 3~4 字符的短串去全局替换会把正常日志打得面目全非。
 * 宁可漏掉一个本就不算秘密的短值。
 */
const MIN_SECRET_LENGTH = 8;

const REDACTED = '***';

/**
 * 「名字像 secret」的变量名后缀。**故意用后缀而不是枚举变量名**：新加的 secret
 * 不必回来登记就自动被覆盖 —— 多脱敏一个值最多让日志难读一点，少脱敏一个是静默泄密。
 *
 * `*_ACCESS_KEY_ID` 故意不命中（结尾是 `_ID`）：AK 是标识符不是凭证。
 */
const SECRET_NAME_SUFFIXES = [
  '_PASSWORD',
  '_PASS',
  '_SECRET',
  '_TOKEN',
  '_KEY',
] as const;

function looksLikeSecretName(name: string): boolean {
  const upper = name.toUpperCase();
  return SECRET_NAME_SUFFIXES.some((suffix) => upper.endsWith(suffix));
}

/** 从环境变量里收集要脱敏的值。空值与短于阈值的丢掉。 */
export function collectSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !looksLikeSecretName(name)) continue;
    if (value.length < MIN_SECRET_LENGTH) continue;
    values.add(value);
  }
  return [...values];
}

/** 按给定名单替换。长值先换 —— 否则短值（另一个 secret 恰好是它的子串）会先把它切碎。 */
export function scrubWith(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret.length < MIN_SECRET_LENGTH) continue;
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

let cachedSecrets: string[] | undefined;

/**
 * 脱敏（用进程环境里收集到的 secret 名单）。
 *
 * 名单只在第一次调用时读一次并缓存：日志是 hot path，而 `.env` 在进程生命周期里不会变。
 * 单测要换名单时调 `resetSecretCache()`（或直接用 `scrubWith`）。
 */
export function scrub(text: string): string {
  cachedSecrets ??= collectSecrets();
  return scrubWith(text, cachedSecrets);
}

/** 只给单测用：让下一次 `scrub()` 重新读环境变量。 */
export function resetSecretCache(): void {
  cachedSecrets = undefined;
}
