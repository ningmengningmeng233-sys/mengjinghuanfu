// 找到 / 关闭 / 带调试端口启动一个 Electron 应用（Cherry Studio、ZCode 共用）。
// 思路取自 Fei-Away/Codex-Dream-Skin 的 Windows 启动流程：
// 正常关闭 → 随机空闲端口 → --remote-debugging-port 启动 → 轮询 /json/list 等主窗口。
// 应用差异全部放在 profile（lib/apps.mjs）里：exe 名、安装位置、主进程判定、主窗口判定。
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fetchCdpJson } from './cdp-core.mjs';

function ps(script, timeout = 15000) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script],
  { encoding: 'utf8', windowsHide: true, timeout }).trim();
}

// 同名进程里，主进程 = 命令行没有 --type=（渲染/GPU 子进程），且 profile 没把它判成后台进程
// （例如 ZCode 用 ELECTRON_RUN_AS_NODE 跑的 app-server / plugin-host）。
export function listProcesses(app) {
  if (process.platform === 'darwin') return listProcessesMac(app);
  try {
    const out = ps(`@(Get-CimInstance Win32_Process -Filter "Name='${app.exeName}'" | ` +
      `Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress`);
    if (!out) return [];
    const data = JSON.parse(out);
    return (Array.isArray(data) ? data : [data]).map((p) => {
      const cmd = p.CommandLine || '';
      return { pid: p.ProcessId, path: p.ExecutablePath || '', cmd,
        isMain: !/\s--type=/.test(cmd) && !(app.isHelperCmd && app.isHelperCmd(cmd)) };
    });
  } catch {
    return [];
  }
}

// macOS：ps 列出全部进程，只认「<名字>.app/Contents/MacOS/<名字>」这个主程序（Helper 子进程在 Frameworks 里，路径不同）。
function listProcessesMac(app) {
  try {
    const out = execFileSync('/bin/ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8', timeout: 10000 });
    const tail = `.app/Contents/MacOS/${app.exeName}`;
    const res = [];
    for (const line of out.split('\n')) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (!m) continue;
      const cmd = m[2], k = cmd.indexOf(tail);
      if (k < 0) continue;
      const next = cmd.charAt(k + tail.length);
      if (next && next !== ' ') continue; // 名字是别的程序的前缀
      res.push({ pid: Number(m[1]), path: cmd.slice(0, k + tail.length), cmd,
        isMain: !/\s--type=/.test(cmd) && !(app.isHelperCmd && app.isHelperCmd(cmd)) });
    }
    return res;
  } catch {
    return [];
  }
}

export function debugPortOf(proc) {
  const m = /--remote-debugging-port=(\d{2,5})/.exec(proc?.cmd || '');
  return m ? Number(m[1]) : 0;
}

// exe 路径：环境变量 → 正在运行的进程 → 常见安装位置 → 卸载注册表（InstallLocation）。
// 注册表这一步抽成可注入的纯逻辑（deps.queryInstallLocation / deps.exists），方便单测模拟注册表返回，不依赖真机。
export function exeFromInstallLocation(loc, exeName, exists = existsSync) {
  if (!loc) return '';
  const p = join(loc, exeName);
  return exists(p) ? p : '';
}
function registryInstallLocation(app) {
  const out = ps("$k = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
    "'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | " +
    `Where-Object { $_.DisplayName -like '${app.uninstallName}*' -and $_.InstallLocation } | Select-Object -First 1; ` +
    "if ($k) { [Console]::Out.Write($k.InstallLocation) }");
  return out || '';
}
export function findExe(app, running = listProcesses(app), deps = {}) {
  const exists = deps.exists || existsSync;
  const env = process.env[app.envExe];
  if (env && exists(env)) return env;
  const live = running.find((p) => p.isMain && p.path && exists(p.path));
  if (live) return live.path;
  for (const c of app.candidates()) if (c && exists(c)) return c;
  if (process.platform === 'darwin') {
    // 装在别处时用 Spotlight 找应用包。
    try {
      const hit = execFileSync('/usr/bin/mdfind', [`kMDItemFSName == '${app.macBundle}.app'`], { encoding: 'utf8', timeout: 8000 }).split('\n').find(Boolean);
      const bin = hit && join(hit, 'Contents', 'MacOS', app.exeName);
      if (bin && exists(bin)) return bin;
    } catch {}
    return '';
  }
  try {
    const loc = deps.queryInstallLocation ? deps.queryInstallLocation(app) : registryInstallLocation(app);
    return exeFromInstallLocation(loc, app.exeName, exists);
  } catch {}
  return '';
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function portAlive(port) {
  if (!port) return false;
  try { await fetchCdpJson(port, '/json/version', 1500); return true; } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 先 taskkill（等同点 ×，应用能自己收尾），关不掉才 /F。
export async function stopApp(app, { force = true, waitMs = 8000 } = {}) {
  if (listProcesses(app).length === 0) return { stopped: true, forced: false };
  const mac = process.platform === 'darwin';
  // macOS 用「退出」菜单同款的 AppleScript quit，应用能自己收尾。
  if (mac) { try { execFileSync('/usr/bin/osascript', ['-e', `tell application "${app.macBundle}" to quit`], { stdio: 'ignore', timeout: 10000 }); } catch {} }
  else { try { execFileSync('taskkill.exe', ['/IM', app.exeName, '/T'], { windowsHide: true, stdio: 'ignore' }); } catch {} }
  for (let t = 0; t < waitMs; t += 500) {
    await sleep(500);
    if (listProcesses(app).length === 0) return { stopped: true, forced: false };
  }
  if (!force) return { stopped: false, forced: false };
  if (mac) { for (const p of listProcesses(app)) { try { process.kill(p.pid, 'SIGKILL'); } catch {} } }
  else { try { execFileSync('taskkill.exe', ['/IM', app.exeName, '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {} }
  for (let t = 0; t < 5000; t += 500) {
    await sleep(500);
    if (listProcesses(app).length === 0) return { stopped: true, forced: true };
  }
  return { stopped: false, forced: true };
}

export async function launchWithPort(exe, port) {
  const child = spawn(exe, [`--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return child.pid;
}

export async function listMainTargets(app, port) {
  const targets = await fetchCdpJson(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('CDP target list is not an array');
  return targets.filter((t) => app.isMainTarget(t, port));
}

export async function waitForMainTargets(app, port, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < until) {
    try {
      const targets = await listMainTargets(app, port);
      if (targets.length > 0) return targets;
    } catch (e) { last = e; }
    await sleep(500);
  }
  throw new Error(`等待 ${app.name} 主窗口超时` + (last ? `（${last.message}）` : '') +
    `。如果 ${app.name} 已打开但一直超时，说明这一版不接受调试端口参数，请把这行日志发给维护者。`);
}
