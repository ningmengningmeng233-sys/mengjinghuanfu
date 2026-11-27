(function bootDreamSkinPrismStudio() {
  'use strict';

  var SCENE_CARDS = [
    { id: 'crystal', icon: '✦', name: '水晶超清', desc: '超清透亮，壁纸锐利', patch: { preset: 'crystal', layoutMode: 'islands', glassOpacity: 0.30, scrimOpacity: 0.04, glassBlur: 0, mediaBlur: 0, glassSurfaces: true, paused: false } },
    { id: 'islands', icon: '◈', name: '日常平衡', desc: '壁纸清晰又护眼', patch: { preset: 'islands', layoutMode: 'islands', glassOpacity: 0.56, scrimOpacity: 0.14, glassBlur: 8, mediaBlur: 0, glassSurfaces: true, paused: false } },
    { id: 'focus', icon: '◐', name: '专注护眼', desc: '柔焦压暗，看字轻松', patch: { preset: 'focus', layoutMode: 'flush', glassOpacity: 0.76, scrimOpacity: 0.34, glassBlur: 18, mediaBlur: 4, glassSurfaces: true, paused: false } },
    { id: 'eco', icon: '🍃', name: '省电静音', desc: '极简定格，几乎不耗电', patch: { preset: 'eco', layoutMode: 'flush', glassOpacity: 0.88, scrimOpacity: 0.26, glassBlur: 0, mediaBlur: 0, glassSurfaces: false, paused: true } },
  ];

  var SCHEMES = [
    { id: 'prism-default', name: '深空黑曜', dot: '#68A4FF', accent2: '#A78BFA', panelBg: '16, 20, 34' },
    { id: 'warm-carbon', name: '暖炭玄岩', dot: '#E07B59', accent2: '#F2B84B', panelBg: '28, 22, 20' },
    { id: 'catppuccin', name: '猫布奇诺', dot: '#CBA6F7', accent2: '#F5C2E7', panelBg: '26, 24, 38' },
    { id: 'nord', name: '极地冰川', dot: '#88C0D0', accent2: '#81A1C1', panelBg: '24, 31, 42' },
    { id: 'rose-pine', name: '松间玫瑰', dot: '#EBBCBA', accent2: '#C4A7E7', panelBg: '29, 25, 40' },
    { id: 'tokyo-night', name: '东京夜色', dot: '#7AA2F7', accent2: '#BB9AF7', panelBg: '20, 22, 36' },
    { id: 'gruvbox', name: '复古暖砂', dot: '#FABD2F', accent2: '#FE8019', panelBg: '34, 30, 26' },
    { id: 'host-native', name: '跟随原版', dot: '#3B82F6', accent2: '#60A5FA', panelBg: '18, 20, 28' },
  ];

  var FILTERS = [
    { id: 'none', name: '原画高清', css: '' },
    { id: 'vivid', name: '鲜明通透', css: 'saturate(1.26) contrast(1.06)' },
    { id: 'warm', name: '暖阳胶片', css: 'sepia(0.18) saturate(1.16) brightness(1.03)' },
    { id: 'cool', name: '极光冷调', css: 'hue-rotate(10deg) saturate(1.14) contrast(1.05)' },
    { id: 'contrast', name: '锐利高对比', css: 'contrast(1.16) saturate(1.12)' },
  ];

  var FALLBACK_ICON_DATA = {
    antigravity: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#101526" stroke="#6366F1" stroke-width="2.5"/><path d="M32 14L48 46H39.5L32 30.5L24.5 46H16L32 14Z" fill="#60A5FA"/><circle cx="32" cy="44" r="4.5" fill="#E0F2FE"/></svg>'),
    cherry: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#1E1017" stroke="#FB7185" stroke-width="2"/><path d="M23 36C25 24 33 17 44 15C38 22 36 29 38 38" stroke="#4ADE80" stroke-width="3" stroke-linecap="round"/><circle cx="23" cy="41" r="9" fill="#F43F5E"/><circle cx="40" cy="43" r="9" fill="#E11D48"/></svg>'),
    codex: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#0F171A" stroke="#34D399" stroke-width="2"/><circle cx="32" cy="32" r="14" stroke="#E2E8F0" stroke-width="3"/><path d="M25 28L30 32L25 36M33 36H40" stroke="#34D399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
    dsh: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#0E172A" stroke="#60A5FA" stroke-width="2"/><path d="M16 36C18 24 27 18 37 20C43 21 48 26 49 33C45 31 41 32 38 35C35 39 28 43 20 41C17 40 15.5 38.5 16 36Z" fill="#3B82F6"/></svg>'),
    'minimax-code': 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#1C131C" stroke="#FB923C" stroke-width="2"/><path d="M16 42V22L27 34L37 22V42M43 25L49 32L43 39" stroke="#FB923C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
    zcode: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#131126" stroke="#A78BFA" stroke-width="2"/><path d="M19 20H45L20 44H45" stroke="#A78BFA" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
    kiro: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#18122B" stroke="#C084FC" stroke-width="2"/><path d="M20 46V29C20 21 25.5 16 32 16C38.5 16 44 21 44 29V46L38 41.5L32 46L26 41.5L20 46Z" fill="#C084FC"/></svg>'),
    windsurf: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#0D1E22" stroke="#2DD4BF" stroke-width="2"/><path d="M17 42C22 28 31 20 46 18C41 28 37 35 39 44C32 41 25 40 17 42Z" fill="#2DD4BF"/></svg>'),
    'minimax-design': 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#1A1224" stroke="#F472B6" stroke-width="2"/><circle cx="28" cy="30" r="10" fill="#F472B6"/><circle cx="38" cy="36" r="9" fill="#60A5FA" fill-opacity=".8"/></svg>'),
    qoder: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#101828" stroke="#38BDF8" stroke-width="2"/><circle cx="31" cy="31" r="12" stroke="#38BDF8" stroke-width="4"/><path d="M39 39L47 47" stroke="#818CF8" stroke-width="4.5" stroke-linecap="round"/></svg>'),
    opencode: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#0F172A" stroke="#22D3EE" stroke-width="2"/><path d="M24 22L15 32L24 42M40 22L49 32L40 42M35 18L29 46" stroke="#22D3EE" stroke-width="3.5" stroke-linecap="round"/></svg>'),
    workbuddy: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#0E1D1A" stroke="#34D399" stroke-width="2"/><path d="M16 22L23 42L32 26L41 42L48 22" stroke="#34D399" stroke-width="4" stroke-linecap="round"/></svg>'),
    t3code: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#171226" stroke="#A78BFA" stroke-width="2"/><path d="M16 22H34M25 22V44M37 22H48L41 32H47" stroke="#A78BFA" stroke-width="3.8" stroke-linecap="round"/></svg>'),
    vscode: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="15" fill="#0C192C" stroke="#3B82F6" stroke-width="2"/><path d="M44 16L22 36L16 32L44 48V16Z" fill="#3B82F6"/></svg>'),
  };

  var SKIN_MODE_CARDS = [
    { id: 'optical', badge: '◆', name: '纯黑曜光学', desc: '深浅光学配色 + 切面边框 + 弹簧动效 + 像素伙伴（无壁纸/玻璃冲突）' },
    { id: 'wallpaper', badge: '✦', name: '纯梦境壁纸', desc: '动静态壁纸 + 液态玻璃 + 浮岛透光（无光学边框与伙伴遮挡）' },
    { id: 'hybrid', badge: '❖', name: '自由混搭', desc: '按下方模块开关任意拼装，冲突项自动安全禁配' },
  ];

  var MODULE_LABELS = [
    { key: 'wallpaperLayer', name: '动态/静态壁纸' },
    { key: 'glassLayer', name: '液态玻璃透光' },
    { key: 'opticalPalette', name: '黑曜光学配色' },
    { key: 'opticalFacet', name: '300Hz 棱镜光带' },
    { key: 'rippleField', name: '地平线波纹光场' },
    { key: 'microMotion', name: '4档弹簧与光标' },
    { key: 'pixelCompanion', name: '像素桌宠叠叠乐' },
  ];

  var COMPANION_OPTIONS = [
    { id: 'crab', name: '双宠经典 (Clawd + 小紫猫)' },
    { id: 'quad', name: '四宠同台 (+银白龙 / Deepy)' },
    { id: 'all', name: '六宠派对 (+小赤狐 / 小熊猫)' },
    { id: 'all-minis', name: '全员叠叠乐 (6主宠 + 3迷你蟹)' },
    { id: 'fox', name: '小赤狐 + 小紫猫' },
    { id: 'panda', name: '团子小熊猫 + 小紫猫' },
    { id: 'whale', name: 'Deepy 蓝鲸 + 小紫猫' },
    { id: 'neko', name: '单宠小紫猫' },
  ];

  var RIM_TONE_OPTIONS = [
    { id: 'follow', name: '随配色光谱' },
    { id: 'cobalt', name: '极光钴蓝' },
    { id: 'iris', name: '鸢尾紫光' },
    { id: 'amber', name: '琥珀暖金' },
    { id: 'mono', name: '极简银辉' },
  ];

  var VIVID_OPTIONS = [
    { id: 'soft', name: '柔和' },
    { id: 'balanced', name: '平衡' },
    { id: 'vivid', name: '鲜艳' },
  ];

  var HABITAT_OPTIONS = [
    { id: 'auto', name: '自动' },
    { id: 'cactus', name: '仙人掌' },
    { id: 'lamp', name: '深夜台灯' },
    { id: 'hourglass', name: '专注沙漏' },
  ];

  var BUILTIN_DYN = Array.isArray(window.__PRISM_DYNAMIC_THEMES__) ? window.__PRISM_DYNAMIC_THEMES__ : [];

  var state = {
    version: '4.1.0',
    activeTab: 'home', // 'home' | 'apps'
    studioMode: 'prism', // 'prism' | 'dynamic' | 'classic'
    selectedAppId: 'antigravity',
    libSource: 'all', // 'all' | 'workshop' | 'local'
    searchQuery: '',
    importUrlText: '',
    previewDynamicId: '', // live-previewing a built-in interactive dynamic theme
    apps: [],
    v4Store: { version: 4, global: {}, apps: {} },
    items: [],
    dynamicThemes: BUILTIN_DYN,
    excludedHostFeatures: [],
    dshPluginStatus: null,
    galleryItems: [],
    galleryLoading: false,
    galleryError: '',
    shortcutInfo: null,
    toast: '',
    toastTimer: 0,
    advOpen: false,
    showHelp: false,
    showUninstalled: true,
    showTakeoverSteps: false,
    draggingOver: false,
  };

  function apiFetch(url, init) {
    if (window.sidecar && typeof window.sidecar.fetch === 'function') {
      return window.sidecar.fetch(url, init);
    }
    var opts = Object.assign({}, init || {});
    var headers = new Headers(opts.headers || {});
    try {
      var tok = new URLSearchParams(window.location.search).get('token') || (window.__SIDECAR_BOOT__ && window.__SIDECAR_BOOT__.token) || '';
      if (tok && !headers.has('X-Sidecar-Token')) headers.set('X-Sidecar-Token', tok);
    } catch (_) {}
    opts.headers = headers;
    return window.fetch(url, opts);
  }

  function apiJson(url, opts) {
    var init = Object.assign({}, opts || {});
    if (init.body && typeof init.body === 'object' && !(init.body instanceof ArrayBuffer) && !(init.body instanceof Blob)) {
      var h = new Headers(init.headers || {});
      if (!h.has('Content-Type')) h.set('Content-Type', 'application/json');
      init.headers = h;
      init.body = JSON.stringify(init.body);
    }
    return apiFetch(url, init).then(function (r) {
      return r.text().then(function (txt) {
        var data = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch (_) {}
        if (!r.ok) {
          var err = new Error(data.error || ('请求失败 ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function showToast(msg) {
    state.toast = String(msg || '');
    clearTimeout(state.toastTimer);
    renderToastOnly();
    state.toastTimer = setTimeout(function () {
      state.toast = '';
      renderToastOnly();
    }, 3400);
  }

  function renderToastOnly() {
    var old = document.getElementById('ds-toast');
    if (!state.toast) {
      if (old) old.remove();
      return;
    }
    if (!old) {
      old = document.createElement('div');
      old.id = 'ds-toast';
      old.className = 'ds-toast';
      document.body.appendChild(old);
    }
    old.textContent = state.toast;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function appIconHtml(appId, imgClass) {
    var cls = imgClass || 'ds-app-icon-img';
    var fb = FALLBACK_ICON_DATA[appId] || FALLBACK_ICON_DATA.antigravity;
    return '<img class="' + cls + '" src="/api/apps/' + encodeURIComponent(appId) + '/icon" data-fallback-src="' + esc(fb) + '" alt="" />';
  }

  function currentApp() {
    return state.apps.find(function (a) { return a.id === state.selectedAppId; }) || state.apps[0] || { id: 'antigravity', name: 'Antigravity (反重力)', channel: 'exe', pluginConflicts: [], skinEnabled: true };
  }

  function currentConfig() {
    var g = (state.v4Store && state.v4Store.global) || {};
    var appEntry = (state.v4Store && state.v4Store.apps && state.v4Store.apps[state.selectedAppId]) || null;
    if (appEntry && !appEntry.inheritGlobal && appEntry.overrides) {
      return Object.assign({}, g, appEntry.overrides, { skinEnabled: appEntry.skinEnabled !== false });
    }
    return Object.assign({}, g, { skinEnabled: appEntry ? appEntry.skinEnabled !== false : true });
  }

  function activeWallpaperOf(cfg) {
    var wid = cfg && cfg.activeWallpaperId;
    if (wid) {
      var found = (state.items || []).find(function (it) { return it.id === wid; });
      if (found) return found;
    }
    return (state.items && state.items[0]) || null;
  }

  function findDynamicTheme(id) {
    return (BUILTIN_DYN || []).find(function (t) { return t.id === id; }) || null;
  }

  function matchedDynamicForItem(item) {
    if (!item) return null;
    return (BUILTIN_DYN || []).find(function (t) { return item.title === t.title; }) || null;
  }

  function schemeInfoOf(id) {
    return SCHEMES.find(function (s) { return s.id === id; }) || SCHEMES[0];
  }

  function filterCssOf(id) {
    var f = FILTERS.find(function (x) { return x.id === id; });
    return f ? f.css : '';
  }

  function applyAmbientAccent(cfg) {
    var s = schemeInfoOf(cfg && cfg.colorScheme);
    document.documentElement.style.setProperty('--accent', s.dot);
    document.documentElement.style.setProperty('--accent-2', s.accent2);
    if (cfg && cfg.themeMode === 'light') {
      document.documentElement.setAttribute('data-prism-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-prism-theme', 'dark');
    }
  }

  function hasPluginConflict(app) {
    return Boolean(app && app.pluginConflicts && app.pluginConflicts.length > 0);
  }

  function isPeacefulYield(app, cfg) {
    return hasPluginConflict(app) && cfg && cfg.skinEnabled === false;
  }

  function dotClass(app) {
    var appEntry = (state.v4Store && state.v4Store.apps && state.v4Store.apps[app.id]) || null;
    var enabled = appEntry ? appEntry.skinEnabled !== false : (app.skinEnabled !== false);
    if (hasPluginConflict(app) && !enabled) return 'yielded';
    if (app.canary && app.canary.state === 'tripped') return 'warn';
    if (hasPluginConflict(app) && enabled) return 'warn';
    if (app.attached || app.skinActive) return 'active';
    if (app.running) return 'running';
    return '';
  }

  function appStatusText(app) {
    var appEntry = (state.v4Store && state.v4Store.apps && state.v4Store.apps[app.id]) || null;
    var enabled = appEntry ? appEntry.skinEnabled !== false : (app.skinEnabled !== false);
    if (hasPluginConflict(app) && !enabled) return '已交给 ' + app.pluginConflicts[0].name;
    if (!enabled) return '已暂停';
    if (app.canary && app.canary.state === 'tripped') return '保护暂停';
    if (app.attached || app.skinActive) return '生效中';
    if (hasPluginConflict(app)) return '检测到插件共存';
    if (app.running) return '运行中';
    if (app.installed) return '未打开';
    return '未安装';
  }

  function statusPillClass(app) {
    var d = dotClass(app);
    if (d === 'active') return 'ok';
    if (d === 'warn') return 'warn';
    if (d === 'yielded') return 'yielded';
    return '';
  }

  function filteredLibrary() {
    var q = state.searchQuery.trim().toLowerCase();
    return (state.items || []).filter(function (it) {
      if (state.libSource === 'workshop' && it.source !== 'workshop') return false;
      if (state.libSource === 'local' && it.source === 'workshop') return false;
      if (q) {
        var hay = (String(it.title || '') + ' ' + String(it.id || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function loadState() {
    return apiJson('/api/state').then(function (data) {
      state.version = data.version || '4.1.0';
      state.apps = Array.isArray(data.apps) ? data.apps : [];
      state.v4Store = data.v4Store || state.v4Store;
      state.items = Array.isArray(data.items) ? data.items : [];
      if (Array.isArray(data.excludedHostFeatures)) state.excludedHostFeatures = data.excludedHostFeatures;
      if (Array.isArray(data.dynamicThemes) && data.dynamicThemes.length && !BUILTIN_DYN.length) {
        state.dynamicThemes = data.dynamicThemes;
      }
      if (state.apps.length && !state.apps.some(function (a) { return a.id === state.selectedAppId; })) {
        state.selectedAppId = state.apps[0].id;
      }
      var app = document.getElementById('app');
      if (app) app.setAttribute('data-prism-ready', 'true');
      render();
      loadShortcutStatus();
      loadDshPluginStatus();
    }).catch(function (err) {
      var app = document.getElementById('app');
      if (app) app.setAttribute('data-prism-ready', 'true');
      showToast('连接管家失败：' + (err && err.message ? err.message : err));
      render();
    });
  }

  function loadDshPluginStatus() {
    if (state.selectedAppId !== 'dsh') return;
    apiJson('/api/apps/dsh/plugin/status').then(function (st) {
      state.dshPluginStatus = st;
      if (state.selectedAppId === 'dsh') renderMainOnly({ preserveScroll: true });
    }).catch(function () {});
  }

  function resolveUiComposition(cfg) {
    var mode = (cfg && (cfg.skinMode === 'optical' || cfg.skinMode === 'hybrid')) ? cfg.skinMode : 'wallpaper';
    var raw = (cfg && cfg.modules) || {};
    var def = mode === 'optical'
      ? { wallpaperLayer: false, glassLayer: false, opticalPalette: true, opticalFacet: true, rippleField: true, microMotion: true, pixelCompanion: true }
      : mode === 'hybrid'
        ? { wallpaperLayer: true, glassLayer: true, opticalPalette: true, opticalFacet: true, rippleField: false, microMotion: true, pixelCompanion: true }
        : { wallpaperLayer: true, glassLayer: true, opticalPalette: true, opticalFacet: false, rippleField: false, microMotion: false, pixelCompanion: false };
    var eff = {
      wallpaperLayer: raw.wallpaperLayer != null ? Boolean(raw.wallpaperLayer) : def.wallpaperLayer,
      glassLayer: raw.glassLayer != null ? Boolean(raw.glassLayer) : def.glassLayer,
      opticalPalette: raw.opticalPalette != null ? Boolean(raw.opticalPalette) : def.opticalPalette,
      opticalFacet: raw.opticalFacet != null ? Boolean(raw.opticalFacet) : def.opticalFacet,
      rippleField: raw.rippleField != null ? Boolean(raw.rippleField) : def.rippleField,
      microMotion: raw.microMotion != null ? Boolean(raw.microMotion) : def.microMotion,
      pixelCompanion: raw.pixelCompanion != null ? Boolean(raw.pixelCompanion) : def.pixelCompanion,
    };
    var locked = {};
    var notes = [];
    if (mode === 'optical') {
      eff.wallpaperLayer = false; locked.wallpaperLayer = true;
      eff.glassLayer = false; locked.glassLayer = true;
      notes.push('纯黑曜光学模式自动关闭壁纸与液态玻璃，完整释放地平线光场与 300Hz 棱镜光带。');
    } else if (mode === 'wallpaper') {
      eff.opticalFacet = false; locked.opticalFacet = true;
      eff.rippleField = false; locked.rippleField = true;
      eff.microMotion = false; locked.microMotion = true;
      eff.pixelCompanion = false; locked.pixelCompanion = true;
      notes.push('纯梦境壁纸模式自动屏蔽棱镜光带、波纹光场与桌宠，保持纯净通透壁纸画面。');
    } else if (!eff.wallpaperLayer && eff.glassLayer) {
      eff.glassLayer = false; locked.glassLayer = true;
      notes.push('自由混搭中关闭背景壁纸时，液态玻璃无底图可透已自动关闭。');
    }
    return { skinMode: mode, effective: eff, locked: locked, notes: notes };
  }

  function renderThreeModePanel(app, cfg) {
    var comp = resolveUiComposition(cfg);
    var cardsHtml = SKIN_MODE_CARDS.map(function (m) {
      var act = comp.skinMode === m.id ? ' active' : '';
      return '<button class="ds-mode-card' + act + '" data-skin-mode="' + m.id + '">' +
        '<div class="ds-mode-card-head"><span>' + m.badge + ' ' + esc(m.name) + '</span>' + (act ? '<span class="ds-muted">使用中</span>' : '') + '</div>' +
        '<div class="ds-mode-card-desc">' + esc(m.desc) + '</div>' +
      '</button>';
    }).join('');

    var modsHtml = MODULE_LABELS.map(function (ml) {
      var isLocked = Boolean(comp.locked[ml.key]);
      var checked = Boolean(comp.effective[ml.key]);
      return '<div class="ds-mod-pill' + (isLocked ? ' locked' : '') + '">' +
        '<span>' + esc(ml.name) + (isLocked ? ' 🔒' : '') + '</span>' +
        '<label class="ds-switch"><input type="checkbox" data-module-toggle="' + ml.key + '"' + (checked ? ' checked' : '') + (isLocked ? ' disabled' : '') + ' /><span class="ds-switch-track"></span></label>' +
      '</div>';
    }).join('');

    var petBarHtml = '';
    if (comp.effective.pixelCompanion || comp.effective.opticalFacet || comp.effective.rippleField) {
      var curMascot = cfg.mascotSpec || 'crab';
      var curRim = cfg.rimTone || 'follow';
      var curVivid = cfg.vividness || 'balanced';
      var curHab = cfg.habitatMode || 'auto';
      var parts = [];
      if (comp.effective.pixelCompanion) {
        parts.push('<span class="ds-muted">桌宠阵容：</span>' + COMPANION_OPTIONS.map(function (o) {
          return '<button class="ds-chip' + (curMascot === o.id ? ' active' : '') + '" data-mascot-spec="' + o.id + '">' + esc(o.name) + '</button>';
        }).join(''));
        parts.push('<span class="ds-muted" style="margin-left:6px">角隅摆件：</span>' + HABITAT_OPTIONS.map(function (h) {
          return '<button class="ds-chip' + (curHab === h.id ? ' active' : '') + '" data-habitat-mode="' + h.id + '">' + esc(h.name) + '</button>';
        }).join(''));
      }
      if (comp.effective.opticalFacet) {
        parts.push('<span class="ds-muted" style="margin-left:6px">棱镜光带：</span>' + RIM_TONE_OPTIONS.map(function (r) {
          return '<button class="ds-chip' + (curRim === r.id ? ' active' : '') + '" data-rim-tone="' + r.id + '">' + esc(r.name) + '</button>';
        }).join(''));
      }
      if (comp.effective.rippleField) {
        parts.push('<span class="ds-muted" style="margin-left:6px">光场饱和：</span>' + VIVID_OPTIONS.map(function (v) {
          return '<button class="ds-chip' + (curVivid === v.id ? ' active' : '') + '" data-vividness="' + v.id + '">' + esc(v.name) + '</button>';
        }).join(''));
      }
      petBarHtml = '<div class="ds-toolbar" style="flex-wrap:wrap;gap:6px">' + parts.join('') + '</div>';
    }

    var notesHtml = comp.notes.length
      ? '<div class="ds-conflict-note">⚡ 冲突自动裁决：' + esc(comp.notes.join(' ')) + '</div>'
      : '';

    var dshBar = '';
    if (app && app.id === 'dsh') {
      var st = state.dshPluginStatus;
      var installed = Boolean(st && st.installed);
      var enabled = Boolean(st && st.enabled);
      dshBar = '<div class="ds-dsh-plugin-bar">' +
        '<div><b>🧩 DSH NEXT 原生双半体插件通道：</b>' +
          (installed ? (enabled ? '已安装并开启（免重启热生效，不改 app.asar）' : '已安装但已暂停') : '未安装（安装后可免 CDP 免重启热切换三模式）') +
        '</div>' +
        '<div class="ds-toolbar" style="gap:6px">' +
          (!installed
            ? '<button class="ds-btn sm primary" data-dsh-plugin-action="install">授权安装原生插件</button>'
            : '<button class="ds-btn sm ' + (enabled ? '' : 'primary') + '" data-dsh-plugin-action="toggle">' + (enabled ? '暂停插件通道' : '开启插件通道') + '</button>' +
              '<button class="ds-btn sm danger" data-dsh-plugin-action="uninstall">卸载插件</button>') +
        '</div>' +
      '</div>';
    }

    return dshBar +
      '<div class="ds-mode-panel">' +
        '<div class="ds-sec-title" style="margin-bottom:0"><span>三种皮肤模式（自由搭配 · 冲突项自动不做）</span><span class="ds-muted">v' + esc(state.version) + '</span></div>' +
        '<div class="ds-mode-grid">' + cardsHtml + '</div>' +
        '<div class="ds-modules-grid">' + modsHtml + '</div>' +
        petBarHtml +
        notesHtml +
      '</div>';
  }

  function loadShortcutStatus() {
    var app = currentApp();
    if (!app || app.channel === 'msix') {
      state.shortcutInfo = null;
      return;
    }
    var reqAppId = app.id;
    apiJson('/api/apps/' + encodeURIComponent(app.id) + '/shortcuts').then(function (info) {
      if (state.selectedAppId !== reqAppId) return;
      var prevEnabled = state.shortcutInfo && state.shortcutInfo.enabled;
      state.shortcutInfo = info;
      if (state.activeTab === 'apps' && prevEnabled !== (info && info.enabled)) {
        render({ preserveScroll: true });
      }
    }).catch(function () {});
  }

  function loadGallery() {
    state.galleryLoading = true;
    state.galleryError = '';
    render();
    var q = encodeURIComponent(state.searchQuery.trim());
    apiJson('/api/gallery?limit=18&q=' + q).then(function (data) {
      state.galleryLoading = false;
      state.galleryItems = Array.isArray(data.items) ? data.items : [];
      if (!data.ok && data.error) state.galleryError = data.error;
      render();
    }).catch(function (err) {
      state.galleryLoading = false;
      state.galleryError = err.message || '加载失败';
      render();
    });
  }

  function applyAppNow(appId, opts) {
    var force = Boolean(opts && opts.force);
    return apiJson('/api/apps/' + encodeURIComponent(appId) + '/apply', {
      method: 'POST',
      body: { force: force },
    }).then(function (r) {
      if (r && r.ok && !r.skipped) {
        showToast('已生效：' + currentApp().name);
      } else if (r && r.reason === 'plugin-conflict') {
        showToast('请在上方选择与 Obsidian Prism 共存或切换');
      } else if (r && r.reason === 'not-debuggable') {
        showToast('已保存！开启「原图标自动换肤」后重开该软件即可生效');
      } else if (r && r.message) {
        showToast(r.message);
      }
      return loadState();
    });
  }

  var OPTICAL_ONLY_KEYS = {
    preset: 1, glassOpacity: 1, glassBlur: 1, glassSurfaces: 1, scrimOpacity: 1,
    mediaBlur: 1, colorScheme: 1, filterPreset: 1, layoutMode: 1, themeMode: 1,
    codeReadabilityMode: 1, accentMode: 1, paused: 1,
  };

  function isOpticalOnlyPatch(patch) {
    if (!patch || typeof patch !== 'object') return false;
    var keys = Object.keys(patch);
    if (!keys.length) return false;
    for (var i = 0; i < keys.length; i++) {
      if (!OPTICAL_ONLY_KEYS[keys[i]]) return false;
    }
    return true;
  }

  function triggerPrismSweep(withMediaReveal) {
    var wrap = document.getElementById('ds-stage-wrap');
    var sweep = document.getElementById('ds-prism-sweep');
    if (sweep) {
      sweep.classList.remove('run');
      void sweep.offsetWidth;
      sweep.classList.add('run');
    }
    if (withMediaReveal && wrap) {
      wrap.classList.remove('ds-media-entering');
      void wrap.offsetWidth;
      wrap.classList.add('ds-media-entering');
    }
  }

  function triggerAppliedPulse() {
    var wrap = document.getElementById('ds-stage-wrap');
    if (!wrap) return;
    wrap.classList.remove('ds-applied-pulse');
    void wrap.offsetWidth;
    wrap.classList.add('ds-applied-pulse');
  }

  function applyOptimisticEntry(appId, patch) {
    if (!state.v4Store) state.v4Store = { version: 4, global: {}, apps: {} };
    if (!state.v4Store.apps) state.v4Store.apps = {};
    var prev = state.v4Store.apps[appId] || { inheritGlobal: false, skinEnabled: true, overrides: {} };
    var nextOverrides = Object.assign({}, prev.inheritGlobal ? (state.v4Store.global || {}) : (prev.overrides || {}), patch);
    var nextEnabled = patch.skinEnabled != null ? Boolean(patch.skinEnabled) : (prev.skinEnabled !== false);
    state.v4Store.apps[appId] = Object.assign({}, prev, {
      inheritGlobal: false,
      skinEnabled: nextEnabled,
      overrides: nextOverrides,
    });
  }

  function syncOpticalControlsInPlace(cfg) {
    applyAmbientAccent(cfg);
    var rawGlassOpacity = Number(cfg.glassOpacity != null ? cfg.glassOpacity : 0.56);
    var clarityPct = Math.max(4, Math.min(80, Math.round((1 - rawGlassOpacity) * 100)));
    var blurPx = cfg.glassSurfaces === false ? 0 : Math.max(0, Math.min(24, Math.round(Number(cfg.glassBlur != null ? cfg.glassBlur : 8))));
    var scrimPct = Math.max(0, Math.min(80, Math.round((Number(cfg.scrimOpacity != null ? cfg.scrimOpacity : 0.14)) * 100)));
    var isLight = cfg.themeMode === 'light';
    var isFlush = cfg.layoutMode === 'flush';

    updateLivePreviewDom(clarityPct, blurPx, scrimPct);

    // Update mock window layout/light classes & media filters smoothly in-place
    var wrap = document.getElementById('ds-stage-wrap');
    if (wrap) {
      var mockWin = wrap.querySelector('.ds-mock-window');
      if (mockWin) {
        mockWin.classList.toggle('flush', isFlush);
        mockWin.classList.toggle('light-preview', isLight);
      }
      var bgBlurPx = Number(cfg.mediaBlur || 0);
      var extraFilter = filterCssOf(cfg.filterPreset || 'none');
      var combined = [bgBlurPx > 0 ? ('blur(' + Math.round(bgBlurPx * 0.45) + 'px)') : '', extraFilter].filter(Boolean).join(' ');
      var mediaEl = wrap.querySelector('.ds-stage-bg, .ds-stage-video, .ds-stage-iframe');
      if (mediaEl) {
        mediaEl.style.filter = combined || 'none';
        mediaEl.style.transform = bgBlurPx > 0 ? 'scale(1.04)' : 'scale(1)';
      }
      var codeEl = wrap.querySelector('.ds-mock-code-card');
      if (codeEl) {
        var sch = schemeInfoOf(cfg.colorScheme);
        var baseRgb = isLight ? '248, 250, 255' : sch.panelBg;
        codeEl.style.background = cfg.codeReadabilityMode === 'solid'
          ? ('rgba(' + baseRgb + ', 0.96)')
          : cfg.codeReadabilityMode === 'frosted'
            ? ('rgba(' + baseRgb + ', 0.84)')
            : (isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.06)');
        codeEl.innerHTML = '<span class="ds-mock-code-kw">const</span> prism = { blur: <span class="ds-mock-code-kw">' + blurPx + 'px</span>, clarity: <span class="ds-mock-code-kw">"' + clarityPct + '%"</span> };';
      }
    }

    // Sync sliders & labels without rebuilding DOM
    var gEl = document.querySelector('input[data-slider="glassClarity"]');
    if (gEl) { gEl.value = String(clarityPct); gEl.style.setProperty('--pct', Math.round(((clarityPct - 4) / (80 - 4)) * 100) + '%'); }
    var bEl = document.querySelector('input[data-slider="glassBlur"]');
    if (bEl) { bEl.value = String(blurPx); bEl.style.setProperty('--pct', Math.round((blurPx / 24) * 100) + '%'); }
    var sEl = document.querySelector('input[data-slider="scrimOpacity"]');
    if (sEl) { sEl.value = String(scrimPct); sEl.style.setProperty('--pct', Math.round((scrimPct / 80) * 100) + '%'); }
    var v1 = document.getElementById('val-glass'); if (v1) v1.textContent = clarityPct + '%';
    var v2 = document.getElementById('val-blur'); if (v2) v2.textContent = blurPx + 'px';
    var v3 = document.getElementById('val-scrim'); if (v3) v3.textContent = scrimPct + '%';

    // Sync active highlights on presets, schemes, filters, layout & theme buttons
    document.querySelectorAll('[data-scene-preset]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-scene-preset') === (cfg.preset || 'islands'));
    });
    document.querySelectorAll('[data-scheme]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-scheme') === (cfg.colorScheme || 'prism-default'));
    });
    document.querySelectorAll('[data-filter-preset]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-filter-preset') === (cfg.filterPreset || 'none'));
    });
    document.querySelectorAll('[data-layout]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-layout') === (cfg.layoutMode || 'islands'));
    });
    document.querySelectorAll('[data-theme-mode]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-theme-mode') === (cfg.themeMode || 'dark'));
    });
    document.querySelectorAll('[data-code-mode]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-code-mode') === (cfg.codeReadabilityMode || 'frosted'));
    });
  }

  function patchCurrentAppConfig(patch, andApply) {
    var appId = state.selectedAppId;
    var opticalOnly = isOpticalOnlyPatch(patch);
    var isWallChange = Boolean(patch && (patch.activeWallpaperId || patch.wallpaperId));
    applyOptimisticEntry(appId, patch);

    if (opticalOnly && document.getElementById('ds-stage-wrap')) {
      syncOpticalControlsInPlace(currentConfig());
      if (patch.preset || patch.colorScheme || patch.themeMode || patch.layoutMode || patch.filterPreset) {
        triggerPrismSweep(false);
      }
    } else {
      renderMainOnly({ preserveScroll: true, mediaSweep: isWallChange });
    }

    return apiJson('/api/apps/' + encodeURIComponent(appId) + '/config', {
      method: 'POST',
      body: patch,
    }).then(function (res) {
      if (!state.v4Store.apps) state.v4Store.apps = {};
      if (res && res.entry) state.v4Store.apps[appId] = res.entry;
      if (opticalOnly && document.getElementById('ds-stage-wrap')) {
        syncOpticalControlsInPlace(currentConfig());
      }
      if (andApply) {
        return apiJson('/api/apps/' + encodeURIComponent(appId) + '/apply', { method: 'POST', body: {} }).then(function (r) {
          if (r && r.ok && !r.skipped) {
            triggerAppliedPulse();
            showToast('已生效 · ' + currentApp().name);
          } else if (r && r.reason === 'not-debuggable') {
            showToast('已保存（打开目标软件后自动生效）');
          } else if (r && r.message && r.reason !== 'plugin-conflict') {
            showToast(r.message);
          }
        });
      }
    }).catch(function (err) {
      showToast(err.message || '保存失败');
    });
  }

  function patchGlobalConfig(patch) {
    return apiJson('/api/config', { method: 'POST', body: patch }).then(function (res) {
      state.v4Store.global = res.global;
      showToast('已更新');
      render();
    }).catch(function (err) { showToast(err.message); });
  }

  function installAndApplyDynamicTheme(dynId) {
    var dyn = findDynamicTheme(dynId);
    state.previewDynamicId = dynId;
    renderMainOnly({ preserveScroll: true, mediaSweep: true });
    showToast('正在加载动态主题「' + (dyn ? dyn.title : dynId) + '」…');
    apiJson('/api/dynamic-themes/' + encodeURIComponent(dynId) + '/install', { method: 'POST', body: {} }).then(function (res) {
      var patch = { skinEnabled: true };
      if (res && res.item && res.item.id) {
        patch.activeWallpaperId = res.item.id;
        patch.wallpaperId = res.item.id;
      }
      if (res && res.theme && res.theme.recommendedScheme) {
        patch.colorScheme = res.theme.recommendedScheme;
      }
      return loadState().then(function () {
        return patchCurrentAppConfig(patch, true);
      });
    }).catch(function (err) {
      if (err && err.status === 404) {
        showToast('已为你开启实时动态预览！重开独立桌面软件或重启插件后即可一键应用到目标软件');
      } else {
        showToast(err.message || '加载动态主题失败');
      }
    });
  }

  function uploadLocalFile(f) {
    if (!f) return;
    if (/\.dsskin$/i.test(f.name)) {
      showToast('正在导入 ' + f.name + '…');
      f.text().then(function (txt) {
        return apiJson('/api/import/dsskin', { method: 'POST', body: { rawText: txt } });
      }).then(function (res) {
        showToast('已导入皮肤「' + (res.title || f.name) + '」');
        loadState();
      }).catch(function (err) { showToast(err.message || '导入失败'); });
      return;
    }
    showToast('正在导入 ' + f.name + '…');
    apiFetch('/api/library/upload?filename=' + encodeURIComponent(f.name), {
      method: 'POST',
      headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) },
      body: f,
    }).then(function (r) { return r.json(); }).then(function (res) {
      showToast(res.duplicate ? '已复用相同壁纸' : '壁纸已导入并选中');
      state.previewDynamicId = '';
      loadState().then(function () {
        if (res && res.item && res.item.id) {
          patchCurrentAppConfig({ activeWallpaperId: res.item.id, wallpaperId: res.item.id, skinEnabled: true }, true);
        }
      });
    }).catch(function (err) { showToast('导入失败：' + err.message); });
  }

  function updateLivePreviewDom(clarityPct, blurPx, scrimPct) {
    var bar = document.getElementById('ds-preview-bar');
    var pane = document.getElementById('ds-preview-pane');
    var side = document.getElementById('ds-preview-side');
    var scrim = document.getElementById('ds-preview-scrim');
    var badge = document.getElementById('ds-preview-mode-badge');
    var codeEl = document.getElementById('ds-preview-code');
    var cfg = currentConfig();
    var sch = schemeInfoOf(cfg.colorScheme);
    var isLight = cfg.themeMode === 'light';
    var baseRgb = isLight ? '248, 250, 255' : sch.panelBg;
    var opacity = Math.max(0.16, Math.min(0.96, (100 - clarityPct) / 100));
    var paneAlpha = Math.max(0.14, Math.min(0.88, opacity * 0.78));
    var sideAlpha = Math.max(0.18, Math.min(0.92, paneAlpha + 0.06));
    var barAlpha = Math.max(0.22, Math.min(0.94, paneAlpha + 0.10));
    var sAlpha = Math.max(0, Math.min(0.85, scrimPct / 100));
    var bf = blurPx > 0 ? ('blur(' + blurPx + 'px) saturate(1.32)') : 'none';
    var frostBorder = blurPx > 0
      ? (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.16)')
      : (isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(147, 197, 253, 0.24)');
    if (bar) {
      bar.style.background = 'rgba(' + baseRgb + ', ' + barAlpha.toFixed(2) + ')';
      bar.style.backdropFilter = bf;
      bar.style.webkitBackdropFilter = bf;
      bar.style.borderColor = frostBorder;
    }
    if (pane) {
      pane.style.background = 'rgba(' + baseRgb + ', ' + paneAlpha.toFixed(2) + ')';
      pane.style.backdropFilter = bf;
      pane.style.webkitBackdropFilter = bf;
      pane.style.borderColor = frostBorder;
    }
    if (side) {
      side.style.background = 'rgba(' + baseRgb + ', ' + sideAlpha.toFixed(2) + ')';
      side.style.backdropFilter = bf;
      side.style.webkitBackdropFilter = bf;
      side.style.borderColor = frostBorder;
    }
    if (scrim) scrim.style.background = isLight ? ('rgba(248, 250, 255, ' + (sAlpha * 0.65).toFixed(2) + ')') : ('rgba(6, 9, 18, ' + sAlpha.toFixed(2) + ')');
    if (badge) {
      badge.textContent = blurPx === 0 ? '0px 原画超清' : ('毛玻璃 ' + blurPx + 'px');
    }
    if (codeEl) {
      codeEl.innerHTML = '<span class="ds-mock-code-kw">const</span> prism = { blur: <span class="ds-mock-code-kw">' + blurPx + 'px</span>, clarity: <span class="ds-mock-code-kw">"' + clarityPct + '%"</span> };';
    }
  }

  function renderHelpPopover() {
    if (!state.showHelp) return '';
    return '<div class="ds-help-popover">' +
      '<div class="ds-help-head"><span>使用速查</span><button class="ds-btn sm ghost" data-action="toggle-guide">关闭</button></div>' +
      '<div>• <b>选软件 → 选壁纸或动态主题 → 点右上角「应用到软件」</b>即可生效。<br/>' +
      '• 觉得壁纸发糊？把 <b>「毛玻璃模糊」拉到 0</b> 或点 <b>「水晶超清」</b> 即可 100% 原画高清透出；按住预览右下角 <b>👀 看原图</b> 可随时对比。<br/>' +
      '• 快捷键：软件内按 <b>Ctrl+Alt+W</b> 快捷调节，连按 <b>4 下 Esc</b> 秒还原原貌。</div>' +
    '</div>';
  }

  function renderCompatCompactStrip(app, cfg) {
    if (!hasPluginConflict(app)) return '';
    var conflict = app.pluginConflicts[0];
    var peaceful = isPeacefulYield(app, cfg);

    if (peaceful) {
      return '<div class="ds-compact-bar peaceful">' +
        '<div class="ds-compact-bar-left"><span>🟣</span><span><b>已和平共存：</b>' + esc(app.name) + ' 交给 ' + esc(conflict.name) + '，其他软件由梦境换肤接管</span></div>' +
        '<div class="ds-toolbar" style="gap:6px">' +
          '<button class="ds-btn sm" data-action="toggle-takeover-steps">切回梦境接管</button>' +
          '<button class="ds-btn sm ghost" data-action="recheck-conflict" title="重新检测插件状态">🔄</button>' +
        '</div>' +
      '</div>' + (state.showTakeoverSteps ? renderTakeoverSteps(conflict) : '');
    }

    return '<div class="ds-compact-bar">' +
      '<div class="ds-compact-bar-left"><span>⚡</span><span>检测到 <b>' + esc(conflict.name) + '</b> 开启中，可一键选择共存或切换：</span></div>' +
      '<div class="ds-toolbar" style="gap:6px">' +
        '<button class="ds-btn sm success" data-action="yield-to-conflict">和平共存（只管其他软件）</button>' +
        '<button class="ds-btn sm primary" data-action="toggle-takeover-steps">由梦境接管</button>' +
        '<button class="ds-btn sm ghost" data-action="recheck-conflict" title="重新检测插件状态">🔄</button>' +
      '</div>' +
    '</div>' + (state.showTakeoverSteps ? renderTakeoverSteps(conflict) : '');
  }

  function renderTakeoverSteps(conflict) {
    return '<div class="ds-compat-steps-box">' +
      '① 在反重力「插件管理」里临时关闭 <b>' + esc(conflict.name) + '</b> → ② 点右侧 <b>重新检测</b> 后即可直接应用皮肤。' +
      '<div class="ds-toolbar" style="margin-top:8px">' +
        '<button class="ds-btn sm primary" data-action="recheck-conflict">我已关闭，重新检测</button>' +
        '<button class="ds-btn sm" data-action="force-takeover">仍要强行叠加上肤</button>' +
      '</div>' +
    '</div>';
  }

  function renderPreviewAndControls(app, cfg) {
    var activeItem = activeWallpaperOf(cfg);
    var previewDyn = state.previewDynamicId ? findDynamicTheme(state.previewDynamicId) : matchedDynamicForItem(activeItem);
    var isVideo = Boolean(!previewDyn && activeItem && activeItem.kind === 'video' && activeItem.mediaUrl);
    var isWebUrl = Boolean(!previewDyn && activeItem && activeItem.kind === 'web' && activeItem.webUrl);
    var previewImgUrl = activeItem ? (activeItem.kind === 'image' ? (activeItem.mediaUrl || activeItem.thumbUrl) : activeItem.thumbUrl) : '';
    var wallTitle = previewDyn ? previewDyn.title : (activeItem ? (activeItem.title || activeItem.id) : '默认极光画布');
    var wallKind = previewDyn ? '互动动态' : (activeItem ? (activeItem.kind === 'video' ? '视频' : activeItem.kind === 'scene' ? 'Steam场景' : activeItem.kind === 'web' ? '互动网页' : '高清壁纸') : '默认');

    var rawGlassOpacity = Number(cfg.glassOpacity != null ? cfg.glassOpacity : 0.56);
    var clarityPct = Math.max(4, Math.min(80, Math.round((1 - rawGlassOpacity) * 100)));
    var blurPx = cfg.glassSurfaces === false ? 0 : Math.max(0, Math.min(24, Math.round(Number(cfg.glassBlur != null ? cfg.glassBlur : 8))));
    var scrimPct = Math.max(0, Math.min(80, Math.round((Number(cfg.scrimOpacity != null ? cfg.scrimOpacity : 0.14)) * 100)));
    var sch = schemeInfoOf(cfg.colorScheme);
    var isLight = cfg.themeMode === 'light';
    var baseRgb = isLight ? '248, 250, 255' : sch.panelBg;
    var gAlpha = Math.max(0.16, Math.min(0.96, (100 - clarityPct) / 100));
    var paneAlpha = Math.max(0.14, Math.min(0.88, gAlpha * 0.78));
    var sideAlpha = Math.max(0.18, Math.min(0.92, paneAlpha + 0.06));
    var barAlpha = Math.max(0.22, Math.min(0.94, paneAlpha + 0.10));
    var sAlpha = Math.max(0, Math.min(0.82, scrimPct / 100));
    var bgBlurPx = Number(cfg.mediaBlur || 0);
    var isFlush = cfg.layoutMode === 'flush';

    var extraFilter = filterCssOf(cfg.filterPreset || 'none');
    var combinedFilter = [bgBlurPx > 0 ? ('blur(' + Math.round(bgBlurPx * 0.45) + 'px)') : '', extraFilter].filter(Boolean).join(' ');
    var mediaFilterStyle = (combinedFilter ? ('filter:' + combinedFilter + ';') : '') + (bgBlurPx > 0 ? 'transform:scale(1.04);' : '');

    var bgMediaHtml = '';
    if (previewDyn && previewDyn.html) {
      bgMediaHtml = '<iframe class="ds-stage-iframe" sandbox="allow-scripts" srcdoc="' + esc(previewDyn.html) + '" style="' + mediaFilterStyle + '"></iframe>';
    } else if (isWebUrl) {
      bgMediaHtml = '<iframe class="ds-stage-iframe" sandbox="allow-scripts allow-same-origin" src="' + esc(activeItem.webUrl) + '" style="' + mediaFilterStyle + '"></iframe>';
    } else if (isVideo) {
      bgMediaHtml = '<video class="ds-stage-video" src="' + esc(activeItem.mediaUrl) + '" style="' + mediaFilterStyle + '" ' + (cfg.paused ? '' : 'autoplay ') + 'loop muted playsinline></video>';
    } else {
      bgMediaHtml = '<div class="ds-stage-bg" style="' + (previewImgUrl ? ('background-image:url(\'' + esc(previewImgUrl).replace(/'/g, '%27') + '\');' + mediaFilterStyle) : mediaFilterStyle) + '"></div>';
    }

    var scrimBg = isLight
      ? 'rgba(248, 250, 255, ' + (sAlpha * 0.65).toFixed(2) + ')'
      : 'rgba(6, 9, 18, ' + sAlpha.toFixed(2) + ')';
    var blurCss = blurPx > 0
      ? ('backdrop-filter:blur(' + blurPx + 'px) saturate(1.32);-webkit-backdrop-filter:blur(' + blurPx + 'px) saturate(1.32);')
      : 'backdrop-filter:none;-webkit-backdrop-filter:none;';
    var barStyle = 'background:rgba(' + baseRgb + ', ' + barAlpha.toFixed(2) + ');' + blurCss;
    var sideStyle = 'background:rgba(' + baseRgb + ', ' + sideAlpha.toFixed(2) + ');' + blurCss;
    var paneStyle = 'background:rgba(' + baseRgb + ', ' + paneAlpha.toFixed(2) + ');' + blurCss;
    var codeBg = cfg.codeReadabilityMode === 'solid'
      ? ('rgba(' + baseRgb + ', 0.96)')
      : cfg.codeReadabilityMode === 'frosted'
        ? ('rgba(' + baseRgb + ', 0.84)')
        : (isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.06)');

    var scenesHtml = SCENE_CARDS.map(function (sc) {
      var active = (cfg.preset || 'islands') === sc.id ? ' active' : '';
      return '<button class="ds-scene-card' + active + '" data-scene-preset="' + sc.id + '">' +
        '<div class="ds-scene-top"><span class="ds-scene-name">' + esc(sc.name) + '</span><span class="ds-scene-ico">' + sc.icon + '</span></div>' +
        '<div class="ds-scene-desc">' + esc(sc.desc) + '</div>' +
      '</button>';
    }).join('');

    var schemesHtml = SCHEMES.map(function (s) {
      var act = (cfg.colorScheme || 'prism-default') === s.id ? ' active' : '';
      return '<button class="ds-scheme-dot-btn' + act + '" data-scheme="' + s.id + '"><span class="ds-swatch" style="background:' + s.dot + '"></span>' + esc(s.name) + '</button>';
    }).join('');

    var filtersHtml = FILTERS.map(function (f) {
      var act = (cfg.filterPreset || 'none') === f.id ? ' active' : '';
      return '<button class="ds-chip' + act + '" data-filter-preset="' + f.id + '">' + esc(f.name) + '</button>';
    }).join('');

    var claritySliderPct = Math.round(((clarityPct - 4) / (80 - 4)) * 100);
    var blurSliderPct = Math.round((blurPx / 24) * 100);
    var scrimSliderPct = Math.round((scrimPct / 80) * 100);

    var compPreview = resolveUiComposition(cfg);
    var opticalOnlyCls = !compPreview.effective.wallpaperLayer ? ' optical-only' : '';
    var petEmoji = cfg.companionStyle === 'neko' ? '🐱' : cfg.companionStyle === 'crabs' ? '🦞' : cfg.companionStyle === 'orb' ? '🔮' : '🦀';
    var petPreviewHtml = compPreview.effective.pixelCompanion ? '<div class="ds-preview-pet" title="像素伙伴预览">' + petEmoji + '</div>' : '';

    return '<div class="ds-hero-grid">' +
      '<div class="ds-stage-wrap' + opticalOnlyCls + '" id="ds-stage-wrap">' +
        bgMediaHtml +
        '<div class="ds-stage-scrim" id="ds-preview-scrim" style="background:' + scrimBg + '"></div>' +
        '<div class="ds-prism-sweep" id="ds-prism-sweep"></div>' +
        petPreviewHtml +
        '<div class="ds-mock-window' + (isFlush ? ' flush' : '') + (isLight ? ' light-preview' : '') + '">' +
          '<div class="ds-mock-bar" id="ds-preview-bar" style="' + barStyle + '">' +
            '<div class="ds-mock-dots"><i></i><i></i><i></i></div>' +
            '<span>' + esc(app.name) + ' · 效果预览</span>' +
            '<span id="ds-preview-mode-badge" style="opacity:0.78">' + (blurPx === 0 ? '0px 原画超清' : ('毛玻璃 ' + blurPx + 'px')) + '</span>' +
          '</div>' +
          '<div class="ds-mock-body">' +
            '<div class="ds-mock-side" id="ds-preview-side" style="' + sideStyle + '">' +
              '<div class="ds-mock-nav-item active">当前对话</div>' +
              '<div class="ds-mock-nav-item">项目文件</div>' +
              '<div class="ds-mock-nav-item">插件中心</div>' +
              '<div class="ds-mock-nav-item">外观设置</div>' +
            '</div>' +
            '<div class="ds-mock-pane" id="ds-preview-pane" style="' + paneStyle + '">' +
              '<div class="ds-mock-chat-q">壁纸现在够清楚吗？</div>' +
              '<div class="ds-mock-chat-a">把「毛玻璃模糊」拉低或点「水晶超清」，壁纸细节就能纤毫毕现。</div>' +
              '<div class="ds-mock-code-card" id="ds-preview-code" style="background:' + codeBg + '">' +
                '<span class="ds-mock-code-kw">const</span> prism = { blur: <span class="ds-mock-code-kw">' + blurPx + 'px</span>, clarity: <span class="ds-mock-code-kw">"' + clarityPct + '%"</span> };' +
              '</div>' +
              '<div class="ds-mock-input-bar"><span>输入消息…</span><span>↵</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ds-stage-foot">' +
          '<div class="ds-stage-wall-info">' +
            '<span class="ds-stage-live-tag">' + esc(wallKind) + '</span>' +
            '<span class="ds-stage-wall-name" title="' + esc(wallTitle) + '">' + esc(wallTitle) + '</span>' +
          '</div>' +
          '<div class="ds-toolbar" style="gap:6px">' +
            '<button class="ds-btn sm" id="ds-peek-raw-btn" title="按住隐藏玻璃，直接看无遮挡高清原图">👀 按住看原图</button>' +
            '<button class="ds-btn sm" data-action="random-wall" title="随机换一张壁纸">🎲 随机</button>' +
            '<button class="ds-btn sm" data-action="step-next">换一张</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="ds-section">' +
        '<div class="ds-scene-grid">' + scenesHtml + '</div>' +
        '<div class="ds-sliders-stack">' +
          '<div class="ds-slider-box">' +
            '<div class="ds-slider-head"><span>玻璃通透感（越右越透）</span><span class="ds-slider-val" id="val-glass">' + clarityPct + '%</span></div>' +
            '<input class="ds-range" type="range" min="4" max="80" value="' + clarityPct + '" style="--pct:' + claritySliderPct + '%" data-slider="glassClarity" />' +
          '</div>' +
          '<div class="ds-slider-box">' +
            '<div class="ds-slider-head"><span>毛玻璃模糊（0 = 原画超清）</span><span class="ds-slider-val" id="val-blur">' + blurPx + 'px</span></div>' +
            '<input class="ds-range" type="range" min="0" max="24" value="' + blurPx + '" style="--pct:' + blurSliderPct + '%" data-slider="glassBlur" />' +
          '</div>' +
          '<div class="ds-slider-box">' +
            '<div class="ds-slider-head"><span>背景压暗护眼</span><span class="ds-slider-val" id="val-scrim">' + scrimPct + '%</span></div>' +
            '<input class="ds-range" type="range" min="0" max="80" value="' + scrimPct + '" style="--pct:' + scrimSliderPct + '%" data-slider="scrimOpacity" />' +
          '</div>' +
        '</div>' +
        '<div class="ds-scheme-dots">' + schemesHtml + '</div>' +
        '<div class="ds-filter-bar"><span class="ds-muted">画质氛围：</span>' + filtersHtml + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderUnifiedLibraryPanel(cfg) {
    var mode = state.studioMode;
    var dynList = state.dynamicThemes || [];

    var headerRow = '<div class="ds-sec-title">' +
      '<div class="ds-seg-pill">' +
        '<button class="ds-seg-btn' + (mode === 'prism' ? ' active' : '') + '" data-studio-mode="prism">✦ 我的壁纸（' + (state.items ? state.items.length : 0) + '）</button>' +
        '<button class="ds-seg-btn' + (mode === 'dynamic' ? ' active' : '') + '" data-studio-mode="dynamic">🌊 动态主题库（' + dynList.length + '）</button>' +
        '<button class="ds-seg-btn' + (mode === 'classic' ? ' active' : '') + '" data-studio-mode="classic">🎨 经典在线库</button>' +
      '</div>' +
      '<div class="ds-toolbar">' +
        (mode === 'prism'
          ? '<button class="ds-btn sm primary" data-action="upload-file">+ 导入图片/视频</button><button class="ds-btn sm" data-action="scan-lib">扫描 Steam</button>'
          : mode === 'dynamic'
            ? '<button class="ds-btn sm primary" data-action="upload-file">+ 导入本地 MP4/网页</button>'
            : '<button class="ds-btn sm primary" data-action="import-dsskin">导入 .dsskin</button><button class="ds-btn sm" data-action="reload-gallery">刷新</button>') +
      '</div>' +
    '</div>';

    if (mode === 'dynamic') {
      var dynCards = dynList.map(function (t) {
        var isSel = state.previewDynamicId === t.id || (activeWallpaperOf(cfg) && activeWallpaperOf(cfg).title === t.title);
        return '<div class="ds-wall-card' + (isSel ? ' active' : '') + '" data-install-dyn="' + esc(t.id) + '">' +
          '<div class="ds-wall-thumb">' +
            '<img src="' + esc(t.thumbUrl) + '" alt="" />' +
            (isSel ? '<span class="ds-wall-active-badge">● 动态播放中</span>' : '') +
            '<span class="ds-wall-badge">' + esc(t.category || '动态') + '</span>' +
          '</div>' +
          '<div class="ds-wall-meta">' +
            '<div class="ds-wall-title">' + esc(t.title) + '</div>' +
            '<div class="ds-dyn-card-sub">' + esc(t.subtitle) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      return '<div class="ds-section">' +
        headerRow +
        '<div class="ds-url-import-bar">' +
          '<input class="ds-input" id="ds-import-url" placeholder="粘贴 GitHub / 网络 MP4、WebM 或高清图直链，一键导入动态壁纸…" value="' + esc(state.importUrlText) + '" />' +
          '<button class="ds-btn sm primary" data-action="import-url">下载导入</button>' +
        '</div>' +
        '<div class="ds-wall-grid">' + dynCards + '</div>' +
      '</div>';
    }

    if (mode === 'classic') {
      var galleryBody = '';
      if (state.galleryLoading) {
        galleryBody = '<div class="ds-muted" style="padding:12px 0">正在加载 dreamskin.cc 在线主题库…</div>';
      } else if (state.galleryError) {
        galleryBody = '<div class="ds-compact-bar"><span>在线主题库暂时连不上：' + esc(state.galleryError) + '</span><button class="ds-btn sm" data-action="reload-gallery">重试</button></div>';
      } else if (!state.galleryItems.length) {
        galleryBody = '<div class="ds-muted" style="padding:12px 0">没有匹配的在线主题</div>';
      } else {
        galleryBody = '<div class="ds-wall-grid">' + state.galleryItems.map(function (it) {
          var id = String(it.key || '').replace(/^ds-/, '');
          return '<div class="ds-wall-card" data-gallery-download="' + esc(id) + '">' +
            '<div class="ds-wall-thumb">' + (it.thumb ? '<img src="' + esc(it.thumb) + '" loading="lazy" alt="" />' : '在线主题') + '<span class="ds-wall-badge">下载套用</span></div>' +
            '<div class="ds-wall-meta"><div class="ds-wall-title">' + esc(it.name) + '</div><div class="ds-muted">' + esc(it.author || '社区作品') + '</div></div>' +
          '</div>';
        }).join('') + '</div>';
      }

      return '<div class="ds-section">' +
        headerRow +
        '<div class="ds-toolbar">' +
          '<input class="ds-input" id="ds-search" placeholder="搜索社区主题，回车搜索…" value="' + esc(state.searchQuery) + '" />' +
          '<button class="ds-btn sm" data-action="reload-gallery">搜索</button>' +
        '</div>' +
        galleryBody +
      '</div>';
    }

    var list = filteredLibrary();
    var wallGridHtml = !list.length
      ? '<div class="ds-muted" style="padding:12px 0">暂无匹配壁纸，点击右上角导入、切到「🌊 动态主题库」，或直接把图片/MP4 拖进来</div>'
      : '<div class="ds-wall-grid">' + list.slice(0, 60).map(function (it) {
          var isSel = !state.previewDynamicId && cfg.activeWallpaperId === it.id;
          var kindLabel = it.kind === 'video' ? '视频' : it.kind === 'scene' ? 'Steam' : it.kind === 'web' ? '动态主题' : '图片';
          var dynMatch = matchedDynamicForItem(it);
          var thumb = dynMatch ? dynMatch.thumbUrl : (it.thumbUrl || (it.kind === 'image' ? it.mediaUrl : ''));
          return '<div class="ds-wall-card' + (isSel ? ' active' : '') + '" data-pick-wall="' + esc(it.id) + '">' +
            '<div class="ds-wall-thumb">' +
              (thumb ? '<img src="' + esc(thumb) + '" loading="lazy" alt="" />' : kindLabel) +
              (isSel ? '<span class="ds-wall-active-badge">✓ 使用中</span>' : '') +
              '<span class="ds-wall-badge">' + kindLabel + '</span>' +
            '</div>' +
            '<div class="ds-wall-meta"><div class="ds-wall-title">' + esc(it.title || it.id) + '</div></div>' +
          '</div>';
        }).join('') + '</div>';

    return '<div class="ds-section">' +
      headerRow +
      '<div class="ds-toolbar">' +
        '<div class="ds-chips">' +
          '<button class="ds-chip' + (state.libSource === 'all' ? ' active' : '') + '" data-lib-src="all">全部</button>' +
          '<button class="ds-chip' + (state.libSource === 'local' ? ' active' : '') + '" data-lib-src="local">本地</button>' +
          '<button class="ds-chip' + (state.libSource === 'workshop' ? ' active' : '') + '" data-lib-src="workshop">Steam 创意工坊</button>' +
        '</div>' +
        '<input class="ds-input" id="ds-search" placeholder="搜索壁纸…" value="' + esc(state.searchQuery) + '" />' +
      '</div>' +
      wallGridHtml +
    '</div>';
  }

  function renderHome(app, cfg) {
    var topStrips = renderHelpPopover() + renderCompatCompactStrip(app, cfg);
    if (app.canary && app.canary.state === 'tripped') {
      topStrips += '<div class="ds-compact-bar"><span>🛡 <b>' + esc(app.name) + '</b> 已进入保护模式</span><button class="ds-btn primary sm" data-action="reset-canary">解除保护</button></div>';
    }
    if (state.shortcutInfo && state.shortcutInfo.supported && !state.shortcutInfo.normalShortcutEnabled && !isPeacefulYield(app, cfg)) {
      topStrips += '<div class="ds-compact-bar accent"><div class="ds-compact-bar-left"><span>✨</span><span>开启原图标自动换肤，下次直接点 <b>' + esc(app.name) + '</b> 图标即带皮肤</span></div><button class="ds-btn primary sm" data-action="enable-shortcut">一键开启</button></div>';
    }

    var g = state.v4Store.global || {};
    var focusFreeze = g.focusFreezeEnabled !== false;
    var pauseBatt = g.pauseOnBattery !== false;
    var dynamicAccent = (cfg.accentMode || 'dynamic') === 'dynamic';
    var fxOn = Boolean(cfg.fxEnabled);
    var parallaxOn = Boolean(cfg.parallaxEnabled);

    return topStrips +
      renderThreeModePanel(app, cfg) +
      renderPreviewAndControls(app, cfg) +
      renderUnifiedLibraryPanel(cfg) +
      '<details class="prism-adv-drawer"' + (state.advOpen ? ' open' : '') + '>' +
        '<summary><span>⚙ 进阶微调（布局、动效视差、自动取色、护眼与省电）</span><span class="ds-muted">' + (state.advOpen ? '收起 ▲' : '展开 ▼') + '</span></summary>' +
        '<div class="ds-adv-body">' +
          '<div class="ds-toolbar">' +
            '<span class="ds-muted">面板形态：</span>' +
            '<button class="ds-chip' + ((cfg.layoutMode || 'islands') === 'islands' ? ' active' : '') + '" data-layout="islands">浮岛圆角</button>' +
            '<button class="ds-chip' + (cfg.layoutMode === 'flush' ? ' active' : '') + '" data-layout="flush">紧凑一体</button>' +
            '<span class="ds-muted" style="margin-left:10px">明暗：</span>' +
            '<button class="ds-chip' + ((cfg.themeMode || 'auto') === 'auto' ? ' active' : '') + '" data-theme-mode="auto">跟随软件</button>' +
            '<button class="ds-chip' + (cfg.themeMode === 'dark' ? ' active' : '') + '" data-theme-mode="dark">深色</button>' +
            '<button class="ds-chip' + (cfg.themeMode === 'light' ? ' active' : '') + '" data-theme-mode="light">浅色</button>' +
          '</div>' +
          '<div class="ds-toolbar">' +
            '<span class="ds-muted">代码区底板：</span>' +
            '<button class="ds-chip' + ((cfg.codeReadabilityMode || 'translucent') === 'translucent' ? ' active' : '') + '" data-code-mode="translucent">通透</button>' +
            '<button class="ds-chip' + (cfg.codeReadabilityMode === 'frosted' ? ' active' : '') + '" data-code-mode="frosted">磨砂护眼</button>' +
            '<button class="ds-chip' + (cfg.codeReadabilityMode === 'solid' ? ' active' : '') + '" data-code-mode="solid">实底清晰</button>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>随壁纸主色自动配色（类似 Spicetify / Obsidian 取色）</span>' +
            '<label class="ds-switch"><input type="checkbox" data-app-toggle="dynamicAccent"' + (dynamicAccent ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>鼠标点击涟漪微光动效</span>' +
            '<label class="ds-switch"><input type="checkbox" data-app-toggle="fxEnabled"' + (fxOn ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>3D 鼠标微视差景深（背景随鼠标轻柔移动）</span>' +
            '<label class="ds-switch"><input type="checkbox" data-app-toggle="parallaxEnabled"' + (parallaxOn ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>多窗口智能省电（后台动态壁纸自动定格）</span>' +
            '<label class="ds-switch"><input type="checkbox" data-global-toggle="focusFreezeEnabled"' + (focusFreeze ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>笔记本使用电池时自动定格</span>' +
            '<label class="ds-switch"><input type="checkbox" data-global-toggle="pauseOnBattery"' + (pauseBatt ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toolbar">' +
            '<button class="ds-btn sm" data-action="import-dsskin">导入 .dsskin</button>' +
            '<button class="ds-btn sm" data-action="disable-shortcut">恢复原图标参数</button>' +
          '</div>' +
        '</div>' +
      '</details>';
  }

  function renderAppsTab() {
    var rows = state.apps.map(function (a) {
      return '<div class="ds-banner">' +
        '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:180px">' +
          '<span class="ds-app-icon-wrap">' + appIconHtml(a.id) + '</span>' +
          '<div><b>' + esc(a.name) + '</b> <span class="ds-muted">· ' + esc(appStatusText(a)) + '</span></div>' +
        '</div>' +
        '<div class="ds-toolbar">' +
          '<button class="ds-btn sm primary" data-app-apply="' + esc(a.id) + '">应用</button>' +
          '<button class="ds-btn sm danger" data-app-restore="' + esc(a.id) + '">还原</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="ds-section">' +
      '<div class="ds-sec-title"><span>已适配软件（' + state.apps.length + '）</span><button class="ds-btn sm" data-action="refresh-apps">🔄 刷新</button></div>' +
      rows +
    '</div>' +
    '<div class="ds-section">' +
      '<div class="ds-sec-title"><span>快捷撤回</span></div>' +
      '<div class="ds-muted"><b>Ctrl+Alt+W</b> 唤出悬浮调节窗 · 连按 <b>4 下 Esc</b> 秒还原原貌</div>' +
      '<div class="ds-toolbar">' +
        '<button class="ds-btn sm" data-action="disable-shortcut">恢复当前软件原图标</button>' +
        '<button class="ds-btn sm danger" data-action="restore-all">一键还原全部软件</button>' +
      '</div>' +
    '</div>';
  }

  function renderAppRow(a, curId) {
    var act = a.id === curId ? ' active' : '';
    var uninst = (!a.installed && a.id !== 'antigravity') ? ' uninstalled' : '';
    return '<button class="ds-app-row' + act + uninst + '" data-app-id="' + esc(a.id) + '">' +
      '<span class="ds-app-icon-wrap">' + appIconHtml(a.id) + '</span>' +
      '<span class="ds-app-info">' +
        '<span class="ds-app-name-line">' + esc(a.name) + '</span>' +
        '<span class="ds-app-sub-line"><span class="ds-dot ' + dotClass(a) + '"></span>' + esc(appStatusText(a)) + '</span>' +
      '</span>' +
    '</button>';
  }

  function renderMainInner(app, cfg) {
    return '<header class="ds-header">' +
      '<div class="ds-header-left" id="ds-header-left">' +
        appIconHtml(app.id, 'ds-cur-app-icon') +
        '<span class="ds-cur-title">' + esc(app.name) + '</span>' +
        '<span class="ds-status-pill ' + statusPillClass(app) + '"><span class="ds-dot ' + dotClass(app) + '"></span>' + esc(appStatusText(app)) + '</span>' +
      '</div>' +
      '<div class="ds-header-right">' +
        '<label class="ds-switch" title="开启或暂停对此软件的换肤">' +
          '<input type="checkbox" id="ds-app-enabled-toggle"' + (cfg.skinEnabled !== false ? ' checked' : '') + ' />' +
          '<span class="ds-switch-track"></span>' +
          '<span>' + (cfg.skinEnabled !== false ? '开启' : '暂停') + '</span>' +
        '</label>' +
        '<button class="ds-btn primary sm" data-action="apply-cur">✦ 应用到软件</button>' +
        '<div class="ds-tabs">' +
          '<button class="ds-tab' + (state.activeTab === 'home' ? ' active' : '') + '" data-tab="home">外观</button>' +
          '<button class="ds-tab' + (state.activeTab === 'apps' ? ' active' : '') + '" data-tab="apps">软件</button>' +
        '</div>' +
        '<button class="ds-btn sm ghost" data-action="toggle-guide" title="速查说明">?</button>' +
      '</div>' +
    '</header>' +
    '<section class="ds-body">' +
      (state.activeTab === 'home' ? renderHome(app, cfg) : renderAppsTab()) +
    '</section>';
  }

  function positionSidebarIndicator(animate) {
    var nav = document.getElementById('ds-apps-scroll');
    var ind = document.getElementById('ds-nav-indicator');
    if (!nav || !ind) return;
    var activeBtn = nav.querySelector('.ds-app-row.active');
    if (!activeBtn) {
      ind.style.opacity = '0';
      return;
    }
    if (!animate) ind.classList.add('instant');
    ind.style.height = activeBtn.offsetHeight + 'px';
    ind.style.transform = 'translate3d(0, ' + activeBtn.offsetTop + 'px, 0)';
    ind.style.opacity = '1';
    if (!animate) {
      void ind.offsetWidth;
      ind.classList.remove('instant');
    }
  }

  function renderMainOnly(opts) {
    opts = opts || {};
    var mainEl = document.getElementById('ds-main');
    if (!mainEl) { render(opts); return; }
    var prevBodyScroll = 0;
    if (opts.preserveScroll) {
      var pb = mainEl.querySelector('.ds-body');
      if (pb) prevBodyScroll = pb.scrollTop;
    }
    var app = currentApp();
    var cfg = currentConfig();
    applyAmbientAccent(cfg);
    mainEl.innerHTML = renderMainInner(app, cfg);
    bindEvents(mainEl, true);
    renderToastOnly();
    if (opts.preserveScroll) {
      var nb = mainEl.querySelector('.ds-body');
      if (nb && prevBodyScroll) nb.scrollTop = prevBodyScroll;
    }
    var bodyEl = mainEl.querySelector('.ds-body');
    var hdrEl = mainEl.querySelector('#ds-header-left');
    if (bodyEl) {
      if (opts.direction === 'up') bodyEl.classList.add('ds-dir-up');
      else if (opts.direction === 'down') bodyEl.classList.add('ds-dir-down');
      else if (opts.tabAnimate) bodyEl.classList.add('ds-tab-enter');
    }
    if (hdrEl && opts.direction) {
      hdrEl.classList.add('ds-hdr-enter');
    }
    if (opts.mediaSweep) {
      triggerPrismSweep(true);
    }
  }

  function render(opts) {
    var root = document.getElementById('app');
    if (!root) return;
    opts = opts || {};
    var prevBodyScroll = 0;
    var prevNavScroll = 0;
    if (opts.preserveScroll) {
      var prevBody = root.querySelector('.ds-body');
      var prevNav = root.querySelector('.ds-apps-scroll');
      if (prevBody) prevBodyScroll = prevBody.scrollTop;
      if (prevNav) prevNavScroll = prevNav.scrollTop;
    }
    var app = currentApp();
    var cfg = currentConfig();
    applyAmbientAccent(cfg);

    var installedApps = state.apps.filter(function (a) { return a.installed || a.id === 'antigravity'; });
    var otherApps = state.apps.filter(function (a) { return !a.installed && a.id !== 'antigravity'; });

    var iconUri = window.__PRISM_ICON_URI__ || '';
    var brandIconHtml = iconUri
      ? '<img class="ds-brand-icon" src="' + iconUri + '" alt="梦境换肤" />'
      : '<span class="ds-app-icon-wrap">' + appIconHtml('antigravity') + '</span>';

    var appListHtml = '<div class="ds-nav-hover" id="ds-nav-hover"></div>' +
      '<div class="ds-nav-indicator" id="ds-nav-indicator"></div>' +
      '<div class="ds-nav-group-label"><span>本机软件（' + installedApps.length + '）</span></div>' +
      installedApps.map(function (a) { return renderAppRow(a, app.id); }).join('');

    if (otherApps.length > 0) {
      appListHtml += '<div class="ds-nav-group-label"><span>未安装（' + otherApps.length + '）</span>' +
        '<button class="ds-uninstalled-toggle" data-action="toggle-uninstalled">' + (state.showUninstalled ? '收起' : '展开') + '</button></div>';
      if (state.showUninstalled) {
        appListHtml += otherApps.map(function (a) { return renderAppRow(a, app.id); }).join('');
      }
    }

    root.innerHTML =
      '<div class="ds-shell">' +
        '<aside class="ds-sidebar">' +
          '<div class="ds-brand">' +
            brandIconHtml +
            '<div class="ds-brand-text">' +
              '<div class="ds-brand-title">梦境换肤 <span class="ds-ver-badge">v' + esc(state.version) + '</span></div>' +
              '<div class="ds-brand-sub">液态玻璃 · by lemon</div>' +
            '</div>' +
          '</div>' +
          '<div class="ds-apps-scroll" id="ds-apps-scroll">' + appListHtml + '</div>' +
          '<div class="ds-sidebar-foot">' +
            '<button class="ds-btn primary" data-action="sync-all">同步外观到全部</button>' +
            '<button class="ds-btn danger" data-action="restore-cur">还原当前软件</button>' +
          '</div>' +
        '</aside>' +

        '<main class="ds-main" id="ds-main">' +
          renderMainInner(app, cfg) +
        '</main>' +
      '</div>' +
      '<div class="ds-drop-overlay' + (state.draggingOver ? ' show' : '') + '" id="ds-drop-overlay">' +
        '<div class="ds-drop-box"><b>松开鼠标即可导入壁纸</b><span>支持 PNG / JPG / WebP / MP4 / WebM 与 .dsskin</span></div>' +
      '</div>' +
      '<input type="file" id="ds-file-input" style="display:none" accept="image/*,video/mp4,video/webm,.mov" />' +
      '<input type="file" id="ds-dsskin-input" style="display:none" accept=".dsskin,application/json" />';

    bindEvents(root, false);
    renderToastOnly();
    positionSidebarIndicator(false);
    if (opts.preserveScroll) {
      var nextBody = root.querySelector('.ds-body');
      var nextNav = root.querySelector('.ds-apps-scroll');
      if (nextBody && prevBodyScroll) nextBody.scrollTop = prevBodyScroll;
      if (nextNav && prevNavScroll) nextNav.scrollTop = prevNavScroll;
    }
    if (opts.tabAnimate) {
      var animBody = root.querySelector('.ds-body');
      if (animBody) animBody.classList.add('ds-tab-enter');
    }
    if (opts.mediaSweep) {
      triggerPrismSweep(true);
    }
  }

  function bindEvents(root, mainOnly) {
    root.querySelectorAll('img[data-fallback-src]').forEach(function (img) {
      img.addEventListener('error', function () {
        var fb = img.getAttribute('data-fallback-src');
        if (fb && img.src !== fb) {
          img.removeAttribute('data-fallback-src');
          img.src = fb;
        }
      });
    });

    // Hold-to-peek unobstructed raw HD wallpaper / live dynamic theme
    var peekBtn = root.querySelector('#ds-peek-raw-btn');
    var stageWrap = root.querySelector('#ds-stage-wrap');
    if (peekBtn && stageWrap) {
      var startPeek = function () { stageWrap.classList.add('peek-raw'); };
      var endPeek = function () { stageWrap.classList.remove('peek-raw'); };
      peekBtn.addEventListener('pointerdown', startPeek);
      peekBtn.addEventListener('pointerup', endPeek);
      peekBtn.addEventListener('pointerleave', endPeek);
      peekBtn.addEventListener('pointercancel', endPeek);
    }

    if (!mainOnly) {
      var navScroll = root.querySelector('#ds-apps-scroll');
      var hoverPill = root.querySelector('#ds-nav-hover');
      var rows = Array.prototype.slice.call(root.querySelectorAll('.ds-app-row[data-app-id]'));

      if (navScroll && hoverPill) {
        navScroll.addEventListener('mouseleave', function () {
          hoverPill.style.opacity = '0';
        });
      }

      rows.forEach(function (btn, idx) {
        if (hoverPill) {
          btn.addEventListener('mouseenter', function () {
            if (btn.classList.contains('active')) {
              hoverPill.style.opacity = '0';
              return;
            }
            hoverPill.style.height = btn.offsetHeight + 'px';
            hoverPill.style.transform = 'translate3d(0, ' + btn.offsetTop + 'px, 0)';
            hoverPill.style.opacity = '1';
          });
        }
        btn.addEventListener('click', function () {
          var nextId = btn.getAttribute('data-app-id');
          if (nextId === state.selectedAppId) return;
          var prevBtn = navScroll ? navScroll.querySelector('.ds-app-row.active') : null;
          var prevIdx = prevBtn ? rows.indexOf(prevBtn) : -1;
          var dir = (prevIdx >= 0 && idx < prevIdx) ? 'up' : 'down';

          state.selectedAppId = nextId;
          state.previewDynamicId = '';
          state.showTakeoverSteps = false;

          // Keep sidebar DOM intact -> magnetic indicator glides with spring physics!
          rows.forEach(function (r) { r.classList.toggle('active', r === btn); });
          if (hoverPill) hoverPill.style.opacity = '0';
          positionSidebarIndicator(true);
          renderMainOnly({ direction: dir, mediaSweep: true });
          loadShortcutStatus();
          loadDshPluginStatus();
        });
      });
    }

    root.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nextTab = btn.getAttribute('data-tab');
        if (nextTab === state.activeTab) return;
        state.activeTab = nextTab;
        renderMainOnly({ tabAnimate: true });
      });
    });

    root.querySelectorAll('[data-studio-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nextMode = btn.getAttribute('data-studio-mode');
        state.studioMode = nextMode;
        if (nextMode === 'classic' && !state.galleryItems.length && !state.galleryLoading) {
          loadGallery();
        } else {
          renderMainOnly({ preserveScroll: true, tabAnimate: true });
        }
      });
    });

    var appEnabledToggle = root.querySelector('#ds-app-enabled-toggle');
    if (appEnabledToggle) {
      appEnabledToggle.addEventListener('change', function () {
        var on = appEnabledToggle.checked;
        if (!on) {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/restore', { method: 'POST', body: {} }).then(function () {
            showToast('已暂停 ' + currentApp().name + ' 换肤');
            loadState();
          });
        } else {
          patchCurrentAppConfig({ skinEnabled: true }, true).then(function () { loadState(); });
        }
      });
    }

    root.querySelectorAll('[data-skin-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-skin-mode');
        patchCurrentAppConfig({ skinMode: mode, skinEnabled: true }, true);
      });
    });

    root.querySelectorAll('[data-module-toggle]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.getAttribute('data-module-toggle');
        var cur = currentConfig();
        var nextMods = Object.assign({}, resolveUiComposition(cur).effective);
        nextMods[key] = cb.checked;
        var nextPatch = { modules: nextMods, skinEnabled: true };
        if (key === 'glassLayer') nextPatch.glassSurfaces = cb.checked;
        patchCurrentAppConfig(nextPatch, true);
      });
    });

    root.querySelectorAll('[data-mascot-spec]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        patchCurrentAppConfig({ mascotSpec: btn.getAttribute('data-mascot-spec') }, true);
      });
    });

    root.querySelectorAll('[data-rim-tone]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        patchCurrentAppConfig({ rimTone: btn.getAttribute('data-rim-tone') }, true);
      });
    });

    root.querySelectorAll('[data-vividness]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        patchCurrentAppConfig({ vividness: btn.getAttribute('data-vividness') }, true);
      });
    });

    root.querySelectorAll('[data-habitat-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        patchCurrentAppConfig({ habitatMode: btn.getAttribute('data-habitat-mode') }, true);
      });
    });

    root.querySelectorAll('[data-dsh-plugin-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-dsh-plugin-action');
        if (act === 'install') {
          apiJson('/api/apps/dsh/plugin/install', { method: 'POST', body: { consent: true, enable: true } }).then(function (r) {
            state.dshPluginStatus = r;
            showToast('DSH 原生双半体插件安装成功，正在应用皮肤…');
            return applyAppNow('dsh', { force: false });
          }).catch(function (err) { showToast(err.message || '安装失败'); });
        } else if (act === 'toggle') {
          apiJson('/api/apps/dsh/plugin/toggle', { method: 'POST', body: {} }).then(function (r) {
            state.dshPluginStatus = r;
            showToast(r.enabled ? '已开启 DSH 原生插件通道' : '已暂停 DSH 原生插件通道并还原');
            renderMainOnly({ preserveScroll: true });
          }).catch(function (err) { showToast(err.message || '切换失败'); });
        } else if (act === 'uninstall') {
          apiJson('/api/apps/dsh/plugin/uninstall', { method: 'POST', body: {} }).then(function (r) {
            state.dshPluginStatus = r;
            showToast('已干净卸载 DSH 原生插件');
            renderMainOnly({ preserveScroll: true });
          }).catch(function (err) { showToast(err.message || '卸载失败'); });
        }
      });
    });

    root.querySelectorAll('[data-scene-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-scene-preset');
        var card = SCENE_CARDS.find(function (c) { return c.id === id; });
        if (card) patchCurrentAppConfig(card.patch, true);
      });
    });

    root.querySelectorAll('input[data-slider]').forEach(function (el) {
      el.addEventListener('input', function () {
        var key = el.getAttribute('data-slider');
        var min = Number(el.min || 0);
        var max = Number(el.max || 100);
        var val = Number(el.value);
        el.style.setProperty('--pct', Math.round(((val - min) / (max - min)) * 100) + '%');
        if (key === 'glassClarity') {
          var l1 = document.getElementById('val-glass');
          if (l1) l1.textContent = val + '%';
        } else if (key === 'glassBlur') {
          var l2 = document.getElementById('val-blur');
          if (l2) l2.textContent = val + 'px';
        } else {
          var l3 = document.getElementById('val-scrim');
          if (l3) l3.textContent = val + '%';
        }
        var gEl = root.querySelector('input[data-slider="glassClarity"]');
        var bEl = root.querySelector('input[data-slider="glassBlur"]');
        var sEl = root.querySelector('input[data-slider="scrimOpacity"]');
        updateLivePreviewDom(gEl ? Number(gEl.value) : 44, bEl ? Number(bEl.value) : 8, sEl ? Number(sEl.value) : 14);
      });
      el.addEventListener('change', function () {
        var key = el.getAttribute('data-slider');
        var patch = {};
        if (key === 'glassClarity') {
          patch.glassOpacity = Math.round(100 - Number(el.value)) / 100;
        } else if (key === 'glassBlur') {
          patch.glassBlur = Math.round(Number(el.value));
          patch.glassSurfaces = patch.glassBlur > 0;
        } else {
          patch[key] = Math.round(Number(el.value)) / 100;
        }
        patchCurrentAppConfig(patch, true);
      });
    });

    root.querySelectorAll('[data-filter-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        patchCurrentAppConfig({ filterPreset: b.getAttribute('data-filter-preset') }, true);
      });
    });

    root.querySelectorAll('[data-install-dyn]').forEach(function (card) {
      card.addEventListener('click', function () {
        installAndApplyDynamicTheme(card.getAttribute('data-install-dyn'));
      });
    });

    var urlInput = root.querySelector('#ds-import-url');
    if (urlInput) {
      urlInput.addEventListener('input', function () { state.importUrlText = urlInput.value; });
    }

    root.querySelectorAll('[data-lib-src]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.libSource = btn.getAttribute('data-lib-src');
        render();
      });
    });

    var searchEl = root.querySelector('#ds-search');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.searchQuery = searchEl.value;
        if (state.studioMode !== 'classic') render();
      });
      searchEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && state.studioMode === 'classic') loadGallery();
      });
    }

    root.querySelectorAll('[data-pick-wall]').forEach(function (card) {
      card.addEventListener('click', function () {
        state.previewDynamicId = '';
        var wid = card.getAttribute('data-pick-wall');
        patchCurrentAppConfig({ activeWallpaperId: wid, wallpaperId: wid, skinEnabled: true }, true);
      });
    });

    root.querySelectorAll('[data-gallery-download]').forEach(function (card) {
      card.addEventListener('click', function () {
        var gid = card.getAttribute('data-gallery-download');
        showToast('正在下载在线主题…');
        apiJson('/api/gallery/download', { method: 'POST', body: { id: gid } }).then(function (r) {
          showToast('已下载并应用');
          state.previewDynamicId = '';
          loadState().then(function () {
            if (r && r.uploaded && r.uploaded.id) {
              patchCurrentAppConfig({ activeWallpaperId: r.uploaded.id, wallpaperId: r.uploaded.id, skinEnabled: true }, true);
            }
          });
        }).catch(function (err) { showToast(err.message); });
      });
    });

    var adv = root.querySelector('details.prism-adv-drawer');
    if (adv) {
      adv.addEventListener('toggle', function () { state.advOpen = adv.open; });
    }

    root.querySelectorAll('[data-scheme]').forEach(function (b) {
      b.addEventListener('click', function () { patchCurrentAppConfig({ colorScheme: b.getAttribute('data-scheme') }, true); });
    });
    root.querySelectorAll('[data-layout]').forEach(function (b) {
      b.addEventListener('click', function () { patchCurrentAppConfig({ layoutMode: b.getAttribute('data-layout') }, true); });
    });
    root.querySelectorAll('[data-theme-mode]').forEach(function (b) {
      b.addEventListener('click', function () { patchCurrentAppConfig({ themeMode: b.getAttribute('data-theme-mode') }, true); });
    });
    root.querySelectorAll('[data-code-mode]').forEach(function (b) {
      b.addEventListener('click', function () { patchCurrentAppConfig({ codeReadabilityMode: b.getAttribute('data-code-mode') }, true); });
    });
    root.querySelectorAll('[data-app-toggle]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var k = cb.getAttribute('data-app-toggle');
        if (k === 'dynamicAccent') {
          patchCurrentAppConfig({ accentMode: cb.checked ? 'dynamic' : 'scheme' }, true);
        } else {
          var p = {};
          p[k] = cb.checked;
          patchCurrentAppConfig(p, true);
        }
      });
    });
    root.querySelectorAll('[data-global-toggle]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var p = {};
        p[cb.getAttribute('data-global-toggle')] = cb.checked;
        patchGlobalConfig(p);
      });
    });

    root.querySelectorAll('[data-app-apply]').forEach(function (b) {
      b.addEventListener('click', function () { applyAppNow(b.getAttribute('data-app-apply'), { force: false }); });
    });
    root.querySelectorAll('[data-app-restore]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-app-restore');
        apiJson('/api/apps/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: {} }).then(function () {
          showToast('已还原原貌');
          loadState();
        });
      });
    });

    var fileInput = root.querySelector('#ds-file-input');
    var dsskinInput = root.querySelector('#ds-dsskin-input');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) uploadLocalFile(f);
      });
    }
    if (dsskinInput) {
      dsskinInput.addEventListener('change', function () {
        var f = dsskinInput.files && dsskinInput.files[0];
        if (f) uploadLocalFile(f);
      });
    }

    root.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-action');
        if (act === 'upload-file' && fileInput) fileInput.click();
        else if (act === 'import-dsskin' && dsskinInput) dsskinInput.click();
        else if (act === 'import-url') {
          var u = (state.importUrlText || '').trim();
          if (!u) { showToast('请先粘贴一个 MP4 / WebM / 图片直链'); return; }
          showToast('正在从链接下载导入…');
          apiJson('/api/library/import-url', { method: 'POST', body: { url: u } }).then(function (r) {
            state.importUrlText = '';
            state.previewDynamicId = '';
            showToast('导入成功，正在为你选中');
            loadState().then(function () {
              if (r && r.item && r.item.id) {
                patchCurrentAppConfig({ activeWallpaperId: r.item.id, wallpaperId: r.item.id, skinEnabled: true }, true);
              }
            });
          }).catch(function (err) {
            showToast(err && err.status === 404 ? '请先重启插件或用新版独立软件以启用链接导入' : (err.message || '导入失败'));
          });
        } else if (act === 'toggle-guide') {
          state.showHelp = !state.showHelp;
          state.activeTab = 'home';
          render();
        } else if (act === 'toggle-uninstalled') {
          state.showUninstalled = !state.showUninstalled;
          render();
        } else if (act === 'toggle-takeover-steps') {
          state.showTakeoverSteps = !state.showTakeoverSteps;
          render();
        } else if (act === 'yield-to-conflict') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/restore', { method: 'POST', body: {} }).then(function () {
            state.showTakeoverSteps = false;
            showToast('已设为和平共存');
            loadState();
          });
        } else if (act === 'recheck-conflict') {
          apiJson('/api/apps/refresh', { method: 'POST', body: {} }).then(function () {
            loadState().then(function () {
              var a = currentApp();
              showToast(hasPluginConflict(a) ? ('检测到 ' + a.pluginConflicts[0].name + ' 仍处于开启状态') : '未检测到冲突，可以直接应用皮肤');
            });
          });
        } else if (act === 'force-takeover') {
          applyAppNow(state.selectedAppId, { force: true });
        } else if (act === 'apply-cur') {
          applyAppNow(state.selectedAppId, { force: false });
        } else if (act === 'reload-gallery') {
          loadGallery();
        } else if (act === 'scan-lib') {
          showToast('正在扫描 Steam 创意工坊…');
          apiJson('/api/library/scan', { method: 'POST', body: {} }).then(function () { showToast('扫描完成'); loadState(); });
        } else if (act === 'refresh-apps') {
          apiJson('/api/apps/refresh', { method: 'POST', body: {} }).then(function () { showToast('已刷新'); loadState(); });
        } else if (act === 'sync-all') {
          apiJson('/api/sync', { method: 'POST', body: { from: state.selectedAppId } }).then(function (r) {
            showToast('已同步到其他 ' + (r.syncedApps ? r.syncedApps.length : 0) + ' 个软件');
            loadState();
          });
        } else if (act === 'restore-cur') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/restore', { method: 'POST', body: {} }).then(function () {
            showToast('已还原 ' + currentApp().name);
            loadState();
          });
        } else if (act === 'restore-all') {
          apiJson('/api/restore-all', { method: 'POST', body: {} }).then(function () {
            showToast('已还原全部软件');
            loadState();
          });
        } else if (act === 'enable-shortcut') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/shortcuts/enable', { method: 'POST', body: {} }).then(function (r) {
            showToast(r.ok ? '已开启原图标自动换肤' : '未能修改快捷方式');
            loadShortcutStatus();
          });
        } else if (act === 'disable-shortcut') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/shortcuts/disable', { method: 'POST', body: {} }).then(function () {
            showToast('已恢复原图标默认参数');
            loadShortcutStatus();
          });
        } else if (act === 'reset-canary') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/wake', { method: 'POST', body: {} }).then(function () {
            showToast('已解除保护模式');
            loadState();
          });
        } else if (act === 'random-wall') {
          var pool = state.items || [];
          if (!pool.length) { showToast('壁纸库还没有壁纸'); return; }
          state.previewDynamicId = '';
          var pick = pool[Math.floor(Math.random() * pool.length)];
          patchCurrentAppConfig({ activeWallpaperId: pick.id, wallpaperId: pick.id, skinEnabled: true }, true);
        } else if (act === 'step-next') {
          var list = state.items || [];
          if (!list.length) { showToast('壁纸库还没有壁纸'); return; }
          state.previewDynamicId = '';
          var curWid = currentConfig().activeWallpaperId;
          var idx = list.findIndex(function (it) { return it.id === curWid; });
          var nextItem = list[(idx + 1 + list.length) % list.length];
          patchCurrentAppConfig({ activeWallpaperId: nextItem.id, wallpaperId: nextItem.id, skinEnabled: true }, true);
        }
      });
    });
  }

  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragDepth += 1;
    if (!state.draggingOver) {
      state.draggingOver = true;
      var ov = document.getElementById('ds-drop-overlay');
      if (ov) ov.classList.add('show');
    }
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && state.draggingOver) {
      state.draggingOver = false;
      var ov = document.getElementById('ds-drop-overlay');
      if (ov) ov.classList.remove('show');
    }
  });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    state.draggingOver = false;
    var ov = document.getElementById('ds-drop-overlay');
    if (ov) ov.classList.remove('show');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) uploadLocalFile(f);
  });

  loadState();
})();
