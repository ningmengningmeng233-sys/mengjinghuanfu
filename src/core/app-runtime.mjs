// 适配器运行时（T1-3，方案 §4.2 / §6 T1-3）：把 adapters/<id>/ 的纯数据组装成运行时 profile。
// adapter.json + parts-map.json + extra.css 是应用事实的唯一来源——原 core/apps.mjs 已退役删除，
// 全仓不再有第二份应用数据。入口（dreamskin.mjs）与通道（channels/）只消费这里组装出的 profile：
//   { id, name, channel, exeName, envExe, uninstallName, macBundle, candidates(), isHelperCmd?,
//     isMainTarget(item, port), readySelector, uaToken, probes, partsMap, partsCss, extraCss, rules,
//     styleId, liveId, userCssId, shortcutName, restartNote, testedVersions, msixPackageFamily,
//     conflicts, adapter }
// 其中 styleId / liveId / shortcutName 是由 id / name 推导的固定规则（不是第二份数据）：
//   styleId = 'dream-skin-2-' + id，liveId = styleId + '-live'，shortcutName = name + ' (梦境换肤)'。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { adapterById, listAdapters, DEFAULT_ADAPTERS_DIR } from './adapters.mjs';
import { renderPartsCss, validatePartsMap } from '../parts/parts.mjs';
import { validatedDebuggerUrl } from './cdp-core.mjs';
import { VERSION } from './version.mjs';
import { CHERRY_PRESETS, PRESET_ALIASES, buildVarsCss } from '../theme/cherry-skin-css.mjs';

export const IS_MAC = process.platform === 'darwin';

// candidates 里的 %VAR% 占位展开（方案 §4.2：路径只用环境变量占位，禁止写死）。
// ProgramFiles 两个变量缺失时用系统默认位置兜底，与 2.1 的 pf() / pf86() 口径一致。
const ENV_FALLBACK = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
const expandEnv = (s) => String(s).replace(/%([^%]+)%/g, (_, n) => process.env[n] || ENV_FALLBACK[n] || '');

function candidatesOf(data) {
  if (IS_MAC) {
    // macOS：/Applications 或 ~/Applications 下的应用包主程序（原 apps.mjs 的 macBins）。
    const bundle = data.discover && data.discover.macBundle;
    if (!bundle) return [];
    const bin = String((data.discover.exeNames || [])[0] || '').replace(/\.exe$/i, '');
    return ['/Applications', join(homedir(), 'Applications')].map((d) => join(d, bundle + '.app', 'Contents', 'MacOS', bin));
  }
  return ((data.discover && data.discover.candidates) || []).map(expandEnv);
}

// 主窗口判定：2.1 的 isCherryMainTarget / isZCodeMainTarget 按方案 §4.2 改成 target 数据描述。
// 规则：type=page、id 与 webSocketDebuggerUrl 齐全；url 必须命中 target.urlPattern
// （后面补 (?:[?#].*)?$，与 2.1 两边的正则逐字一致）；rejectPattern 若声明，只对
// url 尾段（最后两段路径 + hash）和窗口标题测试——ZCode 原逻辑就是这么做的：不看 query
// （主窗口自带 supportsSettings=true 这类开关），也不拿整条 url 测，免得路径上层字样误杀。
// 最后仍过 validatedDebuggerUrl，确认 ws 路径与 target id 一致（§4.8）。
// 协议（scheme）由适配器数据驱动（A-1/A-3/A-4 真机回填）：urlPattern 头部声明的
// scheme（如 ^app:// 或 ^file://）即该应用主窗口唯一允许的协议——Codex / MiniMax
// Design / MiniMax Code 三家主窗口实测为 app:// 承载，靠各自落盘的 urlPattern 放行。
// urlPattern 未声明 scheme（或没有 urlPattern，如 dsh）时维持 2.1 口径只认 file://，
// cherry/zcode 行为逐字节不变。不做「任意 scheme 放行」：与声明不符的协议一律拒绝，
// http(s) 等没有实测声明的协议同样拒绝。validatedDebuggerUrl 校的是调试 ws 端点
// （须回环 + 端口对齐 + /devtools/page/<id>），与页面 url 的 scheme 无关、口径不变。
export function makeIsMainTarget(target = {}) {
  const urlRe = target.urlPattern ? new RegExp(target.urlPattern + '(?:[?#].*)?$', 'i') : null;
  const rejectRe = target.rejectPattern ? new RegExp(target.rejectPattern, 'i') : null;
  const declared = /^\^?([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(String(target.urlPattern || ''));
  const scheme = declared ? declared[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 'file';
  const schemeRe = new RegExp('^' + scheme + '://', 'i');
  return (item, port) => {
    if (item?.type !== 'page' || typeof item.id !== 'string' || !item.webSocketDebuggerUrl) return false;
    const url = String(item.url ?? '');
    if (!schemeRe.test(url)) return false;
    if (urlRe && !urlRe.test(url)) return false;
    if (rejectRe) {
      let tail = '';
      try { const u = new URL(url); tail = u.pathname.split('/').slice(-2).join('/') + u.hash; } catch { return false; }
      if (rejectRe.test(tail) || rejectRe.test(String(item.title || ''))) return false;
    }
    try { return new URL(validatedDebuggerUrl(item, port)).pathname === `/devtools/page/${item.id}`; } catch { return false; }
  };
}

function buildProfile(data, rootDir) {
  const dir = join(rootDir, data.adapterDir);
  const exeNameRaw = (data.discover && data.discover.exeNames && data.discover.exeNames[0]) || '';
  const exeName = IS_MAC ? exeNameRaw.replace(/\.exe$/i, '') : exeNameRaw;

  let partsMap = null;
  let partsCss = '';
  if (data.partsMap) {
    partsMap = JSON.parse(readFileSync(join(dir, data.partsMap), 'utf8'));
    const errs = validatePartsMap(partsMap);
    if (errs.length) throw new Error('适配器 ' + data.id + ' 的 parts-map 不合法：' + errs.join('；'));
    partsCss = renderPartsCss(partsMap);
  }
  // 额外层：extra.css 里 {{version}} 占位在组装时换成当前版本号（版本单一来源 core/version.mjs）。
  let extraCss = '';
  if (data.extraCss) extraCss = readFileSync(join(dir, data.extraCss), 'utf8').split('{{version}}').join(VERSION);

  const helperRe = data.process && data.process.helperCmdPattern ? new RegExp(data.process.helperCmdPattern, 'i') : null;
  const styleId = 'dream-skin-2-' + data.id;
  return {
    id: data.id,
    name: data.name,
    channel: data.channel,
    exeName,
    envExe: (data.discover && data.discover.envExe) || '',
    uninstallName: (data.discover && data.discover.uninstallDisplayName) || data.name,
    macBundle: (data.discover && data.discover.macBundle) || '',
    candidates: () => candidatesOf(data),
    ...(helperRe ? { isHelperCmd: (cmd) => helperRe.test(cmd) } : {}),
    isMainTarget: makeIsMainTarget(data.target || {}),
    readySelector: data.readySelector || '',
    uaToken: (data.target && data.target.uaToken) || '',
    probes: data.probes || [],
    partsMap,
    partsCss,
    extraCss,
    // 规则段 = 部件层 + 额外层（live 预览与 buildCherryCss 用整份）。组合口径与 T3-2 一致；
    // 与 2.1 手写规则段的等价性由 tests/fixtures 的规范化夹具守住（规范化本就抹注释）。
    rules: [partsCss, extraCss].filter((s) => s && s.trim()).join('\n\n'),
    styleId,
    liveId: styleId + '-live',
    userCssId: data.userCssId || '',
    shortcutName: data.name + ' (梦境换肤)',
    restartNote: data.restartNote || '',
    testedVersions: data.testedVersions || [],
    // msix 通道用（T2-2）：包族名只在 msix 适配器的 discover 里有，其余通道为空串。
    msixPackageFamily: (data.discover && data.discover.msixPackageFamily) || '',
    // 已知冲突的其他换肤工具（§4.2 conflicts，如 codex 的 codex-dream-skin），通道做冲突检测时用。
    conflicts: data.conflicts || [],
    // 多外壳声明（A-2）：同一应用的不同外壳各走自己的通道（见 selectShell）。
    shells: (data.shells || []).map((s) => ({
      id: s.id, name: s.name || s.id, channel: s.channel, exeNames: s.exeNames || [],
      ...(s.url ? { url: s.url } : {}),
    })),
    adapter: data,
  };
}

// 外壳自动选择（A-2，方案 A-2「按外壳自动选 exe / webview2 通道」）：只考虑带 exeNames 的
// 进程型外壳——正在运行的优先，其次已安装的；浏览器模式（dsh-plugin 通道）没有可探测的
// 进程，属显式选择，不参与自动探测。detect(shell) 由调用方注入，返回 { installed, running }
// （真实环境接进程扫描 / findExe，单测用假实现）。选不中返回 null（未安装或该外壳暂不支持）。
export function selectShell(profile, detect) {
  const shells = (profile && profile.shells) || [];
  const probed = [];
  for (const s of shells) {
    if (!s.exeNames || !s.exeNames.length) continue;
    probed.push({ shell: s, state: detect(s) || {} });
  }
  const running = probed.find((p) => p.state.running);
  if (running) return { ...running.shell, via: 'running' };
  const installed = probed.find((p) => p.state.installed);
  if (installed) return { ...installed.shell, via: 'installed' };
  return null;
}

const cache = new Map();
// 按 id 取运行时 profile；未知 id 抛加载器的清晰错误（Unknown adapter: <id> (registered: ...)）。
export function appRuntimeById(id, rootDir = DEFAULT_ADAPTERS_DIR) {
  const key = rootDir + '|' + String(id || '').toLowerCase();
  if (!cache.has(key)) cache.set(key, buildProfile(adapterById(id, rootDir), rootDir));
  return cache.get(key);
}

export function listRuntimeProfiles(rootDir = DEFAULT_ADAPTERS_DIR) {
  return listAdapters(rootDir).map((d) => appRuntimeById(d.id, rootDir));
}

// 兼容旧接口：2.1 的 buildCherryCss(presetKey | palette, imageUri, values)（原在 theme/cherry-skin-css.mjs）。
// 规则段改从 Cherry 适配器组装，其余口径（别名、focusX/focusY 兼容）与 2.1 逐字一致。
export function buildCherryCss(preset = 'dark-gold', imageUri = '', values = {}) {
  let palette = preset;
  if (typeof preset === 'string') {
    palette = CHERRY_PRESETS[PRESET_ALIASES[preset] || preset];
    if (!palette) throw new Error('未知预设：' + preset + '，可选：' + Object.keys(CHERRY_PRESETS).join(', '));
  }
  const v = { ...(values || {}) };
  if (Number.isFinite(v.focusX)) v['focus-x'] = v.focusX;
  if (Number.isFinite(v.focusY)) v['focus-y'] = v.focusY;
  delete v.focusX; delete v.focusY;
  return appRuntimeById('cherry').rules + '\n' + buildVarsCss(palette, imageUri, v);
}
