/**
 * Wallpaper Engine Web API Shim, Focus Guard & Live Scene HTML Builder (`runtime/web-shim.mjs`)
 *
 * Ports `dsh-plugin-wallpaper-engine`:
 * - Focus Guard (`window.__weFocusGuard`): Blocks `window.focus()` unconditionally and gates
 *   `HTMLElement.prototype.focus` / `SVGElement.prototype.focus` to a 1000ms trusted-gesture window
 *   so background `<iframe>` wallpapers never steal keyboard focus from code editors or chat inputs.
 * - Wallpaper Engine Web API Shim: `window.wallpaperRegisterAudioListener` (128-bin stereo spectrum),
 *   `window.wallpaperPropertyListener` (`applyUserProperties`, `applyGeneralProperties`, `setPaused`),
 *   `window.__weSeedProps`, `window.__weUpdateProps`, `window.__wePushPointer`, plus `postMessage`
 *   bridge (`source: 'agy-prism-stage'`) so cross-origin `127.0.0.1:<port>` iframes update live.
 * - Live Scene & Built-in Prism Aurora HTML generator for `/scene-live/<token>`.
 */

/** Escape JSON safely for inline `<script>` embedding (`</script>` -> `<\/script>`). */
export function safeInlineJson(value) {
  return JSON.stringify(value ?? {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Returns the inline script body (without `<script>` tags) for `window.__weFocusGuard`.
 */
export function buildFocusGuardScript() {
  return `(function () {
  if (window.__weFocusGuard) return;
  var stats = { blocked: 0, elBlocked: 0, gestureIgnored: 0, lastGestureAt: -1e9 };
  Object.defineProperty(window, '__weFocusGuard', {
    value: stats,
    configurable: false,
    enumerable: false,
    writable: false
  });
  var nowFn = function () {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  };
  var recordTrustedGesture = function (ev) {
    if (ev && ev.isTrusted === true) {
      stats.lastGestureAt = nowFn();
    } else {
      stats.gestureIgnored += 1;
    }
  };
  ['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach(function (evtName) {
    window.addEventListener(evtName, recordTrustedGesture, true);
  });
  try {
    window.focus = function weFocusGuardNoop() {
      stats.blocked += 1;
    };
  } catch (_) {}
  var patchProtoFocus = function (Proto) {
    if (!Proto || typeof Proto.focus !== 'function' || Proto.focus.__weGuarded) return;
    var origFocus = Proto.focus;
    var guarded = function weGuardedElementFocus(options) {
      if ((nowFn() - stats.lastGestureAt) <= 1000) {
        return origFocus.call(this, options);
      }
      stats.elBlocked += 1;
    };
    guarded.__weGuarded = true;
    try { Proto.focus = guarded; } catch (_) {}
  };
  if (typeof HTMLElement !== 'undefined') patchProtoFocus(HTMLElement.prototype);
  if (typeof SVGElement !== 'undefined') patchProtoFocus(SVGElement.prototype);
})();`;
}

/**
 * Returns the inline script body (without `<script>` tags) for the Wallpaper Engine Web API shim.
 */
export function buildWebShimScript(seedProps = {}, options = {}) {
  const initialFps = Number.isFinite(Number(options.fps)) && Number(options.fps) > 0
    ? Math.min(120, Math.max(5, Math.round(Number(options.fps))))
    : 30;
  const initialPaused = Boolean(options.paused);
  const serializedSeed = safeInlineJson(seedProps);

  return `(function () {
  if (window.__weShimInstalled) return;
  window.__weShimInstalled = true;

  var state = {
    props: ${serializedSeed},
    fps: ${initialFps},
    paused: ${initialPaused},
    occluded: false,
    audioCallbacks: [],
    audioTimer: null,
    externalAudio: null,
    externalAudioUntil: 0,
    listener: window.wallpaperPropertyListener || null
  };

  function cloneProps(src) {
    var out = {};
    if (!src || typeof src !== 'object') return out;
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = src[k];
      out[k] = (v && typeof v === 'object' && 'value' in v) ? { value: v.value } : { value: v };
    }
    return out;
  }

  state.props = cloneProps(state.props);

  function notifyListenerAll(listener) {
    if (!listener || typeof listener !== 'object') return;
    try {
      if (typeof listener.applyGeneralProperties === 'function') {
        listener.applyGeneralProperties({ fps: state.fps });
      }
    } catch (_) {}
    try {
      if (typeof listener.applyUserProperties === 'function' && Object.keys(state.props).length > 0) {
        listener.applyUserProperties(cloneProps(state.props));
      }
    } catch (_) {}
    try {
      if (typeof listener.setPaused === 'function') {
        listener.setPaused(Boolean(state.paused || state.occluded));
      }
    } catch (_) {}
  }

  try {
    Object.defineProperty(window, 'wallpaperPropertyListener', {
      configurable: true,
      enumerable: true,
      get: function () { return state.listener; },
      set: function (val) {
        state.listener = val;
        if (val) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { notifyListenerAll(val); }, { once: true });
          } else {
            setTimeout(function () { notifyListenerAll(val); }, 0);
          }
        }
      }
    });
  } catch (_) {}

  if (state.listener) {
    setTimeout(function () { notifyListenerAll(state.listener); }, 0);
  }

  function ensureAudioLoop() {
    if (state.audioTimer || state.audioCallbacks.length === 0) return;
    var bins = new Array(128);
    for (var i = 0; i < 128; i++) bins[i] = 0;
    var tickMs = Math.max(16, Math.round(1000 / Math.min(60, Math.max(10, state.fps || 30))));
    state.audioTimer = setInterval(function () {
      if (state.paused || state.occluded || document.hidden) return;
      var now = Date.now();
      if (state.externalAudio && now < state.externalAudioUntil) {
        for (var j = 0; j < 128; j++) bins[j] = state.externalAudio[j] || 0;
      } else {
        var t = now * 0.0022;
        for (var b = 0; b < 64; b++) {
          var freqDecay = Math.exp(-b * 0.042);
          var wave = 0.5 + 0.35 * Math.sin(t + b * 0.24) + 0.15 * Math.cos(t * 1.7 - b * 0.11);
          var amp = Math.max(0, Math.min(1, wave * freqDecay * 0.28));
          bins[b] = amp;
          bins[b + 64] = amp * (0.94 + 0.06 * Math.sin(t * 0.8 + b));
        }
      }
      for (var c = 0; c < state.audioCallbacks.length; c++) {
        try { state.audioCallbacks[c](bins); } catch (_) {}
      }
    }, tickMs);
  }

  window.wallpaperRegisterAudioListener = function (cb) {
    if (typeof cb !== 'function') return;
    if (state.audioCallbacks.indexOf(cb) === -1) state.audioCallbacks.push(cb);
    ensureAudioLoop();
  };

  window.__weSeedProps = function (nextProps) {
    state.props = cloneProps(nextProps);
    if (state.listener && typeof state.listener.applyUserProperties === 'function') {
      try { state.listener.applyUserProperties(cloneProps(state.props)); } catch (_) {}
    }
  };

  window.__weUpdateProps = function (patch) {
    var norm = cloneProps(patch);
    var keys = Object.keys(norm);
    if (!keys.length) return;
    for (var i = 0; i < keys.length; i++) state.props[keys[i]] = norm[keys[i]];
    if (state.listener && typeof state.listener.applyUserProperties === 'function') {
      try { state.listener.applyUserProperties(norm); } catch (_) {}
    }
  };

  window.__weSetPaused = function (paused) {
    state.paused = Boolean(paused);
    if (state.listener && typeof state.listener.setPaused === 'function') {
      try { state.listener.setPaused(Boolean(state.paused || state.occluded)); } catch (_) {}
    }
  };

  window.__weSetOcclusion = function (occluded) {
    state.occluded = Boolean(occluded);
    if (state.listener && typeof state.listener.setPaused === 'function') {
      try { state.listener.setPaused(Boolean(state.paused || state.occluded)); } catch (_) {}
    }
  };

  window.__weSetFps = function (fps) {
    var n = Number(fps);
    if (!isFinite(n) || n <= 0) n = 30;
    state.fps = Math.min(120, Math.max(5, Math.round(n)));
    if (state.audioTimer) {
      clearInterval(state.audioTimer);
      state.audioTimer = null;
      ensureAudioLoop();
    }
    if (state.listener && typeof state.listener.applyGeneralProperties === 'function') {
      try { state.listener.applyGeneralProperties({ fps: state.fps }); } catch (_) {}
    }
  };

  window.__wePushAudio = function (arr) {
    if (!arr || typeof arr.length !== 'number') return;
    state.externalAudio = arr;
    state.externalAudioUntil = Date.now() + 500;
  };

  window.__wePushPointer = function (ev) {
    if (!ev || typeof ev !== 'object') return;
    var x = Number.isFinite(ev.x) ? ev.x : (Number.isFinite(ev.rx) ? ev.rx * window.innerWidth : 0);
    var y = Number.isFinite(ev.y) ? ev.y : (Number.isFinite(ev.ry) ? ev.ry * window.innerHeight : 0);
    var type = ev.type || 'mousemove';
    if ((type === 'mousedown' || type === 'pointerdown' || type === 'click') && window.__weFocusGuard) {
      window.__weFocusGuard.lastGestureAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
    var target = document.elementFromPoint(x, y) || document.body || document.documentElement;
    if (!target) return;
    try {
      var init = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, button: ev.button || 0 };
      if (typeof PointerEvent === 'function' && type.indexOf('pointer') === 0) {
        target.dispatchEvent(new PointerEvent(type, init));
      } else {
        target.dispatchEvent(new MouseEvent(type, init));
      }
    } catch (_) {}
  };

  window.addEventListener('message', function (event) {
    var msg = event && event.data;
    if (!msg || msg.source !== 'agy-prism-stage') return;
    if (msg.type === 'props' && msg.props) window.__weUpdateProps(msg.props);
    else if (msg.type === 'seedProps' && msg.props) window.__weSeedProps(msg.props);
    else if (msg.type === 'pause') window.__weSetPaused(Boolean(msg.paused));
    else if (msg.type === 'occlusion') window.__weSetOcclusion(Boolean(msg.occluded));
    else if (msg.type === 'fps') window.__weSetFps(msg.fps);
    else if (msg.type === 'pointer' && msg.pointer) window.__wePushPointer(msg.pointer);
    else if (msg.type === 'audio' && msg.bins) window.__wePushAudio(msg.bins);
  });
})();`;
}

/**
 * Injects `<base href>`, `window.__weFocusGuard`, and the Wallpaper Engine Web API shim
 * into an HTML wallpaper document before any author script runs.
 */
export function injectWebWallpaperHtml(rawHtml, { baseHref = '', seedProps = {}, fps = 30, paused = false } = {}) {
  const html = typeof rawHtml === 'string' ? rawHtml : String(rawHtml ?? '');
  const hasBase = /<base\s/i.test(html);
  const baseTag = baseHref && !hasBase ? `<base href="${escapeHtmlAttr(baseHref)}">` : '';
  const injectedBlock = [
    baseTag,
    `<script data-agy-prism="focus-guard">${buildFocusGuardScript()}</script>`,
    `<script data-agy-prism="we-shim">${buildWebShimScript(seedProps, { fps, paused })}</script>`,
  ].filter(Boolean).join('\n');

  const headMatch = /<head(?:\s[^>]*)?>/i.exec(html);
  if (headMatch) {
    const idx = headMatch.index + headMatch[0].length;
    return `${html.slice(0, idx)}\n${injectedBlock}\n${html.slice(idx)}`;
  }

  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(html);
  if (htmlMatch) {
    const idx = htmlMatch.index + htmlMatch[0].length;
    return `${html.slice(0, idx)}\n<head>${injectedBlock}</head>\n${html.slice(idx)}`;
  }

  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8">${injectedBlock}</head><body>\n${html}\n</body></html>`;
}

/**
 * Generates an interactive live scene HTML document for `/scene-live/<token>`
 * (handles both extracted WE Scene wallpapers and the built-in Prism Aurora scene).
 */
export function buildLiveSceneHtml(item = {}, config = {}, { sceneVideoUrl = '', thumbUrl = '', audioUrl = '' } = {}) {
  const fps = Number(config.sceneLiveFps) || 30;
  const paused = Boolean(config.paused);
  const muted = config.muted !== false;
  const volume = Number.isFinite(Number(config.volume)) ? Math.min(1, Math.max(0, Number(config.volume))) : 0.5;
  const schemeColor = typeof item.schemeColor === 'string' && item.schemeColor ? item.schemeColor : '#669DF6';
  const payloadJson = safeInlineJson({
    id: item.id || 'scene',
    title: item.title || 'Prism Scene',
    isBuiltinAurora: item.id === 'builtin-prism-aurora',
    sceneVideoUrl,
    thumbUrl,
    audioUrl,
    schemeColor,
    fps,
    paused,
    muted,
    volume,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtmlAttr(item.title || 'Prism Live Scene')}</title>
<script data-agy-prism="focus-guard">${buildFocusGuardScript()}</script>
<script data-agy-prism="we-shim">${buildWebShimScript(item.wireProps || {}, { fps, paused })}</script>
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    overflow: hidden; background: #090a0f; user-select: none;
  }
  #stage-bg, #stage-video, #stage-canvas {
    position: fixed; inset: 0; width: 100%; height: 100%;
    pointer-events: none;
  }
  #stage-bg {
    object-fit: cover; opacity: 0; transition: opacity 420ms ease;
    transform-origin: center center; will-change: transform;
  }
  #stage-bg.ready { opacity: 1; }
  #stage-video {
    object-fit: cover; opacity: 0; transition: opacity 420ms ease;
  }
  #stage-video.ready { opacity: 1; }
</style>
</head>
<body>
<img id="stage-bg" alt="" decoding="async" />
<video id="stage-video" playsinline loop preload="auto"></video>
<canvas id="stage-canvas"></canvas>
<audio id="stage-audio" loop preload="auto"></audio>
<script>
(function () {
  var cfg = ${payloadJson};
  var canvas = document.getElementById('stage-canvas');
  var ctx = canvas.getContext('2d', { alpha: true });
  var bgImg = document.getElementById('stage-bg');
  var vid = document.getElementById('stage-video');
  var aud = document.getElementById('stage-audio');

  var runtime = {
    paused: Boolean(cfg.paused),
    occluded: false,
    fps: Math.max(10, Math.min(60, Number(cfg.fps) || 30)),
    frames: 0,
    lastFrameAt: 0,
    pointerX: 0.5,
    pointerY: 0.5,
    targetX: 0.5,
    targetY: 0.5
  };

  window.__wp = runtime;
  window.__wpStats = function () {
    return { frames: runtime.frames, fps: runtime.fps, paused: runtime.paused, occluded: runtime.occluded };
  };

  if (cfg.thumbUrl && !cfg.isBuiltinAurora) {
    bgImg.onload = function () { bgImg.classList.add('ready'); };
    bgImg.src = cfg.thumbUrl;
  }

  if (cfg.sceneVideoUrl) {
    vid.muted = cfg.muted;
    vid.volume = cfg.volume;
    vid.oncanplay = function () {
      vid.classList.add('ready');
      if (!runtime.paused && !runtime.occluded) vid.play().catch(function () {});
    };
    vid.src = cfg.sceneVideoUrl;
  }

  if (cfg.audioUrl) {
    aud.muted = cfg.muted;
    aud.volume = cfg.volume;
    aud.src = cfg.audioUrl;
    if (!cfg.muted && !runtime.paused && !runtime.occluded) {
      aud.play().catch(function () {});
    }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('pointermove', function (e) {
    runtime.targetX = e.clientX / Math.max(1, window.innerWidth);
    runtime.targetY = e.clientY / Math.max(1, window.innerHeight);
  }, { passive: true });

  var motes = [];
  for (var i = 0; i < 42; i++) {
    motes.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.8 + Math.random() * 2.4,
      vx: (Math.random() - 0.5) * 0.00025,
      vy: -0.00015 - Math.random() * 0.00035,
      phase: Math.random() * Math.PI * 2
    });
  }

  function syncMediaPlayback() {
    var halt = runtime.paused || runtime.occluded || document.hidden;
    if (cfg.sceneVideoUrl) {
      if (halt) vid.pause();
      else vid.play().catch(function () {});
    }
    if (cfg.audioUrl) {
      if (halt || aud.muted) aud.pause();
      else aud.play().catch(function () {});
    }
  }

  window.wallpaperPropertyListener = {
    applyGeneralProperties: function (p) {
      if (p && p.fps) runtime.fps = Math.max(10, Math.min(60, Number(p.fps) || 30));
    },
    setPaused: function (p) {
      runtime.paused = Boolean(p);
      syncMediaPlayback();
    }
  };

  window.addEventListener('message', function (ev) {
    var msg = ev && ev.data;
    if (!msg || msg.source !== 'agy-prism-stage') return;
    if (msg.type === 'audioConfig') {
      var m = msg.muted !== false;
      var v = Math.min(1, Math.max(0, Number(msg.volume ?? 0.5)));
      vid.muted = m; vid.volume = v;
      aud.muted = m; aud.volume = v;
      syncMediaPlayback();
    }
  });

  function render(now) {
    requestAnimationFrame(render);
    if (runtime.paused || runtime.occluded || document.hidden) return;
    var minDelta = 1000 / runtime.fps;
    if (now - runtime.lastFrameAt < minDelta * 0.92) return;
    runtime.lastFrameAt = now;
    runtime.frames += 1;

    runtime.pointerX += (runtime.targetX - runtime.pointerX) * 0.05;
    runtime.pointerY += (runtime.targetY - runtime.pointerY) * 0.05;

    var w = canvas.width;
    var h = canvas.height;
    var t = now * 0.00035;
    ctx.clearRect(0, 0, w, h);

    if (cfg.isBuiltinAurora || (!cfg.sceneVideoUrl && !cfg.thumbUrl)) {
      var bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#090b12');
      bgGrad.addColorStop(0.52, '#101729');
      bgGrad.addColorStop(1, '#0b0e18');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      var ribbons = [
        { cx: 0.28 + Math.sin(t * 1.1) * 0.14, cy: 0.34 + Math.cos(t * 0.8) * 0.12, r: 0.56, c: 'rgba(102, 157, 246, 0.32)' },
        { cx: 0.72 + Math.cos(t * 0.9) * 0.14, cy: 0.42 + Math.sin(t * 1.2) * 0.12, r: 0.52, c: 'rgba(165, 138, 248, 0.26)' },
        { cx: 0.48 + Math.sin(t * 0.7 + 1.8) * 0.16, cy: 0.74 + Math.cos(t * 1.0) * 0.1, r: 0.50, c: 'rgba(80, 163, 123, 0.20)' }
      ];
      for (var rIdx = 0; rIdx < ribbons.length; rIdx++) {
        var rb = ribbons[rIdx];
        var gx = (rb.cx + (runtime.pointerX - 0.5) * 0.06) * w;
        var gy = (rb.cy + (runtime.pointerY - 0.5) * 0.06) * h;
        var rad = Math.max(w, h) * rb.r;
        var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        g.addColorStop(0, rb.c);
        g.addColorStop(1, 'rgba(9, 11, 18, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    } else if (cfg.thumbUrl && !cfg.sceneVideoUrl) {
      var kbScale = 1.045 + Math.sin(t * 0.65) * 0.015;
      var tx = (0.5 - runtime.pointerX) * 14 + Math.cos(t * 0.5) * 6;
      var ty = (0.5 - runtime.pointerY) * 10 + Math.sin(t * 0.4) * 4;
      bgImg.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + kbScale.toFixed(4) + ')';
    }

    ctx.save();
    for (var m = 0; m < motes.length; m++) {
      var p = motes[m];
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -0.04) { p.y = 1.04; p.x = Math.random(); }
      if (p.x < -0.04) p.x = 1.04;
      if (p.x > 1.04) p.x = -0.04;
      var alpha = 0.14 + 0.24 * (0.5 + 0.5 * Math.sin(now * 0.0016 + p.phase));
      ctx.fillStyle = 'rgba(215, 230, 255,' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  requestAnimationFrame(render);
})();
</script>
</body>
</html>`;
}

/** Crisp SVG preview for the built-in Prism Aurora fallback wallpaper. */
export function buildBuiltinAuroraSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090B12"/>
      <stop offset="52%" stop-color="#11192E"/>
      <stop offset="100%" stop-color="#0B0E18"/>
    </linearGradient>
    <radialGradient id="orbA" cx="30%" cy="32%" r="55%">
      <stop offset="0%" stop-color="#669DF6" stop-opacity="0.52"/>
      <stop offset="100%" stop-color="#669DF6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbB" cx="74%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#A58AF8" stop-opacity="0.44"/>
      <stop offset="100%" stop-color="#A58AF8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbC" cx="50%" cy="78%" r="48%">
      <stop offset="0%" stop-color="#50A37B" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#50A37B" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <rect width="640" height="360" fill="url(#orbA)"/>
  <rect width="640" height="360" fill="url(#orbB)"/>
  <rect width="640" height="360" fill="url(#orbC)"/>
  <g fill="#E2ECFF" fill-opacity="0.35">
    <circle cx="118" cy="84" r="2"/><circle cx="264" cy="62" r="1.6"/>
    <circle cx="448" cy="96" r="2.2"/><circle cx="536" cy="182" r="1.8"/>
    <circle cx="192" cy="244" r="1.5"/><circle cx="382" cy="268" r="2"/>
  </g>
</svg>`;
}
