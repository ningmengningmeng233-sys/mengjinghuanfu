// 部件命中率（Q-1，方案 §6 Q-1）：离线拿脱敏 DOM 快照（core/dom-snapshot.mjs 的
// 骨架树），逐个部件对照 parts-map 的选择器判命中，产出命中率报告。
//
// 裁决口径不另起一套：命中状态与 core/health.mjs 的 partsProbeExpr 完全一致——
// requiredWhen 选择器不在场 -> 'skip' 不计入；任一形态的选择器命中 -> 'present'；
// 都不中 -> 'missing'。最终 mode 直接由 health.evaluateHealth 裁决，保证离线夹具
// 与真机 check 的结论同口径（同一份缺失清单喂 health 必得同一 mode）。
//
// 选择器引擎是为快照骨架树写的最小实现，覆盖现行 parts-map 实际用到的语法：
// 标签 / #id / .class / [attr] / [attr=v] / [attr*=v] / [attr^=v] / [attr$=v] /
// [attr~=v]、逗号列表、后代与子级（>）组合子、:has(...)（含 :has(> ...) 相对
// 选择器，按锚点口径匹配）、:not(...)。其余伪类
// （:hover、:focus-within 等状态类）静态不可判，一律按「不影响命中」处理。
// 不支持的组合子（+ / ~）会抛错，不会静默给错结论。
import { partChecksOf, evaluateHealth } from './health.mjs';

// ---------- 选择器解析 ----------

function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0;
  let bracket = 0;
  let quote = '';
  let cur = '';
  for (const ch of String(text)) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    if (ch === sep && depth === 0 && bracket === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const IDENT_CHAR = /[A-Za-z0-9_-]/;

function readIdent(text, i) {
  let j = i;
  while (j < text.length && IDENT_CHAR.test(text[j])) j++;
  return [text.slice(i, j), j];
}

function readBalanced(text, i, open, close) {
  // text[i] 必须是 open；返回 [括号内文本, close 之后的下标]
  let depth = 0;
  let quote = '';
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return [text.slice(i + 1, j), j + 1];
    }
  }
  throw new Error('选择器括号不配平：' + text);
}

function parseAttr(inner) {
  const m = /^\s*([^\s~|^$*!=]+)\s*(?:(~=|\|=|\^=|\$=|\*=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*$/.exec(inner);
  if (!m) throw new Error('不支持的属性选择器：[' + inner + ']');
  return { t: 'attr', name: m[1], op: m[2] || '', value: m[3] ?? m[4] ?? m[5] ?? '' };
}

// 从下标 i 起读一个简单选择器，返回 [simple, 下一个下标]
function readSimple(text, i) {
  const ch = text[i];
  if (ch === '*') return [{ t: 'any' }, i + 1];
  if (ch === '#') { const [v, j] = readIdent(text, i + 1); return [{ t: 'id', value: v }, j]; }
  if (ch === '.') { const [v, j] = readIdent(text, i + 1); return [{ t: 'class', value: v }, j]; }
  if (ch === '[') {
    const [inner, j] = readBalanced(text, i, '[', ']');
    return [parseAttr(inner), j];
  }
  if (ch === ':') {
    const [name, afterName] = readIdent(text, i + 1);
    if (text[afterName] === '(') {
      const [arg, j] = readBalanced(text, afterName, '(', ')');
      if (name === 'has') return [{ t: 'has', list: parseSelectorList(arg) }, j];
      if (name === 'not') return [{ t: 'not', list: parseSelectorList(arg) }, j];
      return [{ t: 'pseudo', name }, j]; // 带参的其他伪类：静态按不影响命中处理
    }
    return [{ t: 'pseudo', name }, afterName];
  }
  const [v, j] = readIdent(text, i);
  if (!v) throw new Error('不支持的选择器语法（位置 ' + i + '）：' + text);
  return [{ t: 'tag', value: v.toLowerCase() }, j];
}

// 一条复杂选择器 -> [{ combinator: null | ' ' | '>', compound: [simple...] }, ...]
function parseComplex(text) {
  const parts = [];
  let i = 0;
  let combinator = null;
  const skipWs = () => {
    let had = false;
    while (i < text.length && /\s/.test(text[i])) { i++; had = true; }
    return had;
  };
  skipWs();
  if (text[i] === '>' || text[i] === '+' || text[i] === '~') {
    if (text[i] !== '>') throw new Error('命中率引擎暂不支持组合子 ' + text[i] + '：' + text);
    combinator = '>'; // 相对选择器（:has(> ...) 形态）：首个组合子记在第一段上，匹配时按锚点处理
    i++;
    skipWs();
  }
  while (i < text.length) {
    const compound = [];
    while (i < text.length) {
      const ch = text[i];
      if (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch)) break;
      const [simple, j] = readSimple(text, i);
      compound.push(simple);
      i = j;
    }
    if (!compound.length) throw new Error('不支持的选择器语法：' + text);
    parts.push({ combinator, compound });
    const hadWs = skipWs();
    if (i < text.length && text[i] === '>') { combinator = '>'; i++; skipWs(); }
    else if (i < text.length && (text[i] === '+' || text[i] === '~')) {
      throw new Error('命中率引擎暂不支持组合子 ' + text[i] + '：' + text);
    } else if (i < text.length) combinator = hadWs ? ' ' : null;
  }
  return parts;
}

function parseSelectorList(text) {
  return splitTopLevel(text, ',').map(parseComplex).filter((p) => p.length);
}

// ---------- 匹配 ----------

function descendantsOf(node, ancestors) {
  const out = [];
  const walk = (n, anc) => {
    for (const c of n.children || []) {
      out.push([c, anc]);
      walk(c, [...anc, c]);
    }
  };
  walk(node, [...ancestors, node]);
  return out;
}

function matchSimple(node, ancestors, s, ctx) {
  const attrs = node.attrs || {};
  switch (s.t) {
    case 'any': return true;
    case '__anchor': return !!ctx && node === ctx.anchor;
    case 'tag': return node.tag === s.value;
    case 'id': return attrs.id === s.value;
    case 'class': return typeof attrs.class === 'string' && attrs.class.split(/\s+/).includes(s.value);
    case 'attr': {
      if (!(s.name in attrs)) return false;
      if (!s.op) return true;
      const v = String(attrs[s.name]);
      if (s.op === '=') return v === s.value;
      if (s.op === '*=') return v.includes(s.value);
      if (s.op === '^=') return v.startsWith(s.value);
      if (s.op === '$=') return v.endsWith(s.value);
      if (s.op === '~=') return v.split(/\s+/).includes(s.value);
      if (s.op === '|=') return v === s.value || v.startsWith(s.value + '-');
      return false;
    }
    case 'has':
      return descendantsOf(node, ancestors).some(([d, anc]) => s.list.some((cx) => {
        if (cx.length && cx[0].combinator) {
          // 相对选择器：给它接一个「就是当前节点」的锚点段，按锚点口径匹配
          const anchored = [{ combinator: null, compound: [{ t: '__anchor' }] }, ...cx];
          return matchComplex(d, anc, anchored, { anchor: node });
        }
        return matchComplex(d, anc, cx);
      }));
    case 'not':
      return !s.list.some((cx) => matchComplex(node, ancestors, cx));
    case 'pseudo': return true; // 状态类伪类静态不可判，不影响命中
    default: return false;
  }
}

function matchCompound(node, ancestors, compound, ctx) {
  return compound.every((s) => matchSimple(node, ancestors, s, ctx));
}

// parts[idx] 是主体，ancestors 是 node 的祖先链（根在前、父在后）
function matchFrom(node, ancestors, parts, idx, ctx) {
  if (!matchCompound(node, ancestors, parts[idx].compound, ctx)) return false;
  if (idx === 0) return true;
  const comb = parts[idx].combinator || ' ';
  if (comb === '>') {
    if (!ancestors.length) return false;
    return matchFrom(ancestors[ancestors.length - 1], ancestors.slice(0, -1), parts, idx - 1, ctx);
  }
  for (let a = ancestors.length - 1; a >= 0; a--) {
    if (matchFrom(ancestors[a], ancestors.slice(0, a), parts, idx - 1, ctx)) return true;
  }
  return false;
}

function matchComplex(node, ancestors, parts, ctx) {
  return parts.length > 0 && matchFrom(node, ancestors, parts, parts.length - 1, ctx);
}

// 在骨架树里查选择器命中的节点（文档序，去重）。root 本身也参与匹配。
export function queryAll(root, selector) {
  const list = parseSelectorList(selector);
  const out = [];
  const seen = new Set();
  const walk = (node, ancestors) => {
    if (list.some((cx) => matchComplex(node, ancestors, cx)) && !seen.has(node)) {
      seen.add(node);
      out.push(node);
    }
    const next = [...ancestors, node];
    for (const c of node.children || []) walk(c, next);
  };
  if (root) walk(root, []);
  return out;
}

export function queryFirst(root, selector) {
  return queryAll(root, selector).length > 0;
}

// ---------- 命中裁决（与 health 同口径） ----------

// 逐部件命中状态：{ <部件 id>: 'present' | 'missing' | 'skip' }，语义同 partsProbeExpr。
export function partStatesOf(partsMap, tree) {
  const checks = partChecksOf(partsMap);
  const states = {};
  for (const c of checks) {
    if (c.requiredWhen && !queryFirst(tree, c.requiredWhen)) { states[c.id] = 'skip'; continue; }
    states[c.id] = c.selectors.some((q) => queryFirst(tree, q)) ? 'present' : 'missing';
  }
  return { checks, states };
}

// 命中率报告：逐部件状态 + 命中率 + health 裁决出的 mode。
// partsMap 为空（新适配器尚未补锚点）时 checks 为空、mode 为 'full'、命中率为 null——
// 那只表示「还没有可测的部件」，不表示适配完成，报告消费方须连同 requiredTotal 一起看。
export function hitReport(partsMap, tree, { contrast = null } = {}) {
  const { checks, states } = partStatesOf(partsMap, tree);
  const health = evaluateHealth({ partStates: states, checks, contrast });
  const counted = health.partsOk.length + health.partsMissing.length;
  return {
    parts: checks.map((c) => ({ id: c.id, required: c.required, status: states[c.id] || 'skip', selectors: c.selectors })),
    partsOk: health.partsOk,
    partsMissing: health.partsMissing,
    requiredTotal: health.requiredTotal,
    requiredMissing: health.requiredMissing,
    requiredMissingRatio: health.requiredMissingRatio,
    hitRate: counted ? health.partsOk.length / counted : null,
    requiredHitRate: health.requiredTotal ? (health.requiredTotal - health.requiredMissing) / health.requiredTotal : null,
    mode: health.mode,
  };
}
