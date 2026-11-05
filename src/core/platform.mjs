// 平台抽象（mac 适配批，2026-11-05）：把散落在 core 里的平台判定与平台口径收成一处。
// 此前 process.platform 直判散在 env.mjs（数据根）、app-runtime.mjs（IS_MAC / candidates）、
// app-process.mjs（进程列举 / 发现 / 关闭三处），本模块是它们唯一的来源。
//
// 红线：Windows 口径逐字沿用既有实现——defaultDataRoot 的非 darwin 分支与 env.mjs 原内联
// 表达式等价、macCandidateBinaries 与 app-runtime 原 candidatesOf 的 mac 分支产出同一数组，
// 全套单测守卫；本模块不改变任何 Windows 行为。
// darwin 分支为代码层适配：**未在 Mac 真机验证**（见 证据/mac适配/ 与 docs/support-matrix.md）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLATFORM = process.platform;
export const IS_WINDOWS = PLATFORM === 'win32';
export const IS_MAC = PLATFORM === 'darwin';

// 平台分类（可注入 platform 值，单测用）：只认 win32 / darwin，其余归 other——
// 核心不为 other 提供系统口径（数据根仍回退非 darwin 老口径，见 defaultDataRoot）。
export function platformKind(platform = PLATFORM) {
  return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'other';
}

// 数据根目录的系统口径（纯函数；DREAMSKIN_DATA_DIR 覆盖与建目录副作用留在 env.mjs rootDir）：
//   darwin : ~/Library/Application Support/DreamSkin
//   其它   : %LOCALAPPDATA%\DreamSkin（LOCALAPPDATA 缺失时回退 ~/AppData/Local）——与 2.1 起的
//            env.mjs 内联口径逐字一致，Windows 产出不变。
export function defaultDataRoot({ platform = PLATFORM, env = process.env, home = '' } = {}) {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'DreamSkin');
  return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'DreamSkin');
}

// ---- macOS 应用发现（代码层适配，未实测）----

// 适配器 discover 里的 mac bundle 名：2.1 既有 macBundle 字段优先，其次 discover.mac.bundle
// （mac 适配批新增段）；都没有返回 ''。
export function macBundleOf(discover) {
  if (!discover) return '';
  return discover.macBundle || (discover.mac && discover.mac.bundle) || '';
}

// .app 包的两个标准安装目录（系统级 / 用户级）。
export function macAppDirs(home = '') {
  return ['/Applications', join(home, 'Applications')];
}

// 包内主程序路径：<bundle>.app/Contents/MacOS/<bin>。
export function macBundleBinary(bundlePath, binName) {
  return join(bundlePath, 'Contents', 'MacOS', binName);
}

// 按 bundle 名 + 二进制名展开两个安装目录下的候选主程序路径（与 app-runtime 原 mac 分支同形状）。
export function macCandidateBinaries(bundle, binName, home = '') {
  if (!bundle || !binName) return [];
  return macAppDirs(home).map((d) => macBundleBinary(join(d, bundle + '.app'), binName));
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function xmlUnescape(s) {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => XML_ENTITIES[n])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// XML plist 子集解析：取 <key>K</key> 紧随的 <string> 值。只处理 Info.plist 里用到的
// 字符串键，不做全量 plist 语义（dict/array/真假值一概不认），解析不出返回 ''。
export function plistString(xml, key) {
  if (typeof xml !== 'string' || !key) return '';
  const esc = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('<key>\\s*' + esc + '\\s*</key>\\s*<string>([\\s\\S]*?)</string>').exec(xml);
  return m ? xmlUnescape(m[1]).trim() : '';
}

// 解析一份 Info.plist 文本，取发现要用的四个字段；不是 plist / 关键字段全空返回 null。
export function parseInfoPlist(xml) {
  if (typeof xml !== 'string' || !xml.includes('<plist')) return null;
  const info = {
    executable: plistString(xml, 'CFBundleExecutable'),
    identifier: plistString(xml, 'CFBundleIdentifier'),
    name: plistString(xml, 'CFBundleName'),
    shortVersion: plistString(xml, 'CFBundleShortVersionString'),
  };
  return info.executable || info.identifier || info.name ? info : null;
}

// 读某个 .app 的 Contents/Info.plist（deps.readFile 可注入，单测用夹具文本）。
// 读不到 / 解析不出返回 null，不抛错——发现链里 plist 只是把二进制名说准的一步，缺了回退。
export function readBundleInfo(bundlePath, deps = {}) {
  const read = deps.readFile || ((p) => readFileSync(p, 'utf8'));
  try { return parseInfoPlist(read(join(bundlePath, 'Contents', 'Info.plist'))); } catch { return null; }
}

// 包内主程序名：优先 Info.plist 的 CFBundleExecutable（权威），读不到回退调用方给的名字
// （适配器 exeNames[0] 去 .exe 的推断值）。fallback 本身为空时返回 ''。
export function macExecutableName(bundlePath, fallback = '', deps = {}) {
  const info = readBundleInfo(bundlePath, deps);
  return (info && info.executable) || fallback || '';
}

// ---- macOS 启动（open 命令口径，预留）----
// 带调试参数的启动仍走 spawn 包内二进制（app-process.launchWithPort）：open --args 对
// Electron 的调试端口传递在不同应用上口径不一，且无法拿 pid 做后续管理——这是代码走读
// 结论、未在真机验证。下面两个函数是「普通打开 / 激活一个 .app」的预留口径：
// argv 组装是纯函数（单测守住），执行封装只应在 darwin 上被调用，本批未接任何通道。
export function macOpenArgv(target, args = []) {
  return ['-a', String(target), ...(args && args.length ? ['--args', ...args.map(String)] : [])];
}

export function openMacApp(target, args = [], deps = {}) {
  const exec = deps.execFileSync || execFileSync;
  return exec('/usr/bin/open', macOpenArgv(target, args), { timeout: 10000 });
}
