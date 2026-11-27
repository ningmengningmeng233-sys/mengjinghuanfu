// dsh-plugin-dreamskin 宿主后端半体（DreamSkin Prism v4.1）：
// 1. 订阅 webserver/index-inject 首屏注入三层样式（零首帧闪烁）；
// 2. 通过 ctx.inject(['webserver'], ...) 暴露只读本地路由 GET /dsh-plugin-dreamskin/state，
//    供前端半体 lib/client.js 热更新三模式样式、底图舞台与像素伙伴（免重启 DSH NEXT）；
// 3. 红线：仅读 %LOCALAPPDATA%\DreamSkin\dsh\ 下的 active-skin.css 与 active-payload.json，
//    绝不发外网、绝不读取会话内容/凭证/Cookie。
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLayers, removeLayers, parseSkinFile } from './overlay.js';

export const name = 'dsh-plugin-dreamskin';
export const VERSION = '{{version}}';
const API_STATE_PATH = '/dsh-plugin-dreamskin/state';
const API_OPTICAL_PATH = '/dsh-plugin-dreamskin/optical.js';
const OPTICAL_BUNDLE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'optical-bundle.js');

export function skinFilePath(env = process.env) {
  return join(env.LOCALAPPDATA || '', 'DreamSkin', 'dsh', 'active-skin.css');
}

export function payloadFilePath(env = process.env) {
  return join(env.LOCALAPPDATA || '', 'DreamSkin', 'dsh', 'active-payload.json');
}

export function loadLayers(env = process.env) {
  try { return parseSkinFile(readFileSync(skinFilePath(env), 'utf8')); } catch { return null; }
}

export function loadPayload(env = process.env) {
  try {
    const raw = readFileSync(payloadFilePath(env), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const _stateCache = new Map();
let _opticalBundleCache = { mtimeMs: -1, src: '' };

function readLatestMtime(env) {
  const skinFile = skinFilePath(env);
  const pFile = payloadFilePath(env);
  let mtimeMs = 0;
  try { if (existsSync(skinFile)) mtimeMs = Math.max(mtimeMs, statSync(skinFile).mtimeMs); } catch {}
  try { if (existsSync(pFile)) mtimeMs = Math.max(mtimeMs, statSync(pFile).mtimeMs); } catch {}
  return mtimeMs;
}

export function readSkinState(env = process.env) {
  const cacheKey = String((env && env.LOCALAPPDATA) || '');
  const mtimeMs = readLatestMtime(env);
  const cached = _stateCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.state;
  }
  const layers = loadLayers(env);
  const payload = loadPayload(env);
  const active = Boolean(layers && (layers.vars || layers.parts || layers.extra));
  const state = {
    ok: true,
    version: VERSION,
    active,
    mtimeMs,
    layers: active ? layers : { vars: '', parts: '', extra: '' },
    payload: active ? payload : null,
  };
  _stateCache.set(cacheKey, { mtimeMs, state });
  return state;
}

function readOpticalBundleCached() {
  try {
    const st = statSync(OPTICAL_BUNDLE_FILE);
    if (_opticalBundleCache.mtimeMs === st.mtimeMs && _opticalBundleCache.src) {
      return _opticalBundleCache.src;
    }
    const src = readFileSync(OPTICAL_BUNDLE_FILE, 'utf8');
    _opticalBundleCache = { mtimeMs: st.mtimeMs, src };
    return src;
  } catch {
    return '';
  }
}

export function createSkinSync(opts = {}) {
  const env = opts.env || process.env;
  const getDoc = opts.document ? () => opts.document : () => (typeof document !== 'undefined' ? document : null);
  const sync = () => {
    const doc = getDoc();
    if (!doc) return false;
    const layers = loadLayers(env);
    if (layers) applyLayers(doc, layers); else removeLayers(doc);
    return true;
  };
  return { sync };
}

export function skinStyleRows(env = process.env) {
  const layers = loadLayers(env);
  if (!layers) return [];
  const rows = [];
  for (const css of [layers.parts, layers.vars, layers.extra]) {
    if (css) rows.push({ kind: 'style', text: css });
  }
  return rows;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

export function apply(ctx, config = {}) {
  const env = config.env || process.env;
  const { sync } = createSkinSync({ env, document: config.document });
  const disposers = [];

  // 1) 首屏 HTML 样式注入（无闪烁）
  try {
    if (ctx && typeof ctx.on === 'function') {
      const off = ctx.on('webserver/index-inject', (table) => {
        try {
          if (!table || typeof table.push !== 'function') return;
          for (const row of skinStyleRows(env)) table.push(row);
        } catch {}
      });
      if (typeof off === 'function') disposers.push(off);
    }
  } catch {}

  // 2) 注册只读本地状态路由供前端半体热更新三模式皮肤
  try {
    if (ctx && typeof ctx.inject === 'function') {
      ctx.inject(['webserver'], (webCtx) => {
        const ws = webCtx && webCtx.webserver;
        if (!ws) return;
        const routeFn = typeof ws.addRoute === 'function'
          ? (p, h) => ws.addRoute(p, h, 'dreamskin: state')
          : typeof ws.route === 'function'
            ? (p, h) => ws.route(p, h)
            : null;
        if (!routeFn) return;
        const off = routeFn(API_STATE_PATH, (request, response) => {
          if (request && request.method && request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' });
            response.end();
            return;
          }
          const curMtime = readLatestMtime(env);
          let since = -1;
          try {
            const rawUrl = String((request && request.url) || '');
            const qIdx = rawUrl.indexOf('since=');
            if (qIdx >= 0) since = Number(rawUrl.slice(qIdx + 6).split('&')[0]);
          } catch {}
          if (Number.isFinite(since) && since >= 0 && since === curMtime) {
            sendJson(response, 200, { ok: true, unchanged: true, mtimeMs: curMtime });
            return;
          }
          sendJson(response, 200, readSkinState(env));
        });
        if (typeof off === 'function') disposers.push(off);
        const offOpt = routeFn(API_OPTICAL_PATH, (request, response) => {
          if (request && request.method && request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' });
            response.end();
            return;
          }
          const src = readOpticalBundleCached();
          response.writeHead(src ? 200 : 404, {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'no-cache',
          });
          response.end(src || '/* optical bundle unavailable */');
        });
        if (typeof offOpt === 'function') disposers.push(offOpt);
      });
    }
  } catch {}

  // 3) 文件变更监听（200ms 防抖，杜绝连续写盘引发事件循环卡顿）
  try {
    const file = skinFilePath(env);
    if (existsSync(dirname(file))) {
      let watchTimer = null;
      const w = watch(dirname(file), { persistent: false }, () => {
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          watchTimer = null;
          _stateCache.delete(String((env && env.LOCALAPPDATA) || ''));
          sync();
        }, 200);
      });
      disposers.push(() => {
        if (watchTimer) clearTimeout(watchTimer);
        try { w.close(); } catch {}
      });
    }
  } catch {}

  sync();
  return () => {
    for (const d of disposers) { try { d(); } catch {} }
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc) removeLayers(doc);
  };
}
