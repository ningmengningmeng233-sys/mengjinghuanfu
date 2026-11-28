// DreamSkin Prism — Cross-Platform Dynamic Context Vial (liquid telemetry column)
// Mirrors the DSH NEXT smoked-glass 512K context vial and estimates usage from the live
// conversation DOM (chars / 2.4 ≈ tokens) plus a 1.5s sliding-window tok/s rate.
// Zero external URLs, zero host storage access. License: GPL-3.0-only.
(function (root) {
  'use strict';
  var G = root || (typeof globalThis !== 'undefined' ? globalThis : null);
  if (!G) return;

  var STYLE_ID = 'dreamskin-context-vial-css';
  var ROOT_ID = 'dreamskin-context-vial';
  var CONFLICT_SELECTORS = ['#op-vial', '[data-obsidian-vial]', '#ds-telemetry-pop'];
  var MAIN_SELECTORS = ['main', '[data-slot="main"]', '[role="log"]'];
  var MAX_TOKENS = 512000;
  var CHARS_PER_TOKEN = 2.4;
  var HIGH_WATER = 0.8;
  var TICK_MS = 500;
  var WINDOW_MS = 1500;

  var started = false;
  var mounted = false;
  var high = false;
  var collapsed = false;

  var styleEl = null;
  var rootEl = null;
  var fillEl = null;
  var pctEl = null;
  var rateEl = null;
  var capsulePctEl = null;

  var mo = null;
  var tickTimer = 0;
  var debounceTimer = 0;
  var onRootClick = null;
  var samples = [];

  function getDoc() {
    return G.document || null;
  }

  function makeEl(D, tag, cls, id) {
    var el = D.createElement(tag);
    if (cls) el.className = cls;
    if (id) el.id = id;
    return el;
  }

  function buildCss() {
    return [
      '@keyframes ds-vial-rise { from { background-position: 0 26px, 8px 16px; } to { background-position: 0 0, 8px -10px; } }',
      '.ds-vial { position: fixed; right: 18px; bottom: 92px; z-index: 2147483200; display: flex; flex-direction: column; align-items: center; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; color: #eef2ff; user-select: none; -webkit-user-select: none; cursor: pointer; }',
      '.ds-vial-body { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 9px 9px 8px; border-radius: 16px; background: linear-gradient(180deg, rgba(16,20,32,.72), rgba(9,12,20,.82)); border: 1px solid color-mix(in srgb, var(--prism-accent-1, #6EA8FF) 26%, transparent); box-shadow: inset 0 1px 0 rgba(235,243,255,.12), 0 18px 40px -12px rgba(0,0,0,.62); backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%); }',
      'html[data-prism-theme="light"] .ds-vial-body { background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(238,244,252,.9)); border-color: rgba(37,99,235,.18); box-shadow: inset 0 1px 0 #fff, 0 16px 34px -14px rgba(15,23,42,.24); color: #1e293b; }',
      '.ds-vial-head { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 10px; letter-spacing: .04em; }',
      '.ds-vial-cap { color: rgba(158,168,190,.9); }',
      'html[data-prism-theme="light"] .ds-vial-cap { color: #64748b; }',
      '.ds-vial-pct { font-size: 12px; font-weight: 700; color: var(--prism-accent-1, #cfe3ff); }',
      'html[data-prism-theme="light"] .ds-vial-pct { color: #1d4ed8; }',
      '.ds-vial-stage { display: flex; align-items: center; gap: 6px; }',
      '.ds-vial-glass { position: relative; width: 34px; height: 168px; border-radius: 999px; overflow: hidden; background: linear-gradient(90deg, rgba(255,255,255,.07) 0%, rgba(10,13,22,.72) 48%, rgba(255,255,255,.04) 100%); border: 1px solid rgba(196,218,255,.18); box-shadow: inset 0 0 16px rgba(0,0,0,.62), inset 2px 0 6px rgba(255,255,255,.06); }',
      'html[data-prism-theme="light"] .ds-vial-glass { background: linear-gradient(90deg, rgba(255,255,255,.92) 0%, rgba(226,236,250,.85) 55%, rgba(255,255,255,.88) 100%); border-color: rgba(37,99,235,.22); box-shadow: inset 0 0 10px rgba(30,58,138,.09); }',
      '.ds-vial-fill { position: absolute; left: 2px; right: 2px; bottom: 2px; border-radius: 0 0 999px 999px; overflow: hidden; background: var(--st-vial-grad, linear-gradient(180deg, #7CE2FF 0%, #3B82F6 54%, #4F46E5 100%)); box-shadow: 0 -2px 14px color-mix(in srgb, var(--st-accent-2, #64D2FF) 60%, transparent); transition: height 420ms cubic-bezier(.22,1,.36,1), background 320ms ease; }',
      '.ds-vial-fill::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; border-radius: 999px; background: radial-gradient(58% 100% at 50% 50%, rgba(235,248,255,.98) 0%, rgba(125,211,252,.55) 68%, transparent 100%); box-shadow: 0 0 12px rgba(186,230,253,.82); }',
      '.ds-vial-fill::after { content: ""; position: absolute; inset: 5px 0 0 0; pointer-events: none; opacity: .65; background-image: radial-gradient(1.2px 1.2px at 8px 10px, rgba(255,255,255,.85), transparent), radial-gradient(1px 1px at 20px 20px, rgba(186,230,253,.75), transparent), radial-gradient(1px 1px at 14px 4px, rgba(255,255,255,.65), transparent); background-size: 28px 28px; animation: ds-vial-rise 3.2s linear infinite; }',
      '[data-ds-vial-high="1"] .ds-vial-fill { background: linear-gradient(180deg, #FDE68A 0%, #E8845F 56%, #A84423 100%); box-shadow: 0 -2px 16px rgba(234,120,60,.6); }',
      '[data-ds-vial-high="1"] .ds-vial-pct { color: #fca5a5; }',
      '.ds-vial-scale { height: 140px; display: flex; flex-direction: column; justify-content: space-between; font-size: 9px; color: rgba(148,158,180,.85); }',
      'html[data-prism-theme="light"] .ds-vial-scale { color: #64748b; }',
      '.ds-vial-rate { font-size: 10px; font-variant-numeric: tabular-nums; color: rgba(158,168,190,.9); }',
      'html[data-prism-theme="light"] .ds-vial-rate { color: #475569; }',
      '.ds-vial-capsule { display: none; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: linear-gradient(180deg, rgba(16,20,32,.78), rgba(9,12,20,.86)); border: 1px solid color-mix(in srgb, var(--prism-accent-1, #6EA8FF) 30%, transparent); box-shadow: 0 10px 24px -10px rgba(0,0,0,.6); }',
      'html[data-prism-theme="light"] .ds-vial-capsule { background: linear-gradient(180deg, rgba(255,255,255,.94), rgba(238,244,252,.92)); border-color: rgba(37,99,235,.2); color: #1e293b; }',
      '.ds-vial-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--prism-accent-1, #6EA8FF); box-shadow: 0 0 8px color-mix(in srgb, var(--prism-accent-1, #6EA8FF) 70%, transparent); }',
      '.ds-vial-capsule-pct { font-size: 11px; font-weight: 700; }',
      '[data-ds-vial-collapsed="1"] .ds-vial-body { display: none; }',
      '[data-ds-vial-collapsed="1"] .ds-vial-capsule { display: inline-flex; }',
      '@media (prefers-reduced-motion: reduce) { .ds-vial-fill { transition: none; } .ds-vial-fill::after { animation: none; } }',
    ].join('\n');
  }

  function ensureStyle(D) {
    var head = D.head || D.documentElement;
    if (!head) return;
    if (!styleEl || !styleEl.parentNode) {
      styleEl = D.getElementById(STYLE_ID) || D.createElement('style');
      styleEl.id = STYLE_ID;
    }
    var css = buildCss();
    if (styleEl.textContent !== css) styleEl.textContent = css;
    if (!styleEl.parentNode) head.appendChild(styleEl);
  }

  function ensureDom(D) {
    var body = D.body || D.documentElement;
    if (!body) return;
    var stale = D.getElementById(ROOT_ID);
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

    rootEl = makeEl(D, 'div', 'ds-vial', ROOT_ID);
    rootEl.setAttribute('data-ds-vial', '1');
    rootEl.setAttribute('data-ds-vial-collapsed', collapsed ? '1' : '0');
    rootEl.setAttribute('data-ds-vial-high', high ? '1' : '0');
    rootEl.setAttribute('role', 'status');
    rootEl.setAttribute('aria-live', 'polite');

    var capsule = makeEl(D, 'div', 'ds-vial-capsule');
    capsule.appendChild(makeEl(D, 'span', 'ds-vial-dot'));
    capsulePctEl = makeEl(D, 'span', 'ds-vial-capsule-pct');
    capsulePctEl.textContent = '0%';
    capsule.appendChild(capsulePctEl);

    var panel = makeEl(D, 'div', 'ds-vial-body');
    var head = makeEl(D, 'div', 'ds-vial-head');
    var cap = makeEl(D, 'span', 'ds-vial-cap');
    cap.textContent = 'CTX';
    pctEl = makeEl(D, 'span', 'ds-vial-pct');
    pctEl.textContent = '0%';
    head.appendChild(cap);
    head.appendChild(pctEl);

    var stage = makeEl(D, 'div', 'ds-vial-stage');
    var glass = makeEl(D, 'div', 'ds-vial-glass');
    fillEl = makeEl(D, 'div', 'ds-vial-fill');
    fillEl.style.height = '4%';
    glass.appendChild(fillEl);
    var scale = makeEl(D, 'div', 'ds-vial-scale');
    var labels = ['384k', '256k', '128k'];
    for (var i = 0; i < labels.length; i += 1) {
      var s = makeEl(D, 'span', 'ds-vial-scale-tick');
      s.textContent = labels[i];
      scale.appendChild(s);
    }
    stage.appendChild(glass);
    stage.appendChild(scale);

    rateEl = makeEl(D, 'div', 'ds-vial-rate');
    rateEl.textContent = '0.0 tok/s';

    panel.appendChild(head);
    panel.appendChild(stage);
    panel.appendChild(rateEl);

    rootEl.appendChild(capsule);
    rootEl.appendChild(panel);

    onRootClick = function (ev) {
      try {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
      } catch (_) {}
      collapsed = !collapsed;
      if (rootEl) rootEl.setAttribute('data-ds-vial-collapsed', collapsed ? '1' : '0');
    };
    if (typeof rootEl.addEventListener === 'function') rootEl.addEventListener('click', onRootClick);
    body.appendChild(rootEl);
  }

  function pickConversationRoot(D) {
    for (var i = 0; i < MAIN_SELECTORS.length; i += 1) {
      try {
        var found = D.querySelector(MAIN_SELECTORS[i]);
        if (found) return found;
      } catch (_) {}
    }
    return D.body || null;
  }

  function readText(el) {
    if (!el) return '';
    var t = typeof el.innerText === 'string' ? el.innerText : el.textContent;
    return typeof t === 'string' ? t : '';
  }

  function render(pct, rate) {
    var pctText = pct.toFixed(1) + '%';
    if (pctEl && pctEl.textContent !== pctText) pctEl.textContent = pctText;
    if (capsulePctEl && capsulePctEl.textContent !== pctText) capsulePctEl.textContent = pctText;
    if (fillEl) fillEl.style.height = Math.max(4, Math.min(100, pct)).toFixed(1) + '%';
    var rateText = rate.toFixed(1) + ' tok/s';
    if (rateEl && rateEl.textContent !== rateText) rateEl.textContent = rateText;
  }

  function notifyHigh() {
    try {
      var notify = G.__obsidianPrismNotify;
      if (notify && typeof notify.vialHigh === 'function') notify.vialHigh();
    } catch (_) {}
  }

  function measure() {
    var D = getDoc();
    if (!D) return;
    var el = pickConversationRoot(D);
    var chars = readText(el).length;
    var tokens = chars / CHARS_PER_TOKEN;
    if (tokens > MAX_TOKENS) tokens = MAX_TOKENS;
    var pct = (tokens / MAX_TOKENS) * 100;
    if (pct > 100) pct = 100;

    var now = Date.now();
    samples.push({ t: now, tokens: tokens });
    while (samples.length && now - samples[0].t > WINDOW_MS) samples.shift();
    var rate = 0;
    if (samples.length >= 2) {
      var first = samples[0];
      var last = samples[samples.length - 1];
      var dt = (last.t - first.t) / 1000;
      if (dt > 0) rate = Math.max(0, (last.tokens - first.tokens) / dt);
    }

    if (pct >= HIGH_WATER * 100) {
      if (!high) {
        high = true;
        if (rootEl) rootEl.setAttribute('data-ds-vial-high', '1');
        notifyHigh();
      }
    } else if (high) {
      high = false;
      if (rootEl) rootEl.setAttribute('data-ds-vial-high', '0');
    }

    render(pct, rate);
  }

  function isOwnNode(node) {
    if (!rootEl || !node) return false;
    var el = node.nodeType === 1 ? node : node.parentNode;
    if (!el) return false;
    if (el === rootEl) return true;
    try {
      return typeof rootEl.contains === 'function' && rootEl.contains(el);
    } catch (_) {
      return false;
    }
  }

  function scheduleMeasure() {
    if (debounceTimer) {
      try { G.clearTimeout(debounceTimer); } catch (_) {}
    }
    if (typeof G.setTimeout !== 'function') return;
    debounceTimer = G.setTimeout(function () {
      debounceTimer = 0;
      if (started) measure();
    }, 120);
  }

  function startObserver(D) {
    if (mo || typeof G.MutationObserver !== 'function') return;
    var target = pickConversationRoot(D) || D.body;
    if (!target) return;
    try {
      mo = new G.MutationObserver(function (mutations) {
        if (!started) return;
        for (var i = 0; i < mutations.length; i += 1) {
          if (!isOwnNode(mutations[i].target)) {
            scheduleMeasure();
            return;
          }
        }
      });
      mo.observe(target, { childList: true, subtree: true, characterData: true });
    } catch (_) {
      mo = null;
    }
  }

  function startTick() {
    if (tickTimer || typeof G.setInterval !== 'function') return;
    tickTimer = G.setInterval(function () {
      if (started) measure();
    }, TICK_MS);
  }

  function hasConflict(D) {
    for (var i = 0; i < CONFLICT_SELECTORS.length; i += 1) {
      try {
        if (D.querySelector(CONFLICT_SELECTORS[i])) return true;
      } catch (_) {}
    }
    return false;
  }

  function syncMount() {
    if (!started) return false;
    var D = getDoc();
    if (!D) return false;
    if (hasConflict(D)) {
      unmount();
      mounted = false;
      return false;
    }
    ensureStyle(D);
    ensureDom(D);
    if (!mounted) {
      startObserver(D);
      startTick();
    }
    mounted = true;
    measure();
    return true;
  }

  function unmount() {
    if (mo) {
      try { mo.disconnect(); } catch (_) {}
      mo = null;
    }
    if (tickTimer) {
      try { G.clearInterval(tickTimer); } catch (_) {}
      tickTimer = 0;
    }
    if (debounceTimer) {
      try { G.clearTimeout(debounceTimer); } catch (_) {}
      debounceTimer = 0;
    }
    samples = [];
    if (rootEl && onRootClick && typeof rootEl.removeEventListener === 'function') {
      try { rootEl.removeEventListener('click', onRootClick); } catch (_) {}
    }
    onRootClick = null;
    if (rootEl && rootEl.parentNode) {
      try { rootEl.parentNode.removeChild(rootEl); } catch (_) {}
    }
    if (styleEl && styleEl.parentNode) {
      try { styleEl.parentNode.removeChild(styleEl); } catch (_) {}
    }
    styleEl = null;
    rootEl = null;
    fillEl = null;
    pctEl = null;
    rateEl = null;
    capsulePctEl = null;
    high = false;
  }

  function start() {
    started = true;
    return syncMount();
  }

  function stop() {
    started = false;
    mounted = false;
    unmount();
  }

  function update() {
    if (!started) return false;
    return syncMount();
  }

  function isRunning() {
    return mounted;
  }

  G.__dreamSkinContextVial = {
    start: start,
    stop: stop,
    update: update,
    isRunning: isRunning,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
