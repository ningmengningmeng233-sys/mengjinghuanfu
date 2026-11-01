// 脱敏 DOM 快照（Q-1，方案 §6 Q-1）：把一个已带调试端口运行的应用主窗口 DOM
// 抓成「只有结构、没有内容」的骨架，供部件命中率测试（core/parts-hit.mjs）离线跑。
//
// 脱敏口径（方案 §4.8）：
// - 只保留标签名与三类属性：id、class、data-*（部件地图的锚点只用这些）；其余属性
//   （href / src / title / value / placeholder / style 等，可能带用户内容）一律丢弃；
// - 绝不读取文本内容、输入值、Cookie、localStorage，也不发网络请求——抓取靠调用方
//   已建立的 CDP 会话（core/cdp-core.mjs 的 CdpSession.evaluate），本模块只生成
//   页面求值表达式与做序列化 / 解析。
//
// 快照文件格式：脱敏 HTML（treeToHtml 输出），首行可带一条元信息注释
// <!-- dreamskin-dom-snapshot/1 app=<适配器 id> synthetic=<true|false> -->，解析时忽略。
// 骨架树节点形状：{ tag, attrs: { 属性名: 值 }, children: [...] }。

export const SNAPSHOT_SCHEMA = 'dreamskin-dom-snapshot/1';
export const SNAPSHOT_MAX_DEPTH = 40;
export const SNAPSHOT_MAX_NODES = 20000;

// 属性白名单：部件锚点只需要 id / class / data-*。
export function isKeptAttr(name) {
  return name === 'id' || name === 'class' || (typeof name === 'string' && name.startsWith('data-'));
}

// 页面内提取函数。刻意写成自包含（不引用模块作用域的任何东西）：snapshotExpr()
// 用它的源码拼 CDP 求值表达式，页面里跑的和 Node 单测里跑的是同一份逻辑。
// 入参 root 是 DOM 元素；只读 tagName / attributes / children 三样，不碰文本与值。
export function extractSkeleton(root, maxDepth, maxNodes) {
  const depthLimit = typeof maxDepth === 'number' ? maxDepth : 40;
  const nodeLimit = typeof maxNodes === 'number' ? maxNodes : 20000;
  let count = 0;
  const walk = (el, depth) => {
    if (!el || count >= nodeLimit) return null;
    count += 1;
    const node = { tag: String(el.tagName || '').toLowerCase(), attrs: {}, children: [] };
    const attrs = el.attributes || [];
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (a.name === 'id' || a.name === 'class' || a.name.indexOf('data-') === 0) node.attrs[a.name] = String(a.value);
    }
    if (depth < depthLimit) {
      const kids = el.children || [];
      for (let i = 0; i < kids.length; i++) {
        const child = walk(kids[i], depth + 1);
        if (child) node.children.push(child);
      }
    }
    return node;
  };
  return walk(root, 0);
}

// 在页面里求值的完整表达式：对主窗口 documentElement 跑提取。
export function snapshotExpr() {
  return `(${extractSkeleton.toString()})(document.documentElement)`;
}

// 经已建立的 CDP 会话抓一次快照，返回骨架树。session 只需有 evaluate(表达式)。
export async function captureSnapshotTree(session) {
  const tree = await session.evaluate(snapshotExpr());
  if (!tree || typeof tree !== 'object' || typeof tree.tag !== 'string' || !tree.tag) {
    throw new Error('快照抓取失败：页面没有返回 DOM 骨架');
  }
  return tree;
}

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 骨架树 -> 脱敏 HTML（确定性缩进格式，夹具就存这个）。
export function treeToHtml(tree) {
  const lines = [];
  const render = (node, depth) => {
    const pad = '  '.repeat(depth);
    const attrs = Object.entries(node.attrs || {}).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
    const kids = node.children || [];
    if (!kids.length) { lines.push(`${pad}<${node.tag}${attrs}></${node.tag}>`); return; }
    lines.push(`${pad}<${node.tag}${attrs}>`);
    for (const c of kids) render(c, depth + 1);
    lines.push(`${pad}</${node.tag}>`);
  };
  render(tree, 0);
  return lines.join('\n') + '\n';
}

// 快照文件全文：元信息注释 + 脱敏 HTML。
export function snapshotFileText(tree, meta = {}) {
  const app = meta.app ? String(meta.app) : '';
  const synthetic = meta.synthetic ? 'true' : 'false';
  return `<!-- ${SNAPSHOT_SCHEMA} app=${app} synthetic=${synthetic} -->\n` + treeToHtml(tree);
}

// 读快照文件首行注释里的元信息；没有就返回 null。
export function parseSnapshotMeta(html) {
  const m = /<!--\s*(dreamskin-dom-snapshot\/1)\s+([^>]*)-->/.exec(String(html || ''));
  if (!m) return null;
  const meta = { schema: m[1], app: '', synthetic: false };
  for (const kv of m[2].trim().split(/\s+/)) {
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    const k = kv.slice(0, eq);
    const v = kv.slice(eq + 1);
    if (k === 'app') meta.app = v;
    if (k === 'synthetic') meta.synthetic = v === 'true';
  }
  return meta;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const unescapeAttr = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function parseAttrs(text) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(text))) attrs[m[1]] = unescapeAttr(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

function findTagEnd(text, lt) {
  let quote = '';
  for (let i = lt + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return -1;
}

// 脱敏 HTML -> 骨架树。只认标签与属性，标签之间的任何文本一律忽略（脱敏 HTML
// 本来就没有文本；万一混进来也不会被带进树里）。注释与 doctype 跳过。
export function parseSnapshotHtml(html) {
  const text = String(html || '');
  const virtual = { tag: '#root', attrs: {}, children: [] };
  const stack = [virtual];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<!', lt) || text.startsWith('<?', lt)) {
      const end = text.indexOf('>', lt);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    const gt = findTagEnd(text, lt);
    if (gt < 0) break;
    const raw = text.slice(lt + 1, gt);
    i = gt + 1;
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === name) { stack.length = s; break; }
      }
      continue;
    }
    const selfClose = /\/\s*$/.test(raw);
    const body = selfClose ? raw.replace(/\/\s*$/, '') : raw;
    const sp = body.search(/\s/);
    const tag = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
    if (!tag) continue;
    const node = { tag, attrs: parseAttrs(sp < 0 ? '' : body.slice(sp + 1)), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose && !VOID_TAGS.has(tag)) stack.push(node);
  }
  const top = virtual.children.find((c) => c.tag === 'html') || virtual.children[0];
  if (!top) throw new Error('快照里没有任何元素');
  return top;
}
