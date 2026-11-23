(function bootDreamSkinPrismStudio() {
  'use strict';

  var SCENE_CARDS = [
    { id: 'crystal', icon: '✦', name: '通透浮岛', desc: '更透亮，壁纸看得更清', patch: { preset: 'crystal', layoutMode: 'islands', glassOpacity: 0.62, scrimOpacity: 0.16, glassBlur: 18, glassSurfaces: true, paused: false } },
    { id: 'islands', icon: '◈', name: '日常平衡', desc: '好看又护眼，默认推荐', patch: { preset: 'islands', layoutMode: 'islands', glassOpacity: 0.76, scrimOpacity: 0.26, glassBlur: 16, glassSurfaces: true, paused: false } },
    { id: 'focus', icon: '◐', name: '专注护眼', desc: '背景柔焦压暗，看字不累', patch: { preset: 'focus', layoutMode: 'flush', glassOpacity: 0.88, scrimOpacity: 0.44, glassBlur: 20, mediaBlur: 8, glassSurfaces: true, paused: false } },
    { id: 'eco', icon: '🍃', name: '省电静音', desc: '极简定格，几乎不耗电', patch: { preset: 'eco', layoutMode: 'flush', glassOpacity: 0.92, scrimOpacity: 0.34, glassBlur: 0, glassSurfaces: false, paused: true } },
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

  var APP_VISUALS = {
    antigravity: { glyph: 'A', bg: 'linear-gradient(135deg, #38bdf8, #818cf8)' },
    cherry: { glyph: 'C', bg: 'linear-gradient(135deg, #fb7185, #f43f5e)' },
    codex: { glyph: 'X', bg: 'linear-gradient(135deg, #34d399, #059669)' },
    dsh: { glyph: 'D', bg: 'linear-gradient(135deg, #60a5fa, #3b82f6)' },
    zcode: { glyph: 'Z', bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
    'minimax-code': { glyph: 'M', bg: 'linear-gradient(135deg, #f59e0b, #ea580c)' },
    'minimax-design': { glyph: 'M', bg: 'linear-gradient(135deg, #ec4899, #a855f7)' },
    kiro: { glyph: 'K', bg: 'linear-gradient(135deg, #c084fc, #6366f1)' },
    windsurf: { glyph: 'W', bg: 'linear-gradient(135deg, #2dd4bf, #0d9488)' },
  };

  function loadGuidePref() {
    try { return window.localStorage.getItem('ds_prism_guide_hidden_v4') !== '1'; } catch (_) { return true; }
  }
  function saveGuidePref(show) {
    try { window.localStorage.setItem('ds_prism_guide_hidden_v4', show ? '0' : '1'); } catch (_) {}
  }

  var state = {
    version: '4.0.0',
    activeTab: 'home', // 'home' | 'apps'
    studioMode: 'prism', // 'prism' (液态玻璃动态壁纸) | 'classic' (经典3.0主题库与.dsskin)
    selectedAppId: 'antigravity',
    libSource: 'all', // 'all' | 'workshop' | 'local'
    searchQuery: '',
    apps: [],
    v4Store: { version: 4, global: {}, apps: {} },
    items: [],
    galleryItems: [],
    galleryLoading: false,
    galleryError: '',
    shortcutInfo: null,
    toast: '',
    toastTimer: 0,
    advOpen: false,
    showGuide: loadGuidePref(),
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
        if (!r.ok) throw new Error(data.error || ('请求失败 ' + r.status));
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
    }, 3600);
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

  function schemeInfoOf(id) {
    return SCHEMES.find(function (s) { return s.id === id; }) || SCHEMES[0];
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
    if (!enabled) return '已暂停换肤';
    if (app.canary && app.canary.state === 'tripped') return '保护模式（已暂停）';
    if (app.attached || app.skinActive) return '皮肤生效中';
    if (hasPluginConflict(app)) return '检测到插件共存';
    if (app.running) return '运行中 · 待连接';
    if (app.installed) return '已安装 · 未打开';
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
      state.version = data.version || '4.0.0';
      state.apps = Array.isArray(data.apps) ? data.apps : [];
      state.v4Store = data.v4Store || state.v4Store;
      state.items = Array.isArray(data.items) ? data.items : [];
      if (state.apps.length && !state.apps.some(function (a) { return a.id === state.selectedAppId; })) {
        state.selectedAppId = state.apps[0].id;
      }
      var app = document.getElementById('app');
      if (app) app.setAttribute('data-prism-ready', 'true');
      render();
      loadShortcutStatus();
    }).catch(function (err) {
      var app = document.getElementById('app');
      if (app) app.setAttribute('data-prism-ready', 'true');
      showToast('连接管家失败：' + (err && err.message ? err.message : err));
      render();
    });
  }

  function loadShortcutStatus() {
    var app = currentApp();
    if (!app || app.channel === 'msix') {
      state.shortcutInfo = null;
      return;
    }
    apiJson('/api/apps/' + encodeURIComponent(app.id) + '/shortcuts').then(function (info) {
      state.shortcutInfo = info;
      render();
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
        showToast('已生效！' + currentApp().name + ' 皮肤已更新');
      } else if (r && r.reason === 'plugin-conflict') {
        showToast('请先在上方「共存与切换」里选择处理 Obsidian Prism 的方式');
      } else if (r && r.reason === 'not-debuggable') {
        showToast('已保存配置！点击上方「开启原图标自动换肤」后重新打开该软件即可生效');
      } else if (r && r.message) {
        showToast(r.message);
      }
      return loadState();
    });
  }

  function patchCurrentAppConfig(patch, andApply) {
    var appId = state.selectedAppId;
    return apiJson('/api/apps/' + encodeURIComponent(appId) + '/config', {
      method: 'POST',
      body: patch,
    }).then(function (res) {
      if (!state.v4Store.apps) state.v4Store.apps = {};
      state.v4Store.apps[appId] = res.entry;
      render();
      if (andApply) {
        return apiJson('/api/apps/' + encodeURIComponent(appId) + '/apply', { method: 'POST', body: {} }).then(function (r) {
          if (r && r.ok && !r.skipped) showToast('已应用到 ' + currentApp().name);
          else if (r && r.reason === 'not-debuggable') showToast('外观已保存（打开目标软件并启用原图标自动换肤后即时生效）');
          else if (r && r.message && r.reason !== 'plugin-conflict') showToast(r.message);
        });
      }
    }).catch(function (err) {
      showToast(err.message || '保存失败');
    });
  }

  function patchGlobalConfig(patch) {
    return apiJson('/api/config', { method: 'POST', body: patch }).then(function (res) {
      state.v4Store.global = res.global;
      showToast('省电与保护设置已更新');
      render();
    }).catch(function (err) { showToast(err.message); });
  }

  function uploadLocalFile(f) {
    if (!f) return;
    if (/\.dsskin$/i.test(f.name)) {
      showToast('正在导入旧皮肤包 ' + f.name + '…');
      f.text().then(function (txt) {
        return apiJson('/api/import/dsskin', { method: 'POST', body: { rawText: txt } });
      }).then(function (res) {
        showToast('已导入旧皮肤「' + (res.title || f.name) + '」');
        loadState();
      }).catch(function (err) { showToast(err.message || '导入失败'); });
      return;
    }
    showToast('正在导入壁纸 ' + f.name + '…');
    apiFetch('/api/library/upload?filename=' + encodeURIComponent(f.name), {
      method: 'POST',
      headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) },
      body: f,
    }).then(function (r) { return r.json(); }).then(function (res) {
      showToast(res.duplicate ? '已复用壁纸库中的相同文件' : '导入成功，正在为你选中');
      loadState().then(function () {
        if (res && res.item && res.item.id) {
          patchCurrentAppConfig({ activeWallpaperId: res.item.id, wallpaperId: res.item.id, skinEnabled: true }, true);
        }
      });
    }).catch(function (err) { showToast('导入失败：' + err.message); });
  }

  function updateLivePreviewDom(glassPct, scrimPct) {
    var pane = document.getElementById('ds-preview-pane');
    var side = document.getElementById('ds-preview-side');
    var scrim = document.getElementById('ds-preview-scrim');
    var cfg = currentConfig();
    var sch = schemeInfoOf(cfg.colorScheme);
    var gAlpha = Math.max(0.28, Math.min(0.96, glassPct / 100));
    var sAlpha = Math.max(0, Math.min(0.88, scrimPct / 100));
    if (pane) pane.style.background = 'rgba(' + sch.panelBg + ', ' + gAlpha.toFixed(2) + ')';
    if (side) side.style.background = 'rgba(' + sch.panelBg + ', ' + Math.min(0.96, gAlpha + 0.06).toFixed(2) + ')';
    if (scrim) scrim.style.background = 'rgba(6, 9, 18, ' + sAlpha.toFixed(2) + ')';
  }

  function renderOnboardingGuide() {
    if (!state.showGuide) return '';
    return '<div class="ds-guide-card">' +
      '<div class="ds-guide-head">' +
        '<div class="ds-guide-title">✨ 30 秒上手指南 · 3 步就能给软件换上动态液态玻璃</div>' +
        '<button class="ds-btn sm ghost" data-action="hide-guide">我知道了，收起</button>' +
      '</div>' +
      '<div class="ds-guide-steps">' +
        '<div class="ds-guide-step">' +
          '<div class="ds-step-num">1</div>' +
          '<div class="ds-step-body"><b>左侧先挑软件</b><span>想给哪个软件换肤就点哪个（比如反重力、Cherry Studio、Codex）。每个软件可以单独配不同壁纸。</span></div>' +
        '</div>' +
        '<div class="ds-guide-step">' +
          '<div class="ds-step-num">2</div>' +
          '<div class="ds-step-body"><b>选「模式」和壁纸</b><span><b>模式一（液态玻璃）</b>玩本地图/视频/Steam动态壁纸；<b>模式二（经典主题）</b>直接下载社区成品主题或导入旧 .dsskin。</span></div>' +
        '</div>' +
        '<div class="ds-guide-step">' +
          '<div class="ds-step-num">3</div>' +
          '<div class="ds-step-body"><b>点右上角「应用到软件」</b><span>开启一次「原图标自动换肤」后，以后正常双击软件就自带皮肤；不顺眼随时连按 <b>4 下 Esc</b> 秒还原。</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="ds-guide-note">' +
        '<span>💡 <b>桌面软件版</b> 与 <b>反重力右侧边栏</b> 共用同一套配置，无论在哪里调都会自动同步，挑顺手的打开就行。</span>' +
      '</div>' +
    '</div>';
  }

  function renderCompatHub(app, cfg) {
    if (!hasPluginConflict(app)) return '';
    var conflict = app.pluginConflicts[0];
    var peaceful = isPeacefulYield(app, cfg);
    var headTitle = peaceful
      ? '🟣 和平共存中：' + esc(app.name) + ' 交给「' + esc(conflict.name) + '」，梦境负责其他软件'
      : '⚡ 检测到你已开启「' + esc(conflict.name) + '」· 请选一种切换方式';
    var headDesc = peaceful
      ? '梦境换肤已自动暂停接管 ' + esc(app.name) + '，两者互不打架；其他软件（Cherry / Codex / DSH 等）照常享受梦境换肤 4.0。随时可以一键切回。'
      : '两个外观插件同时作用在 ' + esc(app.name) + ' 上容易让界面叠层发花。你可以直接点下面任一方案一键切换，完全不需要改任何配置文件：';

    var takeoverStepsHtml = state.showTakeoverSteps
      ? '<div class="ds-compat-steps-box">' +
          '<b>切换只需 2 步：</b><br/>' +
          '① 打开反重力的 <b>插件管理（Plugins）</b>，把 <b>' + esc(conflict.name) + '</b> 右侧开关暂时关掉；<br/>' +
          '② 回到这里点下方 <b>「重新检测」</b>，绿灯亮起后点 <b>「由梦境换肤接管」</b> 即可丝滑生效！<br/>' +
          '<div class="ds-toolbar" style="margin-top:8px">' +
            '<button class="ds-btn sm primary" data-action="recheck-conflict">🔄 我已关闭，重新检测</button>' +
            '<button class="ds-btn sm" data-action="force-takeover">我只用了它的动效，仍要强制叠加上肤</button>' +
          '</div>' +
        '</div>'
      : '';

    return '<div class="ds-compat-hub' + (peaceful ? ' peaceful' : '') + '">' +
      '<div class="ds-compat-head">' +
        '<div>' +
          '<div class="ds-compat-title">' + headTitle + '</div>' +
          '<div class="ds-compat-desc">' + headDesc + '</div>' +
        '</div>' +
        '<button class="ds-btn sm" data-action="recheck-conflict">🔄 重新检测状态</button>' +
      '</div>' +
      '<div class="ds-compat-options">' +
        '<div class="ds-compat-option' + (peaceful ? ' active-plan' : '') + '">' +
          '<div>' +
            '<div class="ds-compat-opt-title">🤝 方案 A · 和平共存（推荐保留原插件）</div>' +
            '<div class="ds-compat-opt-desc">' + esc(app.name) + ' 继续用 <b>' + esc(conflict.name) + '</b>，梦境换肤自动让位不干扰它，只帮你美化 Cherry / Codex / ZCode 等其他软件。</div>' +
          '</div>' +
          '<div>' +
            (peaceful
              ? '<span class="ds-status-pill ok">✓ 当前正是此方案</span>'
              : '<button class="ds-btn sm success" data-action="yield-to-conflict">一键设为和平共存</button>') +
          '</div>' +
        '</div>' +
        '<div class="ds-compat-option' + (!peaceful ? ' active-plan' : '') + '">' +
          '<div>' +
            '<div class="ds-compat-opt-title">✨ 方案 B · 改用梦境换肤 4.0 接管</div>' +
            '<div class="ds-compat-opt-desc">给 ' + esc(app.name) + ' 换上 MP4 视频壁纸、Steam 创意工坊动态背景与 6 层液态玻璃，随时可再切回 ' + esc(conflict.name) + '。</div>' +
          '</div>' +
          '<div class="ds-toolbar">' +
            '<button class="ds-btn sm primary" data-action="toggle-takeover-steps">' + (state.showTakeoverSteps ? '收起切换步骤' : '查看 2 步切换方法 →') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      takeoverStepsHtml +
    '</div>';
  }

  function renderModeSwitcher() {
    var isPrism = state.studioMode === 'prism';
    return '<div class="ds-mode-grid">' +
      '<button class="ds-mode-card' + (isPrism ? ' active' : '') + '" data-studio-mode="prism">' +
        '<div class="ds-mode-icon">✦</div>' +
        '<div class="ds-mode-body">' +
          '<div class="ds-mode-title">模式一 · Prism 液态玻璃与动态壁纸 <span class="ds-mode-tag">推荐</span></div>' +
          '<div class="ds-mode-desc">支持本地图片、MP4 动态视频、Steam 创意工坊与网页壁纸，实时调通透度与 8 套明暗配色。</div>' +
        '</div>' +
      '</button>' +
      '<button class="ds-mode-card' + (!isPrism ? ' active' : '') + '" data-studio-mode="classic">' +
        '<div class="ds-mode-icon">🎨</div>' +
        '<div class="ds-mode-body">' +
          '<div class="ds-mode-title">模式二 · 梦境经典主题库 <span class="ds-mode-tag classic">兼容 3.0</span></div>' +
          '<div class="ds-mode-desc">直接逛 dreamskin.cc 在线精选社区主题，或导入你以前收藏的 .dsskin 老皮肤包，点一下即换。</div>' +
        '</div>' +
      '</button>' +
    '</div>';
  }

  function renderPreviewAndControls(app, cfg) {
    var activeItem = activeWallpaperOf(cfg);
    var thumbUrl = activeItem ? (activeItem.thumbUrl || (activeItem.kind === 'image' ? activeItem.mediaUrl : '')) : '';
    var wallTitle = activeItem ? (activeItem.title || activeItem.id) : '默认极光曜石画布（点下方壁纸即可更换）';
    var wallKind = activeItem ? (activeItem.kind === 'video' ? '动态视频' : activeItem.kind === 'scene' ? 'Steam 场景' : activeItem.kind === 'web' ? '互动网页' : '高清壁纸') : '默认背景';
    var glassPct = Math.round((Number(cfg.glassOpacity != null ? cfg.glassOpacity : 0.76)) * 100);
    var scrimPct = Math.round((Number(cfg.scrimOpacity != null ? cfg.scrimOpacity : 0.26)) * 100);
    var sch = schemeInfoOf(cfg.colorScheme);
    var gAlpha = Math.max(0.28, Math.min(0.96, glassPct / 100));
    var sAlpha = Math.max(0, Math.min(0.88, scrimPct / 100));
    var blurPx = cfg.glassSurfaces === false ? 0 : Math.min(20, Number(cfg.glassBlur != null ? cfg.glassBlur : 16));
    var bgBlurPx = Number(cfg.mediaBlur || 0);
    var isFlush = cfg.layoutMode === 'flush';

    var bgStyle = thumbUrl
      ? 'background-image:url(\'' + esc(thumbUrl).replace(/'/g, '%27') + '\');filter:blur(' + Math.round(bgBlurPx * 0.4) + 'px);transform:scale(' + (bgBlurPx > 0 ? '1.05' : '1') + ');'
      : '';
    var paneStyle = 'background:rgba(' + sch.panelBg + ', ' + gAlpha.toFixed(2) + ');backdrop-filter:blur(' + Math.round(blurPx * 0.65) + 'px);';
    var sideStyle = 'background:rgba(' + sch.panelBg + ', ' + Math.min(0.96, gAlpha + 0.06).toFixed(2) + ');backdrop-filter:blur(' + Math.round(blurPx * 0.65) + 'px);';
    var codeBg = cfg.codeReadabilityMode === 'solid'
      ? 'rgba(' + sch.panelBg + ', 0.96)'
      : cfg.codeReadabilityMode === 'frosted'
        ? 'rgba(' + sch.panelBg + ', 0.82)'
        : 'rgba(255, 255, 255, 0.05)';

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

    var glassSliderPct = Math.round(((glassPct - 35) / (96 - 35)) * 100);
    var scrimSliderPct = Math.round((scrimPct / 85) * 100);

    return '<div class="ds-hero-grid">' +
      '<div class="ds-stage-wrap">' +
        '<div class="ds-stage-bg" style="' + bgStyle + '"></div>' +
        '<div class="ds-stage-scrim" id="ds-preview-scrim" style="background:rgba(6, 9, 18, ' + sAlpha.toFixed(2) + ')"></div>' +
        '<div class="ds-stage-mock-wrap">' +
          '<div class="ds-mock-window' + (isFlush ? ' flush' : '') + '">' +
            '<div class="ds-mock-bar" style="' + sideStyle + '">' +
              '<div class="ds-mock-dots"><i></i><i></i><i></i></div>' +
              '<span>' + esc(app.name) + ' · 实时效果预览</span>' +
              '<span style="opacity:0.6">' + (isFlush ? '紧凑一体' : '浮岛玻璃') + '</span>' +
            '</div>' +
            '<div class="ds-mock-body">' +
              '<div class="ds-mock-side" id="ds-preview-side" style="' + sideStyle + '">' +
                '<div class="ds-mock-line accent"></div>' +
                '<div class="ds-mock-line med"></div>' +
                '<div class="ds-mock-line short"></div>' +
                '<div class="ds-mock-line med"></div>' +
              '</div>' +
              '<div class="ds-mock-pane" id="ds-preview-pane" style="' + paneStyle + '">' +
                '<div class="ds-mock-line accent" style="width:42%"></div>' +
                '<div class="ds-mock-line med"></div>' +
                '<div class="ds-mock-code-card" style="background:' + codeBg + '">' +
                  '<div class="ds-mock-line" style="width:82%"></div>' +
                  '<div class="ds-mock-line short"></div>' +
                  '<div class="ds-mock-line med"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ds-stage-foot">' +
          '<div class="ds-stage-wall-info">' +
            '<span class="ds-stage-live-tag">' + esc(wallKind) + '</span>' +
            '<span class="ds-stage-wall-name" title="' + esc(wallTitle) + '">' + esc(wallTitle) + '</span>' +
          '</div>' +
          '<div class="ds-toolbar" style="gap:6px">' +
            '<button class="ds-btn sm" data-action="step-next">换一张</button>' +
            '<button class="ds-btn sm" data-action="upload-file">+ 导入</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="ds-section">' +
        '<div class="ds-sec-title"><span>一键风格场景</span><span class="ds-muted">拖动下方滑块时左侧预览实时变</span></div>' +
        '<div class="ds-scene-grid">' + scenesHtml + '</div>' +
        '<div class="ds-sliders-stack">' +
          '<div class="ds-slider-box">' +
            '<div class="ds-slider-head"><span>玻璃不透明度（越低越通透）</span><span class="ds-slider-val" id="val-glass">' + glassPct + '%</span></div>' +
            '<input class="ds-range" type="range" min="35" max="96" value="' + glassPct + '" style="--pct:' + glassSliderPct + '%" data-slider="glassOpacity" />' +
          '</div>' +
          '<div class="ds-slider-box">' +
            '<div class="ds-slider-head"><span>背景压暗护眼（字更清楚）</span><span class="ds-slider-val" id="val-scrim">' + scrimPct + '%</span></div>' +
            '<input class="ds-range" type="range" min="0" max="85" value="' + scrimPct + '" style="--pct:' + scrimSliderPct + '%" data-slider="scrimOpacity" />' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="ds-muted" style="margin-bottom:7px">配色氛围（点击立即预览）</div>' +
          '<div class="ds-scheme-dots">' + schemesHtml + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderClassicModePanel() {
    var galleryBody = '';
    if (state.galleryLoading) {
      galleryBody = '<div class="ds-muted" style="padding:14px 0">正在连接 dreamskin.cc 在线精选主题库…</div>';
    } else if (state.galleryError) {
      galleryBody = '<div class="ds-banner warn"><div class="ds-banner-text">在线主题库暂时连不上（' + esc(state.galleryError) + '），你可以重试，或者直接导入本地的 .dsskin 皮肤包。</div><button class="ds-btn sm" data-action="reload-gallery">重新加载</button></div>';
    } else if (!state.galleryItems.length) {
      galleryBody = '<div class="ds-muted" style="padding:14px 0">没有搜到匹配的在线主题，换个关键词试试，或点右上角导入本地 .dsskin 包。</div>';
    } else {
      galleryBody = '<div class="ds-wall-grid">' + state.galleryItems.map(function (it) {
        var id = String(it.key || '').replace(/^ds-/, '');
        return '<div class="ds-wall-card" data-gallery-download="' + esc(id) + '">' +
          '<div class="ds-wall-thumb">' + (it.thumb ? '<img src="' + esc(it.thumb) + '" loading="lazy" alt="" />' : '在线主题') + '<span class="ds-wall-badge">一键下载套用</span></div>' +
          '<div class="ds-wall-meta"><div class="ds-wall-title">' + esc(it.name) + '</div><div class="ds-muted">' + esc(it.author || '梦境社区作品') + '</div></div>' +
        '</div>';
      }).join('') + '</div>';
    }

    return '<div class="ds-section">' +
      '<div class="ds-sec-title">' +
        '<span>🎨 梦境经典主题库（dreamskin.cc & 旧版 .dsskin）</span>' +
        '<div class="ds-toolbar">' +
          '<button class="ds-btn sm primary" data-action="import-dsskin">导入本地 .dsskin 皮肤包</button>' +
          '<button class="ds-btn sm" data-action="reload-gallery">刷新社区主题</button>' +
        '</div>' +
      '</div>' +
      '<div class="ds-muted">这里保留了梦境换肤 3.0 时代全部精选社区主题与旧皮肤包导入：点任意主题卡片会自动下载、加入壁纸库并立刻套用到当前软件。</div>' +
      '<div class="ds-toolbar">' +
        '<input class="ds-input" id="ds-search" placeholder="输入关键词搜索在线主题，按回车搜…" value="' + esc(state.searchQuery) + '" />' +
        '<button class="ds-btn sm" data-action="reload-gallery">搜索</button>' +
      '</div>' +
      galleryBody +
    '</div>';
  }

  function renderPrismLibraryPanel(cfg) {
    var list = filteredLibrary();
    var wallGridHtml = '';
    if (!list.length) {
      wallGridHtml = '<div class="ds-muted" style="padding:14px 0">暂无匹配的壁纸。你可以点击右上角「导入图片 / 视频」，或直接把电脑里的图片 / MP4 拖进这个窗口！</div>';
    } else {
      wallGridHtml = '<div class="ds-wall-grid">' + list.slice(0, 60).map(function (it) {
        var isSel = cfg.activeWallpaperId === it.id;
        var kindLabel = it.kind === 'video' ? '视频' : it.kind === 'scene' ? 'Steam场景' : it.kind === 'web' ? '互动网页' : '图片';
        var thumb = it.thumbUrl || (it.kind === 'image' ? it.mediaUrl : '');
        return '<div class="ds-wall-card' + (isSel ? ' active' : '') + '" data-pick-wall="' + esc(it.id) + '">' +
          '<div class="ds-wall-thumb">' +
            (thumb ? '<img src="' + esc(thumb) + '" loading="lazy" alt="" />' : kindLabel) +
            (isSel ? '<span class="ds-wall-active-badge">✓ 使用中</span>' : '') +
            '<span class="ds-wall-badge">' + kindLabel + '</span>' +
          '</div>' +
          '<div class="ds-wall-meta"><div class="ds-wall-title">' + esc(it.title || it.id) + '</div></div>' +
        '</div>';
      }).join('') + '</div>';
    }

    return '<div class="ds-section">' +
      '<div class="ds-sec-title">' +
        '<span>🖼 壁纸与动态素材库（共 ' + (state.items ? state.items.length : 0) + ' 个 · 支持直接拖入图片或 MP4）</span>' +
        '<div class="ds-toolbar">' +
          '<button class="ds-btn sm primary" data-action="upload-file">+ 导入图片 / 视频</button>' +
          '<button class="ds-btn sm" data-action="scan-lib">扫描 Steam 创意工坊</button>' +
        '</div>' +
      '</div>' +
      '<div class="ds-toolbar">' +
        '<div class="ds-chips">' +
          '<button class="ds-chip' + (state.libSource === 'all' ? ' active' : '') + '" data-lib-src="all">全部素材</button>' +
          '<button class="ds-chip' + (state.libSource === 'local' ? ' active' : '') + '" data-lib-src="local">本地与 3.0 迁移</button>' +
          '<button class="ds-chip' + (state.libSource === 'workshop' ? ' active' : '') + '" data-lib-src="workshop">Steam Wallpaper Engine</button>' +
        '</div>' +
        '<input class="ds-input" id="ds-search" placeholder="搜索壁纸名称…" value="' + esc(state.searchQuery) + '" />' +
      '</div>' +
      wallGridHtml +
    '</div>';
  }

  function renderHome(app, cfg) {
    var banners = '';
    if (app.canary && app.canary.state === 'tripped') {
      banners += '<div class="ds-banner warn"><div class="ds-banner-text">🛡 <b>' + esc(app.name) + '</b> 上次启动未完成健康检测，已自动进入保护模式以免白屏。</div><button class="ds-btn primary sm" data-action="reset-canary">解除保护并重试</button></div>';
    }
    if (state.shortcutInfo && state.shortcutInfo.supported && !state.shortcutInfo.normalShortcutEnabled && !isPeacefulYield(app, cfg)) {
      banners += '<div class="ds-banner accent"><div class="ds-banner-text">✨ 开启「原图标自动换肤」后，以后你平时点桌面/开始菜单里的 <b>' + esc(app.name) + '</b> 就会自动带皮肤（无损修改，随时可一键还原）</div><button class="ds-btn primary sm" data-action="enable-shortcut">一键开启</button></div>';
    }

    var g = state.v4Store.global || {};
    var focusFreeze = g.focusFreezeEnabled !== false;
    var pauseBatt = g.pauseOnBattery !== false;

    return renderOnboardingGuide() +
      renderCompatHub(app, cfg) +
      banners +
      renderModeSwitcher() +
      renderPreviewAndControls(app, cfg) +
      (state.studioMode === 'prism' ? renderPrismLibraryPanel(cfg) : renderClassicModePanel()) +
      '<details class="prism-adv-drawer"' + (state.advOpen ? ' open' : '') + '>' +
        '<summary><span>⚙ 进阶微调（布局形态、明暗跟随、代码护眼底板、智能省电）</span><span class="ds-muted">' + (state.advOpen ? '收起 ▲' : '展开 ▼') + '</span></summary>' +
        '<div class="ds-adv-body">' +
          '<div class="ds-toolbar">' +
            '<span class="ds-muted">面板形态：</span>' +
            '<button class="ds-chip' + ((cfg.layoutMode || 'islands') === 'islands' ? ' active' : '') + '" data-layout="islands">浮岛圆角</button>' +
            '<button class="ds-chip' + (cfg.layoutMode === 'flush' ? ' active' : '') + '" data-layout="flush">紧凑一体</button>' +
            '<span class="ds-muted" style="margin-left:10px">明暗模式：</span>' +
            '<button class="ds-chip' + ((cfg.themeMode || 'auto') === 'auto' ? ' active' : '') + '" data-theme-mode="auto">跟随软件</button>' +
            '<button class="ds-chip' + (cfg.themeMode === 'dark' ? ' active' : '') + '" data-theme-mode="dark">深色</button>' +
            '<button class="ds-chip' + (cfg.themeMode === 'light' ? ' active' : '') + '" data-theme-mode="light">浅色</button>' +
          '</div>' +
          '<div class="ds-toolbar">' +
            '<span class="ds-muted">文字/代码区底板：</span>' +
            '<button class="ds-chip' + ((cfg.codeReadabilityMode || 'translucent') === 'translucent' ? ' active' : '') + '" data-code-mode="translucent">通透玻璃</button>' +
            '<button class="ds-chip' + (cfg.codeReadabilityMode === 'frosted' ? ' active' : '') + '" data-code-mode="frosted">磨砂护眼</button>' +
            '<button class="ds-chip' + (cfg.codeReadabilityMode === 'solid' ? ' active' : '') + '" data-code-mode="solid">实底最清晰</button>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>多窗口智能省电（只让正在用的软件动，后台窗口自动定格）</span>' +
            '<label class="ds-switch"><input type="checkbox" data-global-toggle="focusFreezeEnabled"' + (focusFreeze ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toggle-row">' +
            '<span>笔记本使用电池时自动定格动态壁纸</span>' +
            '<label class="ds-switch"><input type="checkbox" data-global-toggle="pauseOnBattery"' + (pauseBatt ? ' checked' : '') + ' /><span class="ds-switch-track"></span></label>' +
          '</div>' +
          '<div class="ds-toolbar">' +
            '<button class="ds-btn sm" data-action="import-dsskin">导入旧版 .dsskin 皮肤包</button>' +
            '<button class="ds-btn sm" data-action="disable-shortcut">还原当前软件原图标参数</button>' +
          '</div>' +
        '</div>' +
      '</details>';
  }

  function renderAppsTab() {
    var rows = state.apps.map(function (a) {
      var vis = APP_VISUALS[a.id] || { glyph: a.name.slice(0, 1).toUpperCase(), bg: 'linear-gradient(135deg, #64748b, #475569)' };
      var hasConf = hasPluginConflict(a);
      return '<div class="ds-banner">' +
        '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:180px">' +
          '<div class="ds-app-avatar" style="background:' + vis.bg + '">' + esc(vis.glyph) + '</div>' +
          '<div>' +
            '<div><b>' + esc(a.name) + '</b> <span class="ds-muted">· ' + esc(appStatusText(a)) + '</span></div>' +
            (hasConf ? '<div class="ds-muted" style="color:#fcd34d;margin-top:2px">检测到 ' + esc(a.pluginConflicts[0].name) + '，可在首页自由切换「和平共存」或「梦境接管」</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ds-toolbar">' +
          '<button class="ds-btn sm primary" data-app-apply="' + esc(a.id) + '">立即应用</button>' +
          '<button class="ds-btn sm danger" data-app-restore="' + esc(a.id) + '">还原原貌</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="ds-section">' +
      '<div class="ds-sec-title"><span>全部支持软件总览（共 ' + state.apps.length + ' 款）</span><button class="ds-btn sm" data-action="refresh-apps">🔄 刷新检测状态</button></div>' +
      rows +
    '</div>' +
    '<div class="ds-section">' +
      '<div class="ds-sec-title"><span>🛡 快捷键与安全撤回</span></div>' +
      '<div class="ds-muted" style="line-height:1.7">' +
        '• 在任意已换肤的软件窗口里，按 <b>Ctrl + Alt + W</b> 可直接呼出悬浮快捷调节窗；<br/>' +
        '• 万一觉得字看不清或界面不对劲，连按 <b>4 下 Esc</b>（或按 <b>Ctrl + Alt + Shift + R</b>），立刻清空皮肤、恢复软件原本样子；<br/>' +
        '• 梦境换肤 4.0 绝不修改任何软件的安装文件，所有美化均可随时无痕撤回。' +
      '</div>' +
      '<div class="ds-toolbar">' +
        '<button class="ds-btn sm" data-action="disable-shortcut">还原当前软件原图标默认参数</button>' +
        '<button class="ds-btn sm danger" data-action="restore-all">一键还原全部软件</button>' +
      '</div>' +
    '</div>';
  }

  function renderAppRow(a, curId) {
    var act = a.id === curId ? ' active' : '';
    var uninst = (!a.installed && a.id !== 'antigravity') ? ' uninstalled' : '';
    var vis = APP_VISUALS[a.id] || { glyph: a.name.slice(0, 1).toUpperCase(), bg: 'linear-gradient(135deg, #64748b, #475569)' };
    return '<button class="ds-app-row' + act + uninst + '" data-app-id="' + esc(a.id) + '">' +
      '<span class="ds-app-avatar" style="background:' + vis.bg + '">' + esc(vis.glyph) + '</span>' +
      '<span class="ds-app-info">' +
        '<span class="ds-app-name-line">' + esc(a.name) + '</span>' +
        '<span class="ds-app-sub-line"><span class="ds-dot ' + dotClass(a) + '"></span>' + esc(appStatusText(a)) + '</span>' +
      '</span>' +
    '</button>';
  }

  function render() {
    var root = document.getElementById('app');
    if (!root) return;
    var app = currentApp();
    var cfg = currentConfig();
    applyAmbientAccent(cfg);

    var installedApps = state.apps.filter(function (a) { return a.installed || a.id === 'antigravity'; });
    var otherApps = state.apps.filter(function (a) { return !a.installed && a.id !== 'antigravity'; });

    var iconUri = window.__PRISM_ICON_URI__ || '';
    var brandIconHtml = iconUri
      ? '<img class="ds-brand-icon" src="' + iconUri + '" alt="梦境换肤" />'
      : '<div class="ds-app-avatar" style="width:38px;height:38px;background:linear-gradient(135deg,#5ce1e6,#68a4ff,#a78bfa)">◆</div>';

    var appListHtml = '<div class="ds-nav-group-label"><span>本机软件（' + installedApps.length + '）</span></div>' +
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
              '<div class="ds-brand-title">梦境换肤 <span class="ds-ver-badge">PRISM ' + esc(state.version) + '</span></div>' +
              '<div class="ds-brand-sub">多软件动态壁纸与液态玻璃</div>' +
            '</div>' +
          '</div>' +
          '<div class="ds-apps-scroll">' + appListHtml + '</div>' +
          '<div class="ds-sidebar-foot">' +
            '<button class="ds-btn primary" data-action="sync-all">✨ 同步外观到全部软件</button>' +
            '<button class="ds-btn danger" data-action="restore-cur">还原当前软件</button>' +
          '</div>' +
        '</aside>' +

        '<main class="ds-main">' +
          '<header class="ds-header">' +
            '<div class="ds-header-left">' +
              '<span class="ds-cur-title">' + esc(app.name) + '</span>' +
              '<span class="ds-status-pill ' + statusPillClass(app) + '"><span class="ds-dot ' + dotClass(app) + '"></span>' + esc(appStatusText(app)) + '</span>' +
            '</div>' +
            '<div class="ds-header-right">' +
              '<label class="ds-switch" title="开启或暂停对此软件的换肤">' +
                '<input type="checkbox" id="ds-app-enabled-toggle"' + (cfg.skinEnabled !== false ? ' checked' : '') + ' />' +
                '<span class="ds-switch-track"></span>' +
                '<span>' + (cfg.skinEnabled !== false ? '换肤开启' : '已暂停') + '</span>' +
              '</label>' +
              '<button class="ds-btn primary sm" data-action="apply-cur">✦ 应用到软件</button>' +
              '<div class="ds-tabs">' +
                '<button class="ds-tab' + (state.activeTab === 'home' ? ' active' : '') + '" data-tab="home">外观设计</button>' +
                '<button class="ds-tab' + (state.activeTab === 'apps' ? ' active' : '') + '" data-tab="apps">软件与安全</button>' +
              '</div>' +
              '<button class="ds-btn sm ghost" data-action="toggle-guide" title="查看新手上手引导">? 引导</button>' +
            '</div>' +
          '</header>' +
          '<section class="ds-body">' +
            (state.activeTab === 'home' ? renderHome(app, cfg) : renderAppsTab()) +
          '</section>' +
        '</main>' +
      '</div>' +
      '<div class="ds-drop-overlay' + (state.draggingOver ? ' show' : '') + '" id="ds-drop-overlay">' +
        '<div class="ds-drop-box"><b>松开鼠标，立即导入到壁纸库</b><span>支持 PNG / JPG / WebP / MP4 / WebM 动态壁纸，以及旧版 .dsskin 皮肤包</span></div>' +
      '</div>' +
      '<input type="file" id="ds-file-input" style="display:none" accept="image/*,video/mp4,video/webm,.mov" />' +
      '<input type="file" id="ds-dsskin-input" style="display:none" accept=".dsskin,application/json" />';

    bindEvents(root);
    renderToastOnly();
  }

  function bindEvents(root) {
    root.querySelectorAll('[data-app-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedAppId = btn.getAttribute('data-app-id');
        state.showTakeoverSteps = false;
        render();
        loadShortcutStatus();
      });
    });

    root.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.getAttribute('data-tab');
        render();
      });
    });

    root.querySelectorAll('[data-studio-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nextMode = btn.getAttribute('data-studio-mode');
        state.studioMode = nextMode;
        if (nextMode === 'classic' && !state.galleryItems.length && !state.galleryLoading) {
          loadGallery();
        } else {
          render();
        }
      });
    });

    var appEnabledToggle = root.querySelector('#ds-app-enabled-toggle');
    if (appEnabledToggle) {
      appEnabledToggle.addEventListener('change', function () {
        var on = appEnabledToggle.checked;
        if (!on) {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/restore', { method: 'POST', body: {} }).then(function () {
            showToast('已暂停 ' + currentApp().name + ' 的换肤（已还原为原貌）');
            loadState();
          });
        } else {
          patchCurrentAppConfig({ skinEnabled: true }, true).then(function () { loadState(); });
        }
      });
    }

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
        var lbl = document.getElementById(key === 'glassOpacity' ? 'val-glass' : 'val-scrim');
        if (lbl) lbl.textContent = val + '%';
        var gEl = root.querySelector('input[data-slider="glassOpacity"]');
        var sEl = root.querySelector('input[data-slider="scrimOpacity"]');
        updateLivePreviewDom(gEl ? Number(gEl.value) : 76, sEl ? Number(sEl.value) : 26);
      });
      el.addEventListener('change', function () {
        var key = el.getAttribute('data-slider');
        var patch = {};
        patch[key] = Math.round(Number(el.value)) / 100;
        patchCurrentAppConfig(patch, true);
      });
    });

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
        var wid = card.getAttribute('data-pick-wall');
        patchCurrentAppConfig({ activeWallpaperId: wid, wallpaperId: wid, skinEnabled: true }, true);
      });
    });

    root.querySelectorAll('[data-gallery-download]').forEach(function (card) {
      card.addEventListener('click', function () {
        var gid = card.getAttribute('data-gallery-download');
        showToast('正在下载在线主题…');
        apiJson('/api/gallery/download', { method: 'POST', body: { id: gid } }).then(function (r) {
          showToast('主题下载完成，正在为你应用…');
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
      adv.addEventListener('toggle', function () {
        state.advOpen = adv.open;
      });
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
    root.querySelectorAll('[data-global-toggle]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var p = {};
        p[cb.getAttribute('data-global-toggle')] = cb.checked;
        patchGlobalConfig(p);
      });
    });

    root.querySelectorAll('[data-app-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        applyAppNow(b.getAttribute('data-app-apply'), { force: false });
      });
    });
    root.querySelectorAll('[data-app-restore]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-app-restore');
        apiJson('/api/apps/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: {} }).then(function () {
          showToast('已还原软件原貌');
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
        else if (act === 'hide-guide') {
          state.showGuide = false;
          saveGuidePref(false);
          render();
        } else if (act === 'toggle-guide') {
          state.showGuide = !state.showGuide;
          saveGuidePref(state.showGuide);
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
            showToast('已切换为和平共存：' + currentApp().name + ' 交给 Obsidian Prism，梦境继续守护你的其他软件');
            loadState();
          });
        } else if (act === 'recheck-conflict') {
          showToast('正在重新检测插件状态…');
          apiJson('/api/apps/refresh', { method: 'POST', body: {} }).then(function () {
            loadState().then(function () {
              var a = currentApp();
              if (!hasPluginConflict(a)) {
                showToast('太棒了！未检测到冲突，现在可以直接点「应用到软件」生效');
              } else {
                showToast('检测到 ' + a.pluginConflicts[0].name + ' 仍处于开启状态');
              }
            });
          });
        } else if (act === 'force-takeover') {
          applyAppNow(state.selectedAppId, { force: true });
        } else if (act === 'apply-cur') {
          applyAppNow(state.selectedAppId, { force: false });
        } else if (act === 'reload-gallery') {
          loadGallery();
        } else if (act === 'scan-lib') {
          showToast('正在扫描 Steam 创意工坊与本地壁纸…');
          apiJson('/api/library/scan', { method: 'POST', body: {} }).then(function () { showToast('扫描完成'); loadState(); });
        } else if (act === 'refresh-apps') {
          showToast('正在刷新本机软件状态…');
          apiJson('/api/apps/refresh', { method: 'POST', body: {} }).then(function () { showToast('软件状态已更新'); loadState(); });
        } else if (act === 'sync-all') {
          apiJson('/api/sync', { method: 'POST', body: { from: state.selectedAppId } }).then(function (r) {
            showToast('已同步外观到其他 ' + (r.syncedApps ? r.syncedApps.length : 0) + ' 个软件');
            loadState();
          });
        } else if (act === 'restore-cur') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/restore', { method: 'POST', body: {} }).then(function () {
            showToast('已还原 ' + currentApp().name);
            loadState();
          });
        } else if (act === 'restore-all') {
          apiJson('/api/restore-all', { method: 'POST', body: {} }).then(function () {
            showToast('已还原全部软件为原貌');
            loadState();
          });
        } else if (act === 'enable-shortcut') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/shortcuts/enable', { method: 'POST', body: {} }).then(function (r) {
            showToast(r.ok ? '开启成功！下次正常双击软件图标就会自动带皮肤' : '未能修改快捷方式');
            loadShortcutStatus();
          });
        } else if (act === 'disable-shortcut') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/shortcuts/disable', { method: 'POST', body: {} }).then(function () {
            showToast('已无损恢复原图标默认参数');
            loadShortcutStatus();
          });
        } else if (act === 'reset-canary') {
          apiJson('/api/apps/' + encodeURIComponent(state.selectedAppId) + '/wake', { method: 'POST', body: {} }).then(function () {
            showToast('已解除保护模式');
            loadState();
          });
        } else if (act === 'step-next') {
          apiJson('/api/playlists/step', { method: 'POST', body: { dir: 1 } }).then(function () {
            showToast('已切换到下一张壁纸');
            loadState();
          });
        }
      });
    });
  }

  // Global drag-and-drop import for images, videos, and legacy .dsskin files
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
