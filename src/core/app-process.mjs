// 找到 / 关闭 / 带调试端口启动一个 Electron 应用（Cherry Studio、ZCode 共用）。
// 思路取自 Fei-Away/Codex-Dream-Skin 的 Windows 启动流程：
// 正常关闭 → 随机空闲端口 → --remote-debugging-port 启动 → 轮询 /json/list 等主窗口。
// 应用差异全部放在运行时 profile（core/app-runtime.mjs，由 adapters/<id>/adapter.json 组装）里：exe 名、安装位置、主进程判定、主窗口判定。
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { fetchCdpJson } from './cdp-core.mjs';
import { IS_MAC, macAppDirs, macBundleBinary, macExecutableName } from './platform.mjs';

function ps(script, timeout = 15000) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script],
  { encoding: 'utf8', windowsHide: true, timeout }).trim();
}

// 同名进程里，主进程 = 命令行没有 --type=（渲染/GPU 子进程），且 profile 没把它判成后台进程
// （例如 ZCode 用 ELECTRON_RUN_AS_NODE 跑的 app-server / plugin-host）。
export function listProcesses(app) {
  if (IS_MAC) return listProcessesMac(app);
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

// exe 路径：环境变量 → 正在运行的进程 → 常见安装位置 → 卸载注册表条目推导。
// 注册表这一步抽成可注入的纯逻辑（deps.queryInstallLocation / deps.queryUninstallEntries / deps.exists），方便单测模拟注册表返回，不依赖真机。
export function exeFromInstallLocation(loc, exeName, exists = existsSync) {
  if (!loc) return '';
  const p = join(loc, exeName);
  return exists(p) ? p : '';
}

// 注册表路径类字段（DisplayIcon / UninstallString）的清洗：带引号时取引号内路径；
// 不带引号时截到 .exe 结尾（DisplayIcon 常带 ",0" 图标序号、UninstallString 常带参数）。
export function parseRegPath(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    return end > 0 ? s.slice(1, end) : s.slice(1);
  }
  const exeEnd = s.toLowerCase().indexOf('.exe');
  if (exeEnd >= 0) return s.slice(0, exeEnd + 4);
  return s.replace(/,\d+\s*$/, '');
}

// 从一条卸载注册表条目推导 exe：InstallLocation 拼接 → DisplayIcon 本身就是 exe →
// DisplayIcon 所在目录拼接 → UninstallString 所在目录拼接。每步都以「文件真存在」为准，
// 推不中返回空、绝不乱猜。自定义安装目录的 NSIS 应用常把 InstallLocation 留空，
// 但 DisplayIcon / 卸载程序就落在安装目录里，靠这一步才能在干净环境里找到它们。
export function exeFromUninstallEntry(entry, exeName, exists = existsSync) {
  if (!entry) return '';
  const fromLoc = exeFromInstallLocation(entry.installLocation, exeName, exists);
  if (fromLoc) return fromLoc;
  const icon = parseRegPath(entry.displayIcon);
  if (icon) {
    if (basename(icon).toLowerCase() === String(exeName).toLowerCase() && exists(icon)) return icon;
    const fromIconDir = exeFromInstallLocation(dirname(icon), exeName, exists);
    if (fromIconDir) return fromIconDir;
  }
  const un = parseRegPath(entry.uninstallString);
  if (un) {
    const fromUnDir = exeFromInstallLocation(dirname(un), exeName, exists);
    if (fromUnDir) return fromUnDir;
  }
  return '';
}

function registryUninstallEntries(app) {
  const out = ps("$ks = @(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
    "'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | " +
    `Where-Object { $_.DisplayName -like '${app.uninstallName}*' } | ` +
    "Select-Object DisplayName, InstallLocation, DisplayIcon, UninstallString); " +
    "if ($ks.Count -gt 0) { [Console]::Out.Write(($ks | ConvertTo-Json -Compress)) }");
  if (!out) return [];
  const data = JSON.parse(out);
  return (Array.isArray(data) ? data : [data]).map((k) => ({
    displayName: k.DisplayName || '',
    installLocation: k.InstallLocation || '',
    displayIcon: k.DisplayIcon || '',
    uninstallString: k.UninstallString || '',
  }));
}
export function findExe(app, running = listProcesses(app), deps = {}) {
  const exists = deps.exists || existsSync;
  const env = process.env[app.envExe];
  if (env && exists(env)) return env;
  const live = running.find((p) => p.isMain && p.path && exists(p.path));
  if (live) return live.path;
  for (const c of app.candidates()) if (c && exists(c)) return c;
  if (IS_MAC) {
    // 标准安装目录里的 .app：包在不在以 exists 为准，主程序名优先 Info.plist 的
    // CFBundleExecutable（exeNames 只是按 Windows 名推断、plist 才是权威；mac 适配批新增，未实测）。
    if (app.macBundle) {
      for (const dir of macAppDirs(homedir())) {
        const bundlePath = join(dir, app.macBundle + '.app');
        if (!exists(bundlePath)) continue;
        const binName = macExecutableName(bundlePath, app.exeName, deps);
        const bin = binName && macBundleBinary(bundlePath, binName);
        if (bin && exists(bin)) return bin;
      }
    }
    // 装在别处时用 Spotlight 找应用包。
    try {
      const hit = execFileSync('/usr/bin/mdfind', [`kMDItemFSName == '${app.macBundle}.app'`], { encoding: 'utf8', timeout: 8000 }).split('\n').find(Boolean);
      const bin = hit && join(hit, 'Contents', 'MacOS', app.exeName);
      if (bin && exists(bin)) return bin;
    } catch {}
    return '';
  }
  try {
    // 旧注入口径（deps.queryInstallLocation）保持原样：单测注入它时走老路、不碰真机注册表。
    if (deps.queryInstallLocation) {
      return exeFromInstallLocation(deps.queryInstallLocation(app), app.exeName, exists);
    }
    const entries = deps.queryUninstallEntries ? deps.queryUninstallEntries(app) : registryUninstallEntries(app);
    for (const e of entries || []) {
      const hit = exeFromUninstallEntry(e, app.exeName, exists);
      if (hit) return hit;
    }
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
  const mac = IS_MAC;
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
