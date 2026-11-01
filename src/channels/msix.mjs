// msix 通道（T2-2，方案 §4.3 / §6 T2-2）：Microsoft Store（MSIX）应用装在 WindowsApps 下（ACL 保护），
// 不能直接执行它的 exe，只能用 AppUserModelId（AUMID）经应用激活接口传参启动。本通道的构成：
// - AUMID 解析：PackageFamilyName 来自 adapter.json 的 discover.msixPackageFamily（不写死版本）；
//   包信息与包内应用 Id 用只读 PowerShell 查询（Get-AppxPackage / Get-AppxPackageManifest）取得——
//   与 core/app-process.mjs 用 PowerShell 查注册表 / 进程是同一口径。方案 §6 T2-2 把 --resolve-aumid
//   定为总控台子命令，总控台（launcher）尚无 C# 源码、要等 U 系列反编译重建，本通道先用只读查询
//   落地同一契约（解析结果一致），重建后可平移，判断记在证据里。
// - 激活：COM IApplicationActivationManager 只能在 .NET 端做，Node 侧按方案约定经总控台子命令
//   「梦境换肤.exe --activate <aumid> --args "<args>"」调用（deps.activate 可注入替换）。
//   找不到总控台时如实报错，绝不假装启动成功，也绝不去直接执行 WindowsApps 下的 exe（§4.3）。
// - 端口段与冲突（方案 §3 共存规则）：本通道只在 MSIX_PORT_RANGE 段内分配调试端口；启动前若发现
//   应用已带着段外的调试端口在跑，视为可能有其他换肤工具（如 Codex-Dream-Skin）正在注入，
//   按「检测到就提示二选一、不抢」拒绝启动。style id 本来就按适配器 id 推导（dream-skin-2-<id>），与对方不同。
// - 进程侧（状态 / 关闭 / 主窗口列表）转调 core/app-process.mjs，不复制第二份进程逻辑。
// 全部系统操作可注入（deps），单测用假实现，不真启应用。
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProcesses, debugPortOf, portAlive, stopApp, listMainTargets, waitForMainTargets } from '../core/app-process.mjs';

// 梦境换肤给 MSIX 应用分配的调试端口段（与 exe 通道的系统随机端口区分；段内端口视为本工具启动）。
export const MSIX_PORT_RANGE = [9340, 9399];

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

function ps(script, timeout = 15000) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script],
  { encoding: 'utf8', windowsHide: true, timeout }).trim();
}

// Get-AppxPackage 的 Version 在 PS 5.1 里可能序列化成对象，统一成字符串。
function versionString(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && [v.Major, v.Minor].every((n) => typeof n === 'number')) {
    return [v.Major, v.Minor, v.Build || 0, v.Revision || 0].join('.');
  }
  return '';
}

// 把查询结果（对象或 JSON 文本）规范成 { name, packageFamilyName, version, installLocation, apps }；查不到返回 null。
export function parsePackageInfo(raw) {
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== 'object' || !o.PackageFamilyName) return null;
  const apps = (Array.isArray(o.Apps) ? o.Apps : []).map((a) => ({
    id: String((a && (a.Id ?? a.id)) || ''),
    executable: String((a && (a.Executable ?? a.executable)) || ''),
  })).filter((a) => a.id);
  return {
    name: String(o.Name || ''),
    packageFamilyName: String(o.PackageFamilyName),
    version: versionString(o.Version ?? o.version),
    installLocation: String(o.InstallLocation || ''),
    apps,
  };
}

// 包里有多个应用（如 Codex 还有 CodexCoreCommandRunner）时挑主应用：先按可执行文件名对上
// adapter 的 exeName，再退回 Id 为 App 的，最后取第一个。
export function pickAppId(apps, exeName = '') {
  const list = Array.isArray(apps) ? apps : [];
  if (!list.length) return '';
  const base = String(exeName || '').split(/[\\/]/).pop().toLowerCase();
  if (base) {
    const hit = list.find((a) => String(a.executable || '').split(/[\\/]/).pop().toLowerCase() === base);
    if (hit) return hit.id;
  }
  const app = list.find((a) => a.id === 'App');
  return (app || list[0]).id;
}

export function aumidOf(packageFamily, appId) {
  return packageFamily && appId ? packageFamily + '!' + appId : '';
}

export function isMsixPort(port) {
  return Number.isInteger(port) && port >= MSIX_PORT_RANGE[0] && port <= MSIX_PORT_RANGE[1];
}

// 只读查询已注册包（默认实现，走 PowerShell；查不到返回 null，不抛错）。
function queryPackageDefault(packageFamily) {
  const fam = String(packageFamily || '').replace(/'/g, "''");
  if (!fam) return null;
  try {
    const out = ps("$pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq '" + fam + "' } | Select-Object -First 1; " +
      'if ($pkg) { $apps = @(); try { $m = Get-AppxPackageManifest -Package $pkg; ' +
      '$apps = @($m.Package.Applications.Application | ForEach-Object { [pscustomobject]@{ Id = $_.Id; Executable = $_.Executable } }) } catch {} ' +
      '[pscustomobject]@{ Name = $pkg.Name; PackageFamilyName = $pkg.PackageFamilyName; Version = [string]$pkg.Version; ' +
      'InstallLocation = $pkg.InstallLocation; Apps = $apps } | ConvertTo-Json -Compress -Depth 4 }');
    return parsePackageInfo(out || null);
  } catch {
    return null;
  }
}

// 总控台位置：环境变量 DREAMSKIN_LAUNCHER 优先，其次 payload 根目录与上一级（分发时的相对位置）。
function findLauncherDefault() {
  const env = process.env.DREAMSKIN_LAUNCHER;
  if (env && existsSync(env)) return env;
  for (const cand of [join(SRC_DIR, '梦境换肤.exe'), join(SRC_DIR, '..', '梦境换肤.exe')]) {
    if (existsSync(cand)) return cand;
  }
  return '';
}

// 经总控台子命令激活（方案 §6 T2-2 的 --activate 约定）。总控台不可用时如实抛错。
function activateDefault(aumid, args, findLauncher) {
  const exe = findLauncher();
  if (!exe) {
    throw new Error('msix 激活需要总控台的子命令 --activate（COM 应用激活），当前找不到总控台程序：' +
      '可把环境变量 DREAMSKIN_LAUNCHER 指向 梦境换肤.exe，或等总控台重建后重试。梦境换肤不会直接执行 WindowsApps 下的 exe。');
  }
  const child = spawn(exe, ['--activate', aumid, '--args', args], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}

function portFreeDefault(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

// 在端口段内挑一个空闲端口（只绑 127.0.0.1 试探）。isFree / rand 可注入，方便单测。
export async function pickMsixPort(isFree = portFreeDefault, rand = Math.random) {
  const [lo, hi] = MSIX_PORT_RANGE;
  const span = hi - lo + 1;
  const start = lo + Math.floor(rand() * span);
  for (let i = 0; i < span; i++) {
    const p = lo + ((start - lo + i) % span);
    if (await isFree(p)) return p;
  }
  throw new Error('msix 端口段 ' + lo + '-' + hi + ' 已全部占用，无法分配调试端口');
}

const defaultDeps = {
  queryPackage: queryPackageDefault,
  findLauncher: findLauncherDefault,
  activate: null, // null = 用 activateDefault（经总控台 --activate）
  listProcesses, debugPortOf, portAlive, stopApp, listMainTargets, waitForMainTargets,
  isPortFree: portFreeDefault,
  rand: Math.random,
};

// 运行时 profile -> msix 通道适配器（与 channels/exe.mjs 的 profileToChannelAdapter 对称）。
export function profileToMsixChannelAdapter(profile, opts = {}) {
  if (!profile || typeof profile !== 'object') throw new Error('profileToMsixChannelAdapter: profile 不能为空');
  return {
    id: profile.id, name: profile.name, channel: 'msix',
    packageFamily: profile.msixPackageFamily || '',
    exeName: profile.exeName, isMainTarget: profile.isMainTarget, isHelperCmd: profile.isHelperCmd,
    restartNote: profile.restartNote, uaToken: profile.uaToken,
    conflicts: profile.conflicts || [],
    ...(typeof opts.skinActive === 'function' ? { skinActive: opts.skinActive } : {}),
  };
}

function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('msix 通道：adapter 不能为空');
  for (const k of ['packageFamily', 'exeName', 'isMainTarget']) {
    if (adapter[k] === undefined || adapter[k] === '') throw new Error('msix 通道：adapter 缺少 ' + k);
  }
}

export function createMsixChannel(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const launchedPorts = new Set(); // 本通道实例亲手激活过的端口（跨进程的归属看端口段，见文件头）
  const activate = d.activate || ((aumid, args) => activateDefault(aumid, args, d.findLauncher));

  async function resolve(adapter) {
    const pkg = await d.queryPackage(adapter.packageFamily);
    if (!pkg) return { pkg: null, aumid: '' };
    return { pkg, aumid: aumidOf(pkg.packageFamilyName, pickAppId(pkg.apps, adapter.exeName)) };
  }

  async function liveDebugPort(adapter) {
    const running = d.listProcesses(adapter);
    for (const p of running) {
      const dp = d.debugPortOf(p);
      if (dp && await d.portAlive(dp)) return { running, debugPort: dp };
    }
    return { running, debugPort: 0 };
  }

  const foreignError = (adapter, port) => new Error(
    adapter.name + ' 已在 ' + port + ' 端口开着调试，这个端口不是梦境换肤启动的' +
    '（可能有其他换肤工具正在注入，如 Codex-Dream-Skin）。按共存规则梦境换肤不抢占：' +
    '请先在那边还原或退出，或关闭 ' + adapter.name + ' 后再用梦境换肤启动，二选一。');

  return {
    kind: 'msix',

    async status(adapter) {
      assertAdapter(adapter);
      const { pkg, aumid } = await resolve(adapter);
      const { running, debugPort } = await liveDebugPort(adapter);
      return {
        installed: !!pkg,
        running: running.length > 0,
        debugPort,
        skinActive: typeof adapter.skinActive === 'function' ? !!adapter.skinActive() : false,
        exe: '', // MSIX 没有可直接执行的 exe 路径（§4.3）；安装位置与 AUMID 走下面两个字段
        version: pkg ? pkg.version : '',
        aumid,
        packageFamily: adapter.packageFamily,
        installLocation: pkg ? pkg.installLocation : '',
        conflict: debugPort && !isMsixPort(debugPort) ? { kind: 'foreign-debug-port', port: debugPort } : null,
      };
    },

    async launch(adapter, { port = 0, restart = false } = {}) {
      assertAdapter(adapter);
      const { pkg, aumid } = await resolve(adapter);
      if (!pkg) {
        throw new Error('未检测到 ' + adapter.name + ' 的 MSIX 安装包（PackageFamilyName：' + adapter.packageFamily + '），请先从 Microsoft Store 安装。');
      }
      if (!aumid) {
        throw new Error('已找到 ' + adapter.name + ' 的安装包，但没能从包清单解析出主应用 Id，无法拼出 AUMID，本版本暂不能用 msix 通道启动。');
      }
      const { running, debugPort } = await liveDebugPort(adapter);
      if (running.length > 0) {
        if (debugPort) {
          if (isMsixPort(debugPort) || launchedPorts.has(debugPort)) return { port: debugPort }; // 我们段内 / 本实例启动的：复用
          throw foreignError(adapter, debugPort);
        }
        if (!restart) {
          throw new Error(adapter.name + ' 正在运行，需要由梦境换肤重新启动一次才能换肤' +
            (adapter.restartNote ? '（' + adapter.restartNote + '）' : '') + '。');
        }
        const st = await d.stopApp(adapter, { force: true });
        if (!st.stopped) throw new Error(adapter.name + ' 没能关闭，请手动退出后再试。');
      }
      let p = port || 0;
      if (p && await d.portAlive(p)) {
        if (isMsixPort(p) || launchedPorts.has(p)) return { port: p };
        throw foreignError(adapter, p);
      }
      if (!p) p = await pickMsixPort(d.isPortFree, d.rand);
      await activate(aumid, '--remote-debugging-port=' + p);
      launchedPorts.add(p);
      await d.waitForMainTargets(adapter, p); // 轮询 /json/list 等主窗口出现（§4.3）
      return { port: p };
    },

    async stop(adapter, { graceful = true } = {}) {
      assertAdapter(adapter);
      return d.stopApp(adapter, { force: !graceful });
    },

    async targets(adapter, port) {
      assertAdapter(adapter);
      return d.listMainTargets(adapter, port);
    },
  };
}

export const msixChannel = createMsixChannel();
