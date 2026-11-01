// 支持换肤的应用。一个 profile 讲清楚：怎么找到它、哪个窗口是主窗口、主界面画好的标志、用哪段规则 CSS。
// 配色（palettes.mjs）、参数（SETTINGS）、变量段（buildVarsCss）、我的皮肤（user-skins.mjs）两端完全共用。
import { join } from 'node:path';
import { isCherryMainTarget, validatedDebuggerUrl } from '../cdp/cdp-core.mjs';
import { RULES as CHERRY_RULES } from './cherry-skin-css.mjs';
import { ZCODE_RULES } from './zcode-skin-css.mjs';

import { homedir } from 'node:os';

export const IS_MAC = process.platform === 'darwin';
const local = () => process.env.LOCALAPPDATA || '';
// macOS：应用包里的主程序路径（/Applications 或 ~/Applications）。
const macBins = (bundle, bin) => ['/Applications', join(homedir(), 'Applications')].map((d) => join(d, bundle + '.app', 'Contents', 'MacOS', bin));
const pf = () => process.env.ProgramFiles || 'C:\\Program Files';
const pf86 = () => process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

// ZCode 主 renderer：file://…/out/renderer/index.html；登录/更新/设置等小窗一律不碰（取自 assets/zcode-profile.json targetRules）。
const ZCODE_REJECT = /login|log-in|sign-in|auth|update|updater|settings|splash|welcome/i;
function isZCodeMainTarget(item, port) {
  if (item?.type !== 'page' || typeof item.id !== 'string' || !item.webSocketDebuggerUrl) return false;
  const url = String(item.url ?? '');
  if (!/^file:\/\//i.test(url) || !/\/index\.html(?:[?#].*)?$/i.test(url)) return false;
  let tail = '';
  try { const u = new URL(url); tail = u.pathname.split('/').slice(-2).join('/') + u.hash; } catch { return false; } // 不看 query：主窗口自带 supportsSettings=true 这类开关
  if (ZCODE_REJECT.test(tail) || ZCODE_REJECT.test(String(item.title || ''))) return false;
  try { return new URL(validatedDebuggerUrl(item, port)).pathname === `/devtools/page/${item.id}`; } catch { return false; }
}

export const APPS = {
  cherry: {
    id: 'cherry', name: 'Cherry Studio', exeName: IS_MAC ? 'Cherry Studio' : 'Cherry Studio.exe', envExe: 'DREAMSKIN_CHERRY_EXE', uninstallName: 'Cherry Studio',
    macBundle: 'Cherry Studio',
    candidates: () => IS_MAC ? macBins('Cherry Studio', 'Cherry Studio')
      : [join(local(), 'Programs', 'Cherry Studio', 'Cherry Studio.exe'), join(pf(), 'Cherry Studio', 'Cherry Studio.exe'), join(pf86(), 'Cherry Studio', 'Cherry Studio.exe')],
    isMainTarget: isCherryMainTarget,
    readySelector: '#app-sidebar',
    uaToken: 'CherryStudio',
    // 体检用的结构探针：[选择器, 说明, 只在这个元素存在时才查]。只挑主界面常驻的，避免在设置页误报。
    probes: [
      ['[data-ui="app.sidebar"]', '侧边栏'],
      ['[data-ui="app.tab-bar"]', '标签栏'],
      ['[data-ui="app.content"]', '内容区'],
      ['[data-ui="chat.message-list"]', '消息列表', '#chat'],
      ['#inputbar', '输入框', '#chat'],
    ],
    rules: CHERRY_RULES,
    styleId: 'dream-skin-2-cherry', liveId: 'dream-skin-2-cherry-live',
    userCssId: 'user-defined-custom-css',
    shortcutName: 'Cherry Studio (梦境换肤)',
    restartNote: '聊天记录不受影响，未发送的输入框内容会丢失',
  },
  zcode: {
    id: 'zcode', name: 'ZCode', exeName: IS_MAC ? 'ZCode' : 'ZCode.exe', envExe: 'DREAMSKIN_ZCODE_EXE', uninstallName: 'ZCode',
    macBundle: 'ZCode',
    candidates: () => IS_MAC ? macBins('ZCode', 'ZCode')
      : [join(local(), 'Programs', 'ZCode', 'ZCode.exe'), join(pf(), 'ZCode', 'ZCode.exe')],
    // ZCode 用自己的 exe 以 node 模式跑后台服务（zcode.cjs app-server / plugin-host），这些不是窗口进程。
    isHelperCmd: (cmd) => /\.cjs\b|__zcode-plugin-host|app-server/i.test(cmd),
    isMainTarget: isZCodeMainTarget,
    readySelector: '[data-workspace-shell]',
    uaToken: 'ZCode',
    probes: [
      ['[data-root-workspace-surface]', '工作区底板'],
      ['[data-workspace-sidebar-panel]', '侧边栏'],
      ['#sidebar', '侧边栏列表'],
      ['[data-v4-composer-dock]', '输入区', '[data-workspace-conversation-frame]'],
      ['[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute)', '输入框', '[data-v4-composer-dock]'],
    ],
    rules: ZCODE_RULES,
    styleId: 'dream-skin-2-zcode', liveId: 'dream-skin-2-zcode-live',
    userCssId: '',
    shortcutName: 'ZCode (梦境换肤)',
    restartNote: '正在跑的任务会被中断，项目和对话记录不受影响',
  },
};

export function appById(id) {
  const a = APPS[String(id || 'cherry').toLowerCase()];
  if (!a) throw new Error('未知应用：' + id + '（可选 cherry / zcode）');
  return a;
}
