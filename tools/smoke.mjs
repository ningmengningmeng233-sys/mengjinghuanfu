#!/usr/bin/env node
// 梦境换肤 Q-2 端到端冒烟脚本（方案 §6 Q-2、§7.7 R-3）
//
// 分两段：
//   A 段（无副作用段，默认跑）：在任何 Windows 机器上可跑。全程把数据目录重定向到
//     临时目录（DREAMSKIN_DATA_DIR 与 LOCALAPPDATA 都指向临时区，并有断言守住），
//     只做：构建并校验发布包（结构 + manifest 哈希）、用包内 Node 跑入口的无应用
//     形态命令（presets / schema / status / apps-status / 失败形态）、check-version、
//     Node 全套单测、重建总控台的无界面只读命令（--selfcheck-u1/u2/u3、
//     --which-node、--resolve-aumid）。不启动、不关闭、不修改任何目标应用；
//     不碰用户真实数据目录（跑完用前后快照比对证明）。
//   B 段（应用段，默认不跑）：只有显式加 --with-apps 才执行。会带调试端口启动
//     目标应用，依次做 apply → check → live 改一个参数 → restore，并抓截图。
//     请只在装有目标应用的虚拟机里、或经主人同意的真机上使用。B 段同样使用
//     临时数据目录（只重定向 DREAMSKIN_DATA_DIR；不重定向 LOCALAPPDATA——真机
//     实测重定向后入口连不上应用，见 main 里 childEnvApps 的注释），不动产品真实
//     数据；应用已在运行且没带调试端口时不会强杀，
//     只会如实记录（加 --restart-apps 才允许入口按其既有口径重启应用）。
//
// 用法：
//   node tools/smoke.mjs [--build] [--payload <路径>] [--launcher <exe 路径>]
//                        [--report <报告路径>] [--keep-tmp]
//   node tools/smoke.mjs --with-apps [--apps cherry,zcode] [--restart-apps]
//                        [--report <报告路径>]
//
// 退出码：0 = 已跑部分全 PASS（B 段未跑的 SKIPPED 不算失败）；
//         1 = 有 FAIL；2 = 参数或环境错误。
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, platform, release, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = { build: false, withApps: false, restartApps: false, keepTmp: false, payload: '', launcher: '', report: '', apps: 'cherry,zcode' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--build') o.build = true;
    else if (a === '--with-apps') o.withApps = true;
    else if (a === '--restart-apps') o.restartApps = true;
    else if (a === '--keep-tmp') o.keepTmp = true;
    else if (a === '--payload' && v) { o.payload = v; i++; }
    else if (a === '--launcher' && v) { o.launcher = v; i++; }
    else if (a === '--report' && v) { o.report = v; i++; }
    else if (a === '--apps' && v) { o.apps = v; i++; }
    else throw new Error('不认识的参数：' + a);
  }
  return o;
}

// ---------- 通用小工具 ----------

function run(cmd, args, { cwd = repoRoot, env = null, timeoutMs = 60000 } = {}) {
  return new Promise((resolveRun) => {
    let child;
    try { child = spawn(cmd, args, { cwd, env: env || process.env, windowsHide: true }); }
    catch (e) { resolveRun({ code: -1, out: '', err: String(e), timedOut: false }); return; }
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolveRun({ code: -1, out, err: err + String(e), timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolveRun({ code, out, err, timedOut }); });
    try { child.stdin.end(); } catch {}
  });
}

const scrubPairs = [];
function addScrub(abs, label) {
  if (!abs) return;
  const esc = abs.replaceAll('\\', '\\\\');
  if (esc !== abs) scrubPairs.push([esc, label]);
  scrubPairs.push([abs, label]);
  const alt = abs.replaceAll('\\', '/');
  if (alt !== abs) scrubPairs.push([alt, label]);
}
function scrub(text) {
  let t = String(text ?? '');
  for (const [p, label] of scrubPairs) t = t.split(p).join(label);
  return t;
}

const results = [];
function record(section, name, status, detail = '') {
  const d = scrub(String(detail).replace(/\s*\r?\n\s*/g, ' / ')).slice(0, 400);
  results.push({ section, name, status, detail: d });
  console.log(`[${section}] ${status} ${name}${d ? ' — ' + d : ''}`);
}

function lastJson(text) {
  // 先整段解析（apps-status 是多行美化 JSON，逐行扫会误命中数组里的标量行），再逐行兜底
  try { return JSON.parse(String(text).trim()); } catch {}
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  return null;
}

function dirSnapshot(root) {
  const map = new Map();
  let errors = 0;
  if (!root || !existsSync(root)) return { map, errors };
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { errors++; return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        try { const s = statSync(p); map.set(relative(root, p), s.size + ':' + Math.round(s.mtimeMs)); } catch { errors++; }
      }
    }
  };
  walk(root);
  return { map, errors };
}
// 快照在独立子进程里拍：长驻进程在跑完构建 + 全套单测后，本进程内对真实目录的
// stat 曾出现整目录读不到的异常（existsSync 返回 false、0 读取错误，目录本身完好、
// 独立进程每次都能正常读）。检查的是「目录有没有变」，用干净进程拍才可靠。
const SNAPSHOT_PROGRAM = `
const { existsSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const root = process.argv[1];
const map = {}; let errors = 0;
if (root && existsSync(root)) {
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { errors++; return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { const s = statSync(p); map[relative(root, p)] = s.size + ':' + Math.round(s.mtimeMs); } catch { errors++; } }
    }
  };
  walk(root);
}
process.stdout.write(JSON.stringify({ map, errors }));
`;
function dirSnapshotFresh(root) {
  try {
    const r = spawnSync(process.execPath, ['-e', SNAPSHOT_PROGRAM, root], { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    if (r.status === 0 && r.stdout) {
      const j = JSON.parse(r.stdout);
      return { map: new Map(Object.entries(j.map || {})), errors: j.errors || 0 };
    }
  } catch {}
  return dirSnapshot(root);
}

function snapshotDiff(before, after) {
  const diffs = [];
  for (const [k, v] of after) {
    if (!before.has(k)) diffs.push('新增 ' + k);
    else if (before.get(k) !== v) diffs.push('变化 ' + k);
  }
  for (const k of before.keys()) if (!after.has(k)) diffs.push('消失 ' + k);
  return diffs;
}

// ---------- A 段：无副作用 ----------

function verifyPayload(payloadAbs) {
  const manifest = JSON.parse(readFileSync(join(payloadAbs, 'payload-manifest.json'), 'utf8'));
  const problems = [];
  const listed = new Set();
  for (const f of manifest.files || []) {
    listed.add(f.path);
    const p = join(payloadAbs, ...String(f.path).split('/'));
    if (!existsSync(p)) { problems.push('缺文件 ' + f.path); continue; }
    const buf = readFileSync(p);
    if (buf.length !== f.size) problems.push('大小不符 ' + f.path);
    else if (createHash('sha256').update(buf).digest('hex') !== f.sha256) problems.push('哈希不符 ' + f.path);
    if (problems.length > 12) break;
  }
  for (const req of ['dreamskin.mjs', 'skin-cherry.mjs', 'runtime/node.exe', 'LICENSE']) {
    if (!listed.has(req)) problems.push('清单缺必需项 ' + req);
  }
  if (manifest.platform === 'win32' && listed.has('panel.mjs')) problems.push('win32 包不应含 panel.mjs');
  if (!manifest.runtime || !manifest.runtime.version) problems.push('manifest 缺 runtime 版本');
  return { manifest, problems };
}

async function sectionA(ctx) {
  const { opts, payloadAbs, childEnv, tmpRoot } = ctx;

  // A1 发布包构建（或使用既有产物）
  if (opts.build) {
    const rel = relative(repoRoot, payloadAbs);
    const r = await run(process.execPath, ['tools/build-payload.mjs', '--platform', 'win32', '--out', rel], { timeoutMs: 300000 });
    record('A', '发布包构建（build-payload win32）', r.code === 0 ? 'PASS' : 'FAIL',
      r.code === 0 ? String(r.out).trim().split(/\r?\n/).pop() : '退出码 ' + r.code + '：' + String(r.err || r.out).trim().split(/\r?\n/).pop());
    if (r.code !== 0) ctx.payloadOk = false;
  } else if (existsSync(join(payloadAbs, 'payload-manifest.json'))) {
    record('A', '发布包构建（build-payload win32）', 'PASS', '未加 --build，使用既有 payload 产物');
  } else {
    record('A', '发布包构建（build-payload win32）', 'FAIL', 'payload 不存在（加 --build 或先运行 tools/build-payload.mjs）');
    ctx.payloadOk = false;
  }

  // A2 结构与 manifest 哈希
  if (ctx.payloadOk) {
    try {
      const { manifest, problems } = verifyPayload(payloadAbs);
      ctx.manifest = manifest;
      record('A', '发布包结构与 manifest 哈希校验', problems.length ? 'FAIL' : 'PASS',
        problems.length ? problems.slice(0, 5).join('；') : `清单 ${manifest.files.length} 个文件，大小与 SHA-256 全对，版本 ${manifest.version}，平台 ${manifest.platform}`);
      if (problems.length) ctx.payloadOk = false;
    } catch (e) {
      record('A', '发布包结构与 manifest 哈希校验', 'FAIL', '读 manifest 失败：' + e.message);
      ctx.payloadOk = false;
    }
  } else {
    record('A', '发布包结构与 manifest 哈希校验', 'SKIP', '发布包不可用');
  }

  const nodeExe = join(payloadAbs, 'runtime', 'node.exe');
  const entry = join(payloadAbs, 'dreamskin.mjs');

  // A3 包内 Node 版本与 manifest 一致
  if (ctx.payloadOk) {
    const r = await run(nodeExe, ['--version'], { timeoutMs: 30000 });
    const v = String(r.out).trim();
    record('A', '包内 Node 运行时版本', r.code === 0 && v === ctx.manifest.runtime.version ? 'PASS' : 'FAIL',
      `runtime/node.exe --version = ${v || '(无输出)'}，manifest 记录 ${ctx.manifest.runtime.version}`);
  } else record('A', '包内 Node 运行时版本', 'SKIP', '发布包不可用');

  // A4 数据目录隔离断言：用 payload 自带的 env.mjs 按子进程同样的环境变量解析
  if (ctx.payloadOk) {
    const saved = { d: process.env.DREAMSKIN_DATA_DIR, l: process.env.LOCALAPPDATA };
    process.env.DREAMSKIN_DATA_DIR = childEnv.DREAMSKIN_DATA_DIR;
    process.env.LOCALAPPDATA = childEnv.LOCALAPPDATA;
    try {
      const envMod = await import(pathToFileURL(join(payloadAbs, 'core', 'env.mjs')).href);
      const cherryDir = resolve(envMod.dataDir('cherry'));
      const root = resolve(envMod.rootDir());
      const inTmp = (p) => (p.toLowerCase() + sep).startsWith((tmpRoot.toLowerCase() + sep));
      const okDir = inTmp(cherryDir) && inTmp(root) && cherryDir === resolve(childEnv.DREAMSKIN_DATA_DIR);
      record('A', '数据目录隔离断言（env.mjs 按临时环境解析）', okDir ? 'PASS' : 'FAIL',
        `rootDir=${root}，dataDir(cherry)=${cherryDir}`);
    } catch (e) {
      record('A', '数据目录隔离断言（env.mjs 按临时环境解析）', 'FAIL', e.message);
    } finally {
      if (saved.d === undefined) delete process.env.DREAMSKIN_DATA_DIR; else process.env.DREAMSKIN_DATA_DIR = saved.d;
      if (saved.l === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = saved.l;
    }
  } else record('A', '数据目录隔离断言（env.mjs 按临时环境解析）', 'SKIP', '发布包不可用');

  // A5-A10 入口命令（全部用包内 Node + 临时数据目录，不连任何应用）
  const entryRun = (args, timeoutMs = 60000) => run(nodeExe, [entry, ...args], { cwd: tmpRoot, env: childEnv, timeoutMs });
  if (ctx.payloadOk) {
    let r = await entryRun(['presets']);
    let j = lastJson(r.out);
    record('A', '入口 presets（包内 Node）', r.code === 0 && j && j.count > 0 ? 'PASS' : 'FAIL',
      `退出码 ${r.code}，预设数 ${j ? j.count : '?'}`);
    if (j) ctx.presets = j;

    r = await entryRun(['schema']);
    j = lastJson(r.out);
    record('A', '入口 schema（包内 Node）', r.code === 0 && j && typeof j === 'object' && 'defaults' in j ? 'PASS' : 'FAIL',
      `退出码 ${r.code}，输出 ${j ? 'JSON 结构正常（含 defaults）' : '无法解析'}`);
    if (j) ctx.schema = j;

    r = await entryRun(['status', '--app', 'cherry']);
    j = lastJson(r.out);
    record('A', '入口 status --app cherry（无应用形态）', r.code === 0 && j && j.app === 'cherry' && typeof j.running === 'boolean' && 'version' in j ? 'PASS' : 'FAIL',
      `退出码 ${r.code}，running=${j ? j.running : '?'}，skinActive=${j ? j.skinActive : '?'}`);

    r = await entryRun(['apps-status'], 180000);
    j = lastJson(r.out);
    record('A', '入口 apps-status（全部适配器只读聚合）', r.code === 0 && j && Array.isArray(j.apps) && j.apps.length >= 6 ? 'PASS' : 'FAIL',
      `退出码 ${r.code}，应用数 ${j && Array.isArray(j.apps) ? j.apps.length : '?'}`);

    r = await entryRun(['status', '--app', 'no-such-app']);
    record('A', '失败形态：未知 --app 被拒', r.code === 1 && /Unknown adapter/.test(r.out + r.err) ? 'PASS' : 'FAIL',
      `退出码 ${r.code}，输出含 Unknown adapter=${/Unknown adapter/.test(r.out + r.err)}`);

    r = await entryRun(['check', '--app', 'cherry']);
    j = lastJson(r.out);
    record('A', '失败形态：check 在未用梦境换肤启动时如实报 ok:false', r.code === 1 && j && j.ok === false && Array.isArray(j.problems) && j.problems.length > 0 ? 'PASS' : 'FAIL',
      `退出码 ${r.code}，problems=${j && Array.isArray(j.problems) ? j.problems.join('；') : '?'}`);
  } else {
    for (const n of ['入口 presets（包内 Node）', '入口 schema（包内 Node）', '入口 status --app cherry（无应用形态）', '入口 apps-status（全部适配器只读聚合）', '失败形态：未知 --app 被拒', '失败形态：check 在未用梦境换肤启动时如实报 ok:false']) {
      record('A', n, 'SKIP', '发布包不可用');
    }
  }

  // A11 版本口径校验
  {
    const r = await run(process.execPath, ['tools/check-version.mjs'], { timeoutMs: 60000 });
    const passN = (String(r.out).match(/^PASS:/gm) || []).length;
    const failN = (String(r.out).match(/^FAIL:/gm) || []).length;
    record('A', 'check-version 版本口径', r.code === 0 && failN === 0 ? 'PASS' : 'FAIL', `PASS ${passN} 项 / FAIL ${failN} 项，退出码 ${r.code}`);
  }

  // A12 Node 全套单测
  {
    const files = readdirSync(join(repoRoot, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join('tests', f));
    const r = await run(process.execPath, ['--test', ...files], { timeoutMs: 900000 });
    const text = r.out + r.err;
    const grab = (label) => { const m = text.match(new RegExp('(?:ℹ |# )' + label + ' (\\d+)')); return m ? Number(m[1]) : null; };
    const t = grab('tests'), p = grab('pass'), f = grab('fail');
    record('A', 'Node 全套单测', r.code === 0 && f === 0 ? 'PASS' : 'FAIL',
      `tests ${t ?? '?'} / pass ${p ?? '?'} / fail ${f ?? '?'}，退出码 ${r.code}${r.timedOut ? '（超时被终止）' : ''}`);
    ctx.testCounts = { t, p, f };
  }

  // A13-A15 重建总控台无界面只读命令
  const exe = ctx.launcherExe;
  if (!exe) {
    for (const n of ['总控台 --selfcheck-u1', '总控台 --selfcheck-u2', '总控台 --selfcheck-u3', '总控台 --which-node（Node 定位诊断）', '总控台 --resolve-aumid（Codex 包解析）']) {
      record('A', n, 'FAIL', '未找到重建总控台 exe（先运行 tools/build-launcher.ps1，或用 --launcher 指定）');
    }
  } else {
    for (const u of ['u1', 'u2', 'u3']) {
      const r = await run(exe, ['--selfcheck-' + u], { cwd: tmpRoot, env: childEnv, timeoutMs: 120000 });
      const m = String(r.out).match(new RegExp('SELFCHECK-' + u.toUpperCase() + ':\\s*(\\d+)\\/(\\d+)\\s+PASS'));
      record('A', '总控台 --selfcheck-' + u, r.code === 0 && m ? 'PASS' : 'FAIL',
        m ? `自检 ${m[1]}/${m[2]} PASS` : `退出码 ${r.code}，输出尾：${String(r.out + r.err).trim().split(/\r?\n/).pop() || '(无)'}`);
    }
    {
      const r = await run(exe, ['--which-node'], { cwd: tmpRoot, env: childEnv, timeoutMs: 60000 });
      const firstLine = String(r.out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || '';
      record('A', '总控台 --which-node（Node 定位诊断）', r.code === 0 && /node/i.test(r.out) ? 'PASS' : 'FAIL',
        `退出码 ${r.code}，首行：${firstLine}`);
    }
    {
      let family = '', exeName = '';
      try {
        const aj = JSON.parse(readFileSync(join(repoRoot, 'src', 'adapters', 'codex', 'adapter.json'), 'utf8'));
        family = aj.discover?.msixPackageFamily || '';
        exeName = (aj.discover?.exeNames || [])[0] || '';
      } catch {}
      if (!family) {
        record('A', '总控台 --resolve-aumid（Codex 包解析）', 'FAIL', 'codex adapter.json 里没有 msixPackageFamily');
      } else {
        const r = await run(exe, ['--resolve-aumid', family, ...(exeName ? ['--exe', exeName] : [])], { cwd: tmpRoot, env: childEnv, timeoutMs: 120000 });
        if (r.code === 0) {
          const j = lastJson(r.out);
          const aumid = j ? String(j.Aumid || j.aumid || '') : '';
          record('A', '总控台 --resolve-aumid（Codex 包解析）', aumid.includes(family) ? 'PASS' : 'FAIL',
            aumid ? 'AUMID=' + aumid : '退出码 0 但输出里没有 AUMID：' + String(r.out).trim().split(/\r?\n/).pop());
        } else if (r.code === 1) {
          record('A', '总控台 --resolve-aumid（Codex 包解析）', 'PASS',
            '本机未装该 MSIX 包，解析器以退出码 1 如实报告（stderr：' + String(r.err).trim().split(/\r?\n/)[0] + '）');
        } else {
          record('A', '总控台 --resolve-aumid（Codex 包解析）', 'FAIL', '退出码 ' + r.code);
        }
      }
    }
  }
}

// ---------- B 段：应用段（只在 --with-apps 时执行，本批不跑） ----------

function pickLiveSetting(schema) {
  const seen = new Set();
  let found = null;
  const visit = (v, depth) => {
    if (found || depth > 4 || !v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (typeof v.id === 'string' && Number.isFinite(v.min) && Number.isFinite(v.max) && Number.isFinite(v.default)) { found = v; return; }
    for (const k of Object.keys(v)) visit(v[k], depth + 1);
  };
  visit(schema, 0);
  if (!found) return null;
  const step = Number.isFinite(found.step) && found.step > 0 ? found.step : 1;
  let value = found.default + step;
  if (value > found.max) value = found.default - step;
  if (value < found.min || value > found.max) value = found.default;
  return { id: found.id, value };
}

async function screenshot(port, appId, outFile) {
  const { fetchCdpJson, CdpSession } = await import('../src/core/cdp-core.mjs');
  const { appRuntimeById } = await import('../src/core/app-runtime.mjs');
  const targets = await fetchCdpJson(port, '/json/list');
  const profile = appRuntimeById(appId);
  const pages = (Array.isArray(targets) ? targets : []).filter((t) => t && t.type === 'page' && t.webSocketDebuggerUrl && profile.isMainTarget(t, port));
  if (!pages.length) throw new Error('没找到主窗口目标');
  const session = await new CdpSession(pages[0], port).open();
  try {
    const r = await session.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(outFile, Buffer.from(r.data, 'base64'));
  } finally { session.close(); }
}

function runLive(nodeExe, entry, appId, env, cwd, setting) {
  return new Promise((resolveLive) => {
    const child = spawn(nodeExe, [entry, 'live', '--app', appId], { env, cwd, windowsHide: true });
    let buf = '';
    const waiters = [];
    const timer = setTimeout(() => finish({ ok: false, msg: 'live 会话超时' }), 90000);
    function finish(r) { clearTimeout(timer); try { child.kill(); } catch {} resolveLive(r); }
    child.stdout.on('data', (d) => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg = null;
        try { msg = JSON.parse(line); } catch {}
        if (msg) {
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].pred(msg)) { const w = waiters.splice(i, 1)[0]; w.resolve(msg); }
          }
        }
      }
    });
    child.on('error', (e) => finish({ ok: false, msg: String(e) }));
    const waitFor = (pred, ms) => new Promise((res, rej) => {
      const w = { pred, resolve: res };
      waiters.push(w);
      setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); rej(new Error('等待回复超时')); } }, ms);
    });
    const send = (obj) => { try { child.stdin.write(JSON.stringify(obj) + '\n'); } catch {} };
    (async () => {
      try {
        const hello = await waitFor((m) => m.op === 'hello', 45000);
        if (!hello.ok) return finish({ ok: false, msg: 'hello 失败：' + (hello.msg || hello.code || '') });
        send({ op: 'set', values: { [setting.id]: setting.value } });
        const setR = await waitFor((m) => m.op === 'set', 30000);
        if (!setR.ok) return finish({ ok: false, msg: 'set 失败：' + (setR.msg || '') });
        send({ op: 'cancel' });
        let cancelOk = null;
        try { const c = await waitFor((m) => m.op === 'cancel', 15000); cancelOk = !!c.ok; } catch { cancelOk = null; }
        send({ op: 'quit' });
        setTimeout(() => finish({ ok: true, cancelOk }), 3000);
      } catch (e) { finish({ ok: false, msg: e.message }); }
    })();
  });
}

async function sectionB(ctx) {
  const { opts, payloadAbs, childEnvApps, tmpRoot } = ctx;
  const apps = String(opts.apps || 'cherry,zcode').split(',').map((s) => s.trim()).filter(Boolean);
  if (!opts.withApps) {
    for (const app of apps) {
      record('B', `应用段 ${app}（apply → check → live 改参 → restore + 截图）`, 'SKIP',
        '未加 --with-apps：应用段会带调试端口启动目标应用，只在装有目标应用的虚拟机或经主人同意的真机上运行');
    }
    record('B', '虚拟机断网首跑（V-T0-6：断网全新 Win10/11 首次运行总控台即可换肤）', 'SKIP', '需干净虚拟机 + 断网环境，见证据文件里的 B 段清单');
    record('B', '总控台 GUI 目视与高 DPI（U 系列目视项、V-U4 150%/200%）', 'SKIP', '需真人目视，见证据文件里的 B 段清单');
    return;
  }
  const nodeExe = join(payloadAbs, 'runtime', 'node.exe');
  const entry = join(payloadAbs, 'dreamskin.mjs');
  const entryRun = (args, timeoutMs = 60000) => run(nodeExe, [entry, ...args], { cwd: tmpRoot, env: childEnvApps, timeoutMs });
  const shotsDir = join(dirname(ctx.reportAbs), 'smoke-shots');
  mkdirSync(shotsDir, { recursive: true });

  let presetKey = '';
  {
    const list = (ctx.presets && ctx.presets.palettes) || [];
    const pick = list.find((p) => p.group === 'builtin') || list[0];
    presetKey = pick ? pick.key : '';
  }
  const setting = pickLiveSetting(ctx.schema);

  for (const app of apps) {
    const tag = `应用段 ${app}`;
    try {
      const applyArgs = ['apply', '--app', app, ...(presetKey ? ['--preset', presetKey] : []), ...(opts.restartApps ? ['--restart'] : [])];
      const ra = await entryRun(applyArgs, 240000);
      if (ra.code === 3) {
        record('B', `${tag} apply`, 'SKIP', '应用已在运行且未带调试端口（退出码 3）：先手动退出该应用，或加 --restart-apps 后重跑');
        continue;
      }
      record('B', `${tag} apply`, ra.code === 0 ? 'PASS' : 'FAIL', `退出码 ${ra.code}，输出尾：${String(ra.out + ra.err).trim().split(/\r?\n/).pop() || '(无)'}`);
      if (ra.code !== 0) continue;

      const rs = await entryRun(['status', '--app', app]);
      const st = lastJson(rs.out);
      const port = st ? Number(st.debugPort) || 0 : 0;

      const rc = await entryRun(['check', '--app', app], 120000);
      const cj = lastJson(rc.out);
      record('B', `${tag} check`, rc.code === 0 && cj && cj.ok === true ? 'PASS' : 'FAIL',
        `退出码 ${rc.code}，ok=${cj ? cj.ok : '?'}，mode=${cj ? cj.mode : '?'}，partsOk=${cj ? cj.partsOk : '?'}，contrast=${cj && cj.info ? cj.info.contrast : '?'}`);

      if (port) {
        try {
          const f = join(shotsDir, app + '-apply.png');
          await screenshot(port, app, f);
          record('B', `${tag} 截图（apply 后）`, 'PASS', '已保存 ' + relative(dirname(ctx.reportAbs), f));
        } catch (e) { record('B', `${tag} 截图（apply 后）`, 'FAIL', e.message); }
      } else record('B', `${tag} 截图（apply 后）`, 'SKIP', 'status 没给出调试端口');

      if (setting) {
        const lr = await runLive(nodeExe, entry, app, childEnvApps, tmpRoot, setting);
        record('B', `${tag} live 改参（${setting.id} → ${setting.value}，随后 cancel 撤销）`, lr.ok ? 'PASS' : 'FAIL',
          lr.ok ? `set 已生效，cancel=${lr.cancelOk === null ? '未确认' : lr.cancelOk}` : lr.msg);
      } else record('B', `${tag} live 改参`, 'SKIP', 'schema 里没有可调的数值参数');

      const rr = await entryRun(['restore', '--app', app], 120000);
      const rs2 = await entryRun(['status', '--app', app]);
      const st2 = lastJson(rs2.out);
      record('B', `${tag} restore`, rr.code === 0 && st2 && st2.skinActive === false ? 'PASS' : 'FAIL',
        `restore 退出码 ${rr.code}，restore 后 skinActive=${st2 ? st2.skinActive : '?'}`);

      if (port) {
        try {
          const f = join(shotsDir, app + '-restored.png');
          await screenshot(port, app, f);
          record('B', `${tag} 截图（restore 后）`, 'PASS', '已保存 ' + relative(dirname(ctx.reportAbs), f));
        } catch (e) { record('B', `${tag} 截图（restore 后）`, 'SKIP', 'restore 后页面目标不可达：' + e.message); }
      }
    } catch (e) {
      record('B', `${tag}（整应用流程）`, 'FAIL', e.message);
    }
  }
}

// ---------- 报告与主流程 ----------

function buildReport(ctx) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const cell = (s) => String(s || '').replaceAll('|', '/');
  const table = (sec) => {
    const rows = results.filter((r) => r.section === sec);
    if (!rows.length) return '（无）\n';
    let t = '| # | 检查 | 结果 | 证据摘要 |\n|---|---|---|---|\n';
    rows.forEach((r, i) => { t += `| ${i + 1} | ${cell(r.name)} | ${r.status} | ${cell(r.detail)} |\n`; });
    return t;
  };
  const lines = [];
  lines.push('# 梦境换肤 Q-2 冒烟报告');
  lines.push('');
  lines.push(`- 时间：${new Date().toISOString()}`);
  lines.push(`- 环境：${platform()} ${release()}，脚本 Node ${process.version}，payload 版本 ${ctx.manifest ? ctx.manifest.version : '(未知)'}，包内 Node ${ctx.manifest && ctx.manifest.runtime ? ctx.manifest.runtime.version : '(未知)'}`);
  lines.push(`- 总控台：${ctx.launcherExe ? basename(ctx.launcherExe) + '（重建 exe，只跑无界面只读命令）' : '未找到'}`);
  lines.push('- 数据目录：全程重定向到临时目录（DREAMSKIN_DATA_DIR / LOCALAPPDATA），并有隔离断言与真实目录前后快照比对守住。');
  lines.push('');
  lines.push('## A 段（无副作用段）');
  lines.push('');
  lines.push(table('A'));
  lines.push('## B 段（应用段）');
  lines.push('');
  if (!ctx.opts.withApps) lines.push('本轮未加 --with-apps，B 段未执行；逐项原因如下。B 段完整操作清单见 证据/Q-2-端到端冒烟脚本.txt。');
  lines.push('');
  lines.push(table('B'));
  lines.push('## 汇总');
  lines.push('');
  lines.push(`PASS ${counts.PASS || 0} / FAIL ${counts.FAIL || 0} / SKIP ${counts.SKIP || 0}（脚本退出码 ${counts.FAIL ? 1 : 0}）`);
  lines.push('');
  return { text: lines.join('\n'), counts };
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error('参数错误：' + e.message + '（用法见脚本头注释）'); process.exit(2); }

  const payloadAbs = resolve(isAbsolute(opts.payload || '') ? opts.payload : join(repoRoot, opts.payload || 'build/payload-win'));
  // --build 时 payload 必须在仓库内（build-payload 的 --out 按仓库根拼接）
  if (opts.build && relative(repoRoot, payloadAbs).startsWith('..')) {
    console.error('参数错误：--build 时 --payload 必须在仓库目录内');
    process.exit(2);
  }
  const reportAbs = opts.report ? resolve(process.cwd(), opts.report) : join(repoRoot, 'build', 'smoke-report.md');

  const tmpRoot = mkdtempSync(join(tmpdir(), 'dreamskin-smoke-'));
  addScrub(repoRoot, '<repo>');
  addScrub(tmpRoot, '<tmp>');
  addScrub(homedir(), '<home>');
  const tmpDataRoot = join(tmpRoot, 'DreamSkin');
  const childEnv = { ...process.env, DREAMSKIN_DATA_DIR: join(tmpDataRoot, 'cherry'), LOCALAPPDATA: join(tmpRoot, 'LocalAppData') };
  // B 段专用环境：只重定向 DREAMSKIN_DATA_DIR（数据隔离靠它，env.mjs 优先认它），
  // 不重定向 LOCALAPPDATA。2026-11-05 真机对照实测：LOCALAPPDATA 一旦重定向，入口
  // apply 无法与应用建立调试连接（等待主窗口超时、fetch failed）；改回真实值后同
  // 一入口同应用 apply/check/restore 全通。A 段仍用带重定向的 childEnv 做隔离断言。
  const childEnvApps = { ...process.env, DREAMSKIN_DATA_DIR: join(tmpDataRoot, 'cherry') };

  const origLocalAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const realDataRoot = join(origLocalAppData, 'DreamSkin');
  const realBefore = dirSnapshotFresh(realDataRoot).map;

  const ctx = { opts, payloadAbs, childEnv, childEnvApps, tmpRoot, reportAbs, payloadOk: true, manifest: null, presets: null, schema: null, launcherExe: '' };
  ctx.launcherExe = opts.launcher ? resolve(opts.launcher) : (() => {
    const dir = join(repoRoot, 'src', 'launcher', 'bin', 'Release', 'net48');
    if (!existsSync(dir)) return '';
    const exes = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.exe')).sort();
    return exes.length ? join(dir, exes[0]) : '';
  })();

  await sectionA(ctx);
  await sectionB(ctx);

  // 收尾断言：真实数据目录全程未被触碰（A、B 两段都算）。
  // 个别文件可能被杀毒 / 索引短暂锁定导致一次读不到，出现差异时隔 1.5 秒复拍确认，最多两次。
  let afterSnap = dirSnapshotFresh(realDataRoot);
  let diffs = snapshotDiff(realBefore, afterSnap.map);
  for (let i = 0; i < 2 && diffs.length; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    afterSnap = dirSnapshotFresh(realDataRoot);
    diffs = snapshotDiff(realBefore, afterSnap.map);
  }
  record('A', '真实数据目录未被触碰（全程前后快照比对）', diffs.length ? 'FAIL' : 'PASS',
    diffs.length ? `共 ${diffs.length} 处差异（快照读取错误 ${afterSnap.errors} 次）：` + diffs.slice(0, 5).join('；') : `真实数据目录 ${realBefore.size} 个文件，跑完无新增 / 变化 / 消失（快照读取错误 ${afterSnap.errors} 次）`);

  if (!opts.keepTmp) { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {} }

  const { text, counts } = buildReport(ctx);
  mkdirSync(dirname(reportAbs), { recursive: true });
  writeFileSync(reportAbs, text, 'utf8');
  console.log(`报告已写入 ${scrub(reportAbs)}`);
  console.log(`汇总：PASS ${counts.PASS || 0} / FAIL ${counts.FAIL || 0} / SKIP ${counts.SKIP || 0}`);
  process.exit(counts.FAIL ? 1 : 0);
}

main().catch((e) => { console.error('冒烟脚本自身出错：' + (e && e.stack || e)); process.exit(2); });
