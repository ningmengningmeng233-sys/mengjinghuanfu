// dsh-plugin-dreamskin 入口（T2-4，方案 4.3 dsh-plugin 通道）：DSH 客户端插件。
// 职责只有一个：读梦境换肤数据目录里的 active-skin.css（三层皮肤文件），经官方 UI 插槽
// shell.overlay（与会话无关的帧级常驻插槽，S-2 实证社区换肤插件同路）把三层样式注入 Web UI；
// 文件被删或清空就撤掉全部样式。插件只读这一个本地文件：不联网、不读会话与对话内容、
// 不碰 Cookie 与本地存储（方案 4.8，唯一例外通道且须用户明确同意才安装）。
// 宿主绑定说明（真机核对点）：插槽注册走 ctx.slots（官方 ui-slots 包的注册面），
// 具体签名以真机为准——拿不到预期接口时插件保持惰性、绝不让宿主报错崩溃；
// 文件监视只在宿主进程侧有 fs 时启用，浏览器侧靠插槽重渲染时重新同步。
import { existsSync, readFileSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyLayers, removeLayers, parseSkinFile } from './overlay.js';

export const name = 'dsh-plugin-dreamskin';

// 皮肤文件位置：方案 4.3 写死的产品口径 %LOCALAPPDATA%\\DreamSkin\\dsh\\active-skin.css。
export function skinFilePath(env = process.env) {
  return join(env.LOCALAPPDATA || '', 'DreamSkin', 'dsh', 'active-skin.css');
}

// 读当前皮肤三层；文件不存在 / 为空返回 null（表示撤下样式）。
export function loadLayers(env = process.env) {
  try { return parseSkinFile(readFileSync(skinFilePath(env), 'utf8')); } catch { return null; }
}

// 可单测的同步核心：doc 可注入（假 document），默认取全局 document（浏览器侧）。
export function createSkinSync(opts = {}) {
  const env = opts.env || process.env;
  const getDoc = opts.document ? () => opts.document : () => (typeof document !== 'undefined' ? document : null);
  const sync = () => {
    const doc = getDoc();
    if (!doc) return false;
    const layers = loadLayers(env);
    if (layers) applyLayers(doc, layers); else removeLayers(doc);
    return true;
  };
  return { sync };
}

// 尝试经官方插槽注册 overlay 贡献：注册回调里只做 sync（把当前皮肤写进页面）。
// 宿主接口形态未在真机核对前不写死：两种已知注册面都试，任何异常都吞掉并保持惰性。
function tryRegisterOverlay(ctx, sync) {
  try {
    const slots = ctx && ctx.slots;
    if (!slots) return null;
    if (typeof slots.register === 'function') {
      return slots.register('shell.overlay', { render: () => { sync(); return null; } }) || null;
    }
    if (typeof slots.inject === 'function') {
      return slots.inject('shell.overlay', () => { sync(); return null; }) || null;
    }
  } catch { /* 接口形态与预期不符：保持惰性，等真机核对 */ }
  return null;
}

export function apply(ctx, config = {}) {
  const env = config.env || process.env;
  const { sync } = createSkinSync({ env, document: config.document });
  const disposers = [];
  const reg = tryRegisterOverlay(ctx, sync);
  if (typeof reg === 'function') disposers.push(reg);
  else if (reg && typeof reg.dispose === 'function') disposers.push(() => reg.dispose());
  try {
    const file = skinFilePath(env);
    if (existsSync(dirname(file))) {
      const w = watch(file, { persistent: false }, () => sync());
      disposers.push(() => { try { w.close(); } catch {} });
    }
  } catch { /* 无 fs 的运行面：靠插槽重渲染时 sync */ }
  sync();
  return () => {
    for (const d of disposers) { try { d(); } catch {} }
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc) removeLayers(doc);
  };
}
