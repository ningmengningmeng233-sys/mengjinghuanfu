// 由调色板 + 可调参数 + 可选壁纸生成 Cherry Studio v2 自定义 CSS。
//
// 设计目标对齐原型 Codex Dream Skin：一张 16:9 壁纸铺满整个窗口，原生控件全部保留，
// 只把“外壳层”变透明，再给需要读字的区域加渐变遮罩 / 磨砂，保证文字清楚。
//
// 2.1 起 CSS 分两段：
//   1) 规则段（RULES）：只引用 var(--ds-*)，与配色/参数无关，基本不变；
//   2) 变量段（vars）：:root:root { --ds-*: ... }，由调色板和滑块参数算出。
// 实时预览只替换变量段，Cherry 窗口立即变化，不用重启、不用重排整份样式。
//
// 可调参数的声明格式借用 Obsidian Style Settings（obsidian-community/obsidian-style-settings）
// 的字段：id / title / type / min / max / step / default / format，总控台按它自动生成滑块。
//
// 选择器全部来自 Cherry Studio v2.1.4 源码（CherryHQ/cherry-studio tag v2.1.4）+ 真机 CDP 探针：
//   外壳根节点   #root[data-ui="app.main"]（自带 bg-sidebar；旧写法 div.h-screen.w-screen 保留兼容）
//   图标栏       #app-sidebar / [data-ui="app.sidebar"]
//   标签栏       [data-ui="app.tab-bar"]
//   内容卡片     main[data-ui="app.content"] 及其外层 div[data-ui="app.content"]
//   聊天页       #chat[data-ui="chat.view"]
//   中间聊天区   [data-ui="part:conversation-main"]
//   消息列表     #messages / [data-ui="chat.message-list"]
//   助手/话题栏  [class*="resource-list-pane"] / [data-ui="chat.topic-list"]
//   输入框       #inputbar[data-ui="chat.composer"]
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

// 精选预设：少而精。配色取自口碑最好的几套开源主题（Catppuccin、Rosé Pine、Tokyo Night、Nord、Kanagawa、
// Everforest、Gruvbox Material、Dracula、Ayu、Oxocarbon，均 MIT），按 Theme Station 的做法做了莫兰迪式降饱和，
// 浅色单独设计而不是深色反算；每套带两束氛围光（accent + glow）和一组调好的参数（tune）。
// 字段：name 中文名 / desc 一句话气质 / from 灵感来源 / glow 第二氛围色 / tune 覆盖 SETTINGS 默认值。
export const CHERRY_PRESETS = {
  // ---------------- 夜
  'ink-gold':      { name: '墨夜鎏金', desc: '黑檀与旧金，沉稳克制', from: '梦境换肤', dark: true,
    bg: '#0f0e0c', panel: '#17140f', bubble: '#221d16', accent: '#d4b06a', accentText: '#1a140a', glow: '#8a5a2b', text: '#f2e9d8', muted: '#a8987c',
    tune: { blur: 20, 'pane-alpha': 50 } },
  'star-violet':   { name: '雾紫星河', desc: '薰衣草紫配星夜蓝', from: 'Catppuccin Mocha', dark: true,
    bg: '#1e1e2e', panel: '#181825', bubble: '#313244', accent: '#cba6f7', accentText: '#1e1e2e', glow: '#89b4fa', text: '#cdd6f4', muted: '#a6adc8',
    tune: { blur: 22 } },
  'pine-rose':     { name: '松烟玫瑰', desc: '暗松墨里一抹干枯玫瑰', from: 'Rosé Pine', dark: true,
    bg: '#191724', panel: '#1f1d2e', bubble: '#26233a', accent: '#ebbcba', accentText: '#191724', glow: '#c4a7e7', text: '#e0def4', muted: '#908caa',
    tune: { blur: 24, 'pane-alpha': 44 } },
  'tokyo-rain':    { name: '东京夜雨', desc: '霓虹在雨夜里晕开', from: 'Tokyo Night', dark: true,
    bg: '#1a1b26', panel: '#16161e', bubble: '#24283b', accent: '#7aa2f7', accentText: '#16161e', glow: '#bb9af7', text: '#c0caf5', muted: '#9aa5ce' },
  'aurora':        { name: '北境极光', desc: '冰川灰蓝，极光一线', from: 'Nord', dark: true,
    bg: '#2e3440', panel: '#2a2f3a', bubble: '#3b4252', accent: '#88c0d0', accentText: '#2e3440', glow: '#b48ead', text: '#eceff4', muted: '#a3adbf',
    tune: { 'pane-alpha': 52, scrim: 90 } },
  'kanagawa':      { name: '神奈川浪', desc: '浮世绘的靛与月光黄', from: 'Kanagawa', dark: true,
    bg: '#1f1f28', panel: '#16161d', bubble: '#2a2a37', accent: '#7e9cd8', accentText: '#16161d', glow: '#e6c384', text: '#dcd7ba', muted: '#a6a69c' },
  'deep-forest':   { name: '苔原深林', desc: '雨后森林，苔绿安静', from: 'Everforest', dark: true,
    bg: '#2d353b', panel: '#272e33', bubble: '#343f44', accent: '#a7c080', accentText: '#232a2e', glow: '#83c092', text: '#d3c6aa', muted: '#9da9a0',
    tune: { 'pane-alpha': 52 } },
  'amber-dusk':    { name: '琥珀暮光', desc: '老电影的暖橙暮色', from: 'Gruvbox Material', dark: true,
    bg: '#282828', panel: '#1d2021', bubble: '#32302f', accent: '#e78a4e', accentText: '#1d2021', glow: '#d8a657', text: '#d4be98', muted: '#a89984' },
  'rouge-night':   { name: '胭脂夜', desc: '丝绒夜色里的胭脂粉', from: 'Dracula', dark: true,
    bg: '#21222c', panel: '#1b1c24', bubble: '#2c2e3b', accent: '#ff79c6', accentText: '#1b1c24', glow: '#bd93f9', text: '#f8f8f2', muted: '#a4a8c4',
    tune: { blur: 22 } },
  'deep-sea':      { name: '深海灯塔', desc: '深蓝海面上一盏暖灯', from: 'Ayu Mirage', dark: true,
    bg: '#1f2430', panel: '#1a1f29', bubble: '#242936', accent: '#ffcc66', accentText: '#1a1f29', glow: '#73d0ff', text: '#cccac2', muted: '#8a9199' },
  'qingdai':       { name: '青黛', desc: '极简碳黑，一抹青碧', from: 'Oxocarbon', dark: true,
    bg: '#161616', panel: '#121212', bubble: '#262626', accent: '#3ddbd9', accentText: '#0b1f1f', glow: '#78a9ff', text: '#f2f4f8', muted: '#a8a8a8',
    tune: { blur: 16, 'pane-alpha': 56 } },
  'neon-city':     { name: '霓虹之城', desc: '赛博朋克，青与洋红', from: 'Synthwave', dark: true,
    bg: '#0b0d1a', panel: '#0f1224', bubble: '#171b33', accent: '#4cc9f0', accentText: '#07101f', glow: '#f72585', text: '#e6ecff', muted: '#8f9bc4',
    tune: { blur: 24, scrim: 110 } },
  // ---------------- 昼
  'latte':         { name: '拿铁晨光', desc: '奶白底色配葡萄紫', from: 'Catppuccin Latte', dark: false,
    bg: '#eff1f5', panel: '#e6e9ef', bubble: '#ffffff', accent: '#8839ef', accentText: '#ffffff', glow: '#1e66f5', text: '#4c4f69', muted: '#6c6f85' },
  'rose-dawn':     { name: '玫瑰晨曦', desc: '晨光透过纱帘的暖粉', from: 'Rosé Pine Dawn', dark: false,
    bg: '#faf4ed', panel: '#fffaf3', bubble: '#ffffff', accent: '#d7827e', accentText: '#ffffff', glow: '#907aa9', text: '#575279', muted: '#797593' },
  'rice-paper':    { name: '宣纸墨香', desc: '米白宣纸，淡墨与赭石', from: '梦境换肤', dark: false,
    bg: '#f4efe6', panel: '#fbf8f2', bubble: '#fffdf9', accent: '#9b6b3c', accentText: '#ffffff', glow: '#5a7a6b', text: '#2f2a24', muted: '#7a6e60',
    tune: { 'text-shadow': false } },
  'mint-tea':      { name: '薄荷清茶', desc: '护眼暖白里一口清茶绿', from: 'Everforest Light', dark: false,
    bg: '#fdf6e3', panel: '#f4f0d9', bubble: '#fffbef', accent: '#5c8a5f', accentText: '#ffffff', glow: '#3a94c5', text: '#5c6a72', muted: '#829181' },
  'mist-blue':     { name: '雾霭灰蓝', desc: '莫兰迪灰蓝，冷静通透', from: 'Nord Light', dark: false,
    bg: '#eceff4', panel: '#e5e9f0', bubble: '#ffffff', accent: '#5e81ac', accentText: '#ffffff', glow: '#b48ead', text: '#2e3440', muted: '#4c566a' },
  'sakura':        { name: '樱落', desc: '樱花粉与藤紫，轻盈', from: '梦境换肤', dark: false,
    bg: '#fbf1f3', panel: '#fff7f9', bubble: '#ffffff', accent: '#d4618a', accentText: '#ffffff', glow: '#9b7fd4', text: '#4a3540', muted: '#8a6b78' },
};
// 旧 key 兼容（2.0 的 5 套）。
export const PRESET_ALIASES = { 'dark-gold': 'ink-gold', 'cyber-blue': 'neon-city', 'teal-tech': 'qingdai', 'anime-purple': 'star-violet', 'warm-cream': 'rice-paper', 'soft-cream': 'rice-paper' };

// 可调参数（Obsidian Style Settings 字段格式）。数值都是 0~100 的百分比，除非 format 另有说明。
// default 为 null 的项表示“按深色/浅色取默认值”，见 defaultValues()。
export const SETTINGS = {
  name: 'Dream Skin · Cherry',
  id: 'dream-skin-cherry',
  settings: [
    { id: 'heading-wall', title: '壁纸', type: 'heading', level: 2 },
    { id: 'focus-x', title: '壁纸焦点 · 左右', type: 'variable-number-slider', min: 0, max: 100, step: 1, default: 50, format: '%' },
    { id: 'focus-y', title: '壁纸焦点 · 上下', type: 'variable-number-slider', min: 0, max: 100, step: 1, default: 40, format: '%' },
    { id: 'wall-blur', title: '壁纸模糊', type: 'variable-number-slider', min: 0, max: 30, step: 1, default: 0, format: 'px' },
    { id: 'wall-bright', title: '壁纸亮度', type: 'variable-number-slider', min: 40, max: 130, step: 1, default: 100, format: '%' },
    { id: 'scrim', title: '整体遮罩浓度', type: 'variable-number-slider', min: 0, max: 200, step: 1, default: 100, format: '%' },
    { id: 'heading-glass', title: '磨砂玻璃', type: 'heading', level: 2 },
    { id: 'pane-alpha', title: '话题栏不透明度', type: 'variable-number-slider', min: 0, max: 100, step: 1, default: null, format: '%' },
    { id: 'chat-top', title: '聊天区遮罩（上）', type: 'variable-number-slider', min: 0, max: 100, step: 1, default: 6, format: '%' },
    { id: 'chat-bottom', title: '聊天区遮罩（下）', type: 'variable-number-slider', min: 0, max: 100, step: 1, default: null, format: '%' },
    { id: 'composer-alpha', title: '输入框不透明度', type: 'variable-number-slider', min: 0, max: 100, step: 1, default: 44, format: '%' },
    { id: 'blur', title: '磨砂模糊', type: 'variable-number-slider', min: 0, max: 40, step: 1, default: 18, format: 'px' },
    { id: 'heading-text', title: '文字与主色', type: 'heading', level: 2 },
    { id: 'text-shadow', title: '正文阴影（浅色壁纸上更清楚）', type: 'class-toggle', default: true },
    { id: 'accent', title: '自定义主色（留空 = 跟随配色）', type: 'variable-color', format: 'hex', default: '' },
    { id: 'radius', title: '圆角', type: 'variable-number-slider', min: 0, max: 24, step: 1, default: 12, format: 'px' },
  ],
};

export function defaultValues(palette) {
  const dark = !!(palette && palette.dark);
  const v = {};
  for (const s of SETTINGS.settings) if (s.type !== 'heading') v[s.id] = s.default;
  v['pane-alpha'] = dark ? 46 : 50;
  v['chat-bottom'] = dark ? 26 : 28;
  return v;
}

// 壁纸大小上限：CDP 通道（dreamskin.mjs）走 WebSocket 直接注入 <style>，可以用原图（大图先由 wall-cache 瘦身）。
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGE_BYTES_CDP = 25 * 1024 * 1024;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// 按文件头判断真实格式，防止把改了后缀的别的文件当壁纸。
function sniffMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

export function imageDataUri(path, maxBytes = MAX_IMAGE_BYTES) {
  if (!MIME[extname(path).toLowerCase()]) throw new Error('壁纸只支持 JPG / PNG / WebP：' + path);
  const size = statSync(path).size;
  if (size > maxBytes) {
    throw new Error(`壁纸 ${(size / 1048576).toFixed(1)} MB 太大，上限 ${(maxBytes / 1048576).toFixed(1)} MB。`);
  }
  const buf = readFileSync(path);
  const mime = sniffMime(buf);
  if (!mime) throw new Error('这个文件不是有效的 JPG / PNG / WebP 图片：' + path);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function hexToRgb(hex) {
  const m = HEX.exec(String(hex || '').trim());
  if (!m) throw new Error('不是有效的颜色：' + hex);
  const h = m[1];
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
const isHex = (v) => HEX.test(String(v || '').trim());
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// 校验 / 补全一个调色板对象（内置、base16、壁纸取色共用一个形状）。
export function normalizePalette(p) {
  if (!p || typeof p !== 'object') throw new Error('调色板为空');
  for (const k of ['bg', 'panel', 'bubble', 'accent', 'text']) if (!isHex(p[k])) throw new Error(`调色板缺少有效的 ${k}`);
  return {
    name: String(p.name || '自定义'), dark: !!p.dark,
    bg: p.bg, panel: p.panel, bubble: p.bubble, accent: p.accent, text: p.text,
    accentText: isHex(p.accentText) ? p.accentText : (p.dark ? p.bg : '#ffffff'),
    muted: isHex(p.muted) ? p.muted : p.text,
    glow: isHex(p.glow) ? p.glow : p.accent,
    tune: p.tune && typeof p.tune === 'object' ? { ...p.tune } : {},
  };
}

// 变量段：调色板 + 参数 → :root:root { --ds-*: ... } 以及 Cherry 自己的 shadcn 变量。
export function buildVarsCss(paletteIn, imageUri = '', valuesIn = {}, wallScopeBody = '') {
  const p = normalizePalette(paletteIn);
  const d = defaultValues(p);
  const v = { ...d, ...p.tune, ...(valuesIn || {}) };
  const accentHex = isHex(v.accent) ? v.accent : p.accent;
  const glow = hexToRgb(p.glow);
  const accent = hexToRgb(accentHex), panel = hexToRgb(p.panel), bubble = hexToRgb(p.bubble);
  const base = p.dark ? hexToRgb(p.bg) : panel;
  const shade = p.dark ? '0,0,0' : '255,255,255';
  const line = p.dark ? 'rgba(255,255,255,0.10)' : 'rgba(60,40,10,0.12)';
  const a = (rgb, alpha) => `rgba(${rgb}, ${Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000})`;
  const pct = (id, dv) => num(v[id], dv, 0, 200) / 100;

  // 遮罩强度默认取原型 Codex Dream Skin 的 immersive 档（edge .40 / mid .26 / far .16），
  // “整体遮罩浓度”按比例放大缩小。
  const k = pct('scrim', 100);
  const edge = (p.dark ? 0.40 : 0.44) * k, mid = (p.dark ? 0.26 : 0.28) * k, far = (p.dark ? 0.16 : 0.18) * k;
  const scrim = imageUri
    ? `linear-gradient(90deg, ${a(base, edge)} 0%, ${a(base, mid)} 30%, ${a(base, far)} 65%, ${a(base, mid)} 100%)`
    : 'linear-gradient(transparent, transparent)';
  // 壁纸不走 CSS 变量：Chromium 对 var() 代入有约 2 MB 上限，大图会让整条 background 失效（壁纸消失）。
  // 有壁纸时变量只放 none，真正的图片在文末用一条直接规则写给两端的壁纸层。
  const art = imageUri
    ? 'none'
    // 没有壁纸时：两束氛围光（主色右上、第二色左下）+ 一层自上而下的明暗，避免一片死色。
    : `radial-gradient(1100px 680px at 88% -8%, ${a(accent, p.dark ? 0.22 : 0.16)}, transparent 62%), ` +
      `radial-gradient(900px 640px at -6% 108%, ${a(glow, p.dark ? 0.18 : 0.14)}, transparent 60%), ` +
      `radial-gradient(700px 420px at 40% 55%, ${a(glow, p.dark ? 0.05 : 0.04)}, transparent 70%), ` +
      `linear-gradient(180deg, ${a(p.dark ? '255,255,255' : '255,255,255', p.dark ? 0.02 : 0.35)}, transparent 40%)`;
  const mainTop = imageUri ? pct('chat-top', 6) : Math.max(0.30, pct('chat-top', 6));
  const mainBottom = imageUri ? pct('chat-bottom', d['chat-bottom']) : Math.max(0.40, pct('chat-bottom', d['chat-bottom']));
  const blur = num(v.blur, 18, 0, 60), wallBlur = num(v['wall-blur'], 0, 0, 60);
  const shadowOn = v['text-shadow'] !== false && v['text-shadow'] !== 'false' && v['text-shadow'] !== 0;
  // 照片壁纸直接绘制规则的锚点（Q-4 发布前修复）：调用方给出目标应用 app.root 的 scopeBody 时按它派生，
  // 使每家外壳的 ::before 都能挂上照片（旧写死锚点只有 cherry 旧外壳 #app-sidebar 与 zcode 外壳，
  // cherry 2.1.6 / codex / minimax / dsh 在完整模式下选了照片也画不出来）；没给时保留旧锚点原文兜底。
  const wallAnchor = wallScopeBody ? `${wallScopeBody}::before` : 'body:has(#app-sidebar)::before, body:has([data-workspace-shell])::before';

  return `/* ===== 梦境换肤变量段 · ${p.name.replace(/\*\//g, '')} ===== */
:root:root, :root.dark {
  --ds-bg: ${p.bg};
  --ds-text: ${p.text};
  --ds-muted: ${p.muted};
  --ds-accent: ${accentHex};
  --ds-accent-rgb: ${accent};
  --ds-panel-rgb: ${panel};
  --ds-bubble-rgb: ${bubble};
  --ds-line: ${line};
  --ds-scrim: ${scrim};
  --ds-art: ${art};
  --ds-focus: ${num(v['focus-x'], 50, 0, 100)}% ${num(v['focus-y'], 40, 0, 100)}%;
  --ds-wall-filter: blur(${wallBlur}px) brightness(${num(v['wall-bright'], 100, 10, 200)}%);
  --ds-content-bg: ${imageUri ? 'transparent' : a(panel, 0.20)};
  --ds-content-shadow: 0 10px 40px -12px rgba(0,0,0,${p.dark ? 0.55 : 0.18});
  --ds-pane-bg: ${a(panel, pct('pane-alpha', d['pane-alpha']))};
  --ds-chat-top: ${a(panel, mainTop)};
  --ds-chat-bottom: ${a(panel, mainBottom)};
  --ds-composer-bg: ${a(bubble, imageUri ? pct('composer-alpha', 44) : Math.max(0.8, pct('composer-alpha', 44)))};
  --ds-blur: blur(${blur}px) saturate(1.15);
  --ds-radius: ${num(v.radius, 12, 0, 40)}px;
  --ds-text-shadow: ${shadowOn ? (p.dark ? '0 1px 2px rgba(0,0,0,0.55)' : '0 1px 1px rgba(255,255,255,0.6)') : 'none'};
  --ds-code-bg: ${p.dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)'};
  --ds-composer-shadow: 0 8px 30px -10px rgba(0,0,0,${p.dark ? 0.6 : 0.2});

  /* Cherry 自己的主题变量（shadcn）：亮/暗模式都套同一套配色，弹窗、卡片、菜单保持实心不透明 */
  --background: ${p.bg};
  --foreground: ${p.text};
  --card: ${p.bubble};
  --card-foreground: ${p.text};
  --popover: ${p.bubble};
  --popover-foreground: ${p.text};
  --primary: ${accentHex};
  --primary-foreground: ${isHex(v.accent) ? (p.dark ? '#000000' : '#ffffff') : p.accentText};
  --secondary: ${a(bubble, 0.9)};
  --secondary-foreground: ${p.text};
  --muted: ${a(bubble, 0.85)};
  --muted-foreground: ${p.muted};
  --accent: ${a(accent, p.dark ? 0.16 : 0.14)};
  --accent-foreground: ${p.text};
  --border: ${line};
  --input: ${line};
  --ring: ${a(accent, 0.55)};
  --sidebar: ${a(panel, 0.55)};
  --sidebar-foreground: ${p.text};
  --sidebar-primary: ${accentHex};
  --sidebar-primary-foreground: ${p.accentText};
  --sidebar-accent: ${a(accent, p.dark ? 0.16 : 0.14)};
  --sidebar-accent-foreground: ${p.text};
  --sidebar-border: ${line};
  --sidebar-ring: ${a(accent, 0.55)};
  --chat-user: ${a(accent, p.dark ? 0.16 : 0.12)};
  --code-block: ${p.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)'};
  --inline-code: ${p.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,10,0.08)'};
  --resource-list-row-active: ${a(accent, p.dark ? 0.20 : 0.16)};
  --resource-list-row-selected: ${a(accent, p.dark ? 0.20 : 0.16)};
  --resource-list-row-hover: ${a(shade, p.dark ? 0.18 : 0.35)};
}
${imageUri ? `
/* 壁纸（直接写 url，避开 var() 大小上限） */
${wallAnchor} { background-image: url("${imageUri}") !important; }
` : ''}`;
}

// T1-3 起：Cherry 的规则段（部件层 + 额外层）已迁到 adapters/cherry/
// （parts-map.json + extra.css，运行时由 core/app-runtime.mjs 组装成 profile.rules / partsCss / extraCss）。
// 本文件只保留两端共用的主题模型：精选预设、SETTINGS 参数、变量层 buildVarsCss、壁纸处理。
// 兼容旧接口 buildCherryCss 也随规则段一起搬到了 core/app-runtime.mjs。
