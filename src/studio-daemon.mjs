#!/usr/bin/env node
// Unified Authoritative Single-Daemon Backend for DreamSkin Prism v4.
// Shared by Windows/macOS standalone shell and Antigravity Sidecar (zero split-brain).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { VERSION } from './core/version.mjs';
import { rootDir } from './core/env.mjs';
import { acquireOrReuseDaemonLock } from './core/daemon-lock.mjs';
import { createFocusArbiter } from './core/focus-arbiter.mjs';
import { createMultiAppGuardian } from './core/multi-app-guardian.mjs';
import { appRuntimeById, listRuntimeProfiles } from './core/app-runtime.mjs';
import {
  COLOR_SCHEMES,
  COLOR_SCHEME_IDS,
  DEFAULT_V4_STORE,
  resolveAppEffectiveConfig,
  sanitizeConfig,
  sanitizeV4Store,
  SCENE_PRESETS,
  SCENE_PRESET_IDS,
} from './prism/shared/schema.mjs';
import { createWallpaperPrismEngine, resolveDefaultPrismDataDir } from './prism/engine/index.mjs';
import {
  disableAppShortcutAutoLoad,
  enableAppShortcutAutoLoad,
  inspectAppShortcuts,
} from './prism/cdp/shortcuts.mjs';
import { migrateV3DataIfNeeded } from './store/migrate-v3.mjs';
import { importLegacyDsskin } from './theme/dsskin-compat.mjs';
import { fetchTheme, listGallery } from './store/gallery.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUDIO_DIST_HTML = join(__dirname, 'studio-ui', 'dist', 'index.html');
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

const PRELOAD_SHIM_JS = `(function() {
  var params = new URLSearchParams(window.location.search);
  var boot = window.__SIDECAR_BOOT__ || {};
  var token = params.get('token') || boot.token || '';
  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'theme-change') {
      var vars = (event.data.payload && event.data.payload.cssVariables) || {};
      Object.keys(vars).forEach(function(k) { document.documentElement.style.setProperty(k, vars[k]); });
      window.dispatchEvent(new CustomEvent('prism-host-theme', { detail: vars }));
    }
  });
  function secureFetch(url, options) {
    var init = Object.assign({}, options || {});
    var headers = new Headers(init.headers || {});
    if (token) headers.set('X-Sidecar-Token', token);
    if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    init.headers = headers;
    return window.fetch(url, init);
  }
  if (!window.sidecar) {
    window.sidecar = { fetch: secureFetch };
  }
})();`;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = MAX_JSON_BYTES) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('JSON body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (total === 0) { resolvePromise({}); return; }
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (err) { reject(new Error(`Invalid JSON: ${err.message}`)); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error('Upload exceeds 512 MB limit'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function tokenEquals(expected, actual) {
  if (!expected) return true;
  if (!actual || typeof actual !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function renderStudioHtml(token) {
  const fallback = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>梦境换肤 Prism</title><script src="/preload.js"></script></head><body><div id="app">梦境换肤 Prism Studio 加载中…</div></body></html>`;
  const raw = existsSync(STUDIO_DIST_HTML) ? readFileSync(STUDIO_DIST_HTML, 'utf8') : fallback;
  const bootTag = `<script>window.__SIDECAR_BOOT__=${JSON.stringify({ token })};</script>`;
  let html = raw.includes('</head>') ? raw.replace('</head>', `${bootTag}\n</head>`) : `${bootTag}\n${raw}`;
  if (token) html = html.replace(/src=(["'])\/preload\.js\1/g, `src=$1/preload.js?token=${encodeURIComponent(token)}$1`);
  return html;
}

export async function startStudioDaemon(opts = {}) {
  const dataDir = resolveDefaultPrismDataDir(opts.dataDir || '');
  mkdirSync(dataDir, { recursive: true });
  const legacyRoot = opts.legacyRoot || rootDir();
  const lockFile = join(dataDir, 'daemon.lock.json');
  const v4StoreFile = join(dataDir, 'v4-store.json');

  // 1. Check if another live primary daemon already owns this dataDir (prevent split-brain)
  const preCheck = await acquireOrReuseDaemonLock({
    lockFile,
    port: 0,
    token: '',
    version: VERSION,
    pid: process.pid,
    probeFn: opts.probeFn,
  }).catch(() => null);

  if (preCheck && preCheck.role === 'reuse') {
    const lk = preCheck.lock;
    return {
      role: 'reuse',
      port: lk.port,
      token: lk.token,
      mediaPort: lk.mediaPort,
      mediaOrigin: lk.mediaPort ? `http://127.0.0.1:${lk.mediaPort}` : '',
      url: `http://127.0.0.1:${lk.port}/?token=${encodeURIComponent(lk.token)}`,
      close: async () => {},
    };
  }
  // Release placeholder lock until actual server port is bound
  preCheck?.release?.();

  // 2. Read-only one-time migration from DreamSkin v3 legacy data (never touches v3 files)
  const uploadsDir = join(dataDir, 'uploads');
  if (!opts.skipV3Migration) {
    try {
      migrateV3DataIfNeeded({ legacyRoot, v4DataDir: dataDir, uploadDir: uploadsDir });
    } catch {
      // non-fatal
    }
  }

  // 3. Boot Prism media & wallpaper engine
  const engine = await createWallpaperPrismEngine({
    dataDir,
    mediaPort: opts.mediaPort ?? 0,
    steamRoot: opts.steamRoot,
    includeDefaultPictures: opts.includeDefaultPictures,
    skipStartupScan: opts.skipStartupScan,
    disableDeferredScan: opts.disableDeferredScan,
  });

  // 4. Load or initialize v4 multi-app store
  let v4Store = sanitizeV4Store(DEFAULT_V4_STORE);
  try {
    if (existsSync(v4StoreFile)) {
      v4Store = sanitizeV4Store(JSON.parse(readFileSync(v4StoreFile, 'utf8').replace(/^\uFEFF/, '')));
    } else {
      v4Store = sanitizeV4Store({ version: 4, global: engine.getConfig(), apps: {} });
    }
  } catch {
    v4Store = sanitizeV4Store({ version: 4, global: engine.getConfig(), apps: {} });
  }

  function saveV4Store() {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(v4StoreFile, JSON.stringify(v4Store, null, 2) + '\n', 'utf8');
  }
  saveV4Store();

  const focusArbiter = createFocusArbiter({
    enabled: v4Store.global.focusFreezeEnabled !== false,
    pauseOnBattery: v4Store.global.pauseOnBattery !== false,
  });

  const getActiveItemForApp = (_appId, effCfg) => {
    const items = engine.listLibrary().items || [];
    const wid = effCfg?.activeWallpaperId || '';
    return items.find((i) => i.id === wid) || engine.getActiveItem() || items[0] || null;
  };

  const guardian = createMultiAppGuardian({
    dataDir,
    legacyRootDir: legacyRoot,
    getV4Store: () => v4Store,
    getActiveItemForApp,
    getMediaOrigin: () => engine.getMediaOrigin(),
    focusArbiter,
    skipInitialScan: Boolean(opts.skipInitialAppsScan),
  });

  const token = String(opts.token || randomBytes(24).toString('hex'));

  function buildFullState() {
    const lib = engine.listLibrary();
    return {
      ok: true,
      version: VERSION,
      pid: process.pid,
      mediaOrigin: engine.getMediaOrigin(),
      v4Store,
      apps: guardian.listAppsFast(),
      items: lib.items || [],
      stats: engine.getStats(),
      presets: engine.listPresets(),
      scenePresets: SCENE_PRESETS,
      scenePresetIds: SCENE_PRESET_IDS,
      colorSchemes: COLOR_SCHEMES,
      colorSchemeIds: COLOR_SCHEME_IDS,
      focus: focusArbiter.snapshot(),
    };
  }

  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = u.pathname;
      const method = (req.method || 'GET').toUpperCase();

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Sidecar-Token, X-Filename',
        });
        res.end();
        return;
      }

      if (method === 'GET' && pathname === '/api/ping') {
        sendJson(res, 200, { ok: true, pid: process.pid, version: VERSION, mode: 'primary' });
        return;
      }

      if (method === 'GET' && pathname === '/preload.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(PRELOAD_SHIM_JS);
        return;
      }

      if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(renderStudioHtml(token));
        return;
      }

      // All POST routes require X-Sidecar-Token
      if (method === 'POST') {
        const supplied = String(req.headers['x-sidecar-token'] || u.searchParams.get('token') || '');
        if (!tokenEquals(token, supplied)) {
          sendJson(res, 401, { ok: false, error: 'Unauthorized: missing or invalid X-Sidecar-Token' });
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/state') {
        sendJson(res, 200, buildFullState());
        return;
      }

      if (method === 'GET' && pathname === '/api/library') {
        sendJson(res, 200, { ok: true, ...engine.listLibrary(), stats: engine.getStats() });
        return;
      }

      if (method === 'POST' && pathname === '/api/library/scan') {
        const lib = await engine.listLibrary({ refresh: true });
        sendJson(res, 200, { ok: true, ...lib, stats: engine.getStats() });
        return;
      }

      if (method === 'POST' && pathname === '/api/library/upload') {
        const filename = decodeURIComponent(String(req.headers['x-filename'] || u.searchParams.get('filename') || 'upload.png'));
        const contentType = String(req.headers['content-type'] || 'application/octet-stream');
        const buf = await readRawBody(req);
        const up = await engine.uploadBuffer(buf, { filename, contentType });
        sendJson(res, 200, up);
        return;
      }

      if (method === 'GET' && pathname === '/api/gallery') {
        try {
          const data = await listGallery({
            sort: u.searchParams.get('sort') || 'popular',
            offset: Number(u.searchParams.get('offset') || 0),
            limit: Number(u.searchParams.get('limit') || 18),
            q: u.searchParams.get('q') || '',
            style: u.searchParams.get('style') || '',
          });
          sendJson(res, 200, { ok: true, ...data });
        } catch (err) {
          sendJson(res, 200, { ok: false, items: [], error: err?.message || '连接在线主题库失败' });
        }
        return;
      }

      if (method === 'POST' && pathname === '/api/gallery/download') {
        const body = await readJsonBody(req);
        const entry = await fetchTheme(String(body.id || ''));
        if (entry?.image && existsSync(entry.image)) {
          const buf = readFileSync(entry.image);
          const up = await engine.uploadBuffer(buf, { filename: `${entry.key}.jpg`, title: entry.name });
          sendJson(res, 200, { ok: true, entry, uploaded: up.item });
        } else {
          sendJson(res, 200, { ok: true, entry });
        }
        return;
      }

      if (method === 'POST' && pathname === '/api/import/dsskin') {
        const body = await readJsonBody(req);
        const resImport = importLegacyDsskin({
          filePath: body.filePath,
          rawText: body.rawText,
          uploadDir: engine.store.getUploadDir(),
        });
        if (!resImport.ok) {
          sendJson(res, 400, resImport);
          return;
        }
        await engine.listLibrary({ refresh: true });
        sendJson(res, 200, resImport);
        return;
      }

      if (method === 'POST' && pathname === '/api/apps/refresh') {
        const apps = await guardian.refreshAppsStatus();
        sendJson(res, 200, { ok: true, apps });
        return;
      }

      if (method === 'POST' && pathname === '/api/config') {
        const patch = await readJsonBody(req);
        v4Store = sanitizeV4Store({
          ...v4Store,
          global: sanitizeConfig(patch, v4Store.global),
        });
        saveV4Store();
        await engine.updateConfig(v4Store.global);
        focusArbiter.setOptions({
          enabled: v4Store.global.focusFreezeEnabled !== false,
          pauseOnBattery: v4Store.global.pauseOnBattery !== false,
        });
        sendJson(res, 200, { ok: true, global: v4Store.global, focus: focusArbiter.snapshot() });
        return;
      }

      // Per-app routes: /api/apps/:appId/<action>
      const appMatch = /^\/api\/apps\/([a-z0-9-]+)\/(config|apply|restore|wake|shortcuts|shortcuts\/enable|shortcuts\/disable|canary\/reset)$/.exec(pathname);
      if (appMatch) {
        const [, appId, action] = appMatch;
        if (action === 'config' && method === 'POST') {
          const patch = await readJsonBody(req);
          const prevEntry = v4Store.apps[appId] || { skinEnabled: true, inheritGlobal: false, overrides: {} };
          const nextOverrides = { ...(prevEntry.overrides || {}), ...(patch || {}) };
          delete nextOverrides.inheritGlobal;
          const nextSkinEnabled = typeof patch.skinEnabled === 'boolean' ? patch.skinEnabled : prevEntry.skinEnabled;
          const inheritGlobal = typeof patch.inheritGlobal === 'boolean' ? patch.inheritGlobal : false;
          v4Store.apps[appId] = {
            skinEnabled: nextSkinEnabled,
            inheritGlobal,
            overrides: inheritGlobal ? {} : nextOverrides,
          };
          saveV4Store();
          const effective = resolveAppEffectiveConfig(v4Store, appId);
          sendJson(res, 200, { ok: true, appId, entry: v4Store.apps[appId], effective });
          return;
        }
        if (action === 'apply' && method === 'POST') {
          const body = await readJsonBody(req);
          if (!v4Store.apps[appId]) v4Store.apps[appId] = { skinEnabled: true, inheritGlobal: true, overrides: {} };
          else v4Store.apps[appId].skinEnabled = true;
          saveV4Store();
          const result = await guardian.applyApp(appId, { force: Boolean(body.force) });
          sendJson(res, 200, result);
          return;
        }
        if (action === 'wake' && method === 'POST') {
          guardian.resetCanary(appId);
          if (!v4Store.apps[appId]) v4Store.apps[appId] = { skinEnabled: true, inheritGlobal: true, overrides: {} };
          else v4Store.apps[appId].skinEnabled = true;
          saveV4Store();
          const result = await guardian.applyApp(appId, { force: true });
          sendJson(res, 200, result);
          return;
        }
        if (action === 'restore' && method === 'POST') {
          const prevEntry = v4Store.apps[appId] || { skinEnabled: false, inheritGlobal: true, overrides: {} };
          v4Store.apps[appId] = { ...prevEntry, skinEnabled: false };
          saveV4Store();
          const result = await guardian.restoreApp(appId);
          sendJson(res, 200, result);
          return;
        }
        if (action === 'canary/reset' && method === 'POST') {
          const entry = guardian.resetCanary(appId);
          sendJson(res, 200, { ok: true, appId, canary: entry });
          return;
        }
        if (action === 'shortcuts' && method === 'GET') {
          const profile = appRuntimeById(appId);
          const info = await inspectAppShortcuts({ app: profile, dataDir });
          sendJson(res, 200, { ok: true, ...info });
          return;
        }
        if (action === 'shortcuts/enable' && method === 'POST') {
          const profile = appRuntimeById(appId);
          const info = await enableAppShortcutAutoLoad({ app: profile, dataDir });
          sendJson(res, 200, info);
          return;
        }
        if (action === 'shortcuts/disable' && method === 'POST') {
          const profile = appRuntimeById(appId);
          const info = await disableAppShortcutAutoLoad({ app: profile, dataDir });
          sendJson(res, 200, info);
          return;
        }
      }

      if (method === 'POST' && pathname === '/api/sync') {
        const body = await readJsonBody(req);
        const fromId = String(body.from || 'antigravity');
        const sourceEff = resolveAppEffectiveConfig(v4Store, fromId);
        const allIds = listRuntimeProfiles().map((p) => p.id);
        const targets = Array.isArray(body.targets) && body.targets.length > 0
          ? body.targets.filter((id) => allIds.includes(id) && id !== fromId)
          : allIds.filter((id) => id !== fromId);
        const syncFields = [
          'preset', 'activeWallpaperId', 'layoutMode', 'themeMode', 'colorScheme',
          'accentMode', 'customAccent', 'glassOpacity', 'glassBlur', 'scrimOpacity',
          'cornerStyle', 'borders', 'shadows', 'codeReadabilityMode', 'vignette',
        ];
        const snap = {};
        for (const k of syncFields) snap[k] = sourceEff[k];
        for (const tid of targets) {
          const prev = v4Store.apps[tid] || { skinEnabled: true, inheritGlobal: false, overrides: {} };
          v4Store.apps[tid] = {
            skinEnabled: prev.skinEnabled,
            inheritGlobal: false,
            overrides: { ...(prev.overrides || {}), ...snap },
          };
        }
        v4Store.syncTargets = targets;
        saveV4Store();
        sendJson(res, 200, { ok: true, from: fromId, syncedApps: targets });
        return;
      }

      if (method === 'POST' && pathname === '/api/restore-all') {
        const allIds = listRuntimeProfiles().map((p) => p.id);
        const results = [];
        for (const id of allIds) {
          const prev = v4Store.apps[id] || { skinEnabled: false, inheritGlobal: true, overrides: {} };
          v4Store.apps[id] = { ...prev, skinEnabled: false };
          results.push(await guardian.restoreApp(id));
        }
        saveV4Store();
        sendJson(res, 200, { ok: true, results });
        return;
      }

      if (method === 'POST' && pathname === '/api/focus') {
        const body = await readJsonBody(req);
        if (body.appId) {
          focusArbiter.reportFocus(body.appId, {
            focused: body.focused,
            visible: body.visible,
            dynamic: body.dynamic,
          });
        }
        if (typeof body.onBattery === 'boolean') {
          focusArbiter.setBatteryMode(body.onBattery);
        }
        await guardian.pushFocusDirectives();
        sendJson(res, 200, { ok: true, focus: focusArbiter.snapshot() });
        return;
      }

      if (method === 'POST' && pathname === '/api/playlists/step') {
        const body = await readJsonBody(req);
        const dir = Number(body.dir) < 0 ? -1 : 1;
        const step = await engine.stepPlaylist(dir);
        sendJson(res, 200, { ok: true, ...step });
        return;
      }

      sendJson(res, 404, { ok: false, error: `Route not found: ${method} ${pathname}` });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err?.message || String(err) });
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(Number(opts.port) || 0, '127.0.0.1', () => resolvePromise());
  });

  const boundPort = server.address().port;
  const mediaOrigin = engine.getMediaOrigin();
  const mediaPort = mediaOrigin ? Number(new URL(mediaOrigin).port || 0) : 0;

  const lockHandle = await acquireOrReuseDaemonLock({
    lockFile,
    port: boundPort,
    token,
    mediaPort,
    version: VERSION,
    mode: opts.mode || 'daemon',
    pid: process.pid,
    probeFn: async () => ({ ok: false }),
  });

  if (opts.autoPoll !== false) {
    guardian.startPolling(Number(opts.pollMs) || 4500);
  }

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    guardian.stopPolling();
    lockHandle.release();
    await new Promise((r) => server.close(() => r()));
    await engine.close();
  }

  return {
    role: 'primary',
    port: boundPort,
    token,
    mediaPort,
    mediaOrigin,
    dataDir,
    url: `http://127.0.0.1:${boundPort}/?token=${encodeURIComponent(token)}`,
    close,
  };
}

// Direct CLI boot: node src/studio-daemon.mjs [--port 0] [--print-json]
const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  const argAt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const daemon = await startStudioDaemon({
    port: Number(argAt('--port') || process.env.DREAMSKIN_STUDIO_PORT || 0),
    token: argAt('--token') || process.env.DREAMSKIN_STUDIO_TOKEN || '',
    dataDir: argAt('--data-dir') || '',
  });
  const info = { ok: true, role: daemon.role, port: daemon.port, token: daemon.token, url: daemon.url };
  console.log(JSON.stringify(info));
  if (daemon.role === 'reuse') {
    process.exit(0);
  }
  const shutdown = async () => {
    await daemon.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
