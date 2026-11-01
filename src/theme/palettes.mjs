// 所有调色板的统一入口：我的皮肤 + 精选 18 套 + 壁纸取色（Material Color Utilities）+ tinted-theming base16 库（默认隐藏）。
// 形状统一为 { key, name, group, dark, bg, panel, bubble, accent, accentText, text, muted }。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHERRY_PRESETS, PRESET_ALIASES, normalizePalette } from './cherry-skin-css.mjs';
import { rootDir } from '../core/env.mjs';
import { listSkins } from '../store/user-skins.mjs';
import { listDownloaded } from '../store/gallery.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const WP_FILE = () => join(rootDir(), 'wallpaper-palettes.json'); // 两端共用

export const GROUPS = { mine: '我的皮肤', builtin: '精选', base16: 'base16 配色库', wallpaper: '壁纸取色', gallery: '主题库' };

let base16Cache = null;
function base16() {
  if (!base16Cache) {
    try { base16Cache = JSON.parse(readFileSync(join(here, 'data', 'base16-palettes.json'), 'utf8')).palettes || []; }
    catch { base16Cache = []; }
  }
  return base16Cache;
}

function builtin() {
  // T0-4：原「二次元自带壁纸」分组已删除——预设里没有任何一套带 wallpaper 字段、包里也没有自带壁纸资源，
  // 该分组永远为空，是死代码。自带壁纸只剩主题库下载的主题（见 bundledImage）。
  return Object.entries(CHERRY_PRESETS).map(([key, p]) => ({ key, group: 'builtin', ...p }));
}

export function savedWallpaperPalettes() {
  try { return JSON.parse(readFileSync(WP_FILE(), 'utf8')).palettes || []; } catch { return []; }
}

// 总控台只展示精选 + 壁纸取色（少而精）；base16 库仍可用 --preset b16-xxx 或 presets --all 调用。
export function listPalettes({ all = false } = {}) {
  let mine = [];
  try { mine = listSkins(); } catch {}
  let gallery = [];
  try { gallery = listDownloaded(); } catch {}
  return [...mine, ...builtin(), ...savedWallpaperPalettes(), ...gallery, ...(all ? base16() : [])];
}

export function resolvePalette(key) {
  if (key && typeof key === 'object') return normalizePalette(key);
  key = PRESET_ALIASES[key] || key;
  const hit = listPalettes({ all: true }).find((p) => p.key === key);
  if (!hit) throw new Error('未知配色：' + key + '（运行 dreamskin.mjs presets 查看全部）');
  return { ...normalizePalette(hit), key: hit.key };
}

// 在 Cherry 渲染进程里解码图片（支持 JPG/PNG/WebP），缩到 128px 取像素，再交给 Material Color Utilities。
export async function wallpaperPalettes(session, imageUri, imagePath = '') {
  const pixels = await session.evaluate(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(imageUri)};
    await img.decode();
    const k = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, out = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 255) out.push(((255 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) >>> 0);
    return out;
  })()`);
  if (!Array.isArray(pixels) || pixels.length === 0) throw new Error('读不出这张壁纸的像素');
  const { palettesFromPixels } = await import('./mcu-palette.bundle.mjs');
  const palettes = palettesFromPixels(pixels.map((n) => n | 0));
  writeFileSync(WP_FILE(), JSON.stringify({ image: imagePath, at: new Date().toISOString(), palettes }, null, 2), 'utf8');
  return palettes;
}

// 自带壁纸的主题（仅指主题库下载的主题）：没另给壁纸时用它自己的。
export function bundledImage(key) {
  if (!key || typeof key !== 'string') return '';
  key = PRESET_ALIASES[key] || key;
  if (key.startsWith('ds-')) { try { const hit = listDownloaded().find((p) => p.key === key); return hit ? hit.image : ''; } catch { return ''; } }
  return '';
}
