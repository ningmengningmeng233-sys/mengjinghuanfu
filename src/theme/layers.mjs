// 主题三层（T3-2，方案 §4.4）：变量层 / 部件层 / 额外层分别生成、分别注入（不同 <style id>）。
// - 变量层：buildVarsCss(调色板 + 壁纸 + 参数)，所有应用通用，实时预览只换这一层（经 live 层覆盖，见 dreamskin.mjs 的 live 会话）。
// - 部件层：parts/ 模板按各应用 parts-map 渲染好的 CSS（profile.partsCss）。
// - 额外层：各应用独有、无语义部件可归的修补（profile.extraCss）。
// 落盘：active-skin.css 改存 JSON（format 字段标记），守护进程按层重注入；2.1 的纯 CSS 老文件按整份当部件层兼容读。
import { buildVarsCss } from './cherry-skin-css.mjs';

export const SKIN_FILE_FORMAT = 'dreamskin-skin/1';

export function buildSkinLayers(app, palette, imageUri = '', values = {}) {
  if (!app || typeof app !== 'object') throw new Error('buildSkinLayers: app 不能为空');
  return {
    vars: buildVarsCss(palette, imageUri, values),
    parts: app.partsCss || '',
    extra: app.extraCss || '',
  };
}

// 三层拼回 2.1 的单份 CSS 文本（部件层 + 额外层 + 变量层），顺序与 2.1 的 RULES + vars 一致。
export function joinLayers(layers) {
  return [layers.parts, layers.extra, layers.vars].filter((s) => s && s.trim()).join('\n');
}

export function layersLength(layers) {
  return (layers.parts || '').length + (layers.extra || '').length + (layers.vars || '').length;
}

export function serializeSkinFile(layers) {
  return JSON.stringify({ format: SKIN_FILE_FORMAT, layers: { vars: layers.vars || '', parts: layers.parts || '', extra: layers.extra || '' } });
}

export function parseSkinFile(text) {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (j && j.format === SKIN_FILE_FORMAT && j.layers && typeof j.layers === 'object') {
      return { vars: j.layers.vars || '', parts: j.layers.parts || '', extra: j.layers.extra || '' };
    }
  } catch {}
  // 2.1 老格式：整份就是一段 CSS（规则段 + 变量段），当作部件层整份注入，视觉不变。
  return { vars: '', parts: String(text), extra: '' };
}
