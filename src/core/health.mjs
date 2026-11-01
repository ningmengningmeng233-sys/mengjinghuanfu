// 体检与自动降级（T3-3，方案 §4.5）：纯逻辑层，不碰进程、不连 CDP——入口（dreamskin.mjs）
// 负责在页面里求值部件在不在，再把结果喂给这里裁决，并按裁决决定注入哪些层。
// 裁决规则（§4.5）：
// - 必需部件（parts-map 里 required: true）缺失比例 > 30% -> 兼容模式（mode: 'compat'）：
//   自动撤下部件层与额外层，只保留变量层 + 壁纸（壁纸挂载点 app.root 的规则保留，见 degradedPartsCss）。
// - 对比度：正文阈值 4.5:1、大字阈值 3:1（沿用 2.1 的 contrast 计算与阈值）；正文不达标 ->
//   needsScrimRaise，apply 时自动把整体遮罩浓度（scrim）提高一档，再不达标由 check 提示用户。
// 部件在不在的页面求值表达式由 partsProbeExpr 生成：只查选择器命中（querySelector），
// 不读页面内容、不碰 Cookie / localStorage、不发网络请求（§4.8）。
import { formsOf, renderPartsCss } from '../parts/parts.mjs';

export const REQUIRED_MISSING_LIMIT = 0.3; // 必需部件缺失比例上限（§4.5：>30% 降级）
export const CONTRAST_BODY_MIN = 4.5;
export const CONTRAST_LARGE_MIN = 3;
export const SCRIM_BUMP = 25; // 遮罩「提高一档」= scrim（0-200 的百分比）+25 个点

// parts-map -> 体检清单：[{ id, required, requiredWhen, selectors }]
// selectors 汇集该部件全部形态的选择器字符串，页面里命中任意一个即算部件在。
// requiredWhen（§4.4 示例字段）：该选择器不在页面里时，这个部件本就不适用，标 skip 不计入分母。
export function partChecksOf(partsMap) {
  if (!partsMap || typeof partsMap !== 'object') return [];
  return Object.entries(partsMap).map(([id, entry]) => {
    const obj = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    return {
      id,
      required: obj.required === true,
      requiredWhen: typeof obj.requiredWhen === 'string' ? obj.requiredWhen : '',
      selectors: [...formsOf(entry).values()],
    };
  });
}

// 在页面里求值部件状态的表达式，结果 { <部件 id>: 'present' | 'missing' | 'skip' }。
export function partsProbeExpr(checks) {
  const compact = (checks || []).map((c) => ({ id: c.id, when: c.requiredWhen || '', sels: c.selectors || [] }));
  return `(() => {
  const has = (q) => { try { return !!document.querySelector(q); } catch { return false; } };
  const out = {};
  for (const c of ${JSON.stringify(compact)}) {
    if (c.when && !has(c.when)) { out[c.id] = 'skip'; continue; }
    out[c.id] = (c.sels || []).some((q) => has(q)) ? 'present' : 'missing';
  }
  return out;
})()`;
}

// 裁决：partStates 是 partsProbeExpr 的求值结果；contrast 是正文对比度（数字，未知传 null）。
export function evaluateHealth({ partStates = {}, checks = [], contrast = null } = {}) {
  const partsOk = [];
  const partsMissing = [];
  let requiredTotal = 0;
  let requiredMissing = 0;
  for (const c of checks) {
    const st = partStates[c.id];
    if (st === 'skip' || st === undefined) continue; // 不适用 / 没查到：不计入
    if (st === 'present') partsOk.push(c.id);
    else partsMissing.push(c.id);
    if (c.required) {
      requiredTotal++;
      if (st !== 'present') requiredMissing++;
    }
  }
  const ratio = requiredTotal ? requiredMissing / requiredTotal : 0;
  const c = typeof contrast === 'number' && Number.isFinite(contrast) && contrast > 0 ? contrast : null;
  return {
    partsOk,
    partsMissing,
    requiredTotal,
    requiredMissing,
    requiredMissingRatio: ratio,
    mode: ratio > REQUIRED_MISSING_LIMIT ? 'compat' : 'full',
    contrast: c,
    contrastOk: c === null ? null : c >= CONTRAST_BODY_MIN,
    contrastLargeOk: c === null ? null : c >= CONTRAST_LARGE_MIN,
    needsScrimRaise: c !== null && c < CONTRAST_BODY_MIN,
  };
}

// 兼容模式下部件层只保留 app.root（§4.4：整窗底板，壁纸层挂在这里）渲染出的规则；
// 没有 app.root 的应用就是空。渲染仍走 parts/ 的同一套模板展开，不另写选择器。
export function wallpaperPartsCss(partsMap) {
  if (!partsMap || !partsMap['app.root']) return '';
  return renderPartsCss({ 'app.root': partsMap['app.root'] });
}

// 把三层降级成兼容模式：变量层原样（配色与壁纸都在变量层），部件层只剩壁纸挂载，额外层撤掉。
export function degradeLayers(layers, partsMap) {
  return { vars: layers.vars || '', parts: wallpaperPartsCss(partsMap), extra: '' };
}

// 对比度不达标时把整体遮罩浓度提高一档（§4.5）。settings 是 theme 的 SETTINGS
//（Obsidian 式分组对象 { settings: [...] }，传裸数组也行），取 scrim 的 min/max/default；
// 已到上限返回 null（提不动了，交给 check 提示用户）。不改传入的 values，返回新对象。
export function bumpScrim(values, settings) {
  const list = Array.isArray(settings) ? settings : (settings && settings.settings) || [];
  const decl = list.find((s) => s && s.id === 'scrim');
  const min = decl && Number.isFinite(decl.min) ? decl.min : 0;
  const max = decl && Number.isFinite(decl.max) ? decl.max : 200;
  const dflt = decl && Number.isFinite(decl.default) ? decl.default : 100;
  const cur = values && Number.isFinite(Number(values.scrim)) ? Number(values.scrim) : dflt;
  const next = Math.min(max, Math.max(min, cur + SCRIM_BUMP));
  if (next === cur) return null;
  return { ...(values || {}), scrim: next };
}
