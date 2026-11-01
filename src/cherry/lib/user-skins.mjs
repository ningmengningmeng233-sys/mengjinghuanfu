// 我的皮肤：把「当前主题 + 滑块参数 + 壁纸」存成用户自己的一套，Cherry / ZCode 两端共用。
// 做法参考 Theme Station（keltzeleo/CherryStudio-ThemeMaker）的「保存 / 原地编辑 / 另存为 v2」，
// 以及 Obsidian Style Settings 的设置导入导出（JSON）。
//
// 存储：%LOCALAPPDATA%\DreamSkin\skins\<id>.json，壁纸复制进 skins\images\<sha256 前 16 位>.<ext>，
//       原图被移动或删除也不影响已保存的皮肤。
// 分享：.dsskin 文件 = 同一份 JSON + 内嵌壁纸（base64），导入时重新校验格式和图片文件头。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync, copyFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import { rootDir } from './cherry-env.mjs';
import { normalizePalette, SETTINGS, MAX_IMAGE_BYTES_CDP } from './cherry-skin-css.mjs';

export const SCHEMA = 'dream-skin-user-skin/1';
const SHARE_SCHEMA = 'dream-skin-share/1';
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const skinsDir = () => { const d = join(rootDir(), 'skins'); mkdirSync(join(d, 'images'), { recursive: true }); return d; };
const now = () => new Date().toISOString();
const newId = () => Date.now().toString(36) + randomBytes(3).toString('hex');
const safeId = (id) => { if (!/^[a-z0-9]{6,32}$/.test(String(id || ''))) throw new Error('无效的皮肤 id：' + id); return id; };
const fileOf = (id) => join(skinsDir(), safeId(id) + '.json');

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return '.png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return '';
}

// 只留 schema 里声明过的参数，值做类型收敛，防止导入文件夹带私货。
function cleanValues(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const s of SETTINGS.settings) {
    if (s.type === 'heading' || !(s.id in v)) continue;
    const x = v[s.id];
    if (s.type === 'class-toggle') out[s.id] = x === true || x === 'true';
    else if (s.type === 'variable-color') { if (x === '' || /^#[0-9a-f]{6}$/i.test(String(x))) out[s.id] = String(x); }
    else { const n = Number(x); if (Number.isFinite(n)) out[s.id] = Math.min(s.max ?? 1e9, Math.max(s.min ?? -1e9, n)); }
  }
  return out;
}

function storeImage(buf) {
  const ext = sniff(buf);
  if (!ext) throw new Error('壁纸不是有效的 JPG / PNG / WebP');
  if (buf.length > MAX_IMAGE_BYTES_CDP) throw new Error('壁纸太大（上限 25 MB）');
  const name = createHash('sha256').update(buf).digest('hex').slice(0, 16) + ext;
  const dest = join(skinsDir(), 'images', name);
  if (!existsSync(dest)) writeFileSync(dest, buf);
  return 'images/' + name;
}

function load(id) {
  const s = JSON.parse(readFileSync(fileOf(id), 'utf8'));
  if (s.schema !== SCHEMA) throw new Error('皮肤文件格式不认识：' + id);
  return s;
}

const imagePathOf = (s) => (s.image ? join(skinsDir(), s.image) : '');

// 给总控台 / presets 用的平铺形状：group = mine，key = my-<id>。
export function toPaletteEntry(s) {
  const p = normalizePalette(s.palette);
  const img = imagePathOf(s);
  return { key: 'my-' + s.id, group: 'mine', ...p, tune: {}, name: s.name, desc: s.basedOnName ? `基于「${s.basedOnName}」` : '我的皮肤',
    from: '我的皮肤', values: s.values || {}, image: img && existsSync(img) ? img : '', updatedAt: s.updatedAt };
}

export function listSkins() {
  const d = skinsDir();
  const out = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try { out.push(toPaletteEntry(load(f.slice(0, -5)))); } catch {}
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getSkin(key) {
  const id = String(key).replace(/^my-/, '');
  return toPaletteEntry(load(id));
}

// 保存：overwrite 给了 id 就原地覆盖（保留创建时间），否则新建；重名自动加「v2 / v3」。
export function saveSkin({ name, palette, values, image, basedOn = '', basedOnName = '', overwrite = '' }) {
  const p = normalizePalette(palette);
  let s;
  if (overwrite) s = load(String(overwrite).replace(/^my-/, ''));
  else s = { schema: SCHEMA, id: newId(), createdAt: now() };
  let title = String(name || p.name || '我的皮肤').trim().slice(0, 40) || '我的皮肤';
  if (!overwrite) {
    const taken = new Set(listSkins().map((x) => x.name));
    if (taken.has(title)) { let n = 2; while (taken.has(`${title} v${n}`)) n++; title = `${title} v${n}`; }
  }
  s.name = title;
  s.palette = { ...p, name: title, tune: undefined };
  s.values = cleanValues({ ...(p.tune || {}), ...(values || {}) });
  if (basedOn || !overwrite) { s.basedOn = basedOn; s.basedOnName = basedOnName; } // 覆盖保存时保留原来的出处
  if (image === '') s.image = '';
  else if (image) {
    const full = resolve(image);
    if (full.startsWith(join(skinsDir(), 'images'))) s.image = 'images/' + basename(full);
    else { if (!IMG_EXT.has(extname(full).toLowerCase())) throw new Error('壁纸只支持 JPG / PNG / WebP'); s.image = storeImage(readFileSync(full)); }
  }
  s.updatedAt = now();
  writeFileSync(fileOf(s.id), JSON.stringify(s, null, 2), 'utf8');
  return toPaletteEntry(s);
}

export function renameSkin(key, name) {
  const s = load(String(key).replace(/^my-/, ''));
  s.name = String(name || '').trim().slice(0, 40) || s.name;
  s.palette.name = s.name; s.updatedAt = now();
  writeFileSync(fileOf(s.id), JSON.stringify(s, null, 2), 'utf8');
  return toPaletteEntry(s);
}

// 删除皮肤；它的壁纸如果没有别的皮肤在用，一并删掉。
export function deleteSkin(key) {
  const id = String(key).replace(/^my-/, '');
  const s = load(id);
  rmSync(fileOf(id), { force: true });
  if (s.image && !readdirSync(skinsDir()).some((f) => f.endsWith('.json') && (() => { try { return load(f.slice(0, -5)).image === s.image; } catch { return false; } })())) {
    rmSync(join(skinsDir(), s.image), { force: true });
  }
  return { deleted: id };
}

export function exportSkin(key, outPath) {
  const s = load(String(key).replace(/^my-/, ''));
  const img = imagePathOf(s);
  const share = { schema: SHARE_SCHEMA, skin: { ...s, image: '' }, imageExt: '', imageData: '' };
  if (img && existsSync(img)) { share.imageExt = extname(img); share.imageData = readFileSync(img).toString('base64'); }
  const out = resolve(outPath);
  writeFileSync(out, JSON.stringify(share), 'utf8');
  return { file: out, bytes: statSync(out).size };
}

export function importSkin(file) {
  const full = resolve(file);
  if (statSync(full).size > 40 * 1024 * 1024) throw new Error('文件太大，不像是皮肤文件');
  const share = JSON.parse(readFileSync(full, 'utf8'));
  if (share?.schema !== SHARE_SCHEMA || !share.skin || share.skin.schema !== SCHEMA) throw new Error('不是梦境换肤皮肤文件（.dsskin）');
  let image = '';
  if (share.imageData) {
    const buf = Buffer.from(String(share.imageData), 'base64');
    image = join(skinsDir(), storeImage(buf));
  }
  return saveSkin({ name: share.skin.name, palette: share.skin.palette, values: share.skin.values, image,
    basedOn: share.skin.basedOn || '', basedOnName: share.skin.basedOnName || '' });
}
