// Host Prism Skin & Wallpaper Stage Microkernel for Antigravity (agy-wallpaper-prism v2.0.0).
//
// Gentle Fail-Open ES2020 browser IIFE loaded post-hydration (`stage.js`) or in headless verification harnesses.
// Zero `Page.enable`/`Runtime.enable`, zero `app.asar` modifications, `z-index: -1` inert stage,
// strict Frame-1 Media-Ready Gate, and synchronous `2.34.0` `[data-browser-hole]` rounded GPU cutout.
//
// Exposes `window.__agyPrism = { version, applyPayload, updateConfig, destroy, extractAccent,
// stepSlideshow, setPaused, syncBrowserHoles, heal, status, receive }`.
(function agyPrismSkinKernelMain() {
  'use strict';

  var VERSION = '4.1.0';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document) return { installed: false, reason: 'no-window' };
  if (W.top && W !== W.top) return { installed: false, reason: 'subframe' };
  var doc = W.document;

  var API_KEY = '__agyPrism';
  var BINDING_KEY = '__agyPrismCall';
  var STAGE_ID = 'agy-prism-stage';
  var STYLE_ID = 'agy-prism-css';
  var ADAPTER_STYLE_ID = 'agy-prism-adapter-css';
  var STATIC_STYLE_ID = 'agy-prism-static-css';
  var CARET_STYLE_ID = 'agy-prism-caret-css';
  var FX_CANVAS_ID = 'agy-prism-fx-canvas';
  var COMPANION_ID = 'agy-prism-companion';
  var ROOT_ATTR = 'data-agy-prism-skin';
  var GLASS_ATTR = 'data-agy-prism-glass';
  var WALLPAPER_ATTR = 'data-agy-prism-wallpaper';
  var SKIN_MODE_ATTR = 'data-prism-skin-mode';
  var FACET_ATTR = 'data-prism-optical-facet';
  var MOTION_ATTR = 'data-prism-motion';
  var COMPANION_ATTR = 'data-prism-companion';
  var ACTIVE_HOLE_SEL = '[data-browser-hole]:not([data-browser-hole="false"])';

  // Preserve state or tear down an older kernel cleanly before mounting.
  var prev = W[API_KEY];
  var carryPayload = null;
  if (prev && typeof prev === 'object') {
    if (prev.version === VERSION && typeof prev.alive === 'function' && prev.alive()) {
      try {
        prev.heal();
      } catch (_) {}
      return prev.status();
    }
    try {
      if (typeof prev.getLastPayload === 'function') carryPayload = prev.getLastPayload();
    } catch (_) {}
    try {
      if (typeof prev.destroy === 'function') prev.destroy();
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 8 Paired Light & Dark Color Schemes (Obsidian Prism + Community Classics)
  // ---------------------------------------------------------------------------
  var COLOR_SCHEMES = {
    'prism-default': {
      dark: {
        pt: '255, 255, 255',
        shade: '9, 9, 11',
        base: '14, 14, 17',
        tint1: '20, 20, 24',
        tint2: '28, 28, 34',
        popover: '22, 22, 28',
        fg: '#F2F2F5',
        fg2: '#C4C4CE',
        muted: '#8A8A98',
        faint: '#626270',
        accent: '#669DF6',
        link: '#8AB4F8',
      },
      light: {
        pt: '15, 23, 42',
        shade: '232, 238, 246',
        base: '244, 247, 251',
        tint1: '255, 255, 255',
        tint2: '233, 239, 248',
        popover: '252, 253, 255',
        fg: '#0F172A',
        fg2: '#334155',
        muted: '#5B6B82',
        faint: '#7C8CA5',
        accent: '#2563EB',
        link: '#1D4ED8',
      },
    },
    'warm-carbon': {
      dark: {
        pt: '245, 240, 230',
        shade: '16, 16, 15',
        base: '20, 20, 19',
        tint1: '27, 26, 24',
        tint2: '34, 32, 29',
        popover: '25, 24, 22',
        fg: '#F2EFE9',
        fg2: '#CEC8BC',
        muted: '#A39E93',
        faint: '#6E6A61',
        accent: '#D97757',
        link: '#E59377',
      },
      light: {
        pt: '42, 32, 20',
        shade: '235, 230, 220',
        base: '246, 244, 238',
        tint1: '255, 253, 249',
        tint2: '239, 236, 227',
        popover: '253, 251, 247',
        fg: '#1C1814',
        fg2: '#3F3830',
        muted: '#6B6257',
        faint: '#8E8477',
        accent: '#C25934',
        link: '#B54D28',
      },
    },
    catppuccin: {
      dark: {
        pt: '205, 214, 244',
        shade: '24, 24, 37',
        base: '30, 30, 46',
        tint1: '49, 50, 68',
        tint2: '69, 71, 90',
        popover: '30, 30, 46',
        fg: '#CDD6F4',
        fg2: '#BAC2DE',
        muted: '#9399B2',
        faint: '#6C7086',
        accent: '#CBA6F7',
        link: '#89B4FA',
      },
      light: {
        pt: '76, 79, 105',
        shade: '230, 233, 239',
        base: '239, 241, 245',
        tint1: '252, 253, 255',
        tint2: '220, 224, 232',
        popover: '248, 249, 252',
        fg: '#4C4F69',
        fg2: '#5C5F77',
        muted: '#6C6F85',
        faint: '#8C8FA1',
        accent: '#8839EF',
        link: '#1E66F5',
      },
    },
    nord: {
      dark: {
        pt: '236, 239, 244',
        shade: '36, 41, 51',
        base: '46, 52, 64',
        tint1: '59, 66, 82',
        tint2: '67, 76, 94',
        popover: '46, 52, 64',
        fg: '#ECEFF4',
        fg2: '#D8DEE9',
        muted: '#9AA5B8',
        faint: '#7B88A1',
        accent: '#88C0D0',
        link: '#81A1C1',
      },
      light: {
        pt: '46, 52, 64',
        shade: '229, 233, 240',
        base: '236, 239, 244',
        tint1: '248, 250, 252',
        tint2: '216, 222, 233',
        popover: '250, 252, 254',
        fg: '#2E3440',
        fg2: '#3B4252',
        muted: '#5E6B80',
        faint: '#7B88A1',
        accent: '#5E81AC',
        link: '#4C6E99',
      },
    },
    'rose-pine': {
      dark: {
        pt: '224, 222, 244',
        shade: '25, 23, 36',
        base: '31, 29, 46',
        tint1: '38, 35, 58',
        tint2: '64, 61, 82',
        popover: '31, 29, 46',
        fg: '#E0DEF4',
        fg2: '#C8C4E2',
        muted: '#908CAA',
        faint: '#6E6A86',
        accent: '#C4A7E7',
        link: '#EBBCBA',
      },
      light: {
        pt: '87, 82, 121',
        shade: '242, 233, 225',
        base: '250, 244, 237',
        tint1: '255, 250, 243',
        tint2: '242, 233, 222',
        popover: '255, 251, 246',
        fg: '#575279',
        fg2: '#625D83',
        muted: '#797593',
        faint: '#9893A5',
        accent: '#907AA9',
        link: '#D7827E',
      },
    },
    'tokyo-night': {
      dark: {
        pt: '192, 202, 245',
        shade: '22, 22, 30',
        base: '26, 27, 38',
        tint1: '36, 40, 59',
        tint2: '47, 53, 73',
        popover: '26, 27, 38',
        fg: '#C0CAF5',
        fg2: '#A9B1D6',
        muted: '#787C99',
        faint: '#565F89',
        accent: '#7AA2F7',
        link: '#7DCFFF',
      },
      light: {
        pt: '52, 59, 88',
        shade: '213, 214, 219',
        base: '225, 226, 231',
        tint1: '242, 243, 247',
        tint2: '208, 210, 218',
        popover: '246, 247, 250',
        fg: '#343B58',
        fg2: '#404868',
        muted: '#6172B0',
        faint: '#848CB5',
        accent: '#2E7DE9',
        link: '#007197',
      },
    },
    gruvbox: {
      dark: {
        pt: '235, 219, 178',
        shade: '29, 32, 33',
        base: '40, 40, 40',
        tint1: '60, 56, 54',
        tint2: '80, 73, 69',
        popover: '40, 40, 40',
        fg: '#EBDBB2',
        fg2: '#D5C4A1',
        muted: '#A89984',
        faint: '#7C6F64',
        accent: '#FABD2F',
        link: '#83A598',
      },
      light: {
        pt: '60, 56, 54',
        shade: '235, 219, 178',
        base: '251, 241, 199',
        tint1: '249, 245, 215',
        tint2: '235, 219, 178',
        popover: '252, 248, 224',
        fg: '#3C3836',
        fg2: '#504945',
        muted: '#7C6F64',
        faint: '#928374',
        accent: '#B57614',
        link: '#076678',
      },
    },
    'host-native': {
      dark: {
        pt: '255, 255, 255',
        shade: '17, 17, 20',
        base: '7, 7, 8',
        tint1: '19, 19, 23',
        tint2: '28, 28, 34',
        popover: '20, 20, 26',
        fg: '#FFFFFF',
        fg2: '#BCBDC6',
        muted: '#87888F',
        faint: '#636470',
        accent: '#2F71E3',
        link: '#6A9FCB',
      },
      light: {
        pt: '15, 23, 42',
        shade: '238, 238, 241',
        base: '247, 247, 248',
        tint1: '255, 255, 255',
        tint2: '232, 233, 238',
        popover: '255, 255, 255',
        fg: '#1D1F21',
        fg2: '#3D4348',
        muted: '#5D676F',
        faint: '#8B949E',
        accent: '#0066CC',
        link: '#0055AA',
      },
    },
  };

  var ACCENT_PRESETS = {
    cobalt: { dark: '#669DF6', light: '#2563EB' },
    iris: { dark: '#A58AF8', light: '#7C3AED' },
    amber: { dark: '#F2B84B', light: '#D97706' },
    emerald: { dark: '#50A37B', light: '#059669' },
    rose: { dark: '#F472B6', light: '#DB2777' },
    mono: { dark: '#D4D7E0', light: '#334155' },
  };

  var GRAIN_SVG =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

  // Verified Antigravity 2.0 / 2.34.0 Hub + VS Code Workbench Selectors
  // Explicit exclusions protect sibling plugins and modal/menu/popover overlays.
  var SIBLING_EXCLUDE =
    ':not(#gemini-neko-pet-root):not(#gemini-neko-observer-modal):not(#gemini-neko-stats-bar):not(#ag-context-meter):not(#ag-usage-monitor-capsule):not(#ag-usage-monitor-portal):not(#deck-metrics-strip):not(#agy-prism-popover):not(#' +
    STAGE_ID +
    '):not(.settings-modal-backdrop):not(.settings-modal-container):not(.agy-dialog):not([role="dialog"]):not([role="alertdialog"]):not([role="menu"]):not([role="listbox"]):not([role="tooltip"])';

  var DIALOG_DESCENDANT_EXCLUDE =
    ':not(.settings-modal-backdrop *):not(.settings-modal-container *):not(.agy-dialog *):not([role="dialog"] *):not([role="alertdialog"] *):not([role="menu"] *):not([role="listbox"] *):not([data-radix-popper-content-wrapper] *):not(.agy-popover *):not(.quick-input-widget *)';

  var HOLLOW_SURFACES = [
    '#root',
    '#root > div' + SIBLING_EXCLUDE,
    '#root > div > div' + SIBLING_EXCLUDE,
    '#root > div > div > div' + SIBLING_EXCLUDE,
    '.agy-shell',
    '.agy-inset-shell',
    '.agy-sheet:not([data-browser-occluder])',
    '.browser-hole-ancestor',
    '.browser-hole-opaque' + SIBLING_EXCLUDE + DIALOG_DESCENDANT_EXCLUDE,
    '.agy-sheet[data-sheet-inset] [data-main-content-body]',
    '.agy-inset-shell [data-side-panel-body]',
    '.agy-inset-shell .agy-sheet[data-sheet-inset] [data-side-panel-strip]',
    '.agy-inset-shell .agy-sheet[data-sheet-inset] [data-main-content-header]',
    '[data-split-panes] .agy-sheet[data-sheet-inset] [data-tiling-pane]',
    '[data-split-panes] .agy-sheet[data-sheet-inset] [data-tiling-pane] > [data-pane-id]',
    '.agy-inset-shell > [data-split-root] > [data-split-sash]',
    'body[data-has-browser-hole="true"]',
    '.monaco-workbench',
    '.monaco-workbench .monaco-grid-view',
    '.monaco-workbench .monaco-split-view2 > .monaco-scrollable-element > .split-view-container > .split-view-view',
  ];

  // Glass chrome containers that MUST use `::before` as backdrop-filter carrier
  // so `position: fixed` descendants (Radix poppers, dropdowns, modals) are NEVER trapped!
  var GLASS_CARRIER_SIDEBARS = [
    '[data-testid="sidebar-split"] > div:first-child',
    '.agy-sidebar',
    '.monaco-workbench .part.activitybar',
    '.monaco-workbench .part.sidebar',
    '.monaco-workbench .part.auxiliarybar',
  ];

  var GLASS_CARRIER_COMPOSERS = [
    '[data-testid="agent-input-box"]',
    '#antigravity.agentSidePanelInputBox > .surface-composer-card',
    '.surface-composer-card',
    '.agy-composer',
  ];

  var SOLID_POPOVERS = [
    '.agy-dialog',
    '.settings-modal-container',
    '.agy-overlay',
    '.agy-popover',
    '.agy-menu',
    '.agy-toast',
    '[role="dialog"]:not(#gemini-neko-observer-modal)',
    '[role="menu"]',
    '[role="listbox"]',
    '[role="tooltip"]',
    '[data-radix-popper-content-wrapper] > *',
    '[data-testid="context-menu-popup"]',
    '[data-testid="context-menu-submenu-popup"]',
    '[data-testid="permissions-menu"]',
    '[data-testid="add-resource-menu"]',
    '[data-testid="toast-notification"]',
    '[class*="bg-popover"]:not([role="tooltip"])',
    '.quick-input-widget',
    '.monaco-hover',
    '.editor-widget.suggest-widget',
    '.parameter-hints-widget',
    '.context-view .monaco-menu-container',
  ];

  // ---------------------------------------------------------------------------
  // Utilities & Color Math
  // ---------------------------------------------------------------------------
  function clamp(v, lo, hi) {
    var n = Number(v);
    if (!Number.isFinite(n)) n = lo;
    return Math.min(hi, Math.max(lo, n));
  }
  function num(v, dflt) {
    var n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  }
  function bool(v, dflt) {
    return typeof v === 'boolean' ? v : dflt;
  }
  function normUnit(v, dflt, lo, hi) {
    var n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    if (n > 1 && hi <= 1) n = n / 100;
    return clamp(n, lo, hi);
  }
  function normFactor(v, dflt, lo, hi) {
    var n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    if (n > 2.5) n = n / 100;
    return clamp(n, lo, hi);
  }
  function parseRgbTriplet(str) {
    var m = String(str || '').match(/([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (!m) return [14, 14, 17];
    return [clamp(Math.round(Number(m[1])), 0, 255), clamp(Math.round(Number(m[2])), 0, 255), clamp(Math.round(Number(m[3])), 0, 255)];
  }
  function hexToRgb(hex) {
    var s = String(hex || '').trim().replace(/^#/, '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function rgbToHex(rgb) {
    return (
      '#' +
      [0, 1, 2]
        .map(function (i) {
          return ('0' + clamp(Math.round(rgb[i]), 0, 255).toString(16)).slice(-2);
        })
        .join('')
    );
  }
  function parseCssColor(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    var h = hexToRgb(s);
    if (h) return [h[0], h[1], h[2], 1];
    var m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i.exec(s);
    if (m) {
      var a = m[4] === undefined ? 1 : m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [Number(m[1]), Number(m[2]), Number(m[3]), clamp(a, 0, 1)];
    }
    return null;
  }
  function relLum(rgb) {
    var rs = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255].map(function (c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs[0] + 0.7152 * rs[1] + 0.0722 * rs[2];
  }
  function mixRgb(a, b, weightB) {
    var w = clamp(weightB, 0, 1);
    return [
      Math.round(a[0] * (1 - w) + b[0] * w),
      Math.round(a[1] * (1 - w) + b[1] * w),
      Math.round(a[2] * (1 - w) + b[2] * w),
    ];
  }
  function rgbaStr(rgb, alpha) {
    return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + clamp(alpha, 0, 1).toFixed(3) + ')';
  }
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    if (s === 0) {
      var gray = Math.round(l * 255);
      return [gray, gray, gray];
    }
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ];
  }

  // ---------------------------------------------------------------------------
  // Internal Runtime State
  // ---------------------------------------------------------------------------
  var destroyed = false;
  var lastPayload = null;
  var accentCache = {};
  var rpcSeq = 0;
  var rpcPending = {};

  var state = {
    skinEnabled: true,
    wallpaperReady: false,
    cfg: {},
    item: null,
    mediaOrigin: '',
    slides: [],
    slideIdx: 0,
    slideTimer: 0,
    hostTheme: 'dark',
    effectiveTheme: 'dark',
    autoPaused: false,
    pauseReason: '',
    batteryDischarging: false,
    hiddenDebounced: false,
    hiddenTimer: 0,
    blurPollTimer: 0,
    unmuteGestureCleanup: null,
    activeWrap: null,
    pendingWrap: null,
    pendingMediaTimer: 0,
    mediaMountSeq: 0,
    outgoingWraps: [],
    activeVideo: null,
    activeAudio: null,
    activeIframe: null,
    activeMediaKey: '',
    transitionTimer: 0,
    lastHostFocus: null,
    lastSidecarSig: '',
    lastStructuralSig: '',
    lastCaretSig: '',
    lastHoleClip: '',
    watchdog15Timer: 0,
    watchdog80Timer: 0,
    appliedVars: {},
    parallaxTargetX: 0,
    parallaxTargetY: 0,
    parallaxCurX: 0,
    parallaxCurY: 0,
    parallaxRaf: 0,
    fxParticles: [],
    fxRaf: 0,
    lastTrailAt: 0,
  };

  var domObs = null;
  var themeObs = null;
  var holeAttrObs = null;
  var holeSubObs = null;
  var holeResizeObs = null;
  var holeRaf = 0;
  var holeRafUntil = 0;
  var themeMq = null;
  var themeDebounce = 0;
  var batteryObj = null;
  var cleanups = [];

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
  // RPC Bridge (`__agyPrismCall`)
  // ---------------------------------------------------------------------------
  function callHostRpc(method, params) {
    var fn = W[BINDING_KEY];
    if (typeof fn !== 'function') return Promise.resolve(null);
    rpcSeq += 1;
    var id = 'skin-' + rpcSeq + '-' + Date.now().toString(36);
    var reqStr = JSON.stringify({ id: id, method: method, params: params || {} });
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        delete rpcPending[id];
        resolve(null);
      }, 5000);
      rpcPending[id] = function (res) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        delete rpcPending[id];
        resolve(res);
      };
      try {
        var direct = fn(reqStr);
        if (direct && typeof direct.then === 'function') {
          direct.then(
            function (val) {
              if (rpcPending[id]) rpcPending[id](val);
            },
            function () {
              if (rpcPending[id]) rpcPending[id](null);
            }
          );
        } else if (direct !== undefined) {
          if (rpcPending[id]) rpcPending[id](direct);
        }
      } catch (_) {
        if (rpcPending[id]) rpcPending[id](null);
      }
    });
  }

  function receive(msg) {
    if (destroyed) return false;
    try {
      if (typeof msg === 'string') msg = JSON.parse(msg);
    } catch (_) {
      return false;
    }
    if (!msg || typeof msg !== 'object') return false;
    if (msg.event === 'payload' || msg.event === 'skin') {
      applyPayload(msg.data || {});
      return true;
    }
    if (msg.id && rpcPending[msg.id]) {
      rpcPending[msg.id](msg.ok ? msg.result : null);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Host Theme Detection (`body.dark` / `body.light` / `--foreground` luminance)
  // ---------------------------------------------------------------------------
  function hasAnyClass(el, clsList) {
    if (!el || !el.classList) return false;
    for (var i = 0; i < clsList.length; i += 1) {
      if (el.classList.contains(clsList[i])) return true;
    }
    return false;
  }

  function detectHostTheme() {
    var root = doc.documentElement;
    var body = doc.body;
    var LIGHT = ['light', 'theme-light', 'light-theme', 'vscode-light', 'vscode-high-contrast-light'];
    var DARK = ['dark', 'theme-dark', 'dark-theme', 'vscode-dark', 'vscode-high-contrast'];
    if (hasAnyClass(body, LIGHT) || hasAnyClass(root, LIGHT)) return 'light';
    if (hasAnyClass(body, DARK) || hasAnyClass(root, DARK)) return 'dark';
    var dt = ((root && root.getAttribute('data-ag-cs-theme')) || (root && root.getAttribute('data-theme')) || (body && body.getAttribute('data-theme')) || '').toLowerCase();
    if (dt.indexOf('light') >= 0) return 'light';
    if (dt.indexOf('dark') >= 0) return 'dark';
    try {
      var target = body || root;
      var fgRaw = getComputedStyle(target).getPropertyValue('--foreground').trim() || getComputedStyle(target).color;
      var fg = parseCssColor(fgRaw);
      if (fg && fg[3] > 0.4) return relLum(fg) > 0.45 ? 'dark' : 'light';
    } catch (_) {}
    try {
      if (W.matchMedia && W.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    } catch (_) {}
    return 'dark';
  }

  function resolveEffectiveTheme(cfg) {
    var mode = String(cfg.themeMode || 'auto').toLowerCase();
    if (mode === 'light' || mode === 'dark') return mode;
    if (cfg.themeFollow && state.item && state.item.schemeColor) {
      var sc = parseCssColor(state.item.schemeColor);
      if (sc) return relLum(sc) > 0.42 ? 'light' : 'dark';
    }
    return state.hostTheme;
  }

  // ---------------------------------------------------------------------------
  // 32x32 Offscreen Chroma-Weighted Dynamic Wallpaper Accent Extractor
  // ---------------------------------------------------------------------------
  function extractAccentFromImageSource(imgEl, wallpaperId) {
    try {
      var canvas = doc.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(imgEl, 0, 0, 32, 32);
      var data = ctx.getImageData(0, 0, 32, 32).data;
      var buckets = [];
      for (var b = 0; b < 24; b += 1) buckets.push({ w: 0, hSin: 0, hCos: 0, sSum: 0 });

      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        var hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
        var h = hsl[0];
        var s = hsl[1];
        var l = hsl[2];
        if (l < 0.12 || l > 0.90 || s < 0.16) continue;
        var weight = s * Math.max(0.1, 1 - Math.abs(l - 0.5) * 1.4);
        var idx = Math.floor(h / 15) % 24;
        var rad = (h * Math.PI) / 180;
        buckets[idx].w += weight;
        buckets[idx].hSin += Math.sin(rad) * weight;
        buckets[idx].hCos += Math.cos(rad) * weight;
        buckets[idx].sSum += s * weight;
      }

      var best = null;
      for (var k = 0; k < 24; k += 1) {
        if (!best || buckets[k].w > best.w) best = buckets[k];
      }
      if (!best || best.w < 0.25) {
        return {
          wallpaperId: String(wallpaperId || ''),
          darkHex: '#669DF6',
          lightHex: '#2563EB',
          tintRgb: '102, 157, 246',
        };
      }
      var avgH = (Math.atan2(best.hSin, best.hCos) * 180) / Math.PI;
      if (avgH < 0) avgH += 360;
      var avgS = clamp(best.sSum / best.w, 0.52, 0.84);
      var darkRgb = hslToRgb(avgH, avgS, 0.68);
      var lightRgb = hslToRgb(avgH, clamp(avgS, 0.55, 0.82), 0.44);
      var tintRgb = hslToRgb(avgH, 0.45, 0.50);
      return {
        wallpaperId: String(wallpaperId || ''),
        darkHex: rgbToHex(darkRgb),
        lightHex: rgbToHex(lightRgb),
        tintRgb: tintRgb[0] + ', ' + tintRgb[1] + ', ' + tintRgb[2],
      };
    } catch (_) {
      return null;
    }
  }

  function extractAccent(urlOrElement, wallpaperId) {
    var wid = String(wallpaperId || (state.item && state.item.id) || '');
    if (wid && state.cfg && state.cfg.extractedAccent && state.cfg.extractedAccent.wallpaperId === wid && state.cfg.extractedAccent.darkHex) {
      accentCache[wid] = state.cfg.extractedAccent;
      return Promise.resolve(state.cfg.extractedAccent);
    }
    if (wid && accentCache[wid]) return Promise.resolve(accentCache[wid]);

    if (urlOrElement && typeof urlOrElement === 'object' && urlOrElement.tagName) {
      var resDirect = extractAccentFromImageSource(urlOrElement, wid);
      if (resDirect) {
        if (wid) accentCache[wid] = resDirect;
        callHostRpc('accent.save', resDirect);
      }
      return Promise.resolve(resDirect);
    }

    var srcUrl = String(urlOrElement || (state.item && (state.item.thumbUrl || state.item.mediaUrl)) || '').trim();
    if (!srcUrl) return Promise.resolve(null);

    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      var finish = function (val) {
        if (done) return;
        done = true;
        if (val) {
          if (wid) accentCache[wid] = val;
          callHostRpc('accent.save', val);
        }
        resolve(val);
      };
      var timer = setTimeout(function () {
        finish(null);
      }, 4000);
      img.onload = function () {
        clearTimeout(timer);
        finish(extractAccentFromImageSource(img, wid));
      };
      img.onerror = function () {
        clearTimeout(timer);
        finish(null);
      };
      img.src = srcUrl;
    });
  }

  // ---------------------------------------------------------------------------
  // Config Normalization & CSS Assembly (`#agy-prism-css` + `#agy-prism-caret-css`)
  // ---------------------------------------------------------------------------
  function normalizeConfig(rawCfg, item) {
    var base = rawCfg && typeof rawCfg === 'object' ? rawCfg : {};
    var wid = item && item.id ? String(item.id) : String(base.wallpaperId || '');
    var ovMap = base.perWallpaperOverrides && typeof base.perWallpaperOverrides === 'object' ? base.perWallpaperOverrides : null;
    var ov = wid && ovMap && ovMap[wid] && typeof ovMap[wid] === 'object' ? ovMap[wid] : null;
    var c = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) c[k] = base[k];
    if (ov) {
      for (k in ov) if (Object.prototype.hasOwnProperty.call(ov, k) && ov[k] !== undefined) c[k] = ov[k];
    }

    var schemeKey = String(c.colorScheme || 'prism-default').toLowerCase();
    if (!COLOR_SCHEMES[schemeKey]) schemeKey = 'prism-default';

    var corners = String(c.cornerStyle || 'balanced').toLowerCase();
    if (corners !== 'sharp' && corners !== 'soft') corners = 'balanced';

    var borders = String(c.borders != null ? c.borders : 'on').toLowerCase();
    if (typeof c.borders === 'number') {
      borders = c.borders <= 0.02 ? 'off' : c.borders < 0.25 ? 'subtle' : 'on';
    } else if (borders !== 'off' && borders !== 'subtle') {
      borders = 'on';
    }

    var codeMode = String(c.codeReadabilityMode || (c.thinkingNative ? 'solid' : c.thinkingGlass ? 'frosted' : 'translucent')).toLowerCase();
    if (codeMode === 'native') codeMode = 'solid';
    if (codeMode !== 'frosted' && codeMode !== 'solid') codeMode = 'translucent';

    var fit = String(c.fit || c.objectFit || 'cover').toLowerCase();
    if (fit !== 'contain' && fit !== 'fill' && fit !== 'center') fit = 'cover';

    var trans = String(c.switchTransition || 'fade').toLowerCase();
    if (['cut', 'fade', 'push', 'wipe', 'iris', 'zoom', 'bars'].indexOf(trans) < 0) trans = 'fade';

    var transDir = String(c.switchTransitionDir || 'left').toLowerCase();
    if (['left', 'right', 'up', 'down'].indexOf(transDir) < 0) transDir = 'left';

    var transSpeed = String(c.switchTransitionSpeed || 'normal').toLowerCase();
    if (transSpeed !== 'fast' && transSpeed !== 'slow') transSpeed = 'normal';

    var extAcc = null;
    if (c.extractedAccent && typeof c.extractedAccent === 'object' && c.extractedAccent.darkHex) {
      if (!wid || !c.extractedAccent.wallpaperId || String(c.extractedAccent.wallpaperId) === wid) {
        extAcc = c.extractedAccent;
      }
    }
    if (!extAcc && wid && c.accentCache && typeof c.accentCache === 'object' && c.accentCache[wid] && c.accentCache[wid].darkHex) {
      extAcc = c.accentCache[wid];
    }
    if (!extAcc && wid && accentCache[wid]) {
      extAcc = accentCache[wid];
    }
    if (extAcc && wid) {
      accentCache[wid] = extAcc;
    }

    return {
      wallpaperId: wid,
      layoutMode: c.layoutMode === 'flush' ? 'flush' : 'islands',
      islandGap: clamp(num(c.islandGap, 8), 0, 20),
      workspacePad: clamp(num(c.workspacePad, 8), 0, 20),
      cornerStyle: corners,
      leftCornerRadius: String(c.leftSidebarRadius || c.leftSidebarCornerRadius || 'auto'),
      rightCornerRadius: String(c.rightSidebarRadius || c.rightSidebarCornerRadius || 'auto'),
      borders: borders,
      shadows: bool(c.shadows, true),
      themeMode: String(c.themeMode || 'auto').toLowerCase(),
      themeFollow: bool(c.themeFollow, false),
      colorScheme: schemeKey,
      accentMode: String(c.accentMode || 'dynamic').toLowerCase(),
      customAccent: String(c.customAccent || c.accent || '#669DF6'),
      extractedAccent: extAcc,
      wallTintMix: normUnit(c.wallTintMix != null ? c.wallTintMix : 0.06, 0.06, 0, 0.22),
      glassSurfaces: bool(c.glassSurfaces != null ? c.glassSurfaces : c.glassEnabled, true),
      glassOpacity: normUnit(c.glassOpacity != null ? c.glassOpacity : c.widgetFill != null ? c.widgetFill : 0.76, 0.76, 0.25, 0.98),
      glassBlur: clamp(num(c.glassBlur != null ? c.glassBlur : c.blur, 16), 0, 48),
      glassFidelity: normUnit(c.glassFidelity != null ? c.glassFidelity : 92, 0.92, 0, 1),
      chatGlassFidelity: normUnit(c.chatGlassFidelity != null ? c.chatGlassFidelity : 90, 0.90, 0, 1),
      scrimOpacity: normUnit(c.scrimOpacity != null ? c.scrimOpacity : c.scrim != null ? c.scrim : 0.26, 0.26, 0, 0.94),
      scrimColor: String(c.scrimColor || 'auto').trim(),
      vignette: bool(c.vignette, true),
      contrastFloor: bool(c.contrastFloor, true),
      codeReadabilityMode: codeMode,
      caretColor: String(c.caretColor || '').trim(),
      filterPreset: String(c.filterPreset || 'none').toLowerCase(),
      fit: fit,
      flip: bool(c.flip, false),
      posX: clamp(num(c.layerPosX != null ? c.layerPosX : c.layerPositionX, 50), 0, 100),
      posY: clamp(num(c.layerPosY != null ? c.layerPosY : c.layerPositionY, 50), 0, 100),
      scale: clamp(num(c.layerScale, 100), 50, 150),
      mediaOpacity:
        c.mediaOpacity != null
          ? normUnit(c.mediaOpacity, 1, 0.05, 1)
          : c.wallpaperOpacity != null
            ? clamp(1 - normUnit(c.wallpaperOpacity, 0, 0, 0.95), 0.05, 1)
            : 1,
      mediaBlur: clamp(num(c.mediaBlur != null ? c.mediaBlur : c.wallpaperBlur != null ? c.wallpaperBlur : c.blurPx, 0), 0, 64),
      mediaBrightness: normFactor(c.mediaBrightness != null ? c.mediaBrightness : c.backgroundBrightness != null ? c.backgroundBrightness : 100, 1, 0.4, 1.6),
      mediaContrast: normFactor(c.mediaContrast != null ? c.mediaContrast : c.backgroundContrast != null ? c.backgroundContrast : 100, 1, 0.4, 2.0),
      mediaSaturate: normFactor(c.mediaSaturate != null ? c.mediaSaturate : c.backgroundSaturate != null ? c.backgroundSaturate : 105, 1.05, 0, 2.0),
      grainAlpha: normUnit(c.grainAlpha, 0.022, 0, 0.2),
      switchTransition: trans,
      switchTransitionDir: transDir,
      switchTransitionSpeed: transSpeed,
      pictureSlideSeconds: clamp(num(c.pictureSlideSeconds, 30), 0, 3600),
      paused: bool(c.paused, false),
      muted: c.audioEnabled != null ? !c.audioEnabled : c.videoAudioEnabled != null ? !c.videoAudioEnabled : bool(c.muted, true),
      volume: normUnit(c.volume != null ? c.volume : c.videoVolume != null ? c.videoVolume : 0.5, 0.5, 0, 1),
      playbackRate: clamp(num(c.playbackRate, 1), 0.25, 2),
      rotationEnabled: bool(c.rotationEnabled, false),
      rotationTrigger: String(c.rotationTrigger || 'interval'),
      pauseOnHidden: bool(c.pauseOnHidden, true),
      pauseOnBlur: bool(c.pauseOnBlur != null ? c.pauseOnBlur : c.pauseOnUnfocus, false),
      pauseOnBattery: bool(c.pauseOnBattery, false),
      pauseOnFullscreen: bool(c.pauseOnFullscreen, false),
      agentBusyPaused: bool(c.agentBusyPaused, false),
      interactiveWeb: bool(c.interactiveWeb, false),
      fxEnabled: bool(c.fxEnabled, false),
      fxClickMode: String(c.fxClickMode || 'ripple').toLowerCase(),
      fxTrailMode: String(c.fxTrailMode || 'dust').toLowerCase(),
      parallaxEnabled: bool(c.parallaxEnabled, false),
      parallaxStrength: clamp(num(c.parallaxStrength, 12), 0, 40),
      skinMode: c.skinMode === 'optical' || c.skinMode === 'hybrid' ? c.skinMode : 'wallpaper',
      modules: c.modules && typeof c.modules === 'object' ? c.modules : null,
      companionStyle: ['clawd', 'neko', 'crabs', 'orb'].indexOf(String(c.companionStyle || '')) >= 0 ? String(c.companionStyle) : 'clawd',
      companionPosition: ['bottom-right', 'bottom-left', 'top-right'].indexOf(String(c.companionPosition || '')) >= 0 ? String(c.companionPosition) : 'bottom-right',
      mascotSpec: String(c.mascotSpec || 'crab'),
      prismaticCoat: bool(c.prismaticCoat, false),
      rimTone: ['follow', 'cobalt', 'iris', 'amber', 'mono'].indexOf(String(c.rimTone || '')) >= 0 ? String(c.rimTone) : 'follow',
      motionTier: ['off', 'subtle', 'standard', 'ultra'].indexOf(String(c.motionTier || '')) >= 0 ? String(c.motionTier) : 'ultra',
      ambientIntensity: clamp(num(c.ambientIntensity, 1), 0, 1),
      vividness: ['soft', 'balanced', 'vivid'].indexOf(String(c.vividness || '')) >= 0 ? String(c.vividness) : 'balanced',
      fontStyle: ['modern', 'editorial', 'mono'].indexOf(String(c.fontStyle || '')) >= 0 ? String(c.fontStyle) : 'modern',
      textStyle: ['stylized', 'crisp', 'minimal'].indexOf(String(c.textStyle || '')) >= 0 ? String(c.textStyle) : 'stylized',
      habitatMode: ['auto', 'cactus', 'lamp', 'hourglass'].indexOf(String(c.habitatMode || '')) >= 0 ? String(c.habitatMode) : 'auto',
      codeFont: String(c.codeFont || 'default'),
      codeLigatures: bool(c.codeLigatures, false),
      sidebarCompact: bool(c.sidebarCompact, false),
    };
  }

  function resolveEffectiveModules(cfg, payloadComp) {
    if (payloadComp && payloadComp.effectiveModules && typeof payloadComp.effectiveModules === 'object') {
      return payloadComp.effectiveModules;
    }
    var mode = cfg && cfg.skinMode ? cfg.skinMode : 'wallpaper';
    var m = (cfg && cfg.modules) || {};
    if (mode === 'optical') {
      return {
        wallpaperLayer: false,
        glassLayer: false,
        opticalPalette: m.opticalPalette !== false,
        opticalFacet: m.opticalFacet !== false,
        rippleField: m.rippleField !== false,
        microMotion: m.microMotion !== false,
        pixelCompanion: m.pixelCompanion !== false,
      };
    }
    if (mode === 'wallpaper') {
      return {
        wallpaperLayer: m.wallpaperLayer !== false,
        glassLayer: m.glassLayer !== false && m.wallpaperLayer !== false,
        opticalPalette: m.opticalPalette !== false,
        opticalFacet: false,
        rippleField: false,
        microMotion: false,
        pixelCompanion: false,
      };
    }
    var wl = m.wallpaperLayer !== false;
    return {
      wallpaperLayer: wl,
      glassLayer: wl && m.glassLayer !== false,
      opticalPalette: m.opticalPalette !== false,
      opticalFacet: m.opticalFacet !== false,
      rippleField: Boolean(m.rippleField),
      microMotion: m.microMotion !== false,
      pixelCompanion: m.pixelCompanion !== false,
    };
  }

  function resolveAccent(cfg, scheme, isLight) {
    var mode = cfg.accentMode;
    var hex = scheme.accent;
    var wallTint = parseRgbTriplet(scheme.base);
    var ext = cfg.extractedAccent;

    if (ext && ext.darkHex && ext.lightHex) {
      if (ext.tintRgb) wallTint = parseRgbTriplet(ext.tintRgb);
      if (mode === 'dynamic') hex = isLight ? ext.lightHex : ext.darkHex;
    }
    if (ACCENT_PRESETS[mode]) {
      hex = isLight ? ACCENT_PRESETS[mode].light : ACCENT_PRESETS[mode].dark;
    } else if (mode === 'custom' && hexToRgb(cfg.customAccent)) {
      hex = cfg.customAccent;
    } else if (mode === 'palette') {
      hex = scheme.accent;
    }

    var rgb = hexToRgb(hex) || hexToRgb(scheme.accent) || [102, 157, 246];
    if (!ext || !ext.tintRgb) wallTint = rgb;
    var accentFg = relLum(rgb) > 0.46 ? '#14120E' : '#FFFFFF';
    return {
      hex: rgbToHex(rgb),
      rgb: rgb,
      rgbStr: rgb[0] + ', ' + rgb[1] + ', ' + rgb[2],
      fg: accentFg,
      wallTint: wallTint,
      wallTintStr: wallTint[0] + ', ' + wallTint[1] + ', ' + wallTint[2],
    };
  }

  function computeRadii(cfg) {
    if (cfg.layoutMode === 'flush') {
      var fCtl = cfg.cornerStyle === 'sharp' ? 4 : cfg.cornerStyle === 'soft' ? 8 : 6;
      return { island: 0, sheet: 12, card: fCtl + 2, ctl: fCtl, xs: Math.max(2, fCtl - 2) };
    }
    if (cfg.cornerStyle === 'sharp') return { island: 6, sheet: 8, card: 5, ctl: 4, xs: 2 };
    if (cfg.cornerStyle === 'soft') return { island: 16, sheet: 18, card: 13, ctl: 9, xs: 6 };
    return { island: 12, sheet: 14, card: 10, ctl: 7, xs: 4 };
  }

  // WCAG Readability Floor surface blend (DSH `weClampSurfaceColor` + Prism tint mix)
  function computeFlooredRgba(surfaceRgb, wallTintRgb, tintMix, rawAlpha, floorFidelity, minFloorAlpha, solidMode) {
    var tinted = mixRgb(surfaceRgb, wallTintRgb, tintMix);
    if (solidMode) return rgbaStr(tinted, 1);
    var effectiveFloor = minFloorAlpha * clamp(floorFidelity, 0, 1);
    var finalAlpha = clamp(Math.max(rawAlpha, effectiveFloor), 0, 0.99);
    return rgbaStr(tinted, finalAlpha);
  }

  function computeSkinTokens(cfg) {
    var isLight = state.effectiveTheme === 'light';
    var schemePair = COLOR_SCHEMES[cfg.colorScheme] || COLOR_SCHEMES['prism-default'];
    var S = isLight ? schemePair.light : schemePair.dark;
    var acc = resolveAccent(cfg, S, isLight);
    var R = computeRadii(cfg);

    var ptRgb = parseRgbTriplet(S.pt);
    var shadeRgb = parseRgbTriplet(S.shade);
    var baseRgb = parseRgbTriplet(S.base);
    var tint1Rgb = parseRgbTriplet(S.tint1);
    var tint2Rgb = parseRgbTriplet(S.tint2);
    var popRgb = parseRgbTriplet(S.popover);

    var g = cfg.glassOpacity;
    var solidChrome = !cfg.glassSurfaces;

    var rawSidebarA = isLight ? clamp(g * 0.80, 0.42, 0.97) : clamp(g * 0.72, 0.24, 0.96);
    var rawChatA = cfg.layoutMode === 'flush' && !isLight ? clamp(g * 0.24, 0, 0.82) : isLight ? clamp(g * 0.62, 0.28, 0.92) : clamp(g * 0.42, 0.08, 0.88);
    var rawEditorA = isLight ? clamp(g * 0.96, 0.55, 0.99) : clamp(g * 0.92, 0.45, 0.98);
    var rawCardA = isLight ? clamp(g * 0.86, 0.50, 0.98) : clamp(g * 0.78, 0.32, 0.96);
    var rawCompA = isLight ? clamp(g * 0.94, 0.65, 0.99) : clamp(g * 0.92, 0.48, 0.98);

    var minSidebarFloor = isLight ? 0.58 : 0.42;
    var minChatFloor = isLight ? 0.42 : 0.16;
    var minEditorFloor = cfg.contrastFloor ? (isLight ? 0.84 : 0.72) : (isLight ? 0.52 : 0.38);
    var minCardFloor = isLight ? 0.62 : 0.48;
    var minCompFloor = isLight ? 0.72 : 0.58;

    var surfSidebar = computeFlooredRgba(shadeRgb, acc.wallTint, cfg.wallTintMix, rawSidebarA, cfg.glassFidelity, minSidebarFloor, solidChrome);
    var surfChat = computeFlooredRgba(baseRgb, acc.wallTint, cfg.wallTintMix * 0.75, rawChatA, cfg.chatGlassFidelity, minChatFloor, solidChrome);
    var surfEditor = computeFlooredRgba(
      baseRgb,
      acc.wallTint,
      cfg.wallTintMix * 0.5,
      rawEditorA,
      cfg.contrastFloor ? 1 : cfg.glassFidelity,
      minEditorFloor,
      solidChrome || cfg.codeReadabilityMode === 'solid'
    );
    var surfCard = computeFlooredRgba(tint1Rgb, acc.wallTint, cfg.wallTintMix, rawCardA, cfg.glassFidelity, minCardFloor, solidChrome);
    var surfComp = computeFlooredRgba(tint1Rgb, acc.wallTint, cfg.wallTintMix, rawCompA, cfg.glassFidelity, minCompFloor, solidChrome);
    var surfPopover = rgbaStr(mixRgb(popRgb, acc.wallTint, cfg.wallTintMix * 0.4), isLight ? 0.97 : 0.96);

    var borderScale = cfg.borders === 'off' ? 0 : cfg.borders === 'subtle' ? 0.5 : 1;
    var borderHairline = rgbaStr(ptRgb, (isLight ? 0.095 : 0.075) * borderScale);
    var borderIsland = rgbaStr(ptRgb, (isLight ? 0.125 : 0.105) * borderScale);
    var borderCard = rgbaStr(ptRgb, (isLight ? 0.115 : 0.09) * borderScale);
    var borderPopover = rgbaStr(ptRgb, isLight ? 0.16 : 0.145);
    var specularTop = borderScale === 0 ? 'transparent' : isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(255, 255, 255, 0.075)';
    var sheen = isLight
      ? 'linear-gradient(172deg, rgba(255, 255, 255, 0.68) 0%, rgba(255, 255, 255, 0) 40%)'
      : 'linear-gradient(172deg, rgba(255, 255, 255, 0.042) 0%, rgba(255, 255, 255, 0) 38%)';

    var shadowIsland =
      cfg.layoutMode === 'flush' || !cfg.shadows
        ? 'none'
        : isLight
          ? '0 10px 28px -10px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.06)'
          : '0 10px 28px -8px rgba(0, 0, 0, 0.46), 0 2px 6px rgba(0, 0, 0, 0.24)';
    var shadowPopover = isLight
      ? '0 28px 64px -18px rgba(15, 23, 42, 0.28), 0 2px 8px rgba(15, 23, 42, 0.10)'
      : '0 28px 64px -14px rgba(0, 0, 0, 0.64), 0 2px 8px rgba(0, 0, 0, 0.30)';

    var autoScrim = !cfg.scrimColor || /^(auto|rgba?\(0,\s*0,\s*0|#000|#000000|black)$/i.test(cfg.scrimColor);
    var scrimBg = autoScrim ? rgbaStr(shadeRgb, 1) : cfg.scrimColor;
    var scrimAlpha = isLight && autoScrim ? clamp(0.32 + cfg.scrimOpacity * 0.62, 0.18, 0.94) : cfg.scrimOpacity;

    var vignetteGrad = isLight
      ? 'radial-gradient(ellipse 56% 64% at 50% 48%, rgba(255,255,255,0.42) 0%, rgba(244,247,251,0.24) 60%, rgba(232,238,246,0.52) 100%)'
      : 'radial-gradient(ellipse 56% 64% at 50% 48%, rgba(9,9,11,0.06) 0%, rgba(9,9,11,0.28) 58%, rgba(9,9,11,0.62) 100%)';

    var blurMd = cfg.glassSurfaces ? cfg.glassBlur : 0;
    var blurLg = cfg.glassSurfaces ? Math.min(48, cfg.glassBlur + 4) : 0;
    var blurXl = Math.max(20, cfg.glassBlur + 8);

    var fitCss = cfg.fit === 'center' ? 'none' : cfg.fit;
    var filterParts = [];
    if (cfg.mediaBlur > 0) filterParts.push('blur(' + cfg.mediaBlur + 'px)');
    if (Math.abs(cfg.mediaBrightness - 1) > 0.01) filterParts.push('brightness(' + Math.round(cfg.mediaBrightness * 100) + '%)');
    if (Math.abs(cfg.mediaContrast - 1) > 0.01) filterParts.push('contrast(' + Math.round(cfg.mediaContrast * 100) + '%)');
    if (Math.abs(cfg.mediaSaturate - 1) > 0.01) filterParts.push('saturate(' + Math.round(cfg.mediaSaturate * 100) + '%)');
    if (cfg.filterPreset === 'vivid') filterParts.push('saturate(135%) contrast(108%)');
    else if (cfg.filterPreset === 'warm') filterParts.push('sepia(22%) saturate(118%)');
    else if (cfg.filterPreset === 'cool') filterParts.push('hue-rotate(14deg) saturate(110%)');
    else if (cfg.filterPreset === 'grayscale') filterParts.push('grayscale(100%)');
    else if (cfg.filterPreset === 'sepia') filterParts.push('sepia(78%)');
    else if (cfg.filterPreset === 'contrast') filterParts.push('contrast(128%)');
    else if (cfg.filterPreset === 'darken') filterParts.push('brightness(72%)');
    else if (cfg.filterPreset === 'brighten') filterParts.push('brightness(122%)');
    var mediaFilter = filterParts.length ? filterParts.join(' ') : 'none';
    var baseScale = (cfg.scale / 100) * (cfg.mediaBlur > 0 || cfg.parallaxEnabled ? 1.05 : 1);
    var flipX = cfg.flip ? -1 : 1;

    var leftNum = Number(cfg.leftCornerRadius);
    var rightNum = Number(cfg.rightCornerRadius);
    var leftRad = cfg.leftCornerRadius === 'native' ? '0px' : Number.isFinite(leftNum) && cfg.leftCornerRadius !== '' ? leftNum + 'px' : R.island + 'px';
    var rightRad = cfg.rightCornerRadius === 'native' ? '0px' : Number.isFinite(rightNum) && cfg.rightCornerRadius !== '' ? rightNum + 'px' : R.island + 'px';

    var vars = {
      '--prism-pt-rgb': S.pt,
      '--prism-shade-rgb': S.shade,
      '--prism-base-rgb': S.base,
      '--prism-tint-1-rgb': S.tint1,
      '--prism-tint-2-rgb': S.tint2,
      '--prism-popover-rgb': S.popover,
      '--prism-wall-tint-rgb': acc.wallTintStr,
      '--prism-fg': S.fg,
      '--prism-fg-2': S.fg2,
      '--prism-fg-muted': S.muted,
      '--prism-fg-faint': S.faint,
      '--prism-accent': acc.hex,
      '--prism-accent-rgb': acc.rgbStr,
      '--prism-accent-fg': acc.fg,
      '--prism-accent-soft': 'rgba(' + acc.rgbStr + ', ' + (isLight ? '0.11' : '0.14') + ')',
      '--prism-accent-border': 'rgba(' + acc.rgbStr + ', ' + (isLight ? '0.42' : '0.48') + ')',
      '--prism-link': S.link,
      '--prism-surface-canvas': 'transparent',
      '--prism-surface-sidebar': surfSidebar,
      '--prism-surface-chat': surfChat,
      '--prism-surface-editor': surfEditor,
      '--prism-surface-card': surfCard,
      '--prism-surface-composer': surfComp,
      '--prism-surface-popover': surfPopover,
      '--prism-surface-code-block': cfg.codeReadabilityMode === 'solid' ? rgbaStr(tint1Rgb, 1) : surfEditor,
      '--prism-secondary-bg': rgbaStr(tint2Rgb, isLight ? 0.78 : 0.72),
      '--prism-muted-bg': rgbaStr(tint1Rgb, isLight ? 0.65 : 0.55),
      '--prism-sidebar-muted': 'rgba(' + S.pt + ', 0.048)',
      '--prism-sidebar-secondary': 'rgba(' + S.pt + ', 0.082)',
      '--prism-blur-md': blurMd + 'px',
      '--prism-blur-lg': blurLg + 'px',
      '--prism-blur-xl': blurXl + 'px',
      '--prism-sidebar-backdrop': blurMd > 0 ? 'blur(' + blurMd + 'px) saturate(135%)' : 'none',
      '--prism-composer-backdrop': blurLg > 0 ? 'blur(' + blurLg + 'px) saturate(140%)' : 'none',
      '--prism-code-backdrop': cfg.codeReadabilityMode === 'frosted' && blurMd > 0 ? 'blur(12px) saturate(130%)' : 'none',
      '--prism-border-hairline': borderHairline,
      '--prism-border-island': borderIsland,
      '--prism-border-card': borderCard,
      '--prism-border-popover': borderPopover,
      '--prism-specular-top': specularTop,
      '--prism-sheen': sheen,
      '--prism-shadow-island': shadowIsland,
      '--prism-shadow-popover': shadowPopover,
      '--prism-workspace-pad': (cfg.layoutMode === 'islands' ? cfg.workspacePad : 0) + 'px',
      '--prism-island-gap': (cfg.layoutMode === 'islands' ? cfg.islandGap : 0) + 'px',
      '--prism-r-island': R.island + 'px',
      '--prism-r-left-island': leftRad,
      '--prism-r-right-island': rightRad,
      '--prism-r-sheet': R.sheet + 'px',
      '--prism-r-card': R.card + 'px',
      '--prism-r-ctl': R.ctl + 'px',
      '--prism-r-xs': R.xs + 'px',
      '--prism-native-floor': isLight ? '#f7f7f8' : '#070708',
      '--prism-stage-bg': 'transparent',
      '--prism-wall-image':
        state.item && resolveEffectiveKind(state.item, cfg) === 'image' && (state.item.mediaUrl || state.item.thumbUrl)
          ? 'url(' + JSON.stringify(String(state.item.mediaUrl || state.item.thumbUrl)) + ')'
          : 'none',
      '--prism-media-fit': fitCss,
      '--prism-media-pos': cfg.posX + '% ' + cfg.posY + '%',
      '--prism-media-opacity': cfg.mediaOpacity.toFixed(3),
      '--prism-media-filter': mediaFilter,
      '--prism-media-transform': 'scale(' + (baseScale * flipX).toFixed(4) + ', ' + baseScale.toFixed(4) + ')',
      '--prism-scrim-bg': scrimBg,
      '--prism-scrim-opacity': scrimAlpha.toFixed(3),
      '--prism-vignette-display': cfg.vignette ? 'block' : 'none',
      '--prism-vignette-bg': vignetteGrad,
      '--prism-grain-display': cfg.grainAlpha > 0.001 ? 'block' : 'none',
      '--prism-grain-alpha': cfg.grainAlpha.toFixed(3),
      '--prism-selection-bg': 'rgba(' + acc.rgbStr + ', 0.40)',
      '--prism-editor-selection-bg': 'rgba(' + acc.rgbStr + ', 0.38)',
      '--prism-scroll-thumb': rgbaStr(ptRgb, 0.22),
    };

    var effMods = resolveEffectiveModules(cfg, state.composition);
    var structuralSig = [
      VERSION,
      state.effectiveTheme,
      cfg.colorScheme === 'host-native' ? 'host' : 'prism',
      cfg.layoutMode,
      cfg.skinMode || 'wallpaper',
      effMods.wallpaperLayer ? 'w1' : 'w0',
      effMods.opticalFacet ? 'f1' : 'f0',
      effMods.microMotion ? 'm1' : 'm0',
      effMods.pixelCompanion ? 'c1' : 'c0',
    ].join('|');

    return {
      isLight: isLight,
      S: S,
      acc: acc,
      vars: vars,
      structuralSig: structuralSig,
    };
  }

  // Fast <0.3ms inline CSS variable patch on <html> (avoids rewriting #agy-prism-css on slider ticks!)
  function applyFastCssVars(vars) {
    var root = doc.documentElement;
    if (!root || !root.style) return;
    for (var k in vars) {
      if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
      var v = vars[k];
      if (state.appliedVars[k] !== v) {
        root.style.setProperty(k, v);
        state.appliedVars[k] = v;
      }
    }
  }

  function clearFastCssVars() {
    var root = doc.documentElement;
    if (root && root.style) {
      for (var k in state.appliedVars) {
        if (Object.prototype.hasOwnProperty.call(state.appliedVars, k)) {
          root.style.removeProperty(k);
        }
      }
      root.style.removeProperty('--prism-hole-clip');
    }
    state.appliedVars = {};
    state.lastHoleClip = '';
  }

  function buildStructuralPrismCss(cfg, tok) {
    var GG = 'html[' + GLASS_ATTR + '="ready"]';
    var GW = 'html[' + WALLPAPER_ATTR + '="ready"]';
    var NOT_HOLE = ':not([data-has-browser-hole="true"]):not([data-browser-hole])';
    var isLight = tok.isLight;
    var out = [];

    // 1. Root Safety Floor & 2.34.0 3-Layer [data-browser-hole] Alpha=0 Yield
    // Keep solid native theme floor on <html> ONLY when wallpaper is decoded AND no browser hole is open.
    // Whenever [data-has-browser-hole="true"] is active, <html> & <body> yield immediately to alpha = 0!
    out.push(
      GW + ':not([data-has-browser-hole="true"]):not(:has(> body[data-has-browser-hole="true"])) {\n' +
      '  background-color: var(--prism-native-floor, #070708) !important;\n' +
      '  background-image: none !important;\n' +
      '}\n' +
      GW + ' body {\n' +
      '  isolation: isolate;\n' +
      '  background-color: transparent !important;\n' +
      '  background-image: none !important;\n' +
      '}\n' +
      'html[data-has-browser-hole="true"],\n' +
      'html[data-has-browser-hole="true"] body,\n' +
      'body[data-has-browser-hole="true"],\n' +
      GW + ' [data-has-browser-hole="true"]' + SIBLING_EXCLUDE + ',\n' +
      GW + ' ' + ACTIVE_HOLE_SEL + ' {\n' +
      '  background-color: transparent !important;\n' +
      '  background-image: none !important;\n' +
      '}\n' +
      GW + '[data-prism-kind="image"] body:not(:has(> #' + STAGE_ID + ' .agy-prism-media-wrap))::before {\n' +
      '  content: "";\n' +
      '  position: fixed;\n' +
      '  inset: 0;\n' +
      '  z-index: -2;\n' +
      '  pointer-events: none !important;\n' +
      '  background-image: var(--prism-wall-image, none);\n' +
      '  background-size: var(--prism-media-fit, cover);\n' +
      '  background-position: var(--prism-media-pos, 50% 50%);\n' +
      '  background-repeat: no-repeat;\n' +
      '  opacity: var(--prism-media-opacity, 1);\n' +
      '  filter: var(--prism-media-filter, none);\n' +
      '  clip-path: var(--prism-hole-clip, none);\n' +
      '}'
    );

    // 2. Fail-Open Token Overrides (strictly gated on GW so broken/404 media keeps 100% solid native surfaces!)
    out.push(
      GW + ' body,\n' +
      GW + ' :where(#root, #root > div, #root .dark, #root .light, #root .theme-dark, #root .theme-light, .agy-shell, .agy-inset-shell, .agy-sheet:not([data-browser-occluder]), [data-split-panes] [data-testid="pane-titlebar-toolbar"])' +
      ':where(' + SIBLING_EXCLUDE + DIALOG_DESCENDANT_EXCLUDE + ') {\n' +
      '  --background: transparent !important;\n' +
      '  --color-background: transparent !important;\n' +
      '  --body-background: transparent !important;\n' +
      '  --shell: transparent !important;\n' +
      '  --shell-canvas: transparent !important;\n' +
      '  --content: var(--prism-surface-chat) !important;\n' +
      '  --sidebar: var(--prism-surface-sidebar) !important;\n' +
      '  --color-sidebar: var(--prism-surface-sidebar) !important;\n' +
      '  --sidebar-muted: var(--prism-sidebar-muted) !important;\n' +
      '  --sidebar-secondary: var(--prism-sidebar-secondary) !important;\n' +
      '  --card: var(--prism-surface-card) !important;\n' +
      '  --color-card: var(--prism-surface-card) !important;\n' +
      '  --card-border: var(--prism-border-card) !important;\n' +
      '  --border: var(--prism-border-hairline) !important;\n' +
      '  --color-border: var(--prism-border-hairline) !important;\n' +
      '  --popover: var(--prism-surface-popover) !important;\n' +
      '  --secondary: var(--prism-secondary-bg) !important;\n' +
      '  --muted: var(--prism-muted-bg) !important;\n' +
      (cfg.colorScheme !== 'host-native'
        ? '  --foreground: var(--prism-fg) !important;\n' +
          '  --secondary-foreground: var(--prism-fg-2) !important;\n' +
          '  --muted-foreground: var(--prism-fg-muted) !important;\n' +
          '  --placeholder: var(--prism-fg-faint) !important;\n'
        : isLight
          ? '  --muted-foreground: #475569 !important;\n'
          : '') +
      '  --primary: var(--prism-accent) !important;\n' +
      '  --color-primary: var(--prism-accent) !important;\n' +
      '  --primary-foreground: var(--prism-accent-fg) !important;\n' +
      '  --link: var(--prism-link) !important;\n' +
      '  --onyx-frame: var(--prism-surface-sidebar) !important;\n' +
      '  --onyx-well: var(--prism-surface-chat) !important;\n' +
      '  --onyx-raised: var(--prism-surface-card) !important;\n' +
      '  --vscode-editor-background: transparent !important;\n' +
      '  --vscode-editorGutter-background: transparent !important;\n' +
      '  --vscode-sideBar-background: transparent !important;\n' +
      '  --vscode-panel-background: transparent !important;\n' +
      '  --vscode-terminal-background: transparent !important;\n' +
      '  --editor-diff-inserted-line-background: rgba(46, 160, 67, 0.24) !important;\n' +
      '  --editor-diff-removed-line-background: rgba(248, 81, 73, 0.24) !important;\n' +
      '  --editor-selection-background: var(--prism-editor-selection-bg) !important;\n' +
      '}'
    );

    // 3. Inert Fail-Open Stage at z-index: -1 (0 mouse/focus interception, transparent background, GPU cutout clip)
    out.push(
      '#' + STAGE_ID + ' {\n' +
      '  position: fixed !important;\n' +
      '  inset: 0 !important;\n' +
      '  z-index: -1 !important;\n' +
      '  overflow: hidden !important;\n' +
      '  pointer-events: none !important;\n' +
      '  user-select: none !important;\n' +
      '  -webkit-user-select: none !important;\n' +
      '  background-color: transparent !important;\n' +
      '  background-image: none !important;\n' +
      '  clip-path: var(--prism-hole-clip, none);\n' +
      '  contain: layout paint style;\n' +
      '}\n' +
      '#' + STAGE_ID + ' *, #' + FX_CANVAS_ID + ' {\n' +
      '  pointer-events: none !important;\n' +
      '  user-select: none !important;\n' +
      '}\n' +
      '#' + FX_CANVAS_ID + ' {\n' +
      '  clip-path: var(--prism-hole-clip, none);\n' +
      '}\n' +
      '#' + STAGE_ID + ' .agy-prism-media-wrap {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '  will-change: transform, opacity, clip-path;\n' +
      '  transform: translate3d(var(--prism-px, 0px), var(--prism-py, 0px), 0);\n' +
      '}\n' +
      '#' + STAGE_ID + ' .agy-prism-media-el {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '  border: 0;\n' +
      '  display: block;\n' +
      '  object-fit: var(--prism-media-fit);\n' +
      '  object-position: var(--prism-media-pos);\n' +
      '  opacity: var(--prism-media-opacity);\n' +
      '  filter: var(--prism-media-filter);\n' +
      '  transform: var(--prism-media-transform);\n' +
      '}\n' +
      '#' + STAGE_ID + ' .agy-prism-scrim {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  background: var(--prism-scrim-bg);\n' +
      '  opacity: 0;\n' +
      '  transition: background 240ms ease, opacity 180ms ease;\n' +
      '}\n' +
      GW + ' #' + STAGE_ID + ' .agy-prism-scrim {\n' +
      '  opacity: var(--prism-scrim-opacity);\n' +
      '}\n' +
      '#' + STAGE_ID + ' .agy-prism-vignette {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  display: none;\n' +
      '  background: var(--prism-vignette-bg);\n' +
      '}\n' +
      GW + ' #' + STAGE_ID + ' .agy-prism-vignette {\n' +
      '  display: var(--prism-vignette-display);\n' +
      '}\n' +
      '#' + STAGE_ID + ' .agy-prism-grain {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  display: none;\n' +
      '  opacity: var(--prism-grain-alpha);\n' +
      '  background-image: ' + GRAIN_SVG + ';\n' +
      '  background-repeat: repeat;\n' +
      '}\n' +
      GW + ' #' + STAGE_ID + ' .agy-prism-grain {\n' +
      '  display: var(--prism-grain-display);\n' +
      '}'
    );

    // 4. Hollow Outer Layout Wrappers ONLY When Wallpaper Frame Is Decoded (`GW`)
    out.push(
      GW + ' #root, ' + GW + ' .monaco-workbench { position: relative; z-index: 1; }\n' +
      HOLLOW_SURFACES.map(function (sel) {
        return GW + ' :where(' + sel + ')';
      }).join(',\n') +
      ' {\n' +
      '  background-color: transparent !important;\n' +
      '  background-image: none !important;\n' +
      '}'
    );

    var sbHostList = GLASS_CARRIER_SIDEBARS.map(function (s) {
      return GW + ' ' + s + NOT_HOLE;
    }).join(',\n');
    var sbBeforeList = GLASS_CARRIER_SIDEBARS.map(function (s) {
      return GW + ' ' + s + NOT_HOLE + '::before';
    }).join(',\n');

    out.push(
      sbHostList + ' {\n' +
      '  position: relative !important;\n' +
      '  isolation: isolate;\n' +
      '  background-color: transparent !important;\n' +
      '  background-image: none !important;\n' +
      '  backdrop-filter: none !important;\n' +
      '  -webkit-backdrop-filter: none !important;\n' +
      '}\n' +
      sbBeforeList + ' {\n' +
      '  content: "";\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  z-index: -1;\n' +
      '  border-radius: inherit;\n' +
      '  pointer-events: none;\n' +
      '  background-color: var(--prism-surface-sidebar);\n' +
      '  background-image: var(--prism-sheen);\n' +
      '  backdrop-filter: var(--prism-sidebar-backdrop);\n' +
      '  -webkit-backdrop-filter: var(--prism-sidebar-backdrop);\n' +
      '  box-shadow: inset 0 1px 0 var(--prism-specular-top);\n' +
      '}'
    );

    var compHostList = GLASS_CARRIER_COMPOSERS.map(function (s) {
      return GW + ' ' + s;
    }).join(',\n');
    var compBeforeList = GLASS_CARRIER_COMPOSERS.map(function (s) {
      return GW + ' ' + s + '::before';
    }).join(',\n');

    out.push(
      compHostList + ' {\n' +
      '  position: relative !important;\n' +
      '  isolation: isolate;\n' +
      '  background-color: transparent !important;\n' +
      '  backdrop-filter: none !important;\n' +
      '  -webkit-backdrop-filter: none !important;\n' +
      '  border: 1px solid var(--prism-border-card) !important;\n' +
      '  border-radius: var(--prism-r-card) !important;\n' +
      '  box-shadow: var(--prism-shadow-island) !important;\n' +
      '}\n' +
      compBeforeList + ' {\n' +
      '  content: "";\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  z-index: -1;\n' +
      '  border-radius: inherit;\n' +
      '  pointer-events: none;\n' +
      '  background-color: var(--prism-surface-composer);\n' +
      '  background-image: var(--prism-sheen);\n' +
      '  backdrop-filter: var(--prism-composer-backdrop);\n' +
      '  -webkit-backdrop-filter: var(--prism-composer-backdrop);\n' +
      '  box-shadow: inset 0 1px 0 var(--prism-specular-top);\n' +
      '}'
    );

    out.push(
      GW + ' [data-testid="conversation-view"] {\n' +
      '  background-color: var(--prism-surface-chat) !important;\n' +
      '  backdrop-filter: none !important;\n' +
      '}\n' +
      GW + ' [data-testid="browser-error-overlay"] {\n' +
      '  background-color: var(--prism-surface-editor) !important;\n' +
      '}\n' +
      GW + ' .monaco-workbench .part.editor > .content,\n' +
      GW + ' .monaco-workbench .editor-group-container,\n' +
      GW + ' .monaco-workbench .part.panel,\n' +
      GW + ' [data-testid="background-task-command"] {\n' +
      '  background-color: var(--prism-surface-editor) !important;\n' +
      '  backdrop-filter: none !important;\n' +
      '}\n' +
      GW + ' .monaco-editor,\n' +
      GW + ' .monaco-editor .margin,\n' +
      GW + ' .monaco-editor-background,\n' +
      GW + ' .monaco-editor .view-lines,\n' +
      GW + ' .xterm,\n' +
      GW + ' .xterm .xterm-viewport,\n' +
      GW + ' .xterm .xterm-screen {\n' +
      '  background-color: transparent !important;\n' +
      '  backdrop-filter: none !important;\n' +
      '}\n' +
      GW + ' pre,\n' +
      GW + ' .code-block,\n' +
      GW + ' .md-code-block {\n' +
      '  background-color: var(--prism-surface-code-block) !important;\n' +
      '  border: 1px solid var(--prism-border-card) !important;\n' +
      '  border-radius: var(--prism-r-ctl) !important;\n' +
      '  backdrop-filter: var(--prism-code-backdrop) !important;\n' +
      '  -webkit-backdrop-filter: var(--prism-code-backdrop) !important;\n' +
      '}\n' +
      GW + ' pre code, ' + GW + ' .md-code-block pre { background: transparent !important; border: none !important; backdrop-filter: none !important; }'
    );

    if (cfg.layoutMode === 'islands') {
      out.push(
        GW + '[data-prism-layout="islands"] .agy-shell {\n' +
        '  padding: var(--prism-workspace-pad) !important;\n' +
        '  gap: var(--prism-island-gap) !important;\n' +
        '  box-sizing: border-box !important;\n' +
        '}\n' +
        GW + '[data-prism-layout="islands"] [data-testid="sidebar-split"] > div:first-child' + NOT_HOLE + ',\n' +
        GW + '[data-prism-layout="islands"] .agy-sidebar' + NOT_HOLE + ' {\n' +
        '  border-radius: var(--prism-r-left-island) !important;\n' +
        '  border: 1px solid var(--prism-border-island) !important;\n' +
        '  box-shadow: var(--prism-shadow-island) !important;\n' +
        '}\n' +
        GW + '[data-prism-layout="islands"] :is([data-testid="sidebar-split"], [data-testid="aux-pane-split"]) > div:nth-child(2) {\n' +
        '  width: var(--prism-island-gap) !important;\n' +
        '  background: transparent !important;\n' +
        '  border: none !important;\n' +
        '  position: relative;\n' +
        '}\n' +
        GW + '[data-prism-layout="islands"] :is([data-testid="sidebar-split"], [data-testid="aux-pane-split"]) > div:nth-child(2):hover::after {\n' +
        '  content: "";\n' +
        '  position: absolute;\n' +
        '  top: 50%; left: 50%;\n' +
        '  transform: translate(-50%, -50%);\n' +
        '  width: 3px; height: 36px;\n' +
        '  border-radius: 999px;\n' +
        '  background: var(--prism-accent);\n' +
        '  opacity: 0.78;\n' +
        '}\n' +
        GW + '[data-prism-layout="islands"] [data-testid="aux-pane-split"] > div:first-child' + NOT_HOLE + ',\n' +
        GW + '[data-prism-layout="islands"] .agy-shell > main' + NOT_HOLE + ' {\n' +
        '  border-radius: var(--prism-r-island) !important;\n' +
        '  border: 1px solid var(--prism-border-island) !important;\n' +
        '  box-shadow: var(--prism-shadow-island) !important;\n' +
        '  background-color: var(--prism-surface-chat);\n' +
        '}\n' +
        GW + '[data-prism-layout="islands"] [data-testid="aux-pane-split"] > div:last-child:not([hidden]):not([aria-hidden="true"])' + NOT_HOLE + ' {\n' +
        '  border-radius: var(--prism-r-right-island) !important;\n' +
        '  border: 1px solid var(--prism-border-island) !important;\n' +
        '  box-shadow: var(--prism-shadow-island) !important;\n' +
        '}\n' +
        GW + '[data-prism-layout="islands"] .monaco-workbench :is(.part.activitybar, .part.sidebar, .part.editor .editor-group-container, .part.panel, .part.auxiliarybar) {\n' +
        '  margin: calc(var(--prism-island-gap) * 0.5) !important;\n' +
        '  border-radius: var(--prism-r-island) !important;\n' +
        '  border: 1px solid var(--prism-border-island) !important;\n' +
        '  box-shadow: var(--prism-shadow-island) !important;\n' +
        '}'
      );
    } else {
      out.push(
        GW + '[data-prism-layout="flush"] :is([data-testid="sidebar-split"], [data-testid="aux-pane-split"]) > div:nth-child(2) {\n' +
        '  width: 1px !important;\n' +
        '  background-color: var(--prism-border-hairline) !important;\n' +
        '}\n' +
        GW + '[data-prism-layout="flush"] .agy-sidebar' + NOT_HOLE + ' {\n' +
        '  border-right: 1px solid var(--prism-border-hairline) !important;\n' +
        '}'
      );
    }

    // 5. Solid Popovers, Menus & 2.34.0 Settings Modal Floor (>= 0.96 alpha, zero [class*="bg-background"] hover clobber)
    out.push(
      GG + ' .settings-modal-backdrop {\n' +
      '  background-color: ' + (isLight ? 'rgba(15, 23, 42, 0.28)' : 'rgba(0, 0, 0, 0.45)') + ' !important;\n' +
      '  backdrop-filter: blur(12px) saturate(120%) !important;\n' +
      '  -webkit-backdrop-filter: blur(12px) saturate(120%) !important;\n' +
      '}\n' +
      GG + '[data-has-browser-hole="true"] .settings-modal-backdrop,\n' +
      GG + ' body[data-has-browser-hole="true"] .settings-modal-backdrop {\n' +
      '  background-color: ' + (isLight ? 'rgba(15, 23, 42, 0.42)' : 'rgba(0, 0, 0, 0.58)') + ' !important;\n' +
      '}\n\n' +
      SOLID_POPOVERS.map(function (s) {
        return GG + ' ' + s;
      }).join(',\n') +
      ' {\n' +
      '  --background: var(--prism-surface-popover) !important;\n' +
      '  --color-background: var(--prism-surface-popover) !important;\n' +
      '  --content: var(--prism-surface-popover) !important;\n' +
      '  background-color: var(--prism-surface-popover) !important;\n' +
      '  background-image: var(--prism-sheen) !important;\n' +
      '  backdrop-filter: blur(var(--prism-blur-xl)) saturate(150%) !important;\n' +
      '  -webkit-backdrop-filter: blur(var(--prism-blur-xl)) saturate(150%) !important;\n' +
      '  border: 1px solid var(--prism-border-popover) !important;\n' +
      '  box-shadow: inset 0 1px 0 var(--prism-specular-top), var(--prism-shadow-popover) !important;\n' +
      '}\n\n' +
      GG + ' :is(.agy-dialog, .settings-modal-container, [role="dialog"]:not(#gemini-neko-observer-modal), [role="alertdialog"]) :where(.dark, .light, .theme-dark, .theme-light) {\n' +
      '  --background: var(--prism-surface-popover) !important;\n' +
      '  --color-background: var(--prism-surface-popover) !important;\n' +
      '  --content: var(--prism-surface-popover) !important;\n' +
      '}'
    );

    out.push(
      GG + ' ::selection { background-color: var(--prism-selection-bg) !important; color: inherit; }\n' +
      GW + ' ::-webkit-scrollbar-track { background: transparent !important; }\n' +
      GG + ' ::-webkit-scrollbar-thumb { background: var(--prism-scroll-thumb) !important; border-radius: 999px; }'
    );

    // 6. Pure Optical Mode (no wallpaper/glass) + Faceted Bevels + Micro-Motion + Original SVG Pixel Companion
    out.push(
      'html[' + ROOT_ATTR + '][' + SKIN_MODE_ATTR + '="optical"] {\n' +
      '  background-color: var(--prism-native-floor, #0e0e11) !important;\n' +
      '  color: var(--prism-fg) !important;\n' +
      '}\n' +
      'html[' + ROOT_ATTR + '][' + SKIN_MODE_ATTR + '="optical"] body {\n' +
      '  background-color: var(--prism-native-floor, #0e0e11) !important;\n' +
      '  color: var(--prism-fg) !important;\n' +
      '}\n' +
      'html[' + ROOT_ATTR + '][' + FACET_ATTR + '="on"] :is(.agy-sidebar, [data-slot="sidebar"], [data-composer-card], .surface-composer-card, .md-code-block) {\n' +
      '  border: 1px solid rgba(var(--prism-accent-rgb, 102, 157, 246), 0.24) !important;\n' +
      '  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), var(--prism-shadow-island) !important;\n' +
      '}\n' +
      'html[' + ROOT_ATTR + '][' + MOTION_ATTR + '="on"] :is(button, [role="button"], [data-row-key], .monaco-list-row) {\n' +
      '  transition: background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), border-color 160ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1) !important;\n' +
      '}\n' +
      'html[' + ROOT_ATTR + '][' + MOTION_ATTR + '="on"] :is([data-composer-card], .surface-composer-card, [data-testid="agent-input-box"]):focus-within {\n' +
      '  border-color: rgba(var(--prism-accent-rgb, 102, 157, 246), 0.56) !important;\n' +
      '  box-shadow: 0 0 0 2px rgba(var(--prism-accent-rgb, 102, 157, 246), 0.20), var(--prism-shadow-island) !important;\n' +
      '}\n' +
      '@media (prefers-reduced-motion: reduce) {\n' +
      '  html[' + ROOT_ATTR + '][' + MOTION_ATTR + '="on"] * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }\n' +
      '}\n' +
      '@keyframes agyPrismFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-4px); } }\n' +
      '@keyframes agyPrismHop { 0% { transform: translateY(0) scale(1); } 40% { transform: translateY(-10px) scale(1.08); } 100% { transform: translateY(0) scale(1); } }\n' +
      '#' + COMPANION_ID + ' {\n' +
      '  position: fixed !important;\n' +
      '  z-index: 2147483640 !important;\n' +
      '  pointer-events: none !important;\n' +
      '  user-select: none !important;\n' +
      '  -webkit-user-select: none !important;\n' +
      '  display: flex; align-items: flex-end; gap: 6px;\n' +
      '}\n' +
      '#' + COMPANION_ID + ' .agy-prism-pet-btn {\n' +
      '  pointer-events: auto !important;\n' +
      '  cursor: grab;\n' +
      '  width: 44px; height: 44px; border-radius: 14px;\n' +
      '  display: flex; align-items: center; justify-content: center;\n' +
      '  background: rgba(18, 22, 34, 0.78);\n' +
      '  border: 1px solid rgba(var(--prism-accent-rgb, 102, 157, 246), 0.36);\n' +
      '  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.16);\n' +
      '  animation: agyPrismFloat 3.2s ease-in-out infinite;\n' +
      '}\n' +
      '#' + COMPANION_ID + ' .agy-prism-pet-btn.hop { animation: agyPrismHop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }\n' +
      '#' + COMPANION_ID + ' .agy-prism-pet-tip {\n' +
      '  pointer-events: none; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 600;\n' +
      '  color: var(--prism-fg, #f2f2f5); background: rgba(16, 20, 32, 0.90);\n' +
      '  border: 1px solid rgba(var(--prism-accent-rgb, 102, 157, 246), 0.32);\n' +
      '  opacity: 0; transform: translateY(4px); transition: opacity 180ms ease, transform 180ms ease;\n' +
      '  white-space: nowrap;\n' +
      '}\n' +
      '#' + COMPANION_ID + ' .agy-prism-pet-tip.show { opacity: 1; transform: translateY(0); }'
    );

    return out.join('\n\n');
  }

  function applyCaretStyle(cfg) {
    var existing = doc.getElementById(CARET_STYLE_ID);
    var color = cfg.caretColor || 'var(--prism-accent)';
    if (!state.skinEnabled) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      state.lastCaretSig = '';
      return;
    }
    if (existing && state.lastCaretSig === color) return;
    state.lastCaretSig = color;
    if (!existing) {
      existing = doc.createElement('style');
      existing.id = CARET_STYLE_ID;
      (doc.head || doc.documentElement).appendChild(existing);
    }
    existing.textContent =
      'html[' + GLASS_ATTR + '="ready"] :is(textarea, input:not([type="range"]):not([type="checkbox"]):not([type="color"]), [contenteditable="true"]) { caret-color: ' +
      color +
      ' !important; }\n' +
      'html[' + GLASS_ATTR + '="ready"] .monaco-editor .cursors-layer > .cursor { background-color: ' +
      color +
      ' !important; border-color: ' +
      color +
      ' !important; }';
  }

  // ---------------------------------------------------------------------------
  // Antigravity 2.34.0 3-Layer `[data-browser-hole]` Synchronous Rounded GPU Cutout
  // ---------------------------------------------------------------------------
  function fmtNum(n) {
    var r = Math.round(Number(n) * 100) / 100;
    return Number.isFinite(r) ? String(r) : '0';
  }

  function parseCornerPx(raw) {
    var m = /^([\d.]+)px/.exec(String(raw || '').trim());
    return m ? Math.max(0, Number(m[1])) : 0;
  }

  function measureClippedBrowserHole(holeEl, vw, vh) {
    if (!holeEl || !holeEl.getBoundingClientRect) return null;
    try {
      var hcs = getComputedStyle(holeEl);
      if (hcs.display === 'none' || hcs.visibility === 'hidden') return null;
      var raw = holeEl.getBoundingClientRect();
      if (raw.width <= 0.5 || raw.height <= 0.5) return null;

      var left = Math.max(0, raw.left);
      var top = Math.max(0, raw.top);
      var right = Math.min(vw, raw.right);
      var bottom = Math.min(vh, raw.bottom);
      var tl = parseCornerPx(hcs.borderTopLeftRadius);
      var tr = parseCornerPx(hcs.borderTopRightRadius);
      var br = parseCornerPx(hcs.borderBottomRightRadius);
      var bl = parseCornerPx(hcs.borderBottomLeftRadius);

      var anc = holeEl.parentElement;
      while (anc && anc !== doc.body && anc !== doc.documentElement) {
        var acs = getComputedStyle(anc);
        if (acs.display === 'none' || acs.visibility === 'hidden') return null;
        var ovX = acs.overflowX || acs.overflow || 'visible';
        var ovY = acs.overflowY || acs.overflow || 'visible';
        if (ovX !== 'visible' || ovY !== 'visible') {
          var ar = anc.getBoundingClientRect();
          var bTop = parseFloat(acs.borderTopWidth) || 0;
          var bRight = parseFloat(acs.borderRightWidth) || 0;
          var bBot = parseFloat(acs.borderBottomWidth) || 0;
          var bLeft = parseFloat(acs.borderLeftWidth) || 0;
          var inLeft = ar.left + bLeft;
          var inTop = ar.top + bTop;
          var inRight = ar.right - bRight;
          var inBottom = ar.bottom - bBot;

          if (ovX !== 'visible') {
            left = Math.max(left, inLeft);
            right = Math.min(right, inRight);
          }
          if (ovY !== 'visible') {
            top = Math.max(top, inTop);
            bottom = Math.min(bottom, inBottom);
          }

          var atl = parseCornerPx(acs.borderTopLeftRadius);
          var atr = parseCornerPx(acs.borderTopRightRadius);
          var abr = parseCornerPx(acs.borderBottomRightRadius);
          var abl = parseCornerPx(acs.borderBottomLeftRadius);
          var eps = 2.5;
          var touchL = Math.abs(left - inLeft) <= eps || Math.abs(left - ar.left) <= bLeft + eps;
          var touchR = Math.abs(right - inRight) <= eps || Math.abs(right - ar.right) <= bRight + eps;
          var touchT = Math.abs(top - inTop) <= eps || Math.abs(top - ar.top) <= bTop + eps;
          var touchB = Math.abs(bottom - inBottom) <= eps || Math.abs(bottom - ar.bottom) <= bBot + eps;
          if (touchT && touchL && atl > tl) tl = atl;
          if (touchT && touchR && atr > tr) tr = atr;
          if (touchB && touchR && abr > br) br = abr;
          if (touchB && touchL && abl > bl) bl = abl;
        }
        anc = anc.parentElement;
      }

      var w = right - left;
      var h = bottom - top;
      if (w <= 0.5 || h <= 0.5) return null;

      var scale = Math.min(
        1,
        tl + tr > 0 ? w / (tl + tr) : 1,
        bl + br > 0 ? w / (bl + br) : 1,
        tl + bl > 0 ? h / (tl + bl) : 1,
        tr + br > 0 ? h / (tr + br) : 1
      );
      return {
        x: left,
        y: top,
        w: w,
        h: h,
        tl: tl * scale,
        tr: tr * scale,
        br: br * scale,
        bl: bl * scale,
      };
    } catch (_) {
      return null;
    }
  }

  function buildCcwRoundedHolePath(r) {
    var x = r.x;
    var y = r.y;
    var x2 = r.x + r.w;
    var y2 = r.y + r.h;
    var tl = r.tl > 0.4 ? r.tl : 0;
    var tr = r.tr > 0.4 ? r.tr : 0;
    var br = r.br > 0.4 ? r.br : 0;
    var bl = r.bl > 0.4 ? r.bl : 0;

    return (
      'M' + fmtNum(x + tl) + ',' + fmtNum(y) +
      (tl > 0 ? 'A' + fmtNum(tl) + ',' + fmtNum(tl) + ' 0 0 0 ' + fmtNum(x) + ',' + fmtNum(y + tl) : '') +
      'V' + fmtNum(y2 - bl) +
      (bl > 0 ? 'A' + fmtNum(bl) + ',' + fmtNum(bl) + ' 0 0 0 ' + fmtNum(x + bl) + ',' + fmtNum(y2) : '') +
      'H' + fmtNum(x2 - br) +
      (br > 0 ? 'A' + fmtNum(br) + ',' + fmtNum(br) + ' 0 0 0 ' + fmtNum(x2) + ',' + fmtNum(y2 - br) : '') +
      'V' + fmtNum(y + tr) +
      (tr > 0 ? 'A' + fmtNum(tr) + ',' + fmtNum(tr) + ' 0 0 0 ' + fmtNum(x2 - tr) + ',' + fmtNum(y) : '') +
      'Z'
    );
  }

  function disconnectHoleActiveObservers() {
    if (holeSubObs) {
      try { holeSubObs.disconnect(); } catch (_) {}
      holeSubObs = null;
    }
    if (holeResizeObs) {
      try { holeResizeObs.disconnect(); } catch (_) {}
      holeResizeObs = null;
    }
    if (holeRaf) {
      W.cancelAnimationFrame(holeRaf);
      holeRaf = 0;
    }
    holeRafUntil = 0;
  }

  function armHoleTransitionRaf(durationMs) {
    var until = Date.now() + Math.min(600, Math.max(120, Number(durationMs) || 360));
    if (until > holeRafUntil) holeRafUntil = until;
    if (holeRaf) return;
    var step = function () {
      holeRaf = 0;
      if (destroyed || !state.skinEnabled) return;
      syncBrowserHoleCutout();
      if (Date.now() < holeRafUntil || (doc.body && doc.body.querySelector('[data-split-transition]'))) {
        holeRaf = W.requestAnimationFrame(step);
      }
    };
    holeRaf = W.requestAnimationFrame(step);
  }

  function ensureHoleActiveObservers(holeNodes) {
    if (!holeSubObs && W.MutationObserver && doc.body) {
      holeSubObs = new MutationObserver(function (muts) {
        if (destroyed || !state.skinEnabled) return;
        syncBrowserHoleCutout();
        for (var i = 0; i < muts.length; i += 1) {
          if (muts[i].attributeName === 'data-split-transition') {
            armHoleTransitionRaf(560);
            break;
          }
        }
      });
      try {
        holeSubObs.observe(doc.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'data-browser-hole', 'data-has-browser-hole', 'data-split-transition'],
        });
      } catch (_) {}
    }

    if (W.ResizeObserver) {
      if (!holeResizeObs) {
        holeResizeObs = new ResizeObserver(function () {
          if (destroyed || !state.skinEnabled) return;
          syncBrowserHoleCutout();
        });
      } else {
        try { holeResizeObs.disconnect(); } catch (_) {}
      }
      try {
        if (doc.body) holeResizeObs.observe(doc.body);
        for (var i = 0; i < holeNodes.length; i += 1) {
          var hEl = holeNodes[i];
          holeResizeObs.observe(hEl);
          var sheet = hEl.closest && hEl.closest('.agy-sheet, .aux-drawer-popup');
          if (sheet) holeResizeObs.observe(sheet);
          var pane = hEl.closest && hEl.closest('[data-pane-id], [data-split-sized], [data-testid="aux-pane-split"]');
          if (pane) holeResizeObs.observe(pane);
        }
      } catch (_) {}
    }
  }

  function syncBrowserHoleCutout() {
    var root = doc.documentElement;
    var body = doc.body;
    if (!root || !state.skinEnabled) return '';

    var hasAttr =
      root.getAttribute('data-has-browser-hole') === 'true' ||
      Boolean(body && body.getAttribute('data-has-browser-hole') === 'true');
    var holeNodes = doc.querySelectorAll ? doc.querySelectorAll(ACTIVE_HOLE_SEL) : [];

    if (!hasAttr && (!holeNodes || holeNodes.length === 0)) {
      disconnectHoleActiveObservers();
      if (state.lastHoleClip !== '') {
        state.lastHoleClip = '';
        root.style.removeProperty('--prism-hole-clip');
        var stClear = doc.getElementById(STAGE_ID);
        if (stClear) stClear.style.clipPath = '';
        var fxClear = doc.getElementById(FX_CANVAS_ID);
        if (fxClear) fxClear.style.clipPath = '';
      }
      return '';
    }

    ensureHoleActiveObservers(holeNodes);

    var vw = Math.max(1, W.innerWidth || root.clientWidth || 1440);
    var vh = Math.max(1, W.innerHeight || root.clientHeight || 900);
    var subpaths = [];
    for (var i = 0; i < holeNodes.length; i += 1) {
      var m = measureClippedBrowserHole(holeNodes[i], vw, vh);
      if (m) subpaths.push(buildCcwRoundedHolePath(m));
    }

    var nextClip = subpaths.length > 0 ? 'path("M0,0H' + fmtNum(vw) + 'V' + fmtNum(vh) + 'H0Z ' + subpaths.join(' ') + '")' : '';
    if (nextClip !== state.lastHoleClip) {
      state.lastHoleClip = nextClip;
      if (nextClip) root.style.setProperty('--prism-hole-clip', nextClip);
      else root.style.removeProperty('--prism-hole-clip');
    }
    var stageEl = doc.getElementById(STAGE_ID);
    if (stageEl && stageEl.style.clipPath !== nextClip) stageEl.style.clipPath = nextClip;
    var fxEl = doc.getElementById(FX_CANVAS_ID);
    if (fxEl && fxEl.style.clipPath !== nextClip) fxEl.style.clipPath = nextClip;
    return nextClip;
  }

  function setWallpaperReady(ready) {
    var next = Boolean(ready && state.skinEnabled && !destroyed);
    state.wallpaperReady = next;
    var root = doc.documentElement;
    if (root) {
      if (next) {
        if (root.getAttribute(WALLPAPER_ATTR) !== 'ready') root.setAttribute(WALLPAPER_ATTR, 'ready');
      } else {
        root.removeAttribute(WALLPAPER_ATTR);
      }
    }
    if (next) syncBrowserHoleCutout();
  }

  function clearRootWatchdogTimers() {
    clearTimeout(state.watchdog15Timer);
    clearTimeout(state.watchdog80Timer);
    state.watchdog15Timer = 0;
    state.watchdog80Timer = 0;
  }

  function isHostRootHealthy() {
    var r = doc.getElementById('root') || (doc.querySelector && doc.querySelector('.monaco-workbench'));
    if (!r) return true;
    var b = r.getBoundingClientRect();
    return b.width >= 100 && b.height >= 100;
  }

  function armPostMountWatchdog() {
    if (destroyed || !state.skinEnabled) return;
    if (state._watchdogReported || state.watchdog15Timer || state.watchdog80Timer) return;
    state.watchdog15Timer = setTimeout(function () {
      state.watchdog15Timer = 0;
      if (destroyed || !state.skinEnabled) return;
      if (!isHostRootHealthy()) {
        state._watchdogReported = true;
        callHostRpc('canary.rollback', { reason: 'root_collapsed_1500ms' });
        destroy();
      }
    }, 1500);
    state.watchdog80Timer = setTimeout(function () {
      state.watchdog80Timer = 0;
      if (destroyed || !state.skinEnabled) return;
      state._watchdogReported = true;
      if (!isHostRootHealthy()) {
        callHostRpc('canary.rollback', { reason: 'root_collapsed_8000ms' });
        destroy();
      } else {
        callHostRpc('canary.healthy', {});
      }
    }, 8000);
  }

  // ---------------------------------------------------------------------------
  // Cross-Origin Sidecar Iframe Theme Sync Bridge (`theme-change`)
  // ---------------------------------------------------------------------------
  function syncSidecarIframes(cfg) {
    if (!doc.querySelectorAll) return;
    var isLight = state.effectiveTheme === 'light';
    var schemePair = COLOR_SCHEMES[cfg.colorScheme] || COLOR_SCHEMES['prism-default'];
    var S = isLight ? schemePair.light : schemePair.dark;
    var acc = resolveAccent(cfg, S, isLight);
    var sig = [state.effectiveTheme, cfg.colorScheme, acc.hex, cfg.layoutMode].join('|');
    if (sig === state.lastSidecarSig) return;
    state.lastSidecarSig = sig;

    var vars = {
      '--background': rgbToHex(parseRgbTriplet(S.base)),
      '--content': rgbToHex(parseRgbTriplet(S.base)),
      '--sidebar': rgbToHex(parseRgbTriplet(S.shade)),
      '--card': rgbToHex(parseRgbTriplet(S.tint1)),
      '--secondary': rgbToHex(parseRgbTriplet(S.tint2)),
      '--foreground': S.fg,
      '--secondary-foreground': S.fg2,
      '--muted-foreground': S.muted,
      '--placeholder': S.faint,
      '--primary': acc.hex,
      '--primary-foreground': acc.fg,
      '--accent': acc.hex,
      '--link': S.link,
      '--border': rgbaStr(parseRgbTriplet(S.pt), isLight ? 0.11 : 0.08),
      '--card-border': rgbaStr(parseRgbTriplet(S.pt), isLight ? 0.13 : 0.10),
    };

    var frames = [];
    doc.querySelectorAll('iframe[data-testid="sidecar-iframe"], [data-testid="sidecar-iframe-slot"] iframe').forEach(function (f) {
      if (frames.indexOf(f) < 0) frames.push(f);
    });
    for (var i = 0; i < frames.length; i += 1) {
      try {
        var cw = frames[i].contentWindow;
        if (cw && typeof cw.postMessage === 'function') {
          cw.postMessage(
            {
              type: 'theme-change',
              prismSync: true,
              payload: {
                theme: 'prism-' + cfg.colorScheme,
                themeType: state.effectiveTheme,
                colorScheme: cfg.colorScheme,
                accent: acc.hex,
                cssVariables: vars,
              },
            },
            '*'
          );
        }
      } catch (_) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Stage DOM, 7 Pre-Staged GPU Transitions, Slideshow & Playback Control
  // ---------------------------------------------------------------------------
  function ensureStage() {
    if (!doc.body) return null;
    var stage = doc.getElementById(STAGE_ID);
    if (!stage) {
      stage = doc.createElement('div');
      stage.id = STAGE_ID;
      stage.setAttribute('data-agy-prism-layer', '1');
      doc.body.insertBefore(stage, doc.body.firstChild);
    }
    stage.inert = true;
    stage.setAttribute('inert', '');
    stage.setAttribute('aria-hidden', 'true');
    stage.setAttribute('tabindex', '-1');
    if (state.lastHoleClip && stage.style.clipPath !== state.lastHoleClip) {
      stage.style.clipPath = state.lastHoleClip;
    }
    if (!stage.querySelector('.agy-prism-scrim')) {
      var scrim = doc.createElement('div');
      scrim.className = 'agy-prism-scrim';
      var vig = doc.createElement('div');
      vig.className = 'agy-prism-vignette';
      var grain = doc.createElement('div');
      grain.className = 'agy-prism-grain';
      stage.appendChild(scrim);
      stage.appendChild(vig);
      stage.appendChild(grain);
    }
    return stage;
  }

  function resolveEffectiveKind(item, cfg) {
    if (!item) return 'none';
    var k = String(item.kind || '').toLowerCase();
    if (k === 'scene') {
      var sm = String(item.sceneMode || '').toLowerCase();
      if (
        sm === 'video' ||
        sm === 'scene-video' ||
        sm.indexOf('video') >= 0 ||
        Boolean(item.sceneVideoUrl && (!sm || sm === 'video' || sm === 'scene-video')) ||
        (item.mediaUrl && (/\/scene-video\b/i.test(item.mediaUrl) || /\.(mp4|webm|mkv|avi|mov)(\?|$)/i.test(item.mediaUrl)))
      ) {
        return 'video';
      }
      if (
        sm === 'live' ||
        sm === 'scene-live' ||
        sm === 'web' ||
        sm.indexOf('web') >= 0 ||
        (item.mediaUrl && (/\/scene-live\b|\/scene-files\b/i.test(item.mediaUrl) || /\.html?(\?|$)/i.test(item.mediaUrl)))
      ) {
        return 'web';
      }
      if (item.mediaUrl || item.thumbUrl) return 'image';
      return 'aurora';
    }
    if (k === 'slideshow' || (k === 'image' && item.slidesUrl && state.slides && state.slides.length > 1)) return 'slideshow';
    if (k === 'image' || k === 'video' || k === 'web') return k;
    if (cfg && cfg.sourceUrl) return 'image';
    return 'none';
  }

  function pauseWrapMedia(wrap) {
    if (!wrap || !wrap.querySelectorAll) return;
    var vids = wrap.querySelectorAll('video, audio');
    for (var i = 0; i < vids.length; i += 1) {
      try {
        vids[i].pause();
      } catch (_) {}
    }
  }

  function disposeWrap(wrap) {
    if (!wrap) return;
    var idx = state.outgoingWraps.indexOf(wrap);
    if (idx >= 0) state.outgoingWraps.splice(idx, 1);
    var vids = wrap.querySelectorAll ? wrap.querySelectorAll('video, audio') : [];
    for (var i = 0; i < vids.length; i += 1) {
      try {
        vids[i].pause();
        vids[i].removeAttribute('src');
        vids[i].srcObject = null;
        vids[i].load();
      } catch (_) {}
    }
    var ifs = wrap.querySelectorAll ? wrap.querySelectorAll('iframe') : [];
    for (var j = 0; j < ifs.length; j += 1) {
      try {
        ifs[j].src = 'about:blank';
      } catch (_) {}
    }
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }

  function flushOutgoingWraps() {
    clearTimeout(state.transitionTimer);
    state.transitionTimer = 0;
    if (state.activeWrap && state.activeWrap.isConnected) {
      state.activeWrap.style.transition = '';
      state.activeWrap.style.clipPath = '';
      state.activeWrap.style.opacity = '';
    }
    while (state.outgoingWraps.length > 0) {
      disposeWrap(state.outgoingWraps.pop());
    }
  }

  function transitionDurationMs(speed) {
    if (speed === 'fast') return 260;
    if (speed === 'slow') return 900;
    return 520;
  }

  function applyTransitionAnimation(inWrap, outWrap, type, dir, durMs) {
    if (!outWrap || !outWrap.isConnected || outWrap === inWrap || doc.hidden || type === 'cut' || durMs <= 0) {
      flushOutgoingWraps();
      if (outWrap && outWrap !== inWrap) disposeWrap(outWrap);
      inWrap.style.opacity = '';
      inWrap.style.transition = '';
      inWrap.style.clipPath = '';
      return;
    }
    flushOutgoingWraps();
    pauseWrapMedia(outWrap);
    state.outgoingWraps.push(outWrap);
    var ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
    inWrap.style.transition = 'none';
    outWrap.style.transition = 'none';

    if (type === 'fade') {
      inWrap.style.opacity = '0';
      inWrap.offsetHeight;
      inWrap.style.transition = 'opacity ' + durMs + 'ms ' + ease;
      inWrap.style.opacity = '1';
    } else if (type === 'zoom') {
      inWrap.style.opacity = '0';
      inWrap.style.transform = 'scale(1.08)';
      inWrap.offsetHeight;
      inWrap.style.transition = 'opacity ' + durMs + 'ms ' + ease + ', transform ' + durMs + 'ms ' + ease;
      inWrap.style.opacity = '1';
      inWrap.style.transform = 'translate3d(var(--prism-px, 0px), var(--prism-py, 0px), 0)';
    } else if (type === 'push') {
      inWrap.style.opacity = '1';
      var tx = dir === 'left' ? '100%' : dir === 'right' ? '-100%' : '0%';
      var ty = dir === 'up' ? '100%' : dir === 'down' ? '-100%' : '0%';
      var ox = dir === 'left' ? '-35%' : dir === 'right' ? '35%' : '0%';
      var oy = dir === 'up' ? '-35%' : dir === 'down' ? '35%' : '0%';
      inWrap.style.transform = 'translate3d(' + tx + ', ' + ty + ', 0)';
      inWrap.offsetHeight;
      inWrap.style.transition = 'transform ' + durMs + 'ms ' + ease;
      outWrap.style.transition = 'transform ' + durMs + 'ms ' + ease + ', opacity ' + durMs + 'ms ease';
      inWrap.style.transform = 'translate3d(var(--prism-px, 0px), var(--prism-py, 0px), 0)';
      outWrap.style.transform = 'translate3d(' + ox + ', ' + oy + ', 0)';
      outWrap.style.opacity = '0.4';
    } else if (type === 'wipe') {
      inWrap.style.opacity = '1';
      var startClip =
        dir === 'right'
          ? 'inset(0 100% 0 0)'
          : dir === 'up'
            ? 'inset(100% 0 0 0)'
            : dir === 'down'
              ? 'inset(0 0 100% 0)'
              : 'inset(0 0 0 100%)';
      inWrap.style.clipPath = startClip;
      inWrap.offsetHeight;
      inWrap.style.transition = 'clip-path ' + durMs + 'ms ' + ease;
      inWrap.style.clipPath = 'inset(0 0 0 0)';
    } else if (type === 'iris') {
      inWrap.style.opacity = '1';
      inWrap.style.clipPath = 'circle(0% at 50% 50%)';
      inWrap.offsetHeight;
      inWrap.style.transition = 'clip-path ' + durMs + 'ms ' + ease;
      inWrap.style.clipPath = 'circle(150% at 50% 50%)';
    } else if (type === 'bars') {
      inWrap.style.opacity = '0';
      inWrap.style.clipPath = 'polygon(0 0, 100% 0, 100% 0, 0 0)';
      inWrap.offsetHeight;
      inWrap.style.transition = 'opacity ' + Math.round(durMs * 0.7) + 'ms ease, clip-path ' + durMs + 'ms ' + ease;
      inWrap.style.opacity = '1';
      inWrap.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
    }

    state.transitionTimer = setTimeout(function () {
      inWrap.style.transition = '';
      inWrap.style.clipPath = '';
      inWrap.style.opacity = '';
      disposeWrap(outWrap);
    }, durMs + 60);
  }

  function tryUnmuteAfterPlaying(vid) {
    if (!vid || vid !== state.activeVideo) return;
    var cfg = state.cfg;
    var shouldPause = Boolean(cfg.paused || state.autoPaused || cfg.agentBusyPaused);
    var wantUnmuted = !cfg.muted && cfg.volume > 0.005 && !shouldPause;
    vid.volume = clamp(cfg.volume, 0, 1);
    if (!wantUnmuted) {
      vid.muted = true;
      return;
    }
    if (!vid.muted) return;
    try {
      vid.muted = false;
      var up = vid.play();
      if (up && typeof up.catch === 'function') {
        up.catch(function () {
          if (vid !== state.activeVideo) return;
          vid.muted = true;
          vid.play().catch(function () {});
          armGestureUnmute();
        });
      }
    } catch (_) {
      vid.muted = true;
      armGestureUnmute();
    }
  }

  function syncMediaPlaybackState() {
    var cfg = state.cfg;
    var shouldPause = Boolean(cfg.paused || state.autoPaused || cfg.agentBusyPaused);
    var vid = state.activeVideo;
    if (vid) {
      try {
        if (Math.abs(vid.playbackRate - cfg.playbackRate) > 0.01) vid.playbackRate = cfg.playbackRate;
        var wantLoop = !(cfg.rotationEnabled && cfg.rotationTrigger === 'videoEnd');
        if (vid.loop !== wantLoop) vid.loop = wantLoop;
        vid.volume = clamp(cfg.volume, 0, 1);

        if (shouldPause) {
          if (vid.__prismPriming && vid.readyState < 2) {
            // Allow newly mounted video to decode frame 1 muted before honoring auto-pause (e.g. pauseOnBlur when clicking in sidecar UI)
            vid.muted = true;
            if (vid.paused) vid.play().catch(function () {});
          } else if (!vid.paused) {
            vid.pause();
          }
        } else {
          if (cfg.muted || cfg.volume <= 0.005) {
            vid.muted = true;
          }
          if (vid.paused) {
            // Always start play() muted first so Chromium autoplay policy never blocks!
            var needUnmuteAfter = !cfg.muted && cfg.volume > 0.005;
            if (needUnmuteAfter) vid.muted = true;
            var p = vid.play();
            if (p && typeof p.then === 'function') {
              p.then(
                function () {
                  if (needUnmuteAfter) tryUnmuteAfterPlaying(vid);
                },
                function () {
                  if (vid !== state.activeVideo) return;
                  vid.muted = true;
                  vid.play().catch(function () {});
                  if (needUnmuteAfter) armGestureUnmute();
                }
              );
            }
          } else if (!cfg.muted && cfg.volume > 0.005 && vid.muted) {
            tryUnmuteAfterPlaying(vid);
          }
        }
      } catch (_) {}
    }
    if (state.activeAudio) {
      try {
        state.activeAudio.volume = cfg.muted ? 0 : clamp(cfg.volume, 0, 1);
        state.activeAudio.muted = cfg.muted;
        if (shouldPause || cfg.muted) state.activeAudio.pause();
        else state.activeAudio.play().catch(function () {});
      } catch (_) {}
    }
    if (state.activeIframe && state.activeIframe.contentWindow) {
      try {
        state.activeIframe.contentWindow.postMessage(
          {
            type: 'we-lifecycle',
            paused: shouldPause,
            muted: cfg.muted,
            volume: cfg.muted ? 0 : cfg.volume,
          },
          '*'
        );
      } catch (_) {}
    }
  }

  function armGestureUnmute() {
    if (state.unmuteGestureCleanup) return;
    var handler = function () {
      if (state.unmuteGestureCleanup) {
        state.unmuteGestureCleanup();
        state.unmuteGestureCleanup = null;
      }
      if (state.activeVideo && !state.cfg.muted && state.cfg.volume > 0) {
        try {
          state.activeVideo.muted = false;
          state.activeVideo.volume = clamp(state.cfg.volume, 0, 1);
          if (!state.cfg.paused && !state.autoPaused) state.activeVideo.play().catch(function () {});
        } catch (_) {}
      }
    };
    doc.addEventListener('pointerdown', handler, { once: true, capture: true });
    doc.addEventListener('keydown', handler, { once: true, capture: true });
    state.unmuteGestureCleanup = function () {
      doc.removeEventListener('pointerdown', handler, { capture: true });
      doc.removeEventListener('keydown', handler, { capture: true });
    };
  }

  function shouldExtractAccent(item, cfg) {
    if (!cfg || cfg.accentMode !== 'dynamic' || !item) return false;
    var wid = item.id ? String(item.id) : '';
    if (wid && accentCache[wid]) return false;
    if (wid && cfg.extractedAccent && String(cfg.extractedAccent.wallpaperId || '') === wid && cfg.extractedAccent.darkHex) {
      return false;
    }
    return true;
  }

  function mountStageMedia(forceReplace) {
    var effMods = resolveEffectiveModules(state.cfg, state.composition);
    if (!effMods.wallpaperLayer) {
      clearInterval(state.slideTimer);
      state.slideTimer = 0;
      clearTimeout(state.pendingMediaTimer);
      state.pendingMediaTimer = 0;
      if (state.pendingWrap) { disposeWrap(state.pendingWrap); state.pendingWrap = null; }
      flushOutgoingWraps();
      if (state.activeWrap) { disposeWrap(state.activeWrap); state.activeWrap = null; }
      state.activeVideo = null;
      state.activeAudio = null;
      state.activeIframe = null;
      state.activeMediaKey = '';
      setWallpaperReady(false);
      var oldStage = doc.getElementById(STAGE_ID);
      if (oldStage && oldStage.parentNode) oldStage.parentNode.removeChild(oldStage);
      return;
    }
    var stage = ensureStage();
    if (!stage) return;
    var cfg = state.cfg;
    var item = state.item;
    var effKind = resolveEffectiveKind(item, cfg);
    var rawMediaUrl = '';
    if (effKind === 'video') {
      rawMediaUrl = String((item && (item.sceneVideoUrl || item.mediaUrl)) || cfg.sourceUrl || '').trim();
      if (item && item.mediaUrl && !/\/preview\//i.test(item.mediaUrl)) {
        rawMediaUrl = String(item.mediaUrl).trim();
      }
    } else if (effKind === 'web') {
      rawMediaUrl = String((item && (item.webUrl || item.sceneLiveUrl || item.mediaUrl)) || cfg.sourceUrl || '').trim();
      if (item && item.mediaUrl && !/\/preview\//i.test(item.mediaUrl)) {
        rawMediaUrl = String(item.mediaUrl).trim();
      }
    } else {
      rawMediaUrl = String((item && (item.mediaUrl || item.thumbUrl)) || cfg.sourceUrl || '').trim();
    }
    var mediaUrl = rawMediaUrl;
    var audioUrl = String((item && item.audioUrl) || '').trim();
    var mediaKey = effKind + '|' + mediaUrl + '|' + audioUrl + '|' + (state.slides ? state.slides.length : 0);

    var hasActive = Boolean(state.activeWrap && state.activeWrap.isConnected && state.wallpaperReady);
    var hasLivePending = Boolean(state.pendingWrap && state.pendingWrap.isConnected && state.pendingMediaTimer);
    if (!forceReplace && mediaKey === state.activeMediaKey && (hasActive || hasLivePending)) {
      if (hasActive && !state.transitionTimer && state.activeWrap.style.opacity === '0') {
        state.activeWrap.style.opacity = '';
        state.activeWrap.style.transition = '';
      }
      syncMediaPlaybackState();
      return;
    }
    state.activeMediaKey = mediaKey;
    var mountSeq = ++state.mediaMountSeq;
    clearInterval(state.slideTimer);
    state.slideTimer = 0;
    clearTimeout(state.pendingMediaTimer);
    state.pendingMediaTimer = 0;
    if (state.pendingWrap) {
      disposeWrap(state.pendingWrap);
      state.pendingWrap = null;
    }

    var prevWrap = state.activeWrap;
    var validPrevWrap = Boolean(prevWrap && prevWrap.isConnected && state.wallpaperReady);
    if (!validPrevWrap) {
      setWallpaperReady(false);
    }
    state.activeVideo = null;
    state.activeAudio = null;
    state.activeIframe = null;

    var nextWrap = doc.createElement('div');
    nextWrap.className = 'agy-prism-media-wrap';
    var scrimNode = stage.querySelector('.agy-prism-scrim');

    var commitMount = function () {
      if (destroyed || mountSeq !== state.mediaMountSeq) {
        disposeWrap(nextWrap);
        return;
      }
      if (nextWrap.parentNode !== stage) {
        stage.insertBefore(nextWrap, scrimNode || null);
      }
      state.pendingWrap = null;
      state.activeWrap = nextWrap;
      var validPrev = prevWrap && prevWrap.isConnected && prevWrap !== nextWrap ? prevWrap : null;
      applyTransitionAnimation(
        nextWrap,
        validPrev,
        validPrev ? cfg.switchTransition : 'cut',
        cfg.switchTransitionDir,
        transitionDurationMs(cfg.switchTransitionSpeed)
      );
      setWallpaperReady(true);
      syncMediaPlaybackState();
    };

    var failMount = function () {
      if (destroyed || mountSeq !== state.mediaMountSeq) {
        disposeWrap(nextWrap);
        return;
      }
      clearTimeout(state.pendingMediaTimer);
      state.pendingMediaTimer = 0;
      state.pendingWrap = null;
      if (state.activeVideo && nextWrap.contains(state.activeVideo)) state.activeVideo = null;
      if (state.activeAudio && nextWrap.contains(state.activeAudio)) state.activeAudio = null;
      if (state.activeIframe && nextWrap.contains(state.activeIframe)) state.activeIframe = null;
      disposeWrap(nextWrap);
      flushOutgoingWraps();
      if (prevWrap) disposeWrap(prevWrap);
      state.activeWrap = null;
      state.activeMediaKey = '';
      setWallpaperReady(false);
    };

    if (effKind === 'none') {
      failMount();
      return;
    }

    if (effKind === 'aurora') {
      var aurora = doc.createElement('div');
      aurora.className = 'agy-prism-media-el';
      var baseCol = (item && item.schemeColor) || '#1e293b';
      aurora.style.background =
        'radial-gradient(ellipse 80% 70% at 22% 24%, ' +
        baseCol +
        ' 0%, transparent 65%), radial-gradient(ellipse 75% 75% at 80% 78%, rgba(102, 157, 246, 0.32) 0%, #09090b 100%)';
      nextWrap.appendChild(aurora);
      commitMount();
      return;
    }

    if (!mediaUrl && effKind !== 'slideshow') {
      failMount();
      return;
    }

    if (effKind === 'image') {
      var img = doc.createElement('img');
      img.className = 'agy-prism-media-el';
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.alt = '';
      var settledImg = false;
      var onImgDecoded = function () {
        if (settledImg) return;
        settledImg = true;
        clearTimeout(state.pendingMediaTimer);
        state.pendingMediaTimer = 0;
        if (destroyed || mountSeq !== state.mediaMountSeq) {
          disposeWrap(nextWrap);
          return;
        }
        if (!(img.naturalWidth > 0)) {
          failMount();
          return;
        }
        commitMount();
        if (shouldExtractAccent(item, state.cfg)) {
          extractAccent(img, item && item.id).then(function (acc) {
            if (acc && !destroyed) {
              state.cfg.extractedAccent = acc;
              refreshSkinStyles();
            }
          });
        }
      };
      var onImgFailed = function () {
        if (settledImg) return;
        settledImg = true;
        failMount();
      };
      state.pendingWrap = nextWrap;
      state.pendingMediaTimer = setTimeout(onImgFailed, 6000);
      img.onload = function () {
        var dec = typeof img.decode === 'function' ? img.decode() : null;
        if (dec && typeof dec.then === 'function') {
          dec.then(onImgDecoded, onImgDecoded);
        } else {
          onImgDecoded();
        }
      };
      img.onerror = onImgFailed;
      img.src = mediaUrl;
      nextWrap.appendChild(img);
      return;
    }

    if (effKind === 'slideshow') {
      var list = state.slides && state.slides.length ? state.slides : [mediaUrl];
      var firstSlide = String((list && list[0]) || '').trim();
      if (!firstSlide) {
        failMount();
        return;
      }
      state.slideIdx = 0;
      var imgA = doc.createElement('img');
      var imgB = doc.createElement('img');
      imgA.className = 'agy-prism-media-el';
      imgB.className = 'agy-prism-media-el';
      imgA.crossOrigin = 'anonymous';
      imgB.crossOrigin = 'anonymous';
      imgA.style.transition = 'opacity 680ms ease';
      imgB.style.transition = 'opacity 680ms ease';
      imgB.style.opacity = '0';
      nextWrap.appendChild(imgA);
      nextWrap.appendChild(imgB);

      var settledSlide = false;
      var startSlideLoop = function () {
        var frontIsA = true;
        var intervalSec = cfg.pictureSlideSeconds > 0 ? cfg.pictureSlideSeconds : 30;
        if (list.length > 1) {
          state.slideTimer = setInterval(function () {
            if (state.cfg.paused || state.autoPaused) return;
            state.slideIdx = (state.slideIdx + 1) % list.length;
            var incoming = frontIsA ? imgB : imgA;
            var outgoing = frontIsA ? imgA : imgB;
            incoming.onload = function () {
              if (!(incoming.naturalWidth > 0)) return;
              incoming.style.opacity = String(state.cfg.mediaOpacity);
              outgoing.style.opacity = '0';
              frontIsA = !frontIsA;
            };
            incoming.onerror = function () {};
            incoming.src = list[state.slideIdx];
          }, Math.max(5, intervalSec) * 1000);
        }
      };
      var onSlideDecoded = function () {
        if (settledSlide) return;
        settledSlide = true;
        clearTimeout(state.pendingMediaTimer);
        state.pendingMediaTimer = 0;
        if (destroyed || mountSeq !== state.mediaMountSeq) {
          disposeWrap(nextWrap);
          return;
        }
        if (!(imgA.naturalWidth > 0)) {
          failMount();
          return;
        }
        commitMount();
        startSlideLoop();
        if (shouldExtractAccent(item, state.cfg)) {
          extractAccent(imgA, item && item.id).then(function (acc) {
            if (acc && !destroyed) {
              state.cfg.extractedAccent = acc;
              refreshSkinStyles();
            }
          });
        }
      };
      var onSlideFailed = function () {
        if (settledSlide) return;
        settledSlide = true;
        failMount();
      };
      state.pendingWrap = nextWrap;
      state.pendingMediaTimer = setTimeout(onSlideFailed, 6000);
      imgA.onload = function () {
        var dec = typeof imgA.decode === 'function' ? imgA.decode() : null;
        if (dec && typeof dec.then === 'function') {
          dec.then(onSlideDecoded, onSlideDecoded);
        } else {
          onSlideDecoded();
        }
      };
      imgA.onerror = onSlideFailed;
      imgA.src = firstSlide;
      return;
    }

    if (effKind === 'video') {
      var video = doc.createElement('video');
      video.className = 'agy-prism-media-el';
      // Always start muted & connected in DOM BEFORE setting video.src so Chromium autoplay never blocks (#31/#32).
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';
      video.loop = !(cfg.rotationEnabled && cfg.rotationTrigger === 'videoEnd');
      video.playbackRate = cfg.playbackRate;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.setAttribute('disablepictureinpicture', '');
      if (item && item.thumbUrl) {
        video.poster = String(item.thumbUrl);
      }
      video.__prismPriming = true;

      video.addEventListener('ended', function () {
        if (state.cfg.rotationEnabled && state.cfg.rotationTrigger === 'videoEnd') {
          callHostRpc('playlist.step', { direction: 1, reason: 'videoEnd' });
        } else {
          try {
            video.currentTime = 0;
            video.play().catch(function () {});
          } catch (_) {}
        }
      });

      if (audioUrl) {
        var aud = doc.createElement('audio');
        aud.loop = true;
        aud.preload = 'auto';
        aud.src = audioUrl;
        nextWrap.appendChild(aud);
        state.activeAudio = aud;
      }

      nextWrap.appendChild(video);
      state.activeVideo = video;

      // Freeze outgoing 4K60 decoder immediately so incoming video decodes frame 1 without GPU contention.
      if (prevWrap) pauseWrapMedia(prevWrap);

      var needsCrossfade = Boolean(validPrevWrap && cfg.switchTransition !== 'cut' && !doc.hidden);
      nextWrap.style.opacity = needsCrossfade ? '0' : '0.001';
      state.pendingWrap = nextWrap;
      stage.insertBefore(nextWrap, scrimNode || null);

      var finishPriming = function () {
        if (!video.__prismPriming) return;
        video.__prismPriming = false;
        if (!destroyed && state.activeVideo === video) {
          syncMediaPlaybackState();
        }
      };
      var ensureVidPlaying = function () {
        if (!destroyed && state.activeVideo === video && video.paused) {
          syncMediaPlaybackState();
        }
      };

      var settledVid = false;
      var onVideoDecoded = function () {
        if (settledVid) return;
        if (destroyed || mountSeq !== state.mediaMountSeq || state.activeVideo !== video) {
          settledVid = true;
          disposeWrap(nextWrap);
          return;
        }
        if (video.readyState < 2 || !(video.videoWidth > 0)) return;
        settledVid = true;
        clearTimeout(state.pendingMediaTimer);
        state.pendingMediaTimer = 0;
        if (!needsCrossfade) nextWrap.style.opacity = '';
        finishPriming();
        commitMount();
        if (shouldExtractAccent(item, state.cfg) && item && item.thumbUrl) {
          extractAccent(item.thumbUrl, item.id).then(function (acc) {
            if (acc && !destroyed) {
              state.cfg.extractedAccent = acc;
              refreshSkinStyles();
            }
          });
        }
      };
      var onVideoFailed = function () {
        if (settledVid) return;
        settledVid = true;
        video.__prismPriming = false;
        failMount();
      };

      video.addEventListener('loadedmetadata', ensureVidPlaying, { once: true });
      video.addEventListener('loadeddata', onVideoDecoded);
      video.addEventListener('canplay', function () {
        ensureVidPlaying();
        onVideoDecoded();
      });
      video.addEventListener('playing', onVideoDecoded);
      video.addEventListener('timeupdate', onVideoDecoded);
      video.addEventListener('error', onVideoFailed, { once: true });
      if (typeof video.requestVideoFrameCallback === 'function') {
        try {
          video.requestVideoFrameCallback(function () {
            onVideoDecoded();
          });
        } catch (_) {}
      }

      state.pendingMediaTimer = setTimeout(function () {
        if (video.readyState >= 2 && video.videoWidth > 0) onVideoDecoded();
        else onVideoFailed();
      }, 6000);

      video.src = mediaUrl;
      syncMediaPlaybackState();
      if (video.readyState >= 2 && video.videoWidth > 0) {
        onVideoDecoded();
      }
      return;
    }

    if (effKind === 'web') {
      var iframe = doc.createElement('iframe');
      iframe.className = 'agy-prism-media-el';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.setAttribute('allow', 'autoplay');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('scrolling', 'no');
      iframe.setAttribute('tabindex', '-1');
      var needsWebCrossfade = Boolean(validPrevWrap && cfg.switchTransition !== 'cut' && !doc.hidden);
      nextWrap.style.opacity = needsWebCrossfade ? '0' : '0.001';
      nextWrap.appendChild(iframe);
      state.activeIframe = iframe;
      state.pendingWrap = nextWrap;

      var settledWeb = false;
      var onWebLoaded = function () {
        if (settledWeb) return;
        settledWeb = true;
        clearTimeout(state.pendingMediaTimer);
        state.pendingMediaTimer = 0;
        if (destroyed || mountSeq !== state.mediaMountSeq || state.activeIframe !== iframe) {
          disposeWrap(nextWrap);
          return;
        }
        if (!needsWebCrossfade) nextWrap.style.opacity = '';
        commitMount();
        if (shouldExtractAccent(item, state.cfg) && item && item.thumbUrl) {
          extractAccent(item.thumbUrl, item.id).then(function (acc) {
            if (acc && !destroyed) {
              state.cfg.extractedAccent = acc;
              refreshSkinStyles();
            }
          });
        }
      };
      var onWebFailed = function () {
        if (settledWeb) return;
        settledWeb = true;
        failMount();
      };

      iframe.addEventListener('load', onWebLoaded, { once: true });
      iframe.addEventListener('error', onWebFailed, { once: true });
      state.pendingMediaTimer = setTimeout(onWebFailed, 6000);
      stage.insertBefore(nextWrap, scrimNode || null);
      iframe.src = mediaUrl;
    }
  }

  // ---------------------------------------------------------------------------
  // Host Focus Handback Guard (Blocks Web Wallpaper Iframe Focus Theft!)
  // ---------------------------------------------------------------------------
  function setupFocusHandbackGuard() {
    listen(
      doc,
      'focusin',
      function (e) {
        var t = e && e.target;
        if (t && t !== doc.body && (!state.activeIframe || t !== state.activeIframe)) {
          state.lastHostFocus = t;
        }
      },
      true
    );
    listen(W, 'blur', function () {
      if (!state.activeIframe) return;
      setTimeout(function () {
        if (doc.activeElement === state.activeIframe) {
          try {
            if (state.lastHostFocus && state.lastHostFocus.isConnected && typeof state.lastHostFocus.focus === 'function') {
              state.lastHostFocus.focus({ preventScroll: true });
            } else {
              W.focus();
            }
          } catch (_) {}
        }
      }, 0);
    });
  }

  // ---------------------------------------------------------------------------
  // Smart Auto-Pause Lifecycle (Hidden 1200ms Debounce / Maximized-Safe Fullscreen / Battery)
  // ---------------------------------------------------------------------------
  function isGenuineFullscreenOcclusion() {
    var fsEl = doc.fullscreenElement;
    if (!fsEl) return false;
    if (fsEl === doc.documentElement || fsEl === doc.body) return false;
    if (fsEl.id === 'root' || fsEl.id === STAGE_ID) return false;
    if (fsEl.classList && (fsEl.classList.contains('agy-shell') || fsEl.classList.contains('monaco-workbench'))) {
      return false;
    }
    return true;
  }

  function evaluateAutoPause() {
    if (destroyed || !state.skinEnabled) return;
    var cfg = state.cfg;
    var reason = '';
    // Never check window dimensions (outerWidth/availWidth) so maximized windows never auto-pause (#31/#32).
    if (cfg.pauseOnFullscreen && isGenuineFullscreenOcclusion()) {
      reason = 'fullscreen';
    } else if (cfg.pauseOnBattery && state.batteryDischarging) {
      reason = 'battery';
    } else if (cfg.pauseOnHidden && doc.hidden && state.hiddenDebounced) {
      reason = 'hidden';
    } else if (cfg.pauseOnBlur && typeof doc.hasFocus === 'function' && !doc.hasFocus()) {
      reason = 'blur';
    }
    var nextPaused = Boolean(reason);
    if (nextPaused !== state.autoPaused || reason !== state.pauseReason) {
      var wokeFromHidden = state.autoPaused && !nextPaused;
      state.autoPaused = nextPaused;
      state.pauseReason = reason;
      syncMediaPlaybackState();
      if (wokeFromHidden && state.activeWrap) {
        // 2-frame repaint nudge after wake from minimize/virtual desktop switch.
        W.requestAnimationFrame(function () {
          W.requestAnimationFrame(function () {
            if (state.activeWrap) state.activeWrap.style.opacity = '0.999';
            setTimeout(function () {
              if (state.activeWrap) state.activeWrap.style.opacity = '';
            }, 16);
          });
        });
      }
    }
  }

  function setupLifecycleMonitors() {
    listen(doc, 'visibilitychange', function () {
      clearTimeout(state.hiddenTimer);
      if (doc.hidden) {
        // 1200ms debounce prevents black-screen flicker during quick virtual-desktop switches.
        state.hiddenTimer = setTimeout(function () {
          state.hiddenDebounced = Boolean(doc.hidden);
          evaluateAutoPause();
        }, 1200);
      } else {
        state.hiddenDebounced = false;
        evaluateAutoPause();
      }
    });
    listen(W, 'focus', evaluateAutoPause);
    listen(W, 'blur', evaluateAutoPause);
    listen(doc, 'fullscreenchange', evaluateAutoPause);

    state.blurPollTimer = setInterval(function () {
      if (state.cfg.pauseOnBlur || state.autoPaused) evaluateAutoPause();
    }, 3000);

    if (W.navigator && typeof W.navigator.getBattery === 'function') {
      W.navigator
        .getBattery()
        .then(function (bm) {
          if (destroyed || !bm) return;
          batteryObj = bm;
          var syncBat = function () {
            state.batteryDischarging = Boolean(
              bm.charging === false &&
                bm.level < 0.98 &&
                Number.isFinite(bm.dischargingTime) &&
                bm.dischargingTime > 0 &&
                bm.dischargingTime < 604800
            );
            evaluateAutoPause();
          };
          syncBat();
          if (bm.addEventListener) {
            bm.addEventListener('chargingchange', syncBat);
            cleanups.push(function () {
              try {
                bm.removeEventListener('chargingchange', syncBat);
              } catch (_) {}
            });
          }
        })
        .catch(function () {});
    }
  }

  // ---------------------------------------------------------------------------
  // Optional Pointer Forwarding, 3D Parallax (0fps idle) & Click/Trail FX Canvas
  // ---------------------------------------------------------------------------
  function stepParallax() {
    state.parallaxRaf = 0;
    if (destroyed || !state.skinEnabled || !state.cfg.parallaxEnabled || !state.activeWrap) return;
    var dx = state.parallaxTargetX - state.parallaxCurX;
    var dy = state.parallaxTargetY - state.parallaxCurY;
    state.parallaxCurX += dx * 0.12;
    state.parallaxCurY += dy * 0.12;
    state.activeWrap.style.setProperty('--prism-px', state.parallaxCurX.toFixed(2) + 'px');
    state.activeWrap.style.setProperty('--prism-py', state.parallaxCurY.toFixed(2) + 'px');
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      state.parallaxRaf = W.requestAnimationFrame(stepParallax);
    }
  }

  function ensureFxCanvas() {
    var c = doc.getElementById(FX_CANVAS_ID);
    if (!state.skinEnabled || !state.cfg.fxEnabled) {
      if (c && c.parentNode) c.parentNode.removeChild(c);
      return null;
    }
    if (!c && doc.body) {
      c = doc.createElement('canvas');
      c.id = FX_CANVAS_ID;
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:43;';
      doc.body.appendChild(c);
    }
    if (c && state.lastHoleClip && c.style.clipPath !== state.lastHoleClip) {
      c.style.clipPath = state.lastHoleClip;
    }
    if (c && (c.width !== W.innerWidth || c.height !== W.innerHeight)) {
      c.width = W.innerWidth;
      c.height = W.innerHeight;
    }
    return c;
  }

  function stepFx() {
    state.fxRaf = 0;
    var canvas = ensureFxCanvas();
    if (!canvas || !state.fxParticles.length) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var next = [];
    for (var i = 0; i < state.fxParticles.length; i += 1) {
      var p = state.fxParticles[i];
      p.life -= p.decay;
      if (p.life <= 0) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.grow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (p.ring) {
        ctx.strokeStyle = 'rgba(' + p.rgb + ', ' + (p.life * 0.55).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(' + p.rgb + ', ' + (p.life * 0.65).toFixed(3) + ')';
        ctx.fill();
      }
      next.push(p);
    }
    state.fxParticles = next;
    if (next.length > 0) {
      state.fxRaf = W.requestAnimationFrame(stepFx);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function setupPointerHooks() {
    listen(
      W,
      'pointermove',
      function (e) {
        if (!state.skinEnabled || state.autoPaused) return;
        var vw = Math.max(1, W.innerWidth);
        var vh = Math.max(1, W.innerHeight);

        if (state.activeIframe && state.activeIframe.contentWindow) {
          try {
            state.activeIframe.contentWindow.postMessage(
              { type: 'we-pointer', event: 'move', x: e.clientX / vw, y: e.clientY / vh, clientX: e.clientX, clientY: e.clientY },
              '*'
            );
          } catch (_) {}
        }

        if (state.cfg.parallaxEnabled) {
          var nx = (e.clientX / vw - 0.5) * -2;
          var ny = (e.clientY / vh - 0.5) * -2;
          state.parallaxTargetX = nx * state.cfg.parallaxStrength;
          state.parallaxTargetY = ny * state.cfg.parallaxStrength;
          if (!state.parallaxRaf) state.parallaxRaf = W.requestAnimationFrame(stepParallax);
        }

        if (state.cfg.fxEnabled) {
          var now = Date.now();
          if (now - state.lastTrailAt > 28) {
            state.lastTrailAt = now;
            var rgb = getComputedStyle(doc.documentElement).getPropertyValue('--prism-accent-rgb').trim() || '102, 157, 246';
            state.fxParticles.push({
              x: e.clientX,
              y: e.clientY,
              vx: (Math.random() - 0.5) * 0.8,
              vy: (Math.random() - 0.5) * 0.8 - 0.3,
              r: 2.2,
              grow: 0.04,
              life: 0.85,
              decay: 0.045,
              rgb: rgb,
              ring: false,
            });
            if (!state.fxRaf) state.fxRaf = W.requestAnimationFrame(stepFx);
          }
        }
      },
      { passive: true }
    );

    listen(
      W,
      'pointerdown',
      function (e) {
        if (!state.skinEnabled) return;
        if (!state.autoPaused && state.cfg.interactiveWeb && state.activeIframe && state.activeIframe.contentWindow) {
          var vw = Math.max(1, W.innerWidth);
          var vh = Math.max(1, W.innerHeight);
          try {
            state.activeIframe.contentWindow.postMessage(
              { type: 'we-pointer', event: 'down', x: e.clientX / vw, y: e.clientY / vh, clientX: e.clientX, clientY: e.clientY, button: e.button },
              '*'
            );
          } catch (_) {}
        }
        if (!state.cfg.fxEnabled) return;
        var rgb = getComputedStyle(doc.documentElement).getPropertyValue('--prism-accent-rgb').trim() || '102, 157, 246';
        state.fxParticles.push({
          x: e.clientX,
          y: e.clientY,
          vx: 0,
          vy: 0,
          r: 4,
          grow: 1.8,
          life: 1,
          decay: 0.045,
          rgb: rgb,
          ring: true,
        });
        for (var i = 0; i < 6; i += 1) {
          var ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.4;
          state.fxParticles.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(ang) * 1.9,
            vy: Math.sin(ang) * 1.9,
            r: 2.2,
            grow: -0.02,
            life: 0.95,
            decay: 0.05,
            rgb: rgb,
            ring: false,
          });
        }
        if (!state.fxRaf) state.fxRaf = W.requestAnimationFrame(stepFx);
      },
      { passive: true }
    );

    listen(
      W,
      'pointerup',
      function (e) {
        if (!state.skinEnabled || state.autoPaused || !state.cfg.interactiveWeb) return;
        if (state.activeIframe && state.activeIframe.contentWindow) {
          var vw = Math.max(1, W.innerWidth);
          var vh = Math.max(1, W.innerHeight);
          try {
            state.activeIframe.contentWindow.postMessage(
              { type: 'we-pointer', event: 'up', x: e.clientX / vw, y: e.clientY / vh, clientX: e.clientX, clientY: e.clientY, button: e.button },
              '*'
            );
          } catch (_) {}
        }
      },
      { passive: true }
    );

    listen(
      W,
      'resize',
      function () {
        if (destroyed || !state.skinEnabled) return;
        syncBrowserHoleCutout();
      },
      { passive: true }
    );

    listen(
      doc,
      'transitionrun',
      function () {
        if (destroyed || !state.skinEnabled) return;
        if (state.lastHoleClip) armHoleTransitionRaf(560);
      },
      true
    );
  }

  // ---------------------------------------------------------------------------
  // Root Attribute Sync, Style Rebuild & Self-Healing
  // ---------------------------------------------------------------------------
  function ensureStyleElement() {
    var el = doc.getElementById(STYLE_ID);
    if (!el) {
      el = doc.createElement('style');
      el.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(el);
    }
    return el;
  }

  function buildCompanionSvg(styleKey) {
    if (styleKey === 'neko') {
      return '<svg viewBox="0 0 32 32" width="28" height="28" shape-rendering="crispEdges"><rect x="6" y="6" width="4" height="4" fill="#c084fc"/><rect x="22" y="6" width="4" height="4" fill="#c084fc"/><rect x="6" y="10" width="20" height="14" rx="2" fill="#a855f7"/><rect x="10" y="14" width="3" height="3" fill="#0f172a"/><rect x="19" y="14" width="3" height="3" fill="#0f172a"/><rect x="14" y="18" width="4" height="2" fill="#f9a8d4"/></svg>';
    }
    if (styleKey === 'crabs') {
      return '<svg viewBox="0 0 32 32" width="28" height="28" shape-rendering="crispEdges"><rect x="5" y="10" width="4" height="5" fill="#fb7185"/><rect x="23" y="10" width="4" height="5" fill="#fb7185"/><rect x="8" y="13" width="16" height="9" fill="#f43f5e"/><rect x="11" y="15" width="3" height="3" fill="#fff"/><rect x="18" y="15" width="3" height="3" fill="#fff"/><rect x="12" y="16" width="2" height="2" fill="#0f172a"/><rect x="19" y="16" width="2" height="2" fill="#0f172a"/><rect x="7" y="22" width="3" height="4" fill="#e11d48"/><rect x="22" y="22" width="3" height="4" fill="#e11d48"/></svg>';
    }
    if (styleKey === 'orb') {
      return '<svg viewBox="0 0 32 32" width="28" height="28"><defs><radialGradient id="prOrb" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="#e0f2fe"/><stop offset="55%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#6366f1"/></radialGradient></defs><circle cx="16" cy="16" r="11" fill="url(#prOrb)"/><polygon points="16,7 22,16 16,25 10,16" fill="rgba(255,255,255,0.28)"/></svg>';
    }
    return '<svg viewBox="0 0 32 32" width="28" height="28" shape-rendering="crispEdges"><rect x="7" y="9" width="18" height="12" fill="#f97316"/><rect x="4" y="12" width="3" height="6" fill="#ea580c"/><rect x="25" y="12" width="3" height="6" fill="#ea580c"/><rect x="11" y="13" width="3" height="3" fill="#0f172a"/><rect x="18" y="13" width="3" height="3" fill="#0f172a"/><rect x="9" y="21" width="3" height="4" fill="#ea580c"/><rect x="14" y="21" width="4" height="4" fill="#ea580c"/><rect x="20" y="21" width="3" height="4" fill="#ea580c"/></svg>';
  }

  function removePixelCompanion() {
    var old = doc.getElementById(COMPANION_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    try {
      if (W.__dreamSkinOptical && typeof W.__dreamSkinOptical.teardown === 'function') {
        W.__dreamSkinOptical.teardown();
      }
    } catch (_) {}
  }

  function syncPixelCompanion(cfg, effMods) {
    var old = doc.getElementById(COMPANION_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!state.skinEnabled || !doc.body) {
      removePixelCompanion();
      return;
    }
    if (W.__dreamSkinOptical && typeof W.__dreamSkinOptical.apply === 'function') {
      try {
        W.__dreamSkinOptical.apply({
          skinEnabled: state.skinEnabled,
          config: cfg,
          composition: state.composition || { skinMode: cfg.skinMode || 'wallpaper', effectiveModules: effMods },
          adapterProfile: state.adapterProfile || null,
        });
      } catch (_) {}
    }
  }

  function refreshSkinStyles() {
    if (destroyed) return;
    var root = doc.documentElement;
    if (!root) return;

    if (!state.skinEnabled) {
      teardownSkinDomOnly();
      return;
    }

    var staticStyleEl = doc.getElementById(STATIC_STYLE_ID);
    if (staticStyleEl && staticStyleEl.parentNode) {
      staticStyleEl.parentNode.removeChild(staticStyleEl);
    }

    state.hostTheme = detectHostTheme();
    state.effectiveTheme = resolveEffectiveTheme(state.cfg);

    var effMods = resolveEffectiveModules(state.cfg, state.composition);
    var effKind = effMods.wallpaperLayer ? resolveEffectiveKind(state.item, state.cfg) : 'none';
    var rootAttrs = [
      [ROOT_ATTR, VERSION],
      [GLASS_ATTR, 'ready'],
      [SKIN_MODE_ATTR, state.cfg.skinMode || 'wallpaper'],
      [FACET_ATTR, effMods.opticalFacet ? 'on' : 'off'],
      [MOTION_ATTR, effMods.microMotion ? 'on' : 'off'],
      [COMPANION_ATTR, effMods.pixelCompanion ? 'on' : 'off'],
      ['data-prism-theme', state.effectiveTheme],
      ['data-prism-scheme', state.cfg.colorScheme],
      ['data-prism-accent-mode', state.cfg.accentMode],
      ['data-prism-layout', state.cfg.layoutMode],
      ['data-prism-corners', state.cfg.cornerStyle],
      ['data-prism-borders', state.cfg.borders],
      ['data-prism-shadows', state.cfg.shadows ? 'on' : 'off'],
      ['data-prism-glass', effMods.glassLayer ? 'on' : 'off'],
      ['data-prism-code-mode', state.cfg.codeReadabilityMode],
      ['data-prism-kind', effKind],
    ];
    for (var i = 0; i < rootAttrs.length; i += 1) {
      if (root.getAttribute(rootAttrs[i][0]) !== rootAttrs[i][1]) {
        root.setAttribute(rootAttrs[i][0], rootAttrs[i][1]);
      }
    }
    if (effMods.wallpaperLayer && state.wallpaperReady) {
      if (root.getAttribute(WALLPAPER_ATTR) !== 'ready') root.setAttribute(WALLPAPER_ATTR, 'ready');
    } else {
      root.removeAttribute(WALLPAPER_ATTR);
    }

    var tok = computeSkinTokens(state.cfg);
    applyFastCssVars(tok.vars);

    var styleEl = doc.getElementById(STYLE_ID);
    if (!styleEl || tok.structuralSig !== state.lastStructuralSig) {
      styleEl = ensureStyleElement();
      styleEl.textContent = buildStructuralPrismCss(state.cfg, tok);
      state.lastStructuralSig = tok.structuralSig;
    }

    var adapterCss = state.adapterProfile && state.adapterProfile.adapterCss ? String(state.adapterProfile.adapterCss) : '';
    var adapterEl = doc.getElementById(ADAPTER_STYLE_ID);
    if (adapterCss) {
      if (!adapterEl) {
        adapterEl = doc.createElement('style');
        adapterEl.id = ADAPTER_STYLE_ID;
        (doc.head || doc.documentElement).appendChild(adapterEl);
      }
      if (adapterEl.textContent !== adapterCss) adapterEl.textContent = adapterCss;
    } else if (adapterEl && adapterEl.parentNode) {
      adapterEl.parentNode.removeChild(adapterEl);
    }

    applyCaretStyle(state.cfg);
    ensureFxCanvas();
    syncPixelCompanion(state.cfg, effMods);
    syncBrowserHoleCutout();
    syncSidecarIframes(state.cfg);
  }

  function teardownSkinDomOnly() {
    clearRootWatchdogTimers();
    state._watchdogReported = false;
    disconnectHoleActiveObservers();
    clearInterval(state.slideTimer);
    state.slideTimer = 0;
    clearTimeout(state.pendingMediaTimer);
    state.pendingMediaTimer = 0;
    clearTimeout(state.transitionTimer);
    state.transitionTimer = 0;
    if (state.pendingWrap) {
      disposeWrap(state.pendingWrap);
      state.pendingWrap = null;
    }
    flushOutgoingWraps();
    if (state.activeWrap) {
      disposeWrap(state.activeWrap);
      state.activeWrap = null;
    }
    state.activeVideo = null;
    state.activeAudio = null;
    state.activeIframe = null;
    state.activeMediaKey = '';
    state.wallpaperReady = false;
    state.slides = [];
    state.lastStructuralSig = '';
    state.lastCaretSig = '';
    state.lastSidecarSig = '';
    clearFastCssVars();

    var stage = doc.getElementById(STAGE_ID);
    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    var styleEl = doc.getElementById(STYLE_ID);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    var adapterEl = doc.getElementById(ADAPTER_STYLE_ID);
    if (adapterEl && adapterEl.parentNode) adapterEl.parentNode.removeChild(adapterEl);
    var staticEl = doc.getElementById(STATIC_STYLE_ID);
    if (staticEl && staticEl.parentNode) staticEl.parentNode.removeChild(staticEl);
    var caretEl = doc.getElementById(CARET_STYLE_ID);
    if (caretEl && caretEl.parentNode) caretEl.parentNode.removeChild(caretEl);
    var fxEl = doc.getElementById(FX_CANVAS_ID);
    if (fxEl && fxEl.parentNode) fxEl.parentNode.removeChild(fxEl);
    removePixelCompanion();

    var root = doc.documentElement;
    if (root) {
      var attrs = [
        ROOT_ATTR,
        GLASS_ATTR,
        WALLPAPER_ATTR,
        SKIN_MODE_ATTR,
        FACET_ATTR,
        MOTION_ATTR,
        COMPANION_ATTR,
        'data-prism-theme',
        'data-prism-scheme',
        'data-prism-accent-mode',
        'data-prism-layout',
        'data-prism-corners',
        'data-prism-borders',
        'data-prism-shadows',
        'data-prism-glass',
        'data-prism-code-mode',
        'data-prism-kind',
      ];
      for (var i = 0; i < attrs.length; i += 1) root.removeAttribute(attrs[i]);
    }
  }

  function attachWatchers() {
    if (W.MutationObserver && !domObs && doc.body) {
      domObs = new MutationObserver(function () {
        if (destroyed || !state.skinEnabled) return;
        if (!doc.getElementById(STYLE_ID)) refreshSkinStyles();
        if (!doc.getElementById(STAGE_ID)) mountStageMedia(true);
      });
      try {
        domObs.observe(doc.body, { childList: true });
      } catch (_) {}
    }

    if (W.MutationObserver && !holeAttrObs && doc.documentElement) {
      holeAttrObs = new MutationObserver(function () {
        if (destroyed || !state.skinEnabled) return;
        syncBrowserHoleCutout();
      });
      try {
        holeAttrObs.observe(doc.documentElement, {
          attributes: true,
          attributeFilter: ['data-has-browser-hole', 'data-has-three-layer-browser-hole', 'data-has-drawer-browser-hole'],
        });
        if (doc.body) {
          holeAttrObs.observe(doc.body, {
            attributes: true,
            attributeFilter: ['data-has-browser-hole', 'data-has-three-layer-browser-hole', 'data-has-drawer-browser-hole'],
          });
        }
      } catch (_) {}
    }

    if (W.MutationObserver && !themeObs && doc.documentElement) {
      var onThemeMut = function () {
        if (themeDebounce || destroyed || !state.skinEnabled) return;
        themeDebounce = setTimeout(function () {
          themeDebounce = 0;
          var nextHost = detectHostTheme();
          if (nextHost !== state.hostTheme) {
            state.hostTheme = nextHost;
            refreshSkinStyles();
          }
        }, 32);
      };
      themeObs = new MutationObserver(onThemeMut);
      try {
        themeObs.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-ag-cs-theme'] });
        if (doc.body) themeObs.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      } catch (_) {}

      if (!themeMq && W.matchMedia) {
        try {
          themeMq = W.matchMedia('(prefers-color-scheme: light)');
          if (themeMq.addEventListener) themeMq.addEventListener('change', onThemeMut);
        } catch (_) {}
      }
    }

    syncBrowserHoleCutout();
  }

  function applyPayload(payload) {
    if (destroyed) return status();
    var p = payload && typeof payload === 'object' ? payload : {};
    lastPayload = p;

    if (p.skinEnabled === false || (p.config && p.config.skinEnabled === false)) {
      state.skinEnabled = false;
      teardownSkinDomOnly();
      return status();
    }

    state.skinEnabled = true;
    var rawCfg = p.config || p.prefs || p;
    var prevItemId = state.item && state.item.id ? String(state.item.id) : '';
    if (p.activeItem !== undefined) state.item = p.activeItem;
    else if (p.source && typeof p.source === 'object') {
      state.item = {
        id: p.source.id || rawCfg.wallpaperId || '',
        title: p.source.title || p.source.label || '',
        kind: p.source.kind || rawCfg.kind || 'image',
        mediaUrl: p.source.mediaUrl || p.source.url || '',
        thumbUrl: p.source.thumbUrl || p.source.url || '',
        audioUrl: p.source.audioUrl || '',
        slidesUrl: p.source.slidesUrl || '',
        sceneMode: p.source.sceneMode || '',
        sceneVideoUrl: p.source.sceneVideoUrl || '',
        sceneLiveUrl: p.source.sceneLiveUrl || '',
        webUrl: p.source.webUrl || '',
        schemeColor: p.source.schemeColor || '',
      };
    }
    var nextItemId = state.item && state.item.id ? String(state.item.id) : '';
    if (typeof p.mediaOrigin === 'string') state.mediaOrigin = p.mediaOrigin;
    if (p.adapterProfile && typeof p.adapterProfile === 'object') {
      state.adapterProfile = p.adapterProfile;
    } else if (p.adapterProfile === null) {
      state.adapterProfile = null;
    }
    if (Array.isArray(p.slides)) {
      state.slides = p.slides.slice();
    } else if (p.activeItem !== undefined || p.source !== undefined || nextItemId !== prevItemId || !(state.item && state.item.slidesUrl)) {
      state.slides = [];
    }

    if (p.composition && typeof p.composition === 'object') {
      state.composition = p.composition;
    } else if (p.composition === null) {
      state.composition = null;
    }
    state.cfg = normalizeConfig(rawCfg, state.item);

    var runMount = function () {
      if (destroyed || !state.skinEnabled) return;
      refreshSkinStyles();
      if (state.item && state.item.slidesUrl && (!p.slides || !p.slides.length) && W.fetch) {
        var reqItemId = state.item.id;
        var reqSlidesUrl = state.item.slidesUrl;
        W.fetch(reqSlidesUrl)
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (data) {
            if (
              data &&
              Array.isArray(data.slides) &&
              data.slides.length &&
              !destroyed &&
              state.skinEnabled &&
              state.item &&
              state.item.id === reqItemId &&
              state.item.slidesUrl === reqSlidesUrl
            ) {
              state.slides = data.slides.map(function (s) {
                return s && typeof s === 'object' ? String(s.url || s.mediaUrl || '') : String(s || '');
              }).filter(Boolean);
              refreshSkinStyles();
              mountStageMedia(true);
            }
          })
          .catch(function () {});
      }
      mountStageMedia(false);
      attachWatchers();
      evaluateAutoPause();
      armPostMountWatchdog();
    };

    if (doc.body) {
      runMount();
    } else {
      doc.addEventListener('DOMContentLoaded', runMount, { once: true });
    }
    return status();
  }

  function updateConfig(patch) {
    var cur = (lastPayload && (lastPayload.config || lastPayload.prefs)) || state.cfg || {};
    var merged = {};
    var k;
    for (k in cur) if (Object.prototype.hasOwnProperty.call(cur, k)) merged[k] = cur[k];
    if (patch && typeof patch === 'object') {
      for (k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) merged[k] = patch[k];
    }
    return applyPayload({
      skinEnabled: patch && typeof patch.skinEnabled === 'boolean' ? patch.skinEnabled : state.skinEnabled,
      config: merged,
      activeItem: state.item,
      mediaOrigin: state.mediaOrigin,
      slides: state.slides,
      adapterProfile: state.adapterProfile || null,
    });
  }

  function stepSlideshow(dir) {
    if (!state.slides || state.slides.length < 2) return status();
    var step = dir < 0 ? -1 : 1;
    state.slideIdx = (state.slideIdx + step + state.slides.length) % state.slides.length;
    mountStageMedia(true);
    return status();
  }

  function setPaused(flag) {
    return updateConfig({ paused: Boolean(flag) });
  }

  function heal() {
    if (destroyed || !state.skinEnabled) return status();
    if (doc.body) {
      if (!doc.getElementById(STYLE_ID)) refreshSkinStyles();
      if (!doc.getElementById(STAGE_ID)) {
        mountStageMedia(true);
      } else if (state.activeWrap && state.activeWrap.isConnected && !state.transitionTimer && state.activeWrap.style.opacity === '0') {
        state.activeWrap.style.opacity = '';
        state.activeWrap.style.transition = '';
      } else if (state.pendingWrap && state.pendingWrap.isConnected && !state.pendingMediaTimer) {
        mountStageMedia(true);
      }
      attachWatchers();
    }
    return status();
  }

  function status() {
    var body = doc.body;
    var checks = {};
    if (body) {
      try {
        var cs = getComputedStyle(body);
        checks = {
          bodyBg: cs.backgroundColor,
          tokenBackground: cs.getPropertyValue('--background').trim(),
          tokenCard: cs.getPropertyValue('--card').trim(),
          tokenSidebar: cs.getPropertyValue('--sidebar').trim(),
          tokenPrimary: cs.getPropertyValue('--primary').trim(),
        };
      } catch (_) {}
    }
    return {
      installed: !destroyed,
      version: VERSION,
      skinEnabled: state.skinEnabled,
      theme: state.effectiveTheme,
      hostTheme: state.hostTheme,
      layoutMode: state.cfg.layoutMode || 'islands',
      colorScheme: state.cfg.colorScheme || 'prism-default',
      codeReadabilityMode: state.cfg.codeReadabilityMode || 'translucent',
      kind: resolveEffectiveKind(state.item, state.cfg),
      wallpaperId: (state.item && state.item.id) || '',
      paused: Boolean(state.cfg.paused || state.autoPaused),
      autoPaused: Boolean(state.autoPaused),
      pauseReason: state.pauseReason,
      videoPaused: state.activeVideo ? Boolean(state.activeVideo.paused) : null,
      videoMuted: state.activeVideo ? Boolean(state.activeVideo.muted) : null,
      videoReadyState: state.activeVideo ? Number(state.activeVideo.readyState || 0) : 0,
      videoSrc: state.activeVideo ? String(state.activeVideo.currentSrc || state.activeVideo.src || '') : '',
      glassReady: Boolean(doc.documentElement && doc.documentElement.getAttribute(GLASS_ATTR) === 'ready'),
      wallpaperReady: Boolean(state.wallpaperReady),
      holeClip: state.lastHoleClip,
      stagePresent: Boolean(doc.getElementById(STAGE_ID)),
      stylePresent: Boolean(doc.getElementById(STYLE_ID)),
      checks: checks,
    };
  }

  function destroy() {
    if (destroyed) return { installed: false };
    destroyed = true;
    state.skinEnabled = false;
    clearRootWatchdogTimers();
    disconnectHoleActiveObservers();
    clearTimeout(state.hiddenTimer);
    clearInterval(state.blurPollTimer);
    clearTimeout(themeDebounce);
    if (state.parallaxRaf) W.cancelAnimationFrame(state.parallaxRaf);
    if (state.fxRaf) W.cancelAnimationFrame(state.fxRaf);
    if (state.unmuteGestureCleanup) state.unmuteGestureCleanup();
    try {
      if (domObs) domObs.disconnect();
      if (holeAttrObs) holeAttrObs.disconnect();
      if (themeObs) themeObs.disconnect();
    } catch (_) {}
    domObs = null;
    holeAttrObs = null;
    themeObs = null;
    for (var i = 0; i < cleanups.length; i += 1) {
      try {
        cleanups[i]();
      } catch (_) {}
    }
    cleanups = [];
    teardownSkinDomOnly();
    if (W[API_KEY] === api) {
      try {
        delete W[API_KEY];
      } catch (_) {
        W[API_KEY] = undefined;
      }
    }
    return { installed: false };
  }

  function setupPanicShortcutGuard() {
    var escTimes = [];
    var onPanicKey = function (ev) {
      if (destroyed) return;
      var k = String(ev && ev.key || '');
      var isChord = ev && ev.ctrlKey && ev.altKey && ev.shiftKey && (k === 'R' || k === 'r');
      if (isChord) {
        try { if (W.__agyPrismPanel && W.__agyPrismPanel.destroy) W.__agyPrismPanel.destroy(); } catch (_) {}
        destroy();
        return;
      }
      if (k === 'Escape') {
        var now = Date.now();
        escTimes = escTimes.filter(function (ts) { return now - ts <= 1800; });
        escTimes.push(now);
        if (escTimes.length >= 4) {
          escTimes = [];
          try { if (W.__agyPrismPanel && W.__agyPrismPanel.destroy) W.__agyPrismPanel.destroy(); } catch (_) {}
          destroy();
        }
      }
    };
    W.addEventListener('keydown', onPanicKey, true);
    cleanups.push(function () {
      try { W.removeEventListener('keydown', onPanicKey, true); } catch (_) {}
    });
  }

  setupFocusHandbackGuard();
  setupLifecycleMonitors();
  setupPointerHooks();
  setupPanicShortcutGuard();

  var api = {
    version: VERSION,
    applyPayload: applyPayload,
    apply: applyPayload,
    updateConfig: updateConfig,
    setPrefs: updateConfig,
    extractAccent: extractAccent,
    stepSlideshow: stepSlideshow,
    setPaused: setPaused,
    syncBrowserHoles: syncBrowserHoleCutout,
    heal: heal,
    status: status,
    receive: receive,
    destroy: destroy,
    alive: function () {
      return !destroyed;
    },
    getLastPayload: function () {
      return lastPayload;
    },
  };

  W[API_KEY] = api;

  var bootPayload = W.__AGY_PRISM_BOOT_PAYLOAD__ || carryPayload;
  if (bootPayload) {
    applyPayload(bootPayload);
  }

  return status();
})();
