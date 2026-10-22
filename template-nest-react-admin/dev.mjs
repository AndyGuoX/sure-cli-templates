#!/usr/bin/env node
/**
 * 本地开发一键起后端，跨平台（mac / linux / windows）。只用 Node 内置模块。
 *
 *   node dev.mjs          对齐 .env + 确保 PostgreSQL 在跑 + 装依赖 + 跑迁移 + 起后端
 *
 * 前端不在这里启动 —— 依赖会顺手装好，另开终端执行：cd frontend && npm run dev
 *
 * 数据库：默认连 `backend/.env` 的 `DATABASE_URL`（模板值是 localhost:5432）。
 * 连不上时会尝试 `docker compose -f compose.dev.yml up -d` 起本地 postgres；
 * 没有 docker 就直接报错并给出手动启动的提示。
 *
 * 后缀是 .mjs 不是 .js：根目录没有 package.json，Node 会把 .js 当 CommonJS。
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const isWin = process.platform === 'win32';

const API_PORT = 3100;
const HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/health`;

/**
 * `backend/.env` 期望的 key 集合（模板）。值是**本机默认值**，已存在的 key 一律不动。
 */
function envTemplate() {
  return [
    ['PORT', String(API_PORT)],
    ['APP_NAME', 'Nest React Admin'],
    // 与 compose.dev.yml 的 POSTGRES_* 对齐
    ['DATABASE_URL', 'postgresql://app:app@localhost:5432/app'],
    // JWT 签名密钥**现场生成**：写成模块常量就等于所有机器共用同一个密钥
    ['JWT_SECRET', randomBytes(48).toString('base64')],
    ['COOKIE_SECURE', 'false'],
    // 验证码打日志不真发信 —— 本地不配 SMTP 也能走完登录
    ['DEV_MODE', 'true'],
    ['SMTP_HOST', ''],
    ['SMTP_PORT', '465'],
    ['SMTP_USER', ''],
    ['SMTP_PASSWORD', ''],
    ['SMTP_FROM', ''],
  ];
}

// Windows 上 npm / npx 是 .cmd：Node 从 18.20 / 20.12 起禁止不带 shell 直接 spawn .cmd / .bat。
// 走 shell 时参数按空格拼、不做转义 —— 所以 npm / npx 的参数里不能带空格。
const VIA_SHELL = new Set(['npm', 'npx']);
const shellFor = (cmd) => isWin && VIA_SHELL.has(cmd);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { shell: shellFor(cmd), stdio: 'inherit', ...opts });
  if (r.error) die(`${cmd} 起不来：${r.error.message}`);
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} 退出码 ${r.status}`);
  return r;
}

/** 带超时的「这个 URL 通不通」。定时器必须被 ref，理由见 fetchOk 的调用处。 */
async function fetchOk(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return (await fetch(url, { signal: ac.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 杀整个进程树：npm → cmd → nest → node 好几层，只杀最外层会留下占端口的孤儿。 */
function killTree(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (isWin) {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
  }
}

function spawnBg(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    shell: shellFor(cmd),
    stdio: 'inherit',
    detached: !isWin,
    ...opts,
  });
}

/** 等子进程退出，最多 5 秒。定时器要手动 clear，否则脚本会空等到超时。 */
async function exited(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** 端口是不是已经被占了。用「连一下」而不是「绑一下」：绑定会触发 Windows 防火墙弹窗。 */
function portInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const sock = connect({ port, host });
    const timer = setTimeout(() => done(false), 1000);
    const done = (v) => {
      clearTimeout(timer);
      sock.destroy();
      resolve(v);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

/** 从 DATABASE_URL 里取 host / port。 */
function databaseTarget() {
  const raw = (valueFromEnvFile('DATABASE_URL') ?? 'postgresql://app:app@localhost:5432/app').replace(
    /^postgres(ql)?:\/\//,
    'http://',
  );
  try {
    const url = new URL(raw);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    return { host: 'localhost', port: 5432 };
  }
}

function valueFromEnvFile(key) {
  const file = join(BACKEND, '.env');
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match?.[1]?.trim();
}

/** 等数据库端口就绪。 */
async function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portInUse(port, host)) return true;
    await sleep(500);
  }
  return false;
}

/** 确保 PostgreSQL 在跑；本机没有 docker 时给出可执行的提示。 */
async function ensureDatabase() {
  const { host, port } = databaseTarget();
  if (await portInUse(port, host)) {
    // 端口通不代表是本项目的库：别的 postgres 也监听同一端口时，迁移会跑进别人的库。
    console.log(`PostgreSQL ${host}:${port} 已有实例，直接复用 —— 确认它是本项目的库`);
    return;
  }

  console.log(`PostgreSQL ${host}:${port} 没在跑，尝试用 docker compose 起本地实例…`);
  const compose = spawnSync(
    'docker',
    // --wait：等 healthcheck（pg_isready）通过再返回。只探端口不够 ——
    // docker 的端口映射在 postgres 初始化完成前就已经开放，迁移会踩到半启动的实例。
    ['compose', '-f', join(ROOT, 'compose.dev.yml'), 'up', '-d', '--wait'],
    { stdio: 'inherit', shell: false },
  );
  if (compose.error || compose.status !== 0) {
    die(
      `数据库连不上，docker 也没能启动它。\n` +
        `请手动起一个 PostgreSQL，或在有 docker 的机器上执行：\n` +
        `  docker compose -f compose.dev.yml up -d --wait\n` +
        `然后确认 backend/.env 的 DATABASE_URL 指向它。`,
    );
  }

  if (!(await waitForPort(host, port, 60_000))) {
    die(`等了 60 秒，PostgreSQL ${host}:${port} 仍不可达。看 docker compose logs postgres。`);
  }
}

async function serve() {
  if (await portInUse(API_PORT)) {
    const howToFind = isWin ? `netstat -ano | findstr :${API_PORT}` : `lsof -i :${API_PORT}`;
    die(
      `端口 ${API_PORT} 已被占用，后端起不来。\n` +
        `多半是上一次 dev.mjs 的孤儿进程还活着。先查是谁占的：${howToFind}\n` +
        (isWin ? '再杀它：taskkill /PID <上面查到的PID> /T /F' : '再杀它：kill <上面查到的PID>'),
    );
  }

  console.log(`\n  后端      http://127.0.0.1:${API_PORT}/api`);
  console.log('  前端      另开一个终端：cd frontend && npm run dev');
  console.log(
    `  数据库    ${valueFromEnvFile('DATABASE_URL') ?? 'backend/.env 的 DATABASE_URL'}`,
  );
  console.log('  Ctrl+C    停后端\n');

  const proc = spawnBg('npm', ['run', 'start:dev'], { cwd: BACKEND });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    killTree(proc);
  };
  let interrupted = false;
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      interrupted = true;
    });
  }
  process.on('exit', stop);

  const deadline = Date.now() + 90_000;
  let announced = false;
  try {
    while (proc.exitCode === null && !interrupted) {
      if (!announced && (await fetchOk(HEALTH_URL, 2000))) {
        announced = true;
        console.log(`\n  ✅ 已就绪（后端 + PostgreSQL）：${HEALTH_URL}\n`);
      } else if (!announced && Date.now() > deadline) {
        announced = true;
        console.log(
          '\n  ⚠️ 90 秒没等到 /api/health。\n' +
            '     先翻上面的编译/启动日志；后端确实起来了还不通，就核对 backend/.env 的 DATABASE_URL。\n',
        );
      }
      await sleep(500);
    }
    if (!interrupted) console.log('\n后端进程自己退了，往上翻日志看原因。');
  } finally {
    stop();
    await exited(proc);
  }
}

/**
 * 把 `backend/.env` 对齐到模板：**缺哪个 key 补哪个，已有值一律不动**。
 * 追加而不是重写，避免覆盖手改过的值。
 */
function syncEnv(envFile) {
  const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  if (!existing) {
    writeFileSync(envFile, envTemplate().map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    console.log(`已生成 ${relative(ROOT, envFile)}（不进 git）`);
    return;
  }
  const have = new Set([...existing.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const missing = envTemplate().filter(([k]) => !have.has(k));
  if (missing.length === 0) return;
  const day = new Date().toISOString().slice(0, 10);
  appendFileSync(
    envFile,
    `\n# ---- 以下 key 由 dev.mjs 于 ${day} 补齐（只补缺失的，已有值未改动）----\n` +
      missing.map(([k, v]) => `${k}=${v}`).join('\n') +
      '\n',
  );
  console.log(`已补齐 ${relative(ROOT, envFile)} 的 ${missing.length} 个缺失 key`);
}

async function up() {
  syncEnv(join(BACKEND, '.env'));
  await ensureDatabase();

  if (!existsSync(join(BACKEND, 'node_modules'))) {
    console.log('首次运行，装后端依赖（几分钟）');
    run('npm', ['install'], { cwd: BACKEND });
  }
  if (!existsSync(join(FRONTEND, 'node_modules'))) {
    console.log('首次运行，装前端依赖（几分钟）');
    run('npm', ['install'], { cwd: FRONTEND });
  }

  // 迁移在起服务之前跑一次。生产由 compose 的独立 migrate 服务承担同一件事。
  run('npm', ['run', 'migration:run'], { cwd: BACKEND });

  await serve();
}

const cmd = process.argv[2] ?? 'up';
if (cmd === 'up') {
  await up();
} else {
  console.log('用法：node dev.mjs      对齐 .env + 起数据库 + 跑迁移 + 起后端');
}
