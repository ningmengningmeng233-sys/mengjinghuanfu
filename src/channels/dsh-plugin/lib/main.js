// dsh-plugin-dreamskin 入口（T2-4，方案 4.3 dsh-plugin 通道）：DSH 客户端插件。
// 职责只有一个：读梦境换肤数据目录里的 active-skin.css（三层皮肤文件），把三层样式送进
// Web UI；文件被删或清空就不再送出（页面下次加载时样式随之消失）。插件只读这一个本地
// 文件：不联网、不读会话与对话内容、不碰 Cookie 与本地存储（方案 4.8，唯一例外通道
// 且须用户明确同意才安装）。
// 宿主挂接（2026-11-05 契约实证，见 证据/DSH插件打通/spike-小结.md）：本包经
// cordis.patch.yml 的一行 insert 以包名挂为宿主插件行，宿主加载本入口并调用 apply(ctx)。
// 页面生效路：宿主 webserver 每次服务 Web UI 的 index.html 时发出 webserver/index-inject
// 事件，apply 在此订阅，发出时现读皮肤文件、逐层以 style 行推入注入表，由宿主渲染为
// head 里的 style 元素（第一方主题包同一条路）。另保留 ctx.slots 插槽注册尝试作为
// 兜底：拿不到预期接口时插件保持惰性、绝不让宿主报错崩溃。
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

// 当前皮肤对应的索引注入行（部件 -> 变量 -> 额外，只含非空层）；无皮肤时为空数组。
export function skinStyleRows(env = process.env) {
  const layers = loadLayers(env);
  if (!layers) return [];
  const rows = [];
  for (const css of [layers.parts, layers.vars, layers.extra]) {
    if (css) rows.push({ kind: 'style', text: css });
  }
  return rows;
}

export function apply(ctx, config = {}) {
  const env = config.env || process.env;
  const { sync } = createSkinSync({ env, document: config.document });
  const disposers = [];
  // 宿主索引注入订阅（实证路）：发出时现读皮肤文件、逐层推 style 行；
  // 文件不存在或为空就不推行，页面下次加载时样式自然消失。
  try {
    if (ctx && typeof ctx.on === 'function') {
      const off = ctx.on('webserver/index-inject', (table) => {
        try {
          if (!table || typeof table.push !== 'function') return;
          for (const row of skinStyleRows(env)) table.push(row);
        } catch { /* 注入失败不许影响宿主供页 */ }
      });
      if (typeof off === 'function') disposers.push(off);
    }
  } catch { /* 宿主无此事件：保持惰性 */ }
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
