// 主题库：直接浏览 DreamSkin 社区主题库（dreamskin.cc，Codex Dream Skin 的官方主题站），
// 一键下载到本机，把它的 theme.json 配色映射成我们的调色板，Cherry / ZCode 两端都能用。
//
// 接口（公开、无需登录）：
//   GET https://api.dreamskin.cc/v1/themes?sort=popular|favorites|recent&limit=&offset=&q=
//   GET https://api.dreamskin.cc/v1/themes/<id>/preview/thumbnail?variant=home   缩略图 JPG
//   GET https://api.dreamskin.cc/v1/themes/<id>/download                        主题包 zip
// 主题包 = manifest.json + theme.json + theme.css + background.*；theme.json 与 Codex Dream Skin
// 的格式相同（colors 十色 + art.focusX/focusY + appearance）。theme.css 是 Codex 专用选择器，这里不用。
//
// 缓存：%LOCALAPPDATA%\DreamSkin\gallery\thumbs\<id>.jpg、gallery\<id>\{theme.json, info.json, background.*}
// 只下载到本机自用，不进仓库、不再分发；每套都带作者与许可证，总控台选中时会显示。
import { existsSync, rmSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { rootDir } from './cherry-env.mjs';

const API = 'https://api.dreamskin.cc/v1/themes';
export const SITE = 'https://dreamskin.cc/themes/';
const SORTS = new Set(['popular', 'favorites', 'recent']);
const MAX_PKG = 30 * 1024 * 1024;

const galleryDir = () => { const d = join(rootDir(), 'gallery'); mkdirSync(join(d, 'thumbs'), { recursive: true }); return d; };
const safeId = (id) => { if (!/^ver_[a-z0-9]{8,40}$/.test(String(id || ''))) throw new Error('无效的主题 id：' + id); return id; };

async function get(url, { binary = false, timeout = 30000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'DreamSkin-2.0 (theme gallery)' } });
    if (!r.ok) throw new Error(`主题库返回 ${r.status}`);
    return binary ? Buffer.from(await r.arrayBuffer()) : await r.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '连接主题库超时' : (e.message || String(e)));
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------ 配色映射
// 主题包里的颜色有 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() 几种写法；半透明色取它的 RGB
// （原主题是叠在壁纸上的，我们这边透明度由滑块控制）。认不出的才用默认值。
function toHex(s) {
  const v = String(s || '').trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    if (h.length === 6 || h.length === 8) return '#' + h.slice(0, 6);
    return '';
  }
  m = v.match(/^rgba?\(\s*([\d.]+)%?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(Number(x)))).toString(16).padStart(2, '0')).join('');
  return '';
}
const hex = (s, d) => toHex(s) || d;
function lum(h) {
  const n = parseInt(h.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// DreamSkin 十色 → 我们的 { bg, panel, bubble, accent, glow, text, muted, accentText }。
// 作者给的颜色偶尔不合用（比如 muted 几乎是纯黑），对比度不够就退回 text。
export function mapColors(colors = {}, appearance = 'auto') {
  const dark0 = appearance === 'dark' ? true : appearance === 'light' ? false : null;
  const bg = hex(colors.background, dark0 === false ? '#f4f5f7' : '#1b1b1f');
  const dark = dark0 !== null ? dark0 : lum(bg) < 0.25;
  const text = hex(colors.text, dark ? '#ececf1' : '#1f2328');
  const panel = hex(colors.panel, bg);
  const bubble = hex(colors.panelAlt, panel);
  const accent = hex(colors.accent, hex(colors.highlight, '#c9a96e'));
  const glow = hex(colors.secondary, hex(colors.highlight, accent));
  let muted = hex(colors.muted, text);
  if (contrast(muted, bg) < 2.2) muted = text;
  const accentText = contrast('#ffffff', accent) >= contrast('#111111', accent) ? '#ffffff' : '#111111';
  return { dark, bg, panel, bubble, accent, glow, text, muted, accentText };
}

const pct = (x, d) => (Number.isFinite(Number(x)) ? Math.round(Math.min(1, Math.max(0, Number(x))) * 100) : d);

// 列表项 / 已下载主题 → 统一的调色板条目（group = gallery，key = ds-<id>）。
function toEntry(meta, image) {
  const art = meta.art || {};
  const c = mapColors(meta.colors, meta.appearance);
  return {
    key: 'ds-' + meta.id, group: 'gallery', name: String(meta.name || '未命名').replace(/[\u200b-\u200f\ufeff]/g, '').trim().slice(0, 40) || '未命名',
    ...c,
    // 社区壁纸多是满幅人物插画：默认把遮罩和聊天区底色压厚一些保证字看得清，嫌挡画就往回拉滑块。
    tune: { 'focus-x': pct(art.focusX, 50), 'focus-y': pct(art.focusY, 40),
      scrim: c.dark ? 130 : 160, 'chat-top': c.dark ? 30 : 42, 'chat-bottom': c.dark ? 40 : 52, blur: 22 },
    desc: [meta.author, meta.license].filter(Boolean).join(' · '),
    from: 'DreamSkin 主题库', author: meta.author || '', license: meta.license || '',
    downloads: meta.downloads || 0, favorites: meta.favorites || 0,
    url: SITE + meta.id, image: image || '', downloaded: !!meta.downloaded,
  };
}

// ------------------------------------------------------------ 浏览
async function fetchThumb(id) {
  const f = join(galleryDir(), 'thumbs', id + '.jpg');
  if (existsSync(f)) return f;
  try {
    const buf = await get(`${API}/${id}/preview/thumbnail?variant=home`, { binary: true, timeout: 20000 });
    if (!(buf[0] === 0xff && buf[1] === 0xd8) && buf.readUInt32BE(0) !== 0x89504e47 && buf.toString('ascii', 8, 12) !== 'WEBP') return '';
    writeFileSync(f, buf);
    return f;
  } catch { return ''; }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// ------------------------------------------------------------ 风格分类
// dreamskin.cc 没有风格标签。data/gallery-styles.json 是离线用 CLIP 零样本看缩略图分出来的（只存 id → 风格，
// 不存图片），用 tools/gen-gallery-styles.py 重新生成。表里没有的新主题按名字关键词猜，猜不出算「其他」。
export const STYLES = ['二次元', '真人', '风景', '城市', '国风', '游戏影视', '科幻', '极简', '萌趣', '其他'];
let styleMap = null;
function styleTable() {
  if (styleMap) return styleMap;
  try { styleMap = JSON.parse(readFileSync(new URL('./data/gallery-styles.json', import.meta.url), 'utf8')); } catch { styleMap = {}; }
  return styleMap;
}
const KEYWORDS = [
  ['萌趣', /萌|可爱|卡通|猫|狗|喵|汪|柴犬|宠|兔|熊猫|cat|dog|kitty|puppy/i],
  ['国风', /国风|水墨|古风|山水|汉服|仙|侠|敦煌|江南|ink|hanfu/i],
  ['科幻', /赛博|科幻|机甲|宇宙|星空|太空|未来|cyber|mecha|space|galaxy|neon/i],
  ['城市', /城市|夜景|街|都市|东京|上海|city|street|tokyo|urban/i],
  ['风景', /风景|山|海|湖|森林|雪|晨|雾|日落|云|花海|landscape|mountain|ocean|sea|forest|sunset|sky/i],
  ['极简', /极简|纯色|简约|渐变|minimal|gradient|mono/i],
  ['游戏影视', /漫威|电影|原神|崩坏|星铁|黑神话|悟空|王者|英雄联盟|lol|valorant|game/i],
];
export function styleOf(id, name = '') {
  const t = styleTable()[id];
  if (t && STYLES.includes(t)) return t;
  for (const [s, re] of KEYWORDS) if (re.test(String(name))) return s;
  return '其他';
}

// 按风格筛要看全量：把整个列表拉下来缓存 6 小时（每页 48 条，700 多套约 16 次请求，只有文字）。
async function fullIndex(sort, q) {
  const f = join(galleryDir(), `index-${sort}-${createHash('sha1').update(q || '').digest('hex').slice(0, 8)}.json`);
  try {
    const c = JSON.parse(readFileSync(f, 'utf8'));
    if (Date.now() - c.at < 6 * 3600 * 1000 && Array.isArray(c.items)) return c.items;
  } catch { /* 没缓存 */ }
  const all = [];
  for (let off = 0; off < 5000; off += 48) {
    const u = new URL(API);
    u.searchParams.set('sort', sort); u.searchParams.set('limit', '48'); u.searchParams.set('offset', String(off));
    if (q) u.searchParams.set('q', q);
    const d = await get(u.toString());
    const page = d.items || [];
    all.push(...page);
    if (!page.length || off + 48 >= (d.total || 0)) break;
  }
  writeFileSync(f, JSON.stringify({ at: Date.now(), items: all }), 'utf8');
  return all;
}

export async function listGallery({ sort = 'popular', offset = 0, limit = 24, q = '', style = '' } = {}) {
  if (style && STYLES.includes(style)) return listByStyle({ sort, offset, limit, q, style });
  const u = new URL(API);
  u.searchParams.set('sort', SORTS.has(sort) ? sort : 'popular');
  u.searchParams.set('limit', String(Math.min(48, Math.max(1, Number(limit) || 24))));
  u.searchParams.set('offset', String(Math.max(0, Number(offset) || 0)));
  if (q) u.searchParams.set('q', String(q).slice(0, 60));
  const d = await get(u.toString());
  const raw = (d.items || []).filter((it) => it && it.id && it.applyCompatible !== false);
  const local = new Set(listDownloaded().map((p) => p.key));
  const thumbs = await pool(raw, 6, (it) => fetchThumb(safeId(it.id)));
  const items = raw.map((it, k) => {
    const m = it.displayMeta || {};
    return toEntry({ id: it.id, name: it.name, colors: m.colors, appearance: m.appearance, art: m.art, author: it.authorDisplayName,
      license: it.license, downloads: it.downloadCount, favorites: it.favoriteCount, downloaded: local.has('ds-' + it.id) }, thumbs[k]);
  });
  return { total: d.total || 0, offset: d.offset || 0, items };
}

async function listByStyle({ sort, offset, limit, q, style }) {
  sort = SORTS.has(sort) ? sort : 'popular';
  q = String(q || '').slice(0, 60);
  const all = (await fullIndex(sort, q)).filter((it) => it && it.id && it.applyCompatible !== false && styleOf(it.id, it.name) === style);
  const off = Math.max(0, Number(offset) || 0), n = Math.min(48, Math.max(1, Number(limit) || 24));
  const raw = all.slice(off, off + n);
  const local = new Set(listDownloaded().map((p) => p.key));
  const thumbs = await pool(raw, 6, (it) => fetchThumb(safeId(it.id)));
  const items = raw.map((it, k) => {
    const m = it.displayMeta || {};
    return toEntry({ id: it.id, name: it.name, colors: m.colors, appearance: m.appearance, art: m.art, author: it.authorDisplayName,
      license: it.license, downloads: it.downloadCount, favorites: it.favoriteCount, downloaded: local.has('ds-' + it.id) }, thumbs[k]);
  });
  return { total: all.length, offset: off, items };
}

// ------------------------------------------------------------ 下载（零依赖读 zip：只认 store / deflate）
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('主题包不是有效的 zip');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('主题包目录损坏');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    if (method === 0) files[name] = Buffer.from(data);
    else if (method === 8) files[name] = inflateRawSync(data, { maxOutputLength: MAX_PKG });
  }
  return files;
}

function sniffExt(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.readUInt32BE(0) === 0x89504e47) return '.png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return '';
}

function readLocal(id) {
  const d = join(galleryDir(), id);
  const info = JSON.parse(readFileSync(join(d, 'info.json'), 'utf8'));
  const img = info.image ? join(d, info.image) : '';
  return toEntry({ ...info, id, downloaded: true }, img && existsSync(img) ? img : '');
}

// 从本机移除一套下载过的主题（正在用的皮肤已经把壁纸嵌进样式里，不受影响）。
export function removeTheme(id) {
  safeId(id);
  const d = join(galleryDir(), id);
  if (!existsSync(join(d, 'info.json'))) throw new Error('本机没有这套主题');
  rmSync(d, { recursive: true, force: true });
  return { deleted: id };
}

export function listDownloaded() {
  const d = galleryDir(), out = [];
  for (const f of readdirSync(d)) {
    if (!f.startsWith('ver_') || !existsSync(join(d, f, 'info.json'))) continue;
    try { out.push(readLocal(f)); } catch {}
  }
  return out;
}

// 下载一套主题（已下载就直接用本地的）。meta 可由列表带进来，省一次请求；没有就只信主题包自己的 theme.json。
export async function fetchTheme(id, meta = {}) {
  safeId(id);
  const d = join(galleryDir(), id);
  if (existsSync(join(d, 'info.json'))) return readLocal(id);
  const buf = await get(`${API}/${id}/download`, { binary: true, timeout: 60000 });
  if (buf.length > MAX_PKG) throw new Error('主题包太大');
  const files = unzip(buf);
  const theme = files['theme.json'] ? JSON.parse(files['theme.json'].toString('utf8')) : null;
  if (!theme || !theme.colors) throw new Error('主题包里没有 theme.json');
  let manifest = {};
  try { manifest = JSON.parse(files['manifest.json'].toString('utf8')); } catch {}
  // 校验 manifest 里登记的文件哈希（有就校验）。
  for (const f of manifest.files || []) {
    if (files[f.path] && f.sha256 && createHash('sha256').update(files[f.path]).digest('hex') !== f.sha256) throw new Error('主题包校验失败：' + f.path);
  }
  mkdirSync(d, { recursive: true });
  let image = '';
  const imgBuf = theme.image && files[theme.image];
  const ext = sniffExt(imgBuf);
  if (ext) { image = 'background' + ext; writeFileSync(join(d, image), imgBuf); }
  writeFileSync(join(d, 'theme.json'), JSON.stringify(theme, null, 2), 'utf8');
  const info = {
    name: theme.name || meta.name || id, colors: theme.colors, appearance: theme.appearance || 'auto', art: theme.art || {},
    author: meta.author || manifest.publisher?.displayName || '', license: manifest.license || meta.license || '',
    image, at: new Date().toISOString(),
  };
  writeFileSync(join(d, 'info.json'), JSON.stringify(info, null, 2), 'utf8');
  return readLocal(id);
}
