// In-Host Quick Prism Popover & Statusbar/Corner Trigger for Antigravity (agy-wallpaper-prism).
//
// Self-contained ES2020 browser IIFE injected over CDP alongside `wallpaper-inject.js`.
// Strictly isolated inside `#agy-prism-popover` (`all: initial; position: fixed; z-index: 45`)
// + `#agy-prism-popover-css` + inline `#agy-prism-pill` trigger.
//
// Exposes `window.__agyPrismPanel = { version, syncState, receive, toggle, open, close,
// openDrilldown, closeDrilldown, destroy, heal, snapshot, status }`.
(function agyPrismPanelMain() {
  'use strict';

  var VERSION = '2.0.0';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document) return { installed: false, reason: 'no-window' };
  try {
    if (W.top && W !== W.top) return { installed: false, reason: 'subframe' };
  } catch (_) {}
  var doc = W.document;

  var API_KEY = '__agyPrismPanel';
  var SKIN_KEY = '__agyPrism';
  var BINDING_KEY = '__agyPrismCall';
  var ROOT_ID = 'agy-prism-popover';
  var STYLE_ID = 'agy-prism-popover-css';
  var PILL_ID = 'agy-prism-pill';
  var PILL_STYLE_ID = 'agy-prism-pill-css';
  var HTML_ATTR = 'data-agy-prism-panel';
  var Z_INDEX = 45;

  var prev = W[API_KEY];
  var carry = null;
  if (prev && typeof prev === 'object') {
    if (prev.version === VERSION && typeof prev.alive === 'function' && prev.alive()) {
      try {
        prev.heal();
      } catch (_) {}
      return prev.status();
    }
    try {
      if (typeof prev.snapshot === 'function') carry = prev.snapshot();
    } catch (_) {}
    try {
      if (typeof prev.destroy === 'function') prev.destroy();
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Canonical Defaults, Scene Presets, Color Swatches & Bilingual Copy (zh / en)
  // ---------------------------------------------------------------------------
  var DEFAULTS = {
    skinEnabled: true,
    preset: 'islands',
    layoutMode: 'islands',
    islandGap: 8,
    workspacePad: 8,
    cornerStyle: 'balanced',
    borders: 'on',
    shadows: true,
    themeMode: 'auto',
    colorScheme: 'prism-default',
    accentMode: 'dynamic',
    customAccent: '#669DF6',
    glassSurfaces: true,
    glassOpacity: 0.76,
    glassBlur: 16,
    scrimOpacity: 0.26,
    vignette: true,
    codeReadabilityMode: 'translucent',
    mediaBlur: 0,
    paused: false,
    muted: true,
    audioEnabled: false,
    volume: 0.5,
    rotationEnabled: false,
    pauseOnHidden: true,
    pauseOnBlur: false,
    triggerMode: 'both',
    language: 'zh',
  };

  var SCENE_PRESETS = {
    crystal: {
      layoutMode: 'islands',
      islandGap: 8,
      glassSurfaces: true,
      glassOpacity: 0.64,
      glassBlur: 18,
      scrimOpacity: 0.18,
      mediaBlur: 0,
      vignette: true,
      paused: false,
    },
    islands: {
      layoutMode: 'islands',
      islandGap: 8,
      glassSurfaces: true,
      glassOpacity: 0.76,
      glassBlur: 16,
      scrimOpacity: 0.26,
      mediaBlur: 0,
      vignette: true,
      paused: false,
    },
    focus: {
      layoutMode: 'flush',
      islandGap: 0,
      glassSurfaces: true,
      glassOpacity: 0.88,
      glassBlur: 20,
      scrimOpacity: 0.42,
      mediaBlur: 8,
      vignette: true,
      paused: false,
    },
    eco: {
      layoutMode: 'flush',
      islandGap: 0,
      glassSurfaces: false,
      glassOpacity: 0.94,
      glassBlur: 0,
      scrimOpacity: 0.34,
      mediaBlur: 0,
      vignette: false,
      paused: true,
    },
  };

  var SCHEMES = [
    { id: 'prism-default', zh: '黑曜', en: 'Obsidian', c1: '#09090B', c2: '#141418', acc: '#669DF6' },
    { id: 'warm-carbon', zh: '暖炭', en: 'Warm', c1: '#10100F', c2: '#1B1A18', acc: '#D97757' },
    { id: 'catppuccin', zh: '猫布', en: 'Mocha', c1: '#181825', c2: '#313244', acc: '#CBA6F7' },
    { id: 'nord', zh: '极地', en: 'Nord', c1: '#242933', c2: '#3B4252', acc: '#88C0D0' },
    { id: 'rose-pine', zh: '松玫', en: 'Rosé', c1: '#191724', c2: '#26233A', acc: '#C4A7E7' },
    { id: 'tokyo-night', zh: '东京', en: 'Tokyo', c1: '#16161E', c2: '#24283B', acc: '#7AA2F7' },
    { id: 'gruvbox', zh: '暖砂', en: 'Gruvbox', c1: '#1D2021', c2: '#3C3836', acc: '#FABD2F' },
    { id: 'host-native', zh: '原生', en: 'Host', c1: '#111114', c2: '#131317', acc: '#2F71E3' },
  ];

  var ACCENTS = [
    { id: 'dynamic', zh: '壁纸取色', en: 'Dynamic' },
    { id: 'palette', zh: '方案默认', en: 'Scheme' },
    { id: 'cobalt', zh: '钴蓝', en: 'Cobalt', hex: '#669DF6' },
    { id: 'iris', zh: '鸢尾', en: 'Iris', hex: '#A58AF8' },
    { id: 'amber', zh: '琥珀', en: 'Amber', hex: '#F2B84B' },
    { id: 'emerald', zh: '翡翠', en: 'Emerald', hex: '#50A37B' },
    { id: 'rose', zh: '玫瑰', en: 'Rose', hex: '#F472B6' },
    { id: 'mono', zh: '极简', en: 'Mono', hex: '#D4D7E0' },
    { id: 'custom', zh: '自选', en: 'Custom' },
  ];

  var COPY = {
    zh: {
      brand: 'Prism',
      connOn: '已连接',
      connOff: '待机中',
      openStudio: '打开完整 Prism 工作台',
      close: '关闭 (Esc)',
      prev: '上一张',
      play: '播放',
      pause: '暂停',
      next: '下一张',
      mute: '静音/开启声音',
      sceneLabel: 'SCENE',
      layoutLabel: 'LAYOUT',
      flush: '紧凑一体 Flush',
      islands: '浮岛画境 Islands',
      preset_crystal: '通透',
      preset_islands: '浮岛',
      preset_focus: '柔焦',
      preset_eco: '省电',
      tab_library: '速选壁纸',
      tab_optics: '光学精调',
      tab_status: '状态',
      searchPh: '搜索壁纸标题或标签…',
      drillBtn: '轮播与筛选',
      drillTitle: '轮播与高级筛选 (按 Esc 返回)',
      drillDone: '完成返回',
      kind_all: '全部',
      kind_image: '图片',
      kind_video: '视频',
      kind_web: '网页',
      kind_scene: '场景',
      emptyLib: '暂无匹配壁纸，可在完整工作台中扫描或导入',
      rotateLabel: '自动轮播列表',
      nextBtn: '切换下一张',
      schemeLabel: '棱镜配色方案',
      accentLabel: '强调色来源',
      s_glassOpacity: '界面不透明度',
      s_glassBlur: '毛玻璃模糊',
      s_islandGap: '浮岛间距',
      s_scrimOpacity: '背景压暗遮罩',
      s_mediaBlur: '壁纸柔焦模糊',
      s_volume: '壁纸音量',
      resetTip: '重置为默认值',
      sw_glass: '毛玻璃磨砂界面',
      sw_vignette: '中央阅读暗角保护',
      sw_pauseBlur: '窗口失焦时自动暂停',
      codeLabel: '代码/终端底板',
      code_translucent: '通透',
      code_frosted: '磨砂',
      code_solid: '实心',
      st_skin: '棱镜皮肤状态',
      st_skinOn: '生效中',
      st_skinOff: '已还原原生',
      st_active: '当前壁纸',
      st_none: '未选择',
      st_theme: '当前明暗 / 配色',
      st_rpc: '宿主桥接通道',
      btnRefresh: '刷新状态',
      btnResetSkin: '重置外观参数',
      btnReapply: '重新启用棱镜皮肤',
      btnRestore: '还原宿主默认外观',
      btnRestoreConfirm: '确认还原？(再点一次确认，Esc 取消)',
      cancel: '取消',
      studioToast: '请在右侧边栏「+ -> Plugins -> Wallpaper Prism」或对话药丸打开完整工作台',
    },
    en: {
      brand: 'Prism',
      connOn: 'Connected',
      connOff: 'Standby',
      openStudio: 'Open Full Prism Studio',
      close: 'Close (Esc)',
      prev: 'Previous',
      play: 'Play',
      pause: 'Pause',
      next: 'Next',
      mute: 'Mute / Unmute',
      sceneLabel: 'SCENE',
      layoutLabel: 'LAYOUT',
      flush: 'Flush',
      islands: 'Islands',
      preset_crystal: 'Crystal',
      preset_islands: 'Islands',
      preset_focus: 'Focus',
      preset_eco: 'Eco',
      tab_library: 'Library',
      tab_optics: 'Optics',
      tab_status: 'Status',
      searchPh: 'Search wallpapers or tags…',
      drillBtn: 'Playlist & Filter',
      drillTitle: 'Rotation & Rating Filter (Esc to close)',
      drillDone: 'Done',
      kind_all: 'All',
      kind_image: 'Image',
      kind_video: 'Video',
      kind_web: 'Web',
      kind_scene: 'Scene',
      emptyLib: 'No matching wallpapers found. Open Full Studio to scan or upload.',
      rotateLabel: 'Auto-Rotate Playlist',
      nextBtn: 'Step Next',
      schemeLabel: 'Color Scheme',
      accentLabel: 'Accent Mode',
      s_glassOpacity: 'Glass Opacity',
      s_glassBlur: 'Backdrop Blur',
      s_islandGap: 'Island Gap',
      s_scrimOpacity: 'Scrim Veil',
      s_mediaBlur: 'Wallpaper Blur',
      s_volume: 'Audio Volume',
      resetTip: 'Reset to default',
      sw_glass: 'Frosted Glass Surfaces',
      sw_vignette: 'Central Reading Vignette',
      sw_pauseBlur: 'Auto-Pause When Unfocused',
      codeLabel: 'Code & Terminal Backing',
      code_translucent: 'Tint',
      code_frosted: 'Frost',
      code_solid: 'Solid',
      st_skin: 'Prism Skin Status',
      st_skinOn: 'Active',
      st_skinOff: 'Restored to Host',
      st_active: 'Active Wallpaper',
      st_none: 'None',
      st_theme: 'Polarity / Scheme',
      st_rpc: 'CDP Host Bridge',
      btnRefresh: 'Refresh',
      btnResetSkin: 'Reset Optics',
      btnReapply: 'Re-enable Prism Skin',
      btnRestore: 'Restore Host Default',
      btnRestoreConfirm: 'Confirm Restore? (Click again, Esc cancels)',
      cancel: 'Cancel',
      studioToast: 'Open via Aux Pane "+ -> Plugins -> Wallpaper Prism" or sidecar:// pill',
    },
  };

  var ICONS = {
    prism:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 2.5 21 12l-9 9.5L3 12 12 2.5Z"/><path d="M12 2.5v19M3 12h18" opacity=".45"/></svg>',
    prev:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/></svg>',
    play:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5.5v13l10.5-6.5L8 5.5z"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z"/></svg>',
    next:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"/></svg>',
    volOn:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
    volOff:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>',
    ext:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    reset:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // State & Helpers
  // ---------------------------------------------------------------------------
  var ui = {
    open: false,
    tab: 'optics',
    drilldown: false,
    query: '',
    kindFilter: '',
    favOnly: false,
    ratings: { everyone: true, pg13: true, mature: false, unrated: true },
    pos: null,
  };

  var store = {
    skinEnabled: true,
    config: {},
    activeItem: null,
    items: [],
    connected: false,
    theme: 'dark',
  };

  if (carry && typeof carry === 'object') {
    if (carry.ui) {
      for (var uk in ui) if (Object.prototype.hasOwnProperty.call(carry.ui, uk)) ui[uk] = carry.ui[uk];
    }
    if (carry.store) {
      if (carry.store.config) store.config = carry.store.config;
      if (carry.store.activeItem) store.activeItem = carry.store.activeItem;
      if (Array.isArray(carry.store.items)) store.items = carry.store.items;
      if (typeof carry.store.skinEnabled === 'boolean') store.skinEnabled = carry.store.skinEnabled;
    }
  }

  var destroyed = false;
  var mounted = false;
  var restoreArmed = false;
  var restoreTimer = 0;
  var patchQueue = {};
  var patchTimer = 0;
  var searchTimer = 0;
  var toastTimer = 0;
  var lastFocus = null;
  var rpcSeq = 0;
  var rpcPending = {};
  var els = {};
  var sliderRefs = {};
  var cleanups = [];
  var domObserver = null;
  var themeObserver = null;
  var housekeepTimer = 0;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function hasBinding() {
    return typeof W[BINDING_KEY] === 'function';
  }
  function getLang() {
    var l = String((store.config && store.config.language) || DEFAULTS.language).toLowerCase();
    if (l === 'en') return 'en';
    if (l === 'zh' || l === 'zh-cn') return 'zh';
    var nav = String((W.navigator && W.navigator.language) || 'zh').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }
  function tr(key) {
    var lang = getLang();
    return (COPY[lang] && COPY[lang][key]) || COPY.zh[key] || key;
  }
  function cfgVal(key) {
    if (Object.prototype.hasOwnProperty.call(patchQueue, key)) return patchQueue[key];
    if (store.config && store.config[key] !== undefined) return store.config[key];
    return DEFAULTS[key];
  }

  function h(tag, props, children) {
    var el = doc.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i += 1) {
        var c = children[i];
        if (c == null || c === false) continue;
        el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
      }
    }
    return el;
  }

  function listen(target, type, fn, opts) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts);
    cleanups.push(function () {
      try {
        target.removeEventListener(type, fn, opts);
      } catch (_) {}
    });
  }

  // ---------------------------------------------------------------------------
  // Scoped Stylesheet (`#agy-prism-popover-css` + `#agy-prism-pill-css`)
  // ---------------------------------------------------------------------------
  var PANEL_CSS = [
    '#R{all:initial;position:fixed;left:0;top:0;width:0;height:0;overflow:visible;z-index:' + Z_INDEX + ';pointer-events:none;',
    "--pp-font:'Google Sans Flex','Google Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC','PingFang SC','Microsoft YaHei UI',sans-serif;",
    "--pp-mono:'Google Sans Code','JetBrains Mono','Cascadia Code',Consolas,ui-monospace,monospace;",
    '--pp-accent:#669DF6;--pp-accent-fg:#FFFFFF;--pp-r-sheet:14px;--pp-r-card:10px;--pp-r-ctl:7px;--pp-ease:cubic-bezier(.22,1,.36,1);',
    '--pp-bg:rgba(20,20,26,.84);--pp-bg-solid:rgba(20,20,26,.97);--pp-fg:#F2F2F5;--pp-fg2:#C4C4CE;--pp-muted:#8A8A98;--pp-faint:#626270;',
    '--pp-border:rgba(255,255,255,.09);--pp-border2:rgba(255,255,255,.15);--pp-fill:rgba(255,255,255,.045);--pp-fill2:rgba(255,255,255,.085);',
    '--pp-hover:rgba(255,255,255,.07);--pp-track:rgba(255,255,255,.14);--pp-spec:rgba(255,255,255,.08);',
    '--pp-sheen:linear-gradient(172deg,rgba(255,255,255,.045) 0%,rgba(255,255,255,0) 38%);',
    '--pp-shadow:0 28px 64px -14px rgba(0,0,0,.64),0 2px 8px rgba(0,0,0,.30);--pp-ok:#50A37B;--pp-warn:#F2B84B;--pp-danger:#E5534B;}',
    '#R[data-theme="light"]{--pp-accent:#2563EB;--pp-bg:rgba(250,251,254,.88);--pp-bg-solid:rgba(252,253,255,.98);--pp-fg:#0F172A;--pp-fg2:#334155;--pp-muted:#5B6B82;--pp-faint:#94A3B8;',
    '--pp-border:rgba(15,23,42,.10);--pp-border2:rgba(15,23,42,.16);--pp-fill:rgba(15,23,42,.038);--pp-fill2:rgba(15,23,42,.072);',
    '--pp-hover:rgba(15,23,42,.06);--pp-track:rgba(15,23,42,.14);--pp-spec:rgba(255,255,255,.92);',
    '--pp-sheen:linear-gradient(172deg,rgba(255,255,255,.72) 0%,rgba(255,255,255,0) 40%);',
    '--pp-shadow:0 28px 64px -18px rgba(15,23,42,.28),0 2px 8px rgba(15,23,42,.10);--pp-ok:#059669;--pp-warn:#D97706;--pp-danger:#DC2626;}',
    '#R,#R *,#R *::before,#R *::after{box-sizing:border-box;font-family:var(--pp-font);}',
    '#R [hidden]{display:none !important;}',
    '#R button,#R input{margin:0;font:inherit;color:inherit;}',
    '#R svg{display:block;flex-shrink:0;}',
    // Corner Glass Orb
    '#R .prism-corner-orb{position:fixed;left:12px;bottom:12px;width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;',
    'border-radius:999px;border:1px solid var(--pp-border2);color:var(--pp-fg2);background-color:var(--pp-bg);background-image:var(--pp-sheen);',
    'backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);box-shadow:inset 0 1px 0 var(--pp-spec),0 6px 18px -6px rgba(0,0,0,.45);',
    'opacity:.48;transition:opacity .16s ease,transform .16s var(--pp-ease),color .16s ease;}',
    '#R .prism-corner-orb:hover,#R[data-open="true"] .prism-corner-orb{opacity:1;color:var(--pp-accent);transform:translateY(-1px);}',
    '#R .prism-corner-orb i{position:absolute;right:0;top:0;width:7px;height:7px;border-radius:50%;background:var(--pp-faint);box-shadow:0 0 0 2px var(--pp-bg-solid);}',
    '#R[data-conn="on"] .prism-corner-orb i{background:var(--pp-ok);}',
    // Main Floating Sheet (384 x max 560px)
    '#R .prism-sheet{position:fixed;left:12px;bottom:48px;width:384px;max-width:calc(100vw - 16px);max-height:560px;display:flex;flex-direction:column;pointer-events:auto;',
    'color:var(--pp-fg);font-size:12.5px;line-height:1.45;-webkit-font-smoothing:antialiased;border-radius:var(--pp-r-sheet);border:1px solid var(--pp-border2);',
    'background-color:var(--pp-bg) !important;background-image:var(--pp-sheen);backdrop-filter:blur(26px) saturate(155%) !important;-webkit-backdrop-filter:blur(26px) saturate(155%) !important;',
    'box-shadow:inset 0 1px 0 var(--pp-spec),var(--pp-shadow);overflow:hidden;opacity:0;visibility:hidden;transform:translateY(8px) scale(.985);',
    'transition:opacity .16s ease,transform .18s var(--pp-ease),visibility 0s linear .18s;}',
    '#R[data-open="true"] .prism-sheet{opacity:1;visibility:visible;transform:none;transition:opacity .16s ease,transform .18s var(--pp-ease),visibility 0s;}',
    '#R[data-open="false"] .prism-sheet{pointer-events:none;}',
    // Header
    '#R .pp-head{display:flex;align-items:center;gap:5px;height:40px;padding:0 8px 0 12px;border-bottom:1px solid var(--pp-border);cursor:grab;user-select:none;flex-shrink:0;}',
    '#R .pp-head:active{cursor:grabbing;}',
    '#R .pp-logo{color:var(--pp-accent);display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;margin-right:2px;}',
    '#R .pp-conn{display:inline-flex;align-items:center;gap:4px;height:19px;padding:0 7px;border-radius:999px;font-size:10.5px;color:var(--pp-muted);background:var(--pp-fill);border:1px solid var(--pp-border);}',
    '#R .pp-conn i{width:5.5px;height:5.5px;border-radius:50%;background:var(--pp-faint);}',
    '#R[data-conn="on"] .pp-conn i{background:var(--pp-ok);}',
    '#R .pp-grow{flex:1;}',
    '#R .pp-ibtn{width:25px;height:25px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--pp-fg2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,color .12s;}',
    '#R .pp-ibtn:hover{background:var(--pp-hover);color:var(--pp-fg);}',
    '#R .pp-lang{height:21px;padding:0 6px;border-radius:5px;border:1px solid var(--pp-border);background:var(--pp-fill);color:var(--pp-fg2);font-family:var(--pp-mono);font-size:10px;font-weight:600;cursor:pointer;}',
    '#R .pp-lang:hover{color:var(--pp-fg);border-color:var(--pp-border2);}',
    // Topdeck (Scene Presets + Flush/Islands Toggle)
    '#R .pp-topdeck{display:flex;flex-direction:column;gap:6px;margin:8px 10px 0;padding:8px 9px;border-radius:var(--pp-r-card);border:1px solid var(--pp-border);background:var(--pp-fill);flex-shrink:0;}',
    '#R .pp-deck-row{display:flex;align-items:center;gap:6px;}',
    '#R .pp-micro{font-family:var(--pp-mono);font-size:9.5px;font-weight:600;letter-spacing:.06em;color:var(--pp-muted);width:44px;flex-shrink:0;}',
    '#R .pp-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;flex:1;}',
    '#R .pp-preset{height:25px;padding:0 6px;border-radius:6px;border:1px solid var(--pp-border);background:transparent;color:var(--pp-fg2);font-size:11.5px;font-weight:500;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:all .14s ease;}',
    '#R .pp-preset:hover{background:var(--pp-hover);color:var(--pp-fg);}',
    '#R .pp-preset[aria-pressed="true"]{border-color:color-mix(in srgb,var(--pp-accent) 65%,transparent);background:color-mix(in srgb,var(--pp-accent) 15%,transparent);color:var(--pp-accent);font-weight:600;}',
    '#R .pp-seg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;padding:2px;border-radius:8px;border:1px solid var(--pp-border);background:var(--pp-fill);flex:1;}',
    '#R .pp-seg3{grid-template-columns:repeat(3,minmax(0,1fr));}',
    '#R .pp-seg button{height:23px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:var(--pp-fg2);font-size:11.5px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s;}',
    '#R .pp-seg button[aria-checked="true"]{background:var(--pp-fill2);color:var(--pp-fg);font-weight:600;box-shadow:inset 0 1px 0 var(--pp-spec),0 1px 2px rgba(0,0,0,.14);}',
    // Subtabs
    '#R .pp-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin:8px 10px 0;padding:2px;border-radius:9px;border:1px solid var(--pp-border);background:var(--pp-fill);flex-shrink:0;}',
    '#R .pp-tab{height:26px;border:none;border-radius:7px;background:transparent;color:var(--pp-fg2);font-size:12px;cursor:pointer;transition:background .12s,color .12s;}',
    '#R .pp-tab[aria-selected="true"]{background:var(--pp-fill2);color:var(--pp-fg);font-weight:600;box-shadow:inset 0 1px 0 var(--pp-spec);}',
    // Toast banner
    '#R .pp-toast{margin:6px 10px 0;padding:6px 9px;border-radius:7px;font-size:11px;background:color-mix(in srgb,var(--pp-accent) 14%,transparent);border:1px solid color-mix(in srgb,var(--pp-accent) 40%,transparent);color:var(--pp-fg);}',
    // Scrollable Body + Drilldown
    '#R .pp-body{position:relative;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:8px 10px 10px;scrollbar-width:thin;scrollbar-color:var(--pp-track) transparent;}',
    '#R .pp-drill{padding:9px;margin-bottom:8px;border-radius:var(--pp-r-card);border:1px solid color-mix(in srgb,var(--pp-accent) 45%,transparent);background:var(--pp-bg-solid);display:flex;flex-direction:column;gap:8px;}',
    '#R .pp-drill-head{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;font-weight:600;color:var(--pp-accent);}',
    // Library
    '#R .pp-lib-bar{display:flex;gap:5px;margin-bottom:6px;}',
    '#R .pp-inp{flex:1;min-width:0;height:28px;padding:0 9px;border-radius:var(--pp-r-ctl);border:1px solid var(--pp-border);background:var(--pp-fill);color:var(--pp-fg);font-size:12px;outline:none;}',
    '#R .pp-inp:focus{border-color:var(--pp-accent);background:var(--pp-fill2);}',
    '#R .pp-chips{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:7px;}',
    '#R .pp-chip{height:22px;padding:0 8px;border-radius:999px;border:1px solid var(--pp-border);background:transparent;color:var(--pp-fg2);font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;}',
    '#R .pp-chip[aria-pressed="true"]{background:var(--pp-fill2);border-color:var(--pp-border2);color:var(--pp-fg);font-weight:600;}',
    '#R .pp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;}',
    '#R .pp-card{position:relative;display:flex;flex-direction:column;padding:0;border-radius:8px;border:1px solid var(--pp-border);background:var(--pp-fill);overflow:hidden;cursor:pointer;text-align:left;transition:transform .14s var(--pp-ease),border-color .14s;}',
    '#R .pp-card:hover{transform:translateY(-1px);border-color:var(--pp-border2);}',
    '#R .pp-card[aria-current="true"]{border-color:var(--pp-accent);box-shadow:0 0 0 1px var(--pp-accent);}',
    '#R .pp-thumb{position:relative;width:100%;aspect-ratio:16/10;background:rgba(128,128,140,.12);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--pp-muted);}',
    '#R .pp-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}',
    '#R .pp-cur{position:absolute;left:4px;top:4px;width:16px;height:16px;border-radius:50%;background:var(--pp-accent);color:var(--pp-accent-fg);display:flex;align-items:center;justify-content:center;}',
    '#R .pp-fav{position:absolute;right:4px;top:4px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,.48);color:#fff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}',
    '#R .pp-fav[data-on="true"]{color:#FBBF24;}',
    '#R .pp-ctitle{padding:4px 6px;font-size:11px;color:var(--pp-fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    // Optics Swatches & Sliders
    '#R .pp-sec{padding:7px 9px;margin-bottom:7px;border-radius:var(--pp-r-card);border:1px solid var(--pp-border);background:var(--pp-fill);display:flex;flex-direction:column;gap:6px;}',
    '#R .pp-sec-title{font-size:10.5px;font-weight:600;color:var(--pp-muted);letter-spacing:.03em;}',
    '#R .pp-swatches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;}',
    '#R .pp-swatch{display:flex;align-items:center;gap:4px;height:25px;padding:0 6px;border-radius:6px;border:1px solid var(--pp-border);background:transparent;color:var(--pp-fg2);font-size:11px;cursor:pointer;overflow:hidden;white-space:nowrap;}',
    '#R .pp-swatch[aria-checked="true"]{border-color:var(--pp-accent);background:color-mix(in srgb,var(--pp-accent) 13%,transparent);color:var(--pp-fg);font-weight:600;}',
    '#R .pp-dots{display:inline-flex;gap:2px;flex-shrink:0;}',
    '#R .pp-dots i{width:6px;height:6px;border-radius:50%;border:1px solid rgba(255,255,255,.22);}',
    '#R .pp-acc-row{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}',
    '#R .pp-color{width:24px;height:22px;padding:0;border:1px solid var(--pp-border2);border-radius:5px;background:transparent;cursor:pointer;}',
    // Slider Row with Tabular Readout + 1-Click Reset (`↺`)
    '#R .pp-srow{display:grid;grid-template-columns:1fr auto auto;grid-template-rows:auto auto;align-items:center;column-gap:6px;row-gap:3px;padding:4px 0;border-top:1px solid var(--pp-border);}',
    '#R .pp-srow:first-of-type{border-top:none;}',
    '#R .pp-sval{font-family:var(--pp-mono);font-size:11px;font-variant-numeric:tabular-nums;color:var(--pp-fg2);}',
    '#R .pp-rst{width:18px;height:18px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--pp-faint);opacity:.22;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .12s,color .12s,background .12s;}',
    '#R .pp-srow[data-dirty="true"] .pp-rst{opacity:.9;color:var(--pp-accent);}',
    '#R .pp-srow[data-dirty="true"] .pp-rst:hover{opacity:1;background:color-mix(in srgb,var(--pp-accent) 16%,transparent);}',
    '#R .pp-range{grid-column:1 / -1;-webkit-appearance:none;appearance:none;width:100%;height:15px;background:transparent;cursor:pointer;outline:none;}',
    '#R .pp-range::-webkit-slider-runnable-track{height:4px;border-radius:99px;background:linear-gradient(to right,var(--pp-accent) 0,var(--pp-accent) var(--pct,50%),var(--pp-track) var(--pct,50%),var(--pp-track) 100%);}',
    '#R .pp-range::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-4.5px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.2);box-shadow:0 1px 3px rgba(0,0,0,.35);}',
    // Switch Row
    '#R .pp-trow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--pp-border);font-size:12px;}',
    '#R .pp-sw{position:relative;width:34px;height:19px;padding:0;border-radius:99px;border:1px solid var(--pp-border2);background:var(--pp-fill2);cursor:pointer;flex-shrink:0;transition:background .15s,border-color .15s;}',
    '#R .pp-sw::after{content:"";position:absolute;top:1.5px;left:1.5px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .16s var(--pp-ease);}',
    '#R .pp-sw[aria-checked="true"]{background:var(--pp-accent);border-color:var(--pp-accent);}',
    '#R .pp-sw[aria-checked="true"]::after{transform:translateX(15px);}',
    // Status KV & Buttons
    '#R .pp-kv{display:grid;grid-template-columns:auto 1fr;border-radius:var(--pp-r-card);border:1px solid var(--pp-border);background:var(--pp-fill);overflow:hidden;margin-bottom:8px;}',
    '#R .pp-kv dt,#R .pp-kv dd{margin:0;padding:6px 9px;font-size:11.5px;border-top:1px solid var(--pp-border);}',
    '#R .pp-kv dt:first-of-type,#R .pp-kv dt:first-of-type + dd{border-top:none;}',
    '#R .pp-kv dt{color:var(--pp-muted);}',
    '#R .pp-kv dd{text-align:right;color:var(--pp-fg);font-family:var(--pp-mono);font-size:11px;word-break:break-all;}',
    '#R .pp-btn{height:28px;padding:0 10px;border-radius:var(--pp-r-ctl);border:1px solid var(--pp-border2);background:var(--pp-fill);color:var(--pp-fg);font-size:11.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:background .12s,border-color .12s;}',
    '#R .pp-btn:hover{background:var(--pp-hover);}',
    '#R .pp-btn-danger{width:100%;color:var(--pp-danger);border-color:color-mix(in srgb,var(--pp-danger) 42%,transparent);background:color-mix(in srgb,var(--pp-danger) 9%,transparent);}',
    '#R .pp-btn-danger[data-armed="true"]{color:#fff;background:var(--pp-danger);border-color:var(--pp-danger);font-weight:600;}',
    '#R .pp-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid var(--pp-border);background:var(--pp-fill);flex-shrink:0;font-size:11px;color:var(--pp-muted);}',
    '#R .pp-foot-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--pp-fg2);}',
  ]
    .join('\n')
    .replace(/#R/g, '#' + ROOT_ID);

  var PILL_CSS =
    '#' + PILL_ID + '{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;margin-left:6px;border-radius:999px;' +
    'border:1px solid rgba(148,163,184,.24);background:rgba(128,138,158,.10);color:var(--foreground,inherit);' +
    'font-family:inherit;font-size:11px;font-weight:500;line-height:1;cursor:pointer;user-select:none;white-space:nowrap;' +
    'transition:background .14s ease,border-color .14s ease;-webkit-app-region:no-drag;}\n' +
    '#' + PILL_ID + ':hover{background:rgba(102,157,246,.16);border-color:rgba(102,157,246,.48);}\n' +
    '#' + PILL_ID + ' i{width:6px;height:6px;border-radius:50%;background:var(--prism-accent,#669DF6);flex-shrink:0;}';

  // ---------------------------------------------------------------------------
  // RPC & Optimistic Sync
  // ---------------------------------------------------------------------------
  function callRpc(method, params) {
    var fn = W[BINDING_KEY];
    if (typeof fn !== 'function') {
      store.connected = false;
      renderConnectionState();
      return Promise.resolve(null);
    }
    store.connected = true;
    rpcSeq += 1;
    var id = 'pp-' + rpcSeq + '-' + Date.now().toString(36);
    var payload = JSON.stringify({ id: id, method: method, params: params || {} });
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        delete rpcPending[id];
        resolve(null);
      }, 6000);
      rpcPending[id] = function (val) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete rpcPending[id];
        resolve(val);
      };
      try {
        var ret = fn(payload);
        if (ret && typeof ret.then === 'function') {
          ret.then(
            function (v) {
              if (rpcPending[id]) rpcPending[id](v);
            },
            function () {
              if (rpcPending[id]) rpcPending[id](null);
            }
          );
        } else if (ret !== undefined) {
          if (rpcPending[id]) rpcPending[id](ret);
        }
      } catch (_) {
        if (rpcPending[id]) rpcPending[id](null);
      }
    });
  }

  function pushConfigPatch(patch, immediate) {
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        patchQueue[k] = patch[k];
        store.config[k] = patch[k];
      }
    }
    // Instant <16ms optimistic skin update on host!
    if (W[SKIN_KEY] && typeof W[SKIN_KEY].updateConfig === 'function') {
      try {
        W[SKIN_KEY].updateConfig(patch);
      } catch (_) {}
    }
    renderAll();

    clearTimeout(patchTimer);
    var flush = function () {
      var send = {};
      var hasKeys = false;
      for (var pk in patchQueue) {
        if (Object.prototype.hasOwnProperty.call(patchQueue, pk)) {
          send[pk] = patchQueue[pk];
          hasKeys = true;
        }
      }
      patchQueue = {};
      if (!hasKeys) return;
      callRpc('config.set', { patch: send }).then(function (res) {
        if (res && typeof res === 'object') ingestState(res.state || res);
      });
    };
    if (immediate) flush();
    else patchTimer = setTimeout(flush, 150);
  }

  function ingestState(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.skinEnabled === 'boolean') store.skinEnabled = data.skinEnabled;
    else if (data.config && typeof data.config.skinEnabled === 'boolean') store.skinEnabled = data.config.skinEnabled;

    if (data.config && typeof data.config === 'object') store.config = data.config;
    else if (data.prefs && typeof data.prefs === 'object') store.config = data.prefs;

    if (data.activeItem !== undefined) store.activeItem = data.activeItem;
    else if (data.source && typeof data.source === 'object') store.activeItem = data.source;

    if (Array.isArray(data.items)) store.items = data.items;
    store.connected = hasBinding() || Boolean(data.connected);
    syncHostTheme();
    mountInlinePill();
    renderAll();
  }

  function syncState(data) {
    ingestState(data);
    return status();
  }

  function receive(msg) {
    if (destroyed) return false;
    try {
      if (typeof msg === 'string') msg = JSON.parse(msg);
    } catch (_) {
      return false;
    }
    if (!msg || typeof msg !== 'object') return false;
    if (msg.event === 'state') {
      ingestState(msg.data || {});
      return true;
    }
    if (msg.event === 'payload' || msg.event === 'skin') {
      if (W[SKIN_KEY] && typeof W[SKIN_KEY].applyPayload === 'function') {
        W[SKIN_KEY].applyPayload(msg.data || {});
      }
      ingestState(msg.data || {});
      return true;
    }
    if (msg.id && rpcPending[msg.id]) {
      var val = msg.ok !== false ? (msg.result !== undefined ? msg.result : msg) : null;
      rpcPending[msg.id](val);
      return true;
    }
    if (msg.config || msg.prefs || msg.items) {
      ingestState(msg);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Theme Sync & Trigger Positioning (Inline Pill + Auto-Dodging Corner Orb)
  // ---------------------------------------------------------------------------
  function detectTheme() {
    var root = doc.documentElement;
    var body = doc.body;
    var pt = root && root.getAttribute('data-prism-theme');
    if (pt === 'light' || pt === 'dark') return pt;
    if ((body && body.classList && body.classList.contains('light')) || (root && root.classList && root.classList.contains('light'))) {
      return 'light';
    }
    return 'dark';
  }

  function syncHostTheme() {
    store.theme = detectTheme();
    if (!els.root) return;
    els.root.setAttribute('data-theme', store.theme);
    var acc = '';
    try {
      acc = getComputedStyle(doc.documentElement).getPropertyValue('--prism-accent').trim();
      if (!acc && doc.body) acc = getComputedStyle(doc.body).getPropertyValue('--primary').trim();
    } catch (_) {}
    if (acc && /^#|rgb/i.test(acc)) els.root.style.setProperty('--pp-accent', acc);
  }

  function mountInlinePill() {
    var mode = String(cfgVal('triggerMode') || 'both');
    var wantPill = mode === 'pill' || mode === 'both';
    var existing = doc.getElementById(PILL_ID);

    if (!wantPill || destroyed) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return false;
    }

    var pStyle = doc.getElementById(PILL_STYLE_ID);
    if (!pStyle) {
      pStyle = doc.createElement('style');
      pStyle.id = PILL_STYLE_ID;
      pStyle.textContent = PILL_CSS;
      (doc.head || doc.documentElement).appendChild(pStyle);
    }

    var hostSlot =
      doc.querySelector('.agy-composer-footer') ||
      doc.querySelector('.composer-bar') ||
      doc.querySelector('.monaco-workbench .part.statusbar .right-items') ||
      doc.querySelector('.monaco-workbench .part.statusbar');

    if (!hostSlot) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return false;
    }

    if (existing && existing.dataset && existing.dataset.prismLazyStub === '1') {
      if (existing.parentNode) existing.parentNode.removeChild(existing);
      existing = null;
    }

    if (!existing) {
      existing = h('button', { id: PILL_ID, type: 'button', title: 'Wallpaper Prism (Ctrl+Alt+W)', onclick: function (e) { e.stopPropagation(); toggle(); } }, [
        h('i'),
        h('span', { text: 'Prism' }),
      ]);
    }
    if (existing.parentNode !== hostSlot) {
      hostSlot.appendChild(existing);
    }
    return true;
  }

  function positionTriggersAndSheet() {
    if (!els.orb || !els.sheet) return;
    var pillMounted = mountInlinePill();
    var mode = String(cfgVal('triggerMode') || 'both');
    var showOrb = mode === 'corner' || mode === 'both' || (mode === 'pill' && !pillMounted);
    els.orb.hidden = !showOrb;

    var vw = Math.max(320, W.innerWidth || 1280);
    var vh = Math.max(280, W.innerHeight || 800);
    var left = 12;
    var bottom = 12;

    try {
      var sbs = doc.querySelectorAll('[data-testid="sidebar-split"] > div:first-child, .agy-sidebar, .monaco-workbench .part.sidebar');
      for (var i = 0; i < sbs.length; i += 1) {
        var r = sbs[i].getBoundingClientRect();
        if (r.left <= 16 && r.width >= 40 && r.width < vw * 0.55 && r.height > vh * 0.5) {
          left = Math.max(left, Math.round(r.right + 10));
        }
      }
      var comps = doc.querySelectorAll('[data-testid="agent-input-box"], .surface-composer-card, .agy-composer');
      for (var j = 0; j < comps.length; j += 1) {
        var c = comps[j].getBoundingClientRect();
        if (c.width > 10 && left + 28 > c.left - 6 && left < c.right + 6 && vh - bottom < c.bottom + 6 && vh - bottom - 28 > c.top - 6) {
          bottom = Math.round(vh - c.top + 8);
        }
      }
    } catch (_) {}

    left = clamp(left, 8, vw - 36);
    bottom = clamp(bottom, 8, vh - 36);
    els.orb.style.left = left + 'px';
    els.orb.style.bottom = bottom + 'px';

    var sheetW = Math.min(384, vw - 16);
    if (ui.pos) {
      var sx = clamp(ui.pos.x, 8, Math.max(8, vw - sheetW - 8));
      var sy = clamp(ui.pos.y, 8, Math.max(8, vh - 140));
      els.sheet.style.left = sx + 'px';
      els.sheet.style.top = sy + 'px';
      els.sheet.style.bottom = 'auto';
      els.sheet.style.maxHeight = Math.max(240, Math.min(560, vh - sy - 8)) + 'px';
    } else {
      var sLeft = clamp(left, 8, Math.max(8, vw - sheetW - 8));
      var sBot = showOrb ? bottom + 36 : 48;
      if (vh - sBot < 280) sBot = 12;
      els.sheet.style.left = sLeft + 'px';
      els.sheet.style.top = 'auto';
      els.sheet.style.bottom = sBot + 'px';
      els.sheet.style.maxHeight = Math.max(240, Math.min(560, vh - sBot - 10)) + 'px';
    }
  }

  // ---------------------------------------------------------------------------
  // DOM Construction & Rendering
  // ---------------------------------------------------------------------------
  function showToast(text) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (els.toast) els.toast.hidden = true;
    }, 3600);
  }

  function disarmRestore() {
    restoreArmed = false;
    clearTimeout(restoreTimer);
    if (els.restoreBtn) {
      els.restoreBtn.setAttribute('data-armed', 'false');
      els.restoreBtn.textContent = tr('btnRestore');
    }
  }

  function buildSliderRow(key, min, max, step, fmt) {
    var valSpan = h('span', { class: 'pp-sval' });
    var labelSpan = h('span', { class: 'pp-slabel' });
    var rstBtn = h('button', {
      type: 'button',
      class: 'pp-rst',
      'data-reset-key': key,
      html: ICONS.reset,
      onclick: function () {
        var p = { preset: 'custom' };
        p[key] = DEFAULTS[key];
        pushConfigPatch(p, true);
      },
    });
    var range = h('input', {
      type: 'range',
      class: 'pp-range',
      'data-slider-key': key,
      min: min,
      max: max,
      step: step,
      oninput: function () {
        var v = Number(range.value);
        var p = { preset: 'custom' };
        p[key] = v;
        pushConfigPatch(p, false);
      },
      onchange: function () {
        var v = Number(range.value);
        var p = { preset: 'custom' };
        p[key] = v;
        pushConfigPatch(p, true);
      },
    });
    var row = h('div', { class: 'pp-srow', 'data-dirty': 'false' }, [labelSpan, valSpan, rstBtn, range]);
    sliderRefs[key] = { row: row, label: labelSpan, val: valSpan, rst: rstBtn, range: range, min: min, max: max, fmt: fmt };
    return row;
  }

  function buildDom() {
    els.orb = h(
      'button',
      {
        type: 'button',
        class: 'prism-corner-orb',
        title: 'Wallpaper Prism (Ctrl+Alt+W)',
        'aria-expanded': 'false',
        html: ICONS.prism + '<i></i>',
        onclick: function () {
          toggle();
        },
      },
      []
    );

    els.connDot = h('i');
    els.connText = h('span');
    els.prevBtn = h('button', {
      type: 'button',
      class: 'pp-ibtn',
      html: ICONS.prev,
      onclick: function () {
        callRpc('playlist.step', { direction: -1, reason: 'manual' }).then(function (r) {
          if (r) ingestState(r.state || r);
        });
      },
    });
    els.playBtn = h('button', {
      type: 'button',
      class: 'pp-ibtn',
      html: ICONS.pause,
      onclick: function () {
        pushConfigPatch({ paused: !cfgVal('paused') }, true);
      },
    });
    els.nextBtn = h('button', {
      type: 'button',
      class: 'pp-ibtn',
      html: ICONS.next,
      onclick: function () {
        callRpc('playlist.step', { direction: 1, reason: 'manual' }).then(function (r) {
          if (r) ingestState(r.state || r);
        });
      },
    });
    els.muteBtn = h('button', {
      type: 'button',
      class: 'pp-ibtn',
      html: ICONS.volOff,
      onclick: function () {
        var nextMuted = !cfgVal('muted');
        var patch = { muted: nextMuted, audioEnabled: !nextMuted };
        if (!nextMuted && Number(cfgVal('volume')) <= 0.01) patch.volume = 0.5;
        pushConfigPatch(patch, true);
      },
    });
    els.langBtn = h('button', {
      type: 'button',
      class: 'pp-lang',
      'data-testid': 'prism-lang-toggle',
      onclick: function () {
        var next = getLang() === 'zh' ? 'en' : 'zh';
        pushConfigPatch({ language: next }, true);
      },
    });
    els.studioBtn = h('button', {
      type: 'button',
      class: 'pp-ibtn',
      'data-testid': 'prism-open-studio',
      html: ICONS.ext,
      onclick: function () {
        callRpc('studio.open', {}).then(function (res) {
          if (!res || !res.opened) showToast(tr('studioToast'));
        });
      },
    });
    els.closeBtn = h('button', {
      type: 'button',
      class: 'pp-ibtn',
      'data-testid': 'prism-close-btn',
      html: ICONS.close,
      onclick: function () {
        close();
      },
    });

    els.head = h('div', { class: 'pp-head' }, [
      h('span', { class: 'pp-logo', html: ICONS.prism + '<span>Prism</span>' }),
      h('span', { class: 'pp-conn' }, [els.connDot, els.connText]),
      h('span', { class: 'pp-grow' }),
      els.prevBtn,
      els.playBtn,
      els.nextBtn,
      els.muteBtn,
      els.langBtn,
      els.studioBtn,
      els.closeBtn,
    ]);

    // Topdeck: 4 Scene Presets + Flush/Islands toggle
    els.presetBtns = {};
    var presetKids = ['crystal', 'islands', 'focus', 'eco'].map(function (pid) {
      var b = h('button', {
        type: 'button',
        class: 'pp-preset',
        'data-preset': pid,
        'aria-pressed': 'false',
        onclick: function () {
          var patch = { preset: pid };
          var sp = SCENE_PRESETS[pid];
          for (var k in sp) patch[k] = sp[k];
          for (var qk in patch) store.config[qk] = patch[qk];
          if (W[SKIN_KEY] && typeof W[SKIN_KEY].updateConfig === 'function') W[SKIN_KEY].updateConfig(patch);
          renderAll();
          callRpc('preset.apply', { presetId: pid }).then(function (r) {
            if (r) ingestState(r.state || r);
          });
        },
      });
      els.presetBtns[pid] = b;
      return b;
    });

    els.flushBtn = h('button', {
      type: 'button',
      'data-layout': 'flush',
      onclick: function () {
        pushConfigPatch({ layoutMode: 'flush', preset: 'custom' }, true);
      },
    });
    els.islandsBtn = h('button', {
      type: 'button',
      'data-layout': 'islands',
      onclick: function () {
        pushConfigPatch({ layoutMode: 'islands', islandGap: cfgVal('islandGap') || 8, preset: 'custom' }, true);
      },
    });

    var topdeck = h('div', { class: 'pp-topdeck' }, [
      h('div', { class: 'pp-deck-row' }, [h('span', { class: 'pp-micro', text: 'SCENE' }), h('div', { class: 'pp-presets' }, presetKids)]),
      h('div', { class: 'pp-deck-row' }, [
        h('span', { class: 'pp-micro', text: 'LAYOUT' }),
        h('div', { class: 'pp-seg', role: 'radiogroup' }, [els.flushBtn, els.islandsBtn]),
      ]),
    ]);

    // Subtabs
    els.tabBtns = {};
    var tabBar = h(
      'div',
      { class: 'pp-tabs', role: 'tablist' },
      ['library', 'optics', 'status'].map(function (tid) {
        var b = h('button', {
          type: 'button',
          class: 'pp-tab',
          role: 'tab',
          'data-tab': tid,
          onclick: function () {
            ui.tab = tid;
            if (tid === 'library' && (!store.items || !store.items.length)) refreshLibrary();
            renderAll();
          },
        });
        els.tabBtns[tid] = b;
        return b;
      })
    );

    els.toast = h('div', { class: 'pp-toast', hidden: true });

    // Drill-down sub-drawer (Stage 1 of Two-Stage Escape Unwind!)
    els.drillTitle = h('span');
    els.drillDoneBtn = h('button', {
      type: 'button',
      class: 'pp-btn',
      style: 'height:22px;padding:0 8px;font-size:11px;',
      onclick: function () {
        closeDrilldown();
      },
    });
    els.rotSwitch = h('button', {
      type: 'button',
      class: 'pp-sw',
      role: 'switch',
      onclick: function () {
        pushConfigPatch({ rotationEnabled: !cfgVal('rotationEnabled') }, true);
      },
    });
    els.rotLabel = h('span');
    els.drillPanel = h('div', { class: 'pp-drill', hidden: true, 'data-testid': 'prism-drilldown' }, [
      h('div', { class: 'pp-drill-head' }, [els.drillTitle, els.drillDoneBtn]),
      h('div', { class: 'pp-trow', style: 'border-top:none;' }, [els.rotLabel, els.rotSwitch]),
    ]);

    // Pane 1: Library
    els.searchInp = h('input', {
      type: 'text',
      class: 'pp-inp',
      oninput: function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          ui.query = els.searchInp.value || '';
          renderLibraryGrid();
        }, 180);
      },
    });
    els.drillOpenBtn = h('button', {
      type: 'button',
      class: 'pp-btn',
      'data-testid': 'prism-open-drilldown',
      onclick: function () {
        if (ui.drilldown) closeDrilldown();
        else openDrilldown();
      },
    });
    els.kindChips = {};
    var chipRow = h(
      'div',
      { class: 'pp-chips' },
      ['', 'image', 'video', 'web', 'scene'].map(function (k) {
        var c = h('button', {
          type: 'button',
          class: 'pp-chip',
          onclick: function () {
            ui.kindFilter = k;
            renderAll();
          },
        });
        els.kindChips[k || 'all'] = c;
        return c;
      })
    );
    els.favChip = h('button', {
      type: 'button',
      class: 'pp-chip',
      text: '★',
      onclick: function () {
        ui.favOnly = !ui.favOnly;
        renderAll();
      },
    });
    chipRow.appendChild(els.favChip);
    els.grid = h('div', { class: 'pp-grid' });
    els.paneLibrary = h('div', { class: 'pp-pane' }, [
      h('div', { class: 'pp-lib-bar' }, [els.searchInp, els.drillOpenBtn]),
      chipRow,
      els.grid,
    ]);

    // Pane 2: Optics
    els.schemeTitle = h('div', { class: 'pp-sec-title' });
    els.swatchBtns = {};
    var swatchGrid = h(
      'div',
      { class: 'pp-swatches' },
      SCHEMES.map(function (sc) {
        var labelEl = h('span');
        var btn = h(
          'button',
          {
            type: 'button',
            class: 'pp-swatch',
            'data-scheme': sc.id,
            onclick: function () {
              pushConfigPatch({ colorScheme: sc.id }, true);
            },
          },
          [
            h('span', { class: 'pp-dots' }, [
              h('i', { style: 'background:' + sc.c1 }),
              h('i', { style: 'background:' + sc.acc }),
            ]),
            labelEl,
          ]
        );
        els.swatchBtns[sc.id] = { btn: btn, label: labelEl, meta: sc };
        return btn;
      })
    );

    els.accentTitle = h('div', { class: 'pp-sec-title' });
    els.accentBtns = {};
    var accRow = h('div', { class: 'pp-acc-row' });
    ACCENTS.forEach(function (ac) {
      var b = h('button', {
        type: 'button',
        class: 'pp-chip',
        'data-accent': ac.id,
        onclick: function () {
          pushConfigPatch({ accentMode: ac.id }, true);
        },
      });
      els.accentBtns[ac.id] = { btn: b, meta: ac };
      accRow.appendChild(b);
    });
    els.customColorInp = h('input', {
      type: 'color',
      class: 'pp-color',
      value: '#669DF6',
      oninput: function () {
        pushConfigPatch({ accentMode: 'custom', customAccent: els.customColorInp.value }, false);
      },
      onchange: function () {
        pushConfigPatch({ accentMode: 'custom', customAccent: els.customColorInp.value }, true);
      },
    });
    accRow.appendChild(els.customColorInp);

    var slidersSec = h('div', { class: 'pp-sec' }, [
      buildSliderRow('glassOpacity', 0.3, 0.98, 0.01, function (v) { return Math.round(v * 100) + '%'; }),
      buildSliderRow('glassBlur', 0, 48, 1, function (v) { return Math.round(v) + ' px'; }),
      buildSliderRow('islandGap', 0, 20, 1, function (v) { return Math.round(v) + ' px'; }),
      buildSliderRow('scrimOpacity', 0, 0.92, 0.01, function (v) { return Math.round(v * 100) + '%'; }),
      buildSliderRow('mediaBlur', 0, 64, 1, function (v) { return Math.round(v) + ' px'; }),
      buildSliderRow('volume', 0, 1, 0.05, function (v) { return Math.round(v * 100) + '%'; }),
    ]);

    els.swGlassLbl = h('span');
    els.swGlass = h('button', {
      type: 'button',
      class: 'pp-sw',
      role: 'switch',
      onclick: function () { pushConfigPatch({ glassSurfaces: !cfgVal('glassSurfaces'), preset: 'custom' }, true); },
    });
    els.swVigLbl = h('span');
    els.swVig = h('button', {
      type: 'button',
      class: 'pp-sw',
      role: 'switch',
      onclick: function () { pushConfigPatch({ vignette: !cfgVal('vignette'), preset: 'custom' }, true); },
    });
    els.swBlurLbl = h('span');
    els.swBlur = h('button', {
      type: 'button',
      class: 'pp-sw',
      role: 'switch',
      onclick: function () { pushConfigPatch({ pauseOnBlur: !cfgVal('pauseOnBlur') }, true); },
    });
    els.codeLbl = h('span', { class: 'pp-sec-title' });
    els.codeBtns = {};
    var codeSeg = h(
      'div',
      { class: 'pp-seg pp-seg3', role: 'radiogroup' },
      ['translucent', 'frosted', 'solid'].map(function (cm) {
        var b = h('button', {
          type: 'button',
          onclick: function () { pushConfigPatch({ codeReadabilityMode: cm }, true); },
        });
        els.codeBtns[cm] = b;
        return b;
      })
    );

    var togglesSec = h('div', { class: 'pp-sec' }, [
      h('div', { class: 'pp-trow', style: 'border-top:none;' }, [els.swGlassLbl, els.swGlass]),
      h('div', { class: 'pp-trow' }, [els.swVigLbl, els.swVig]),
      h('div', { class: 'pp-trow' }, [els.swBlurLbl, els.swBlur]),
      els.codeLbl,
      codeSeg,
    ]);

    els.paneOptics = h('div', { class: 'pp-pane' }, [
      h('div', { class: 'pp-sec' }, [els.schemeTitle, swatchGrid, els.accentTitle, accRow]),
      slidersSec,
      togglesSec,
    ]);

    // Pane 3: Status & 2-Step Inline Restore
    els.kvList = h('dl', { class: 'pp-kv' });
    els.refreshBtn = h('button', {
      type: 'button',
      class: 'pp-btn',
      style: 'flex:1;',
      onclick: function () {
        refreshAllFromHost();
      },
    });
    els.resetSkinBtn = h('button', {
      type: 'button',
      class: 'pp-btn',
      style: 'flex:1;',
      onclick: function () {
        callRpc('config.reset', { scope: 'skin' }).then(function (r) {
          if (r) ingestState(r.state || r);
        });
      },
    });
    els.restoreBtn = h('button', {
      type: 'button',
      class: 'pp-btn pp-btn-danger',
      'data-testid': 'prism-restore-btn',
      'data-armed': 'false',
      onclick: function () {
        if (!store.skinEnabled) {
          store.skinEnabled = true;
          pushConfigPatch({ skinEnabled: true }, true);
          return;
        }
        if (!restoreArmed) {
          restoreArmed = true;
          els.restoreBtn.setAttribute('data-armed', 'true');
          els.restoreBtn.textContent = tr('btnRestoreConfirm');
          clearTimeout(restoreTimer);
          restoreTimer = setTimeout(disarmRestore, 4500);
          return;
        }
        disarmRestore();
        store.skinEnabled = false;
        if (W[SKIN_KEY] && typeof W[SKIN_KEY].applyPayload === 'function') {
          W[SKIN_KEY].applyPayload({ skinEnabled: false });
        }
        renderAll();
        callRpc('skin.restore', {}).then(function (r) {
          if (r) ingestState(r.state || r);
        });
      },
    });
    els.paneStatus = h('div', { class: 'pp-pane' }, [
      els.kvList,
      h('div', { style: 'display:flex;gap:6px;margin-bottom:8px;' }, [els.refreshBtn, els.resetSkinBtn]),
      els.restoreBtn,
    ]);

    els.body = h('div', { class: 'pp-body' }, [els.drillPanel, els.paneLibrary, els.paneOptics, els.paneStatus]);

    els.footTitle = h('span', { class: 'pp-foot-title' });
    els.footShortcut = h('span', { style: 'font-family:var(--pp-mono);font-size:10px;', text: 'Ctrl+Alt+W' });
    var foot = h('div', { class: 'pp-foot' }, [els.footTitle, els.footShortcut]);

    els.sheet = h('div', { class: 'prism-sheet', role: 'dialog', 'aria-label': 'Wallpaper Prism', tabindex: '-1' }, [
      els.head,
      topdeck,
      tabBar,
      els.toast,
      els.body,
      foot,
    ]);

    els.root = h('div', { id: ROOT_ID, 'data-open': 'false', 'data-conn': 'off', 'data-theme': 'dark' }, [els.orb, els.sheet]);
    attachHeaderDrag();
    return els.root;
  }

  function attachHeaderDrag() {
    var drag = null;
    els.head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || (e.target && e.target.closest && e.target.closest('button'))) return;
      var r = els.sheet.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, pid: e.pointerId };
      try {
        els.head.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
    });
    els.head.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.pid) return;
      ui.pos = { x: Math.round(e.clientX - drag.dx), y: Math.round(e.clientY - drag.dy) };
      positionTriggersAndSheet();
    });
    var stopDrag = function (e) {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      drag = null;
      try {
        els.head.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    els.head.addEventListener('pointerup', stopDrag);
    els.head.addEventListener('pointercancel', stopDrag);
    els.head.addEventListener('dblclick', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      ui.pos = null;
      positionTriggersAndSheet();
    });
  }

  function renderConnectionState() {
    if (!els.root) return;
    var conn = hasBinding() || store.connected;
    els.root.setAttribute('data-conn', conn ? 'on' : 'off');
    if (els.connText) els.connText.textContent = conn ? tr('connOn') : tr('connOff');
  }

  var lastGridSig = '';

  function renderLibraryGrid() {
    if (!els.grid) return;
    if (!ui.open) {
      lastGridSig = '';
      return;
    }

    var q = String(ui.query || '').trim().toLowerCase();
    var favs = Array.isArray(store.config.favorites) ? store.config.favorites : [];
    var hidden = Array.isArray(store.config.hiddenIds) ? store.config.hiddenIds : [];
    var activeId = (store.activeItem && store.activeItem.id) || cfgVal('activeWallpaperId') || cfgVal('wallpaperId') || '';
    var itemsArr = store.items || [];
    var firstId = itemsArr.length && itemsArr[0] ? itemsArr[0].id : '';
    var lastId = itemsArr.length && itemsArr[itemsArr.length - 1] ? itemsArr[itemsArr.length - 1].id : '';
    var gridSig = [
      getLang(),
      store.skinEnabled ? '1' : '0',
      activeId,
      ui.kindFilter,
      ui.favOnly ? '1' : '0',
      q,
      itemsArr.length,
      firstId,
      lastId,
      favs.join(','),
      hidden.join(','),
    ].join('|');
    if (gridSig === lastGridSig) return;
    lastGridSig = gridSig;

    while (els.grid.firstChild) els.grid.removeChild(els.grid.firstChild);

    var filtered = (store.items || []).filter(function (it) {
      if (!it || hidden.indexOf(it.id) >= 0) return false;
      if (ui.kindFilter && it.kind !== ui.kindFilter) return false;
      if (ui.favOnly && favs.indexOf(it.id) < 0) return false;
      if (q) {
        var hay = (String(it.title || '') + ' ' + (Array.isArray(it.tags) ? it.tags.join(' ') : '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    if (!filtered.length) {
      els.grid.appendChild(h('div', { style: 'grid-column:1/-1;padding:22px 8px;text-align:center;color:var(--pp-muted);font-size:11.5px;', text: tr('emptyLib') }));
      return;
    }

    filtered.slice(0, 90).forEach(function (it) {
      var isCur = store.skinEnabled && activeId && it.id === activeId;
      var isFav = favs.indexOf(it.id) >= 0;
      var thumb = h('div', { class: 'pp-thumb' }, [h('span', { text: String(it.kind || 'IMG').toUpperCase() })]);
      if (it.thumbUrl) {
        thumb.appendChild(h('img', { src: it.thumbUrl, loading: 'lazy', alt: '' }));
      }
      if (isCur) thumb.appendChild(h('span', { class: 'pp-cur', html: ICONS.check }));
      var favBtn = h('button', {
        type: 'button',
        class: 'pp-fav',
        'data-on': isFav ? 'true' : 'false',
        text: '★',
        onclick: function (e) {
          e.stopPropagation();
          var curFavs = Array.isArray(store.config.favorites) ? store.config.favorites.slice() : [];
          var idx = curFavs.indexOf(it.id);
          if (idx >= 0) curFavs.splice(idx, 1);
          else curFavs.push(it.id);
          pushConfigPatch({ favorites: curFavs }, true);
        },
      });
      thumb.appendChild(favBtn);

      var card = h(
        'div',
        {
          class: 'pp-card',
          role: 'button',
          tabindex: '0',
          'aria-current': isCur ? 'true' : 'false',
          onclick: function () {
            store.skinEnabled = true;
            store.activeItem = it;
            if (W[SKIN_KEY] && typeof W[SKIN_KEY].applyPayload === 'function') {
              W[SKIN_KEY].applyPayload({ skinEnabled: true, config: store.config, activeItem: it });
            }
            renderAll();
            callRpc('wallpaper.apply', { wallpaperId: it.id }).then(function (r) {
              if (r) ingestState(r.state || r);
            });
          },
          onkeydown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              card.click();
            }
          },
        },
        [thumb, h('div', { class: 'pp-ctitle', text: it.title || it.id })]
      );
      els.grid.appendChild(card);
    });
  }

  function renderAll() {
    if (!els.root) return;
    var lang = getLang();
    renderConnectionState();

    // Header tooltips & state
    els.prevBtn.title = tr('prev');
    els.playBtn.title = cfgVal('paused') ? tr('play') : tr('pause');
    els.playBtn.innerHTML = cfgVal('paused') ? ICONS.play : ICONS.pause;
    els.nextBtn.title = tr('next');
    els.muteBtn.title = tr('mute');
    els.muteBtn.innerHTML = cfgVal('muted') ? ICONS.volOff : ICONS.volOn;
    els.langBtn.textContent = lang === 'zh' ? 'EN' : '中';
    els.studioBtn.title = tr('openStudio');
    els.closeBtn.title = tr('close');

    // Topdeck
    var curPreset = String(cfgVal('preset') || 'custom');
    for (var pid in els.presetBtns) {
      els.presetBtns[pid].textContent = tr('preset_' + pid);
      els.presetBtns[pid].setAttribute('aria-pressed', curPreset === pid ? 'true' : 'false');
    }
    var lMode = cfgVal('layoutMode') === 'flush' ? 'flush' : 'islands';
    els.flushBtn.textContent = tr('flush');
    els.flushBtn.setAttribute('aria-checked', lMode === 'flush' ? 'true' : 'false');
    els.islandsBtn.textContent = tr('islands');
    els.islandsBtn.setAttribute('aria-checked', lMode === 'islands' ? 'true' : 'false');

    // Tabs
    ['library', 'optics', 'status'].forEach(function (tid) {
      els.tabBtns[tid].textContent = tr('tab_' + tid);
      els.tabBtns[tid].setAttribute('aria-selected', ui.tab === tid ? 'true' : 'false');
    });
    els.paneLibrary.hidden = ui.tab !== 'library';
    els.paneOptics.hidden = ui.tab !== 'optics';
    els.paneStatus.hidden = ui.tab !== 'status';

    // Drilldown
    els.drillPanel.hidden = !ui.drilldown;
    els.drillTitle.textContent = tr('drillTitle');
    els.drillDoneBtn.textContent = tr('drillDone');
    els.rotLabel.textContent = tr('rotateLabel');
    els.rotSwitch.setAttribute('aria-checked', cfgVal('rotationEnabled') ? 'true' : 'false');

    // Library controls
    els.searchInp.placeholder = tr('searchPh');
    els.drillOpenBtn.textContent = tr('drillBtn');
    ['all', 'image', 'video', 'web', 'scene'].forEach(function (k) {
      var raw = k === 'all' ? '' : k;
      els.kindChips[k].textContent = tr('kind_' + k);
      els.kindChips[k].setAttribute('aria-pressed', ui.kindFilter === raw ? 'true' : 'false');
    });
    els.favChip.setAttribute('aria-pressed', ui.favOnly ? 'true' : 'false');
    if (ui.tab === 'library') renderLibraryGrid();

    // Optics controls
    els.schemeTitle.textContent = tr('schemeLabel');
    var curScheme = String(cfgVal('colorScheme') || 'prism-default');
    for (var sid in els.swatchBtns) {
      var sw = els.swatchBtns[sid];
      sw.label.textContent = lang === 'zh' ? sw.meta.zh : sw.meta.en;
      sw.btn.setAttribute('aria-checked', curScheme === sid ? 'true' : 'false');
    }

    els.accentTitle.textContent = tr('accentLabel');
    var curAcc = String(cfgVal('accentMode') || 'dynamic');
    for (var aid in els.accentBtns) {
      var ab = els.accentBtns[aid];
      ab.btn.textContent = lang === 'zh' ? ab.meta.zh : ab.meta.en;
      ab.btn.setAttribute('aria-pressed', curAcc === aid ? 'true' : 'false');
    }
    if (cfgVal('customAccent') && /^#[0-9a-f]{6}$/i.test(cfgVal('customAccent'))) {
      els.customColorInp.value = cfgVal('customAccent');
    }

    for (var sk in sliderRefs) {
      var sr = sliderRefs[sk];
      var val = Number(cfgVal(sk));
      if (!Number.isFinite(val)) val = DEFAULTS[sk];
      var pct = ((clamp(val, sr.min, sr.max) - sr.min) / (sr.max - sr.min)) * 100;
      sr.label.textContent = tr('s_' + sk);
      sr.val.textContent = sr.fmt(val);
      sr.rst.title = tr('resetTip');
      sr.range.value = String(val);
      sr.range.style.setProperty('--pct', pct.toFixed(1) + '%');
      var dirty = Math.abs(val - DEFAULTS[sk]) > (sr.max <= 1 ? 0.004 : 0.4);
      sr.row.setAttribute('data-dirty', dirty ? 'true' : 'false');
    }

    els.swGlassLbl.textContent = tr('sw_glass');
    els.swGlass.setAttribute('aria-checked', cfgVal('glassSurfaces') ? 'true' : 'false');
    els.swVigLbl.textContent = tr('sw_vignette');
    els.swVig.setAttribute('aria-checked', cfgVal('vignette') ? 'true' : 'false');
    els.swBlurLbl.textContent = tr('sw_pauseBlur');
    els.swBlur.setAttribute('aria-checked', cfgVal('pauseOnBlur') ? 'true' : 'false');
    els.codeLbl.textContent = tr('codeLabel');
    var curCode = String(cfgVal('codeReadabilityMode') || 'translucent');
    if (curCode === 'native') curCode = 'solid';
    ['translucent', 'frosted', 'solid'].forEach(function (cm) {
      els.codeBtns[cm].textContent = tr('code_' + cm);
      els.codeBtns[cm].setAttribute('aria-checked', curCode === cm ? 'true' : 'false');
    });

    // Status KV
    while (els.kvList.firstChild) els.kvList.removeChild(els.kvList.firstChild);
    var activeName = (store.activeItem && (store.activeItem.title || store.activeItem.id)) || tr('st_none');
    var rows = [
      [tr('st_skin'), store.skinEnabled ? tr('st_skinOn') : tr('st_skinOff')],
      [tr('st_active'), activeName],
      [tr('st_theme'), store.theme + ' · ' + curScheme],
      [tr('st_rpc'), hasBinding() ? '__agyPrismCall (OK)' : 'Standby'],
    ];
    rows.forEach(function (pair) {
      els.kvList.appendChild(h('dt', { text: pair[0] }));
      els.kvList.appendChild(h('dd', { text: pair[1] }));
    });
    els.refreshBtn.textContent = tr('btnRefresh');
    els.resetSkinBtn.textContent = tr('btnResetSkin');
    if (!store.skinEnabled) {
      els.restoreBtn.setAttribute('data-armed', 'false');
      els.restoreBtn.textContent = tr('btnReapply');
    } else if (!restoreArmed) {
      els.restoreBtn.setAttribute('data-armed', 'false');
      els.restoreBtn.textContent = tr('btnRestore');
    }

    els.footTitle.textContent = store.skinEnabled ? activeName : tr('st_skinOff');
  }

  function refreshLibrary() {
    return callRpc('library.list', {}).then(function (res) {
      if (res && Array.isArray(res.items)) {
        store.items = res.items;
        renderAll();
      }
    });
  }

  function refreshAllFromHost() {
    callRpc('state.get', {}).then(function (res) {
      if (res) ingestState(res.state || res);
    });
    refreshLibrary();
  }

  // ---------------------------------------------------------------------------
  // Open / Close / Drilldown & Two-Stage Escape Unwind
  // ---------------------------------------------------------------------------
  function openDrilldown() {
    ui.drilldown = true;
    renderAll();
    return status();
  }

  function closeDrilldown() {
    ui.drilldown = false;
    renderAll();
    return status();
  }

  function open() {
    if (destroyed) return status();
    if (!mounted) {
      ui.open = true;
      return status();
    }
    if (!ui.open) {
      var ae = doc.activeElement;
      lastFocus = ae && els.root && !els.root.contains(ae) ? ae : null;
    }
    ui.open = true;
    els.root.setAttribute('data-open', 'true');
    els.root.setAttribute('data-browser-occluder', 'true');
    if (els.sheet) els.sheet.setAttribute('data-browser-occluder', 'true');
    els.orb.setAttribute('aria-expanded', 'true');
    syncHostTheme();
    positionTriggersAndSheet();
    refreshAllFromHost();
    renderAll();
    try {
      els.sheet.focus({ preventScroll: true });
    } catch (_) {}
    return status();
  }

  function close() {
    if (!mounted) {
      ui.open = false;
      return status();
    }
    disarmRestore();
    ui.drilldown = false;
    ui.open = false;
    els.root.setAttribute('data-open', 'false');
    els.root.removeAttribute('data-browser-occluder');
    if (els.sheet) els.sheet.removeAttribute('data-browser-occluder');
    els.orb.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') {
      try {
        lastFocus.focus({ preventScroll: true });
      } catch (_) {}
    }
    lastFocus = null;
    renderAll();
    return status();
  }

  function toggle() {
    return ui.open ? close() : open();
  }

  function handleWindowKeyDown(e) {
    if (destroyed || !e) return;
    var key = String(e.key || '');
    // Global Ctrl+Alt+W / Cmd+Alt+W shortcut across page, inputs, and terminal
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && key.toLowerCase() === 'w') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
      return;
    }

    if (key === 'Escape' && ui.open) {
      // Yield if a host modal dialog or context menu is open above our popover
      var inside = els.root && els.root.contains(e.target);
      if (!inside && doc.querySelector('[role="dialog"][aria-modal="true"]:not(.prism-sheet), [role="menu"], .quick-input-widget:not([style*="display: none"])')) {
        return;
      }
      // Stage 1 of Two-Stage Escape Unwind: close inner drilldown or disarm inline confirmation first!
      if (ui.drilldown) {
        e.preventDefault();
        e.stopPropagation();
        closeDrilldown();
        return;
      }
      if (restoreArmed) {
        e.preventDefault();
        e.stopPropagation();
        disarmRestore();
        return;
      }
      if (ui.query && doc.activeElement === els.searchInp) {
        e.preventDefault();
        e.stopPropagation();
        ui.query = '';
        els.searchInp.value = '';
        renderLibraryGrid();
        return;
      }
      // Stage 2: close parent Quick Prism Popover
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // ---------------------------------------------------------------------------
  // Mount, Self-Heal & Teardown
  // ---------------------------------------------------------------------------
  function ensureStyles() {
    var s = doc.getElementById(STYLE_ID);
    if (!s) {
      s = doc.createElement('style');
      s.id = STYLE_ID;
      s.textContent = PANEL_CSS;
      (doc.head || doc.documentElement).appendChild(s);
    }
  }

  function heal() {
    if (destroyed || !doc.body) return status();
    ensureStyles();
    if (els.root && !els.root.isConnected) doc.body.appendChild(els.root);
    syncHostTheme();
    positionTriggersAndSheet();
    return status();
  }

  function mount() {
    if (mounted || destroyed || !doc.body) return;
    ensureStyles();
    buildDom();
    doc.body.appendChild(els.root);
    doc.documentElement.setAttribute(HTML_ATTR, VERSION);
    mounted = true;

    syncHostTheme();
    positionTriggersAndSheet();
    renderAll();

    listen(W, 'keydown', handleWindowKeyDown, true);
    listen(W, 'resize', positionTriggersAndSheet);

    if (W.MutationObserver) {
      domObserver = new MutationObserver(function () {
        if (destroyed) return;
        if (!els.root.isConnected || !doc.getElementById(STYLE_ID)) heal();
      });
      try {
        domObserver.observe(doc.body, { childList: true });
      } catch (_) {}

      themeObserver = new MutationObserver(function () {
        if (!destroyed) syncHostTheme();
      });
      try {
        themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-prism-theme'] });
        themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      } catch (_) {}
    }

    housekeepTimer = setInterval(function () {
      if (destroyed) return;
      var mode = String(cfgVal('triggerMode') || 'both');
      var wantPill = mode === 'pill' || mode === 'both';
      if (!els.root.isConnected || !doc.getElementById(STYLE_ID) || (wantPill && !doc.getElementById(PILL_ID))) {
        heal();
      }
    }, 2500);

    if (W.__AGY_PRISM_PANEL_BOOT__) {
      ingestState(W.__AGY_PRISM_PANEL_BOOT__);
    } else if (hasBinding()) {
      refreshAllFromHost();
    }

    if (ui.open) {
      ui.open = false;
      open();
    }
  }

  function snapshot() {
    return { ui: ui, store: store };
  }

  function status() {
    return {
      installed: !destroyed,
      version: VERSION,
      mounted: mounted,
      open: ui.open,
      drilldown: ui.drilldown,
      restoreArmed: restoreArmed,
      tab: ui.tab,
      theme: store.theme,
      connected: hasBinding() || store.connected,
      pillPresent: Boolean(doc.getElementById(PILL_ID)),
    };
  }

  function destroy() {
    if (destroyed) return { installed: false };
    destroyed = true;
    clearTimeout(restoreTimer);
    clearTimeout(patchTimer);
    clearTimeout(searchTimer);
    clearTimeout(toastTimer);
    clearInterval(housekeepTimer);
    try {
      if (domObserver) domObserver.disconnect();
      if (themeObserver) themeObserver.disconnect();
    } catch (_) {}
    cleanups.forEach(function (fn) {
      try {
        fn();
      } catch (_) {}
    });
    cleanups = [];

    var r = doc.getElementById(ROOT_ID);
    if (r && r.parentNode) r.parentNode.removeChild(r);
    var s = doc.getElementById(STYLE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
    var pill = doc.getElementById(PILL_ID);
    if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
    var ps = doc.getElementById(PILL_STYLE_ID);
    if (ps && ps.parentNode) ps.parentNode.removeChild(ps);
    if (doc.documentElement) doc.documentElement.removeAttribute(HTML_ATTR);

    if (W[API_KEY] === api) {
      try {
        delete W[API_KEY];
      } catch (_) {
        W[API_KEY] = undefined;
      }
    }
    mounted = false;
    return { installed: false };
  }

  var api = {
    version: VERSION,
    syncState: syncState,
    receive: receive,
    toggle: toggle,
    open: open,
    close: close,
    openDrilldown: openDrilldown,
    closeDrilldown: closeDrilldown,
    heal: heal,
    snapshot: snapshot,
    status: status,
    destroy: destroy,
    alive: function () {
      return !destroyed;
    },
  };

  W[API_KEY] = api;

  if (doc.body) {
    mount();
  } else {
    doc.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  return status();
})();
