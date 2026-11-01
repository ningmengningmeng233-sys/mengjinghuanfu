// 语义部件层（T3-1，方案 §4.4）：跨应用的部件清单 parts.json + 写一次的样式模板 templates/*.css。
// 主题不再直接写选择器：模板用 {{selector}} / {{selector:<形态>}} 占位，各应用用 parts-map 给出
// 每个部件在自己 DOM 里的选择器（可带多种形态，如 scope / pane / card），渲染时展开成部件层 CSS。
// 本模块只做纯数据活：加载 / 校验清单与模板 / 按 map 渲染。不碰进程、不碰网络、不读页面内容。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARTS_SCHEMA = 'dreamskin-parts/1';
export const PARTS_DIR = fileURLToPath(new URL('.', import.meta.url));
export const PARTS_FILE = join(PARTS_DIR, 'parts.json');
export const TEMPLATES_DIR = join(PARTS_DIR, 'templates');

const PART_ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
const SCOPES = ['all', 'chat', 'ide'];
const FORM_RE = /^[a-z][a-z0-9-]*$/;
const PLACEHOLDER_RE = /\{\{selector(?::([a-z][a-z0-9-]*))?\}\}/g;
const ANY_PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;
const PART_HEADER_RE = /^\/\*\s*part:\s*([a-z0-9.]+)(?:\s*;\s*require:\s*([a-z0-9,\s-]+))?\s*\*\//;

// ---- 部件清单 ----
export function validateParts(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['parts.json 必须是一个 JSON 对象'];
  if (data.schema !== PARTS_SCHEMA) errors.push('schema 必须是 "' + PARTS_SCHEMA + '"');
  if (!Array.isArray(data.parts) || data.parts.length === 0) { errors.push('parts 必须是非空数组'); return errors; }
  const seen = new Set();
  for (const [i, p] of data.parts.entries()) {
    const at = 'parts[' + i + ']';
    if (!p || typeof p !== 'object') { errors.push(at + ' 必须是对象'); continue; }
    if (typeof p.id !== 'string' || !PART_ID_RE.test(p.id)) errors.push(at + '.id 不合规：' + p.id);
    else if (seen.has(p.id)) errors.push('部件 id 重复：' + p.id);
    else seen.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push(at + '（' + p.id + '）.name 不能为空');
    if (!SCOPES.includes(p.scope)) errors.push(at + '（' + p.id + '）.scope 必须是 ' + SCOPES.join(' | '));
  }
  return errors;
}

export function loadParts(file = PARTS_FILE) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const errors = validateParts(data);
  if (errors.length) throw new Error('部件清单不合法（' + file + '）：' + errors.join('；'));
  return data;
}

export function partIds(parts = loadParts()) {
  return parts.parts.map((p) => p.id);
}

// ---- 模板 ----
export function parseTemplate(file, text) {
  const errors = [];
  const head = PART_HEADER_RE.exec(text.trimStart());
  const part = head ? head[1] : null;
  if (!part) errors.push(file + '：缺少开头声明 /* part: <部件 id> */');
  // 模板头可声明必填形态：/* part: app.root; require: scope, selector */（selector 指默认形态）。
  // 必填形态缺失 = map 写漏了，渲染时报错；非必填形态整块缺失则跳过该块（有的应用天生没有这块）。
  const requiredForms = new Set();
  if (head && head[2]) {
    for (const f of head[2].split(/[\s,]+/).filter(Boolean)) requiredForms.add(f === 'selector' ? '' : f);
  }
  const forms = new Set();
  for (const m of text.matchAll(ANY_PLACEHOLDER_RE)) {
    const ph = m[0];
    const one = /^\{\{selector(?::([a-z][a-z0-9-]*))?\}\}$/.exec(ph);
    if (!one) { errors.push(file + '：不认识的占位符 ' + ph + '（只允许 {{selector}} 与 {{selector:<形态>}}）'); continue; }
    forms.add(one[1] || '');
  }
  if (forms.size === 0) errors.push(file + '：模板里没有任何 {{selector}} 占位符');
  for (const f of requiredForms) {
    if (!forms.has(f)) errors.push(file + '：require 声明的形态「' + (f || 'selector') + '」在模板里根本没用到');
  }
  return { file, part, forms, requiredForms, text, errors };
}

export function loadTemplates(dir = TEMPLATES_DIR) {
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.css')).sort()) {
    out.push(parseTemplate(name, readFileSync(join(dir, name), 'utf8')));
  }
  return out;
}

// 模板引用的部件必须都在清单里；同一部件不许有两份模板；模板自身的错误一并报出。
export function validateTemplates(parts, templates) {
  const errors = [];
  const ids = new Set(partIds(parts));
  const seen = new Map();
  for (const t of templates) {
    errors.push(...t.errors);
    if (!t.part) continue;
    if (!ids.has(t.part)) errors.push(t.file + '：声明的部件 ' + t.part + ' 不在 parts.json 清单里');
    if (seen.has(t.part)) errors.push('部件 ' + t.part + ' 有两份模板：' + seen.get(t.part) + ' 与 ' + t.file);
    else seen.set(t.part, t.file);
  }
  return errors;
}

// 把一份模板按 CSS 规则分块：注释行归入紧随其后的规则块，深度回到 0 的 '}' 行结束一块。
// 不依赖空行分段（写入工具可能吃掉空行）。模板都是平铺规则、声明值里没有大括号，计数可靠。
function splitCssBlocks(text) {
  const blocks = [];
  let cur = [];
  let depth = 0;
  for (const line of text.split('\n')) {
    cur.push(line);
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth === 0 && line.includes('}')) { blocks.push(cur.join('\n')); cur = []; }
  }
  if (cur.join('').trim()) blocks.push(cur.join('\n'));
  return blocks;
}

// ---- parts-map 与渲染 ----
// map 形状：{ <部件 id>: "<选择器>" | { selector: "<默认形态>", <形态>: "<选择器>", ... }, ... }
// 对象里非字符串的值（如 required: true 这类体检元数据，见方案 §4.4）不是形态，渲染时忽略。
export function formsOf(entry) {
  const forms = new Map();
  if (typeof entry === 'string') { forms.set('', entry); return forms; }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === 'string' && v) forms.set(k === 'selector' ? '' : k, v);
    }
  }
  return forms;
}

export function validatePartsMap(map, parts = loadParts()) {
  const errors = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ['parts-map 必须是一个对象'];
  const ids = new Set(partIds(parts));
  for (const [id, entry] of Object.entries(map)) {
    if (!ids.has(id)) { errors.push('parts-map 里的部件 ' + id + ' 不在 parts.json 清单里'); continue; }
    if (typeof entry !== 'string' && (!entry || typeof entry !== 'object' || Array.isArray(entry))) {
      errors.push('部件 ' + id + ' 的 map 值必须是选择器字符串或对象');
      continue;
    }
    const forms = formsOf(entry);
    if (forms.size === 0) errors.push('部件 ' + id + ' 没有给出任何选择器');
    for (const [f, sel] of forms) {
      if (f && !FORM_RE.test(f)) errors.push('部件 ' + id + ' 的形态名不合规：' + f);
      if (!sel.trim()) errors.push('部件 ' + id + ' 的形态「' + (f || '默认') + '」选择器为空');
    }
  }
  return errors;
}

// 按 map 把模板展开成部件层 CSS。规则：
// - 没给 map 的部件，整份模板跳过；
// - 模板头 require 声明的必填形态在 map 里缺失 -> 抛错（这是写漏了，不是应用没有）；
// - 按空行分块渲染：一整块用到的形态全都缺失 -> 跳过这一块（该应用没有这块，如 Cherry 没有 main 形态）；
//   一块里只缺一部分形态 -> 抛错（多半是形态名写错）。
// 模板顺序 = 文件名排序（loadTemplates 已排序），渲染结果稳定可比对。
export function renderPartsCss(map, opts = {}) {
  const parts = opts.parts || loadParts();
  const templates = opts.templates || loadTemplates();
  const terrors = validateTemplates(parts, templates);
  if (terrors.length) throw new Error('模板不合法：' + terrors.join('；'));
  const merrors = validatePartsMap(map, parts);
  if (merrors.length) throw new Error('parts-map 不合法：' + merrors.join('；'));
  const chunks = [];
  for (const t of templates) {
    const entry = map[t.part];
    if (entry === undefined) continue;
    const forms = formsOf(entry);
    for (const f of t.requiredForms) {
      if (!forms.has(f)) {
        throw new Error('parts-map 缺少部件 ' + t.part + ' 的必填 selector 形态：' + (f || 'selector') + '（模板 ' + t.file + ' 在头部 require 里声明了）');
      }
    }
    const kept = [];
    for (const block of splitCssBlocks(t.text)) {
      const used = new Set();
      for (const m of block.matchAll(PLACEHOLDER_RE)) used.add(m[1] || '');
      if (used.size === 0) { kept.push(block); continue; }
      const missing = [...used].filter((f) => !forms.has(f));
      if (missing.length === used.size) continue; // 整块的形态都没有：这个应用没有这一块
      if (missing.length) {
        throw new Error('parts-map 缺少部件 ' + t.part + ' 的 selector 形态：' + missing.join(', ') + '（模板 ' + t.file + ' 的某一块只给了一部分）');
      }
      kept.push(block.replace(PLACEHOLDER_RE, (ph, form) => forms.get(form || '')));
    }
    const css = kept.join('\n\n').trim();
    if (css) chunks.push(css);
  }
  return chunks.join('\n\n');
}

export function templatesExist() {
  return existsSync(TEMPLATES_DIR) && existsSync(PARTS_FILE);
}
