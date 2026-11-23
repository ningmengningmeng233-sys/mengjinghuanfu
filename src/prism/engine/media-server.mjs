/**
 * Loopback Media Server (`127.0.0.1:0`) with HTTP `206` Range, Virtual MP4 Faststart,
 * `scene.pkg` Video/Audio Extraction, Directory-Fenced Web Serving & Shim Injection (`media-server.mjs`)
 */

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createReadStream, existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, posix, relative, resolve, sep } from 'node:path';
import { Writable } from 'node:stream';
import { createMp4VfsKit, createVirtualSegmentStream } from './mp4-vfs.mjs';
import {
  extractSceneAudioPayload,
  extractSceneVideoPayload,
} from './pkg-scene.mjs';
import {
  buildBuiltinAuroraSvg,
  buildLiveSceneHtml,
  injectWebWallpaperHtml,
} from './runtime/web-shim.mjs';

const MIME_BY_EXT = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
});

const SAFE_TOKEN_RE = /^[a-zA-Z0-9_-]{1,120}$/;
const SCENE_BUFFER_CACHE_MAX_BYTES = 192 * 1024 * 1024;
const SCENE_BUFFER_CACHE_MAX_ENTRIES = 6;

export function mimeForPath(filePath, fallback = 'application/octet-stream') {
  const ext = extname(String(filePath || '')).toLowerCase();
  return MIME_BY_EXT[ext] || fallback;
}

export function tokenForWallpaperId(id) {
  const s = String(id || '').trim();
  if (SAFE_TOKEN_RE.test(s)) return s;
  return `tok-${createHash('sha1').update(s).digest('hex').slice(0, 20)}`;
}

function encodeUrlSubpath(relPosix) {
  return String(relPosix || '')
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Detect any path traversal attempt in raw URL BEFORE `new URL(...)` collapses `..` segments!
 */
export function hasRawTraversalAttempt(rawUrl) {
  if (typeof rawUrl !== 'string') return true;
  const qIdx = rawUrl.indexOf('?');
  const pathPart = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
  if (pathPart.includes('\0') || pathPart.includes('\\')) return true;

  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return true;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return true;

  // Check both raw and decoded segments for `.` traversal (`..`)
  for (const candidate of [pathPart, decoded]) {
    const segs = candidate.split('/');
    for (const seg of segs) {
      if (seg === '..' || seg.toLowerCase() === '%2e%2e' || seg.toLowerCase() === '.%2e' || seg.toLowerCase() === '%2e.') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Strictly resolve a relative request path inside `rootDir`, failing closed (`null`) on
 * any traversal, null byte, or symlink escaping outside `realpathSync(rootDir)`.
 */
function resolveWebAssetPath(rootDir, subSegments) {
  if (!rootDir || !Array.isArray(subSegments) || subSegments.length === 0) {
    return { status: 404, absPath: null };
  }
  const decodedSegs = [];
  for (const rawSeg of subSegments) {
    let seg = '';
    try {
      seg = decodeURIComponent(rawSeg);
    } catch {
      return { status: 403, absPath: null };
    }
    if (!seg || seg === '.') continue;
    if (seg === '..' || seg.includes('/') || seg.includes('\\') || seg.includes('\0')) {
      return { status: 403, absPath: null };
    }
    decodedSegs.push(seg);
  }
  if (decodedSegs.length === 0) return { status: 404, absPath: null };

  const absRoot = resolve(rootDir);
  let realRoot;
  try {
    realRoot = realpathSync(absRoot);
  } catch {
    return { status: 404, absPath: null };
  }

  const candidate = resolve(absRoot, ...decodedSegs);
  const relCheck = relative(absRoot, candidate);
  if (!relCheck || relCheck.startsWith('..') || relCheck.includes(`..${sep}`)) {
    return { status: 403, absPath: null };
  }

  if (!existsSync(candidate)) {
    return { status: 404, absPath: null };
  }

  try {
    const lst = lstatSync(candidate);
    if (lst.isSymbolicLink()) {
      return { status: 403, absPath: null };
    }
    const realCand = realpathSync(candidate);
    if (realCand !== realRoot && !realCand.startsWith(realRoot + sep)) {
      return { status: 403, absPath: null };
    }
    if (!lst.isFile()) {
      return { status: 404, absPath: null };
    }
    return { status: 200, absPath: realCand, relPosix: decodedSegs.join('/') };
  } catch {
    return { status: 403, absPath: null };
  }
}

/**
 * Parse HTTP `Range: bytes=start-end` header against `totalSize`.
 * Returns `null` if no Range header, `{ valid: false }` for 416, or `{ valid: true, start, end }`.
 */
export function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null;
  if (totalSize <= 0) return { valid: false };
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) return { valid: false };

  const startStr = m[1];
  const endStr = m[2];
  if (startStr === '' && endStr === '') return { valid: false };

  let start;
  let end;
  if (startStr === '') {
    // Suffix byte-range-spec: bytes=-500
    const suffixLen = Number(endStr);
    if (!Number.isInteger(suffixLen) || suffixLen <= 0) return { valid: false };
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? totalSize - 1 : Number(endStr);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return { valid: false };
    if (start < 0 || start >= totalSize || start > end) return { valid: false };
    end = Math.min(end, totalSize - 1);
  }
  return { valid: true, start, end };
}

export async function createMediaServer(opts = {}) {
  const host = '127.0.0.1';
  const requestedPort = Number.isInteger(opts.port) && opts.port >= 0 ? opts.port : 0;
  const keepAlive = Boolean(opts.keepAlive);
  let runtimeContextGetter = typeof opts.getRuntimeContext === 'function'
    ? opts.getRuntimeContext
    : () => ({ config: {}, userProps: {} });
  const cacheDirGetter = typeof opts.getCacheDir === 'function'
    ? opts.getCacheDir
    : () => (typeof opts.cacheDir === 'string' ? opts.cacheDir : '');

  const vfsKit = createMp4VfsKit();
  const registry = new Map(); // token -> entry
  const sockets = new Set();
  const activeStreams = new Set();

  // Bounded LRU for extracted `scene.pkg` MP4 / audio buffers
  const scenePayloadCache = new Map();
  let sceneCacheBytes = 0;

  function getCachedSceneBuffer(cacheKey, loaderFn) {
    const hit = scenePayloadCache.get(cacheKey);
    if (hit) {
      scenePayloadCache.delete(cacheKey);
      scenePayloadCache.set(cacheKey, hit);
      return hit;
    }
    const loaded = loaderFn();
    if (!loaded) return null;
    if (loaded.kind === 'buffer' && loaded.bytes && loaded.bytes.byteLength <= SCENE_BUFFER_CACHE_MAX_BYTES) {
      while (
        scenePayloadCache.size > 0
        && (
          scenePayloadCache.size >= SCENE_BUFFER_CACHE_MAX_ENTRIES
          || sceneCacheBytes + loaded.bytes.byteLength > SCENE_BUFFER_CACHE_MAX_BYTES
        )
      ) {
        const [oldestKey, oldestVal] = scenePayloadCache.entries().next().value;
        scenePayloadCache.delete(oldestKey);
        sceneCacheBytes = Math.max(0, sceneCacheBytes - (oldestVal.bytes?.byteLength || 0));
      }
      scenePayloadCache.set(cacheKey, loaded);
      sceneCacheBytes += loaded.bytes.byteLength;
    }
    return loaded;
  }

  function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, If-None-Match');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Timing-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  function sendJson(req, res, status, obj) {
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  }

  function pipeTrackedStream(stream, req, res) {
    activeStreams.add(stream);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      activeStreams.delete(stream);
      try { stream.destroy(); } catch { /* ignore */ }
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
    stream.on('error', () => {
      activeStreams.delete(stream);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      try { res.end(); } catch { /* ignore */ }
    });
    stream.on('end', () => activeStreams.delete(stream));
    stream.pipe(res);
  }

  function serveBufferWithRange(req, res, bytes, mime, etag = '') {
    const buf = Buffer.isBuffer(bytes)
      ? bytes
      : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const totalSize = buf.length;
    const headers = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=300',
    };
    if (etag) {
      headers.ETag = etag;
      if (!req.headers.range && req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
    }

    const range = parseByteRange(req.headers.range, totalSize);
    if (range && !range.valid) {
      res.writeHead(416, {
        ...headers,
        'Content-Range': `bytes */${totalSize}`,
        'Content-Length': 0,
      });
      res.end();
      return;
    }

    if (range && range.valid) {
      const slice = buf.subarray(range.start, range.end + 1);
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
        'Content-Length': slice.length,
      });
      if (req.method === 'HEAD') res.end();
      else res.end(slice);
      return;
    }

    res.writeHead(200, {
      ...headers,
      'Content-Length': totalSize,
    });
    if (req.method === 'HEAD') res.end();
    else res.end(buf);
  }

  function serveFileWithRange(req, res, absPath, { useMp4Vfs = false, sessionKey = '', cacheControl = 'public, max-age=300' } = {}) {
    let st;
    try {
      const lst = lstatSync(absPath);
      if (lst.isSymbolicLink() || !lst.isFile()) {
        sendJson(req, res, 403, { error: 'Symbolic links and non-files are forbidden' });
        return;
      }
      st = statSync(absPath);
    } catch {
      sendJson(req, res, 404, { error: 'Media file not found' });
      return;
    }

    const mime = mimeForPath(absPath);
    const ext = extname(absPath).toLowerCase();
    const vfsVariant = useMp4Vfs && (ext === '.mp4' || ext === '.m4v' || ext === '.mov')
      ? vfsKit.pinnedFaststartVariant(absPath, sessionKey || absPath)
      : null;
    const layout = vfsVariant || { kind: 'plain', absPath, size: st.size };

    const totalSize = layout.kind === 'virtual' ? layout.size : st.size;
    const etag = `"${totalSize.toString(16)}-${Math.trunc(st.mtimeMs).toString(16)}-${layout.kind === 'virtual' ? 'vfs' : 'raw'}"`;

    const baseHeaders = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
      ETag: etag,
    };

    if (!req.headers.range && req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }

    const range = parseByteRange(req.headers.range, totalSize);
    if (range && !range.valid) {
      res.writeHead(416, {
        ...baseHeaders,
        'Content-Range': `bytes */${totalSize}`,
        'Content-Length': 0,
      });
      res.end();
      return;
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : Math.max(0, totalSize - 1);
    const contentLength = totalSize === 0 ? 0 : (end - start + 1);
    const status = range ? 206 : 200;
    const headers = {
      ...baseHeaders,
      'Content-Length': contentLength,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${totalSize}` } : {}),
    };

    res.writeHead(status, headers);
    if (req.method === 'HEAD' || totalSize === 0) {
      res.end();
      return;
    }

    const stream = layout.kind === 'virtual'
      ? createVirtualSegmentStream(absPath, layout, start, end)
      : createReadStream(absPath, { start, end });
    pipeTrackedStream(stream, req, res);
  }

  let origin = '';

  const server = createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(req, res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const rawUrl = req.url || '/';
    if (hasRawTraversalAttempt(rawUrl)) {
      sendJson(req, res, 403, { error: 'Forbidden: path traversal blocked' });
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    } catch {
      sendJson(req, res, 400, { error: 'Malformed URL' });
      return;
    }

    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || (parts.length === 1 && parts[0] === 'health')) {
      sendJson(req, res, 200, { ok: true, entries: registry.size, origin });
      return;
    }

    const route = parts[0];
    const token = parts[1] ? decodeURIComponent(parts[1]) : '';
    const entry = token ? registry.get(token) : null;

    // Security: even for unknown tokens on `/web/` or `/scene-files/`, traversal was caught above;
    // missing token returns 404.
    if (!entry) {
      sendJson(req, res, 404, { error: 'Unknown media token' });
      return;
    }

    const fsMeta = entry._fs || {};

    if (route === 'media') {
      if (!fsMeta.primaryAbs) {
        sendJson(req, res, 404, { error: 'No primary media file for item' });
        return;
      }
      serveFileWithRange(req, res, fsMeta.primaryAbs, {
        useMp4Vfs: true,
        sessionKey: `${token}:${parsedUrl.searchParams.get('s') || 'main'}`,
      });
      return;
    }

    if (route === 'preview') {
      if (fsMeta.isBuiltinAurora) {
        const svg = Buffer.from(buildBuiltinAuroraSvg(), 'utf8');
        serveBufferWithRange(req, res, svg, 'image/svg+xml', '"builtin-prism-aurora-v1"');
        return;
      }
      if (!fsMeta.previewAbs) {
        sendJson(req, res, 404, { error: 'No preview image available' });
        return;
      }
      serveFileWithRange(req, res, fsMeta.previewAbs, { cacheControl: 'public, max-age=3600' });
      return;
    }

    if (route === 'slides') {
      const slides = Array.isArray(fsMeta.slidesAbs) ? fsMeta.slidesAbs : [];
      const urls = slides.map((_, idx) => `${origin}/slide/${encodeURIComponent(token)}/${idx}`);
      sendJson(req, res, 200, {
        id: entry.id,
        count: urls.length,
        intervalMs: entry.slideIntervalMs || 30_000,
        slides: urls,
      });
      return;
    }

    if (route === 'slide') {
      const idx = Number(parts[2]);
      const slides = Array.isArray(fsMeta.slidesAbs) ? fsMeta.slidesAbs : [];
      if (!Number.isInteger(idx) || idx < 0 || idx >= slides.length) {
        sendJson(req, res, 404, { error: 'Slide index out of bounds' });
        return;
      }
      serveFileWithRange(req, res, slides[idx], { cacheControl: 'public, max-age=600' });
      return;
    }

    if (route === 'audio') {
      if (!fsMeta.looseAudioAbs) {
        sendJson(req, res, 404, { error: 'No loose audio file' });
        return;
      }
      serveFileWithRange(req, res, fsMeta.looseAudioAbs);
      return;
    }

    if (route === 'scene-video') {
      if (!fsMeta.sceneContainerAbs) {
        sendJson(req, res, 404, { error: 'No scene container' });
        return;
      }
      let mtimeTag = '0';
      try { mtimeTag = String(Math.trunc(statSync(fsMeta.sceneContainerAbs).mtimeMs)); } catch { /* ignore */ }
      const cacheDir = cacheDirGetter();
      const payload = getCachedSceneBuffer(
        `vid:${token}:${mtimeTag}:${cacheDir ? 'disk' : 'mem'}`,
        () => extractSceneVideoPayload(fsMeta.sceneContainerAbs, { cacheDir }),
      );
      if (!payload) {
        sendJson(req, res, 404, { error: 'No embedded video inside scene container' });
        return;
      }
      if (payload.kind === 'file' && payload.absPath) {
        serveFileWithRange(req, res, payload.absPath, { useMp4Vfs: true, sessionKey: `scene-vid:${token}` });
      } else if (payload.kind === 'buffer' && payload.bytes) {
        serveBufferWithRange(req, res, payload.bytes, payload.mime || 'video/mp4', `"sv-${token}-${mtimeTag}"`);
      } else {
        sendJson(req, res, 404, { error: 'Empty scene video payload' });
      }
      return;
    }

    if (route === 'scene-audio') {
      if (!fsMeta.sceneContainerAbs) {
        sendJson(req, res, 404, { error: 'No scene container' });
        return;
      }
      let mtimeTag = '0';
      try { mtimeTag = String(Math.trunc(statSync(fsMeta.sceneContainerAbs).mtimeMs)); } catch { /* ignore */ }
      const cacheDir = cacheDirGetter();
      const payload = getCachedSceneBuffer(
        `aud:${token}:${mtimeTag}:${cacheDir ? 'disk' : 'mem'}`,
        () => extractSceneAudioPayload(fsMeta.sceneContainerAbs, { cacheDir }),
      );
      if (!payload) {
        sendJson(req, res, 404, { error: 'No embedded audio inside scene container' });
        return;
      }
      if (payload.kind === 'file' && payload.absPath) {
        serveFileWithRange(req, res, payload.absPath);
      } else if (payload.kind === 'buffer' && payload.bytes) {
        serveBufferWithRange(req, res, payload.bytes, payload.mime || 'audio/mpeg', `"sa-${token}-${mtimeTag}"`);
      } else {
        sendJson(req, res, 404, { error: 'Empty scene audio payload' });
      }
      return;
    }

    if (route === 'scene-live') {
      const ctx = runtimeContextGetter(entry) || {};
      const cfg = ctx.config || {};
      const html = buildLiveSceneHtml(entry, cfg, {
        sceneVideoUrl: entry.sceneVideoUrl || '',
        thumbUrl: entry.thumbUrl || '',
        audioUrl: entry.audioUrl || '',
      });
      const body = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return;
    }

    if (route === 'web' || route === 'scene-files') {
      if (!fsMeta.projectDir) {
        sendJson(req, res, 404, { error: 'No project directory mapped' });
        return;
      }
      const subParts = parts.slice(2);
      const effectiveSub = subParts.length > 0
        ? subParts
        : (fsMeta.webEntryRel ? fsMeta.webEntryRel.split('/') : ['index.html']);

      const resolved = resolveWebAssetPath(fsMeta.projectDir, effectiveSub);
      if (resolved.status === 403) {
        sendJson(req, res, 403, { error: 'Forbidden: path outside wallpaper directory' });
        return;
      }
      if (resolved.status !== 200 || !resolved.absPath) {
        sendJson(req, res, 404, { error: 'Asset not found' });
        return;
      }

      const ext = extname(resolved.absPath).toLowerCase();
      if (route === 'web' && (ext === '.html' || ext === '.htm')) {
        let rawHtml = '';
        try {
          rawHtml = readFileSync(resolved.absPath, 'utf8');
        } catch {
          sendJson(req, res, 500, { error: 'Failed to read HTML entry' });
          return;
        }
        const ctx = runtimeContextGetter(entry) || {};
        const cfg = ctx.config || {};
        const seedProps = ctx.wireProps || entry.wireProps || {};
        const fps = Number(cfg.fpsCap) > 0 ? Number(cfg.fpsCap) : 30;
        const dirRel = posix.dirname(resolved.relPosix);
        const baseSuffix = dirRel && dirRel !== '.' ? `${encodeUrlSubpath(dirRel)}/` : '';
        const baseHref = `${origin}/web/${encodeURIComponent(token)}/${baseSuffix}`;
        const injected = injectWebWallpaperHtml(rawHtml, {
          baseHref,
          seedProps,
          fps,
          paused: Boolean(cfg.paused),
        });
        const body = Buffer.from(injected, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
        });
        if (req.method === 'HEAD') res.end();
        else res.end(body);
        return;
      }

      serveFileWithRange(req, res, resolved.absPath, {
        useMp4Vfs: true,
        sessionKey: `web:${token}:${resolved.relPosix}`,
      });
      return;
    }

    if (route === 'media-info') {
      sendJson(req, res, 200, {
        id: entry.id,
        kind: entry.kind,
        resolution: entry.resolution || '',
        width: entry.width || null,
        height: entry.height || null,
        durationSec: entry.durationSec || null,
        fps: entry.fps || null,
        fileSize: entry.fileSize || 0,
      });
      return;
    }

    sendJson(req, res, 404, { error: 'Route not found' });
  });

  server.on('connection', (sock) => {
    sockets.add(sock);
    if (!keepAlive) sock.unref();
    sock.on('close', () => sockets.delete(sock));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(requestedPort, host, () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  if (!keepAlive) server.unref();

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : requestedPort;
  origin = `http://${host}:${port}`;

  /** Attach loopback HTTP URLs to scanned items and populate the token registry. */
  function syncLibrary(rawItems = []) {
    const nextRegistry = new Map();
    const publicItems = [];

    for (const raw of rawItems) {
      if (!raw || !raw.id) continue;
      const token = tokenForWallpaperId(raw.id);
      const encToken = encodeURIComponent(token);
      const fsMeta = raw._fs || {};

      const thumbUrl = (fsMeta.previewAbs || fsMeta.isBuiltinAurora)
        ? `${origin}/preview/${encToken}`
        : '';
      const sceneVideoUrl = fsMeta.hasSceneVideo ? `${origin}/scene-video/${encToken}` : '';
      const sceneLiveUrl = raw.kind === 'scene' ? `${origin}/scene-live/${encToken}` : '';
      const slidesUrl = raw.kind === 'slideshow' ? `${origin}/slides/${encToken}` : '';
      const webUrl = raw.kind === 'web'
        ? `${origin}/web/${encToken}/${encodeUrlSubpath(fsMeta.webEntryRel || 'index.html')}`
        : '';
      const audioUrl = fsMeta.hasSceneAudio
        ? `${origin}/scene-audio/${encToken}`
        : fsMeta.looseAudioAbs
          ? `${origin}/audio/${encToken}`
          : '';

      let mediaUrl = '';
      if (raw.kind === 'image' || raw.kind === 'video') {
        mediaUrl = fsMeta.primaryAbs ? `${origin}/media/${encToken}` : thumbUrl;
      } else if (raw.kind === 'slideshow') {
        mediaUrl = fsMeta.slidesAbs?.length ? `${origin}/slide/${encToken}/0` : thumbUrl;
      } else if (raw.kind === 'web') {
        mediaUrl = webUrl;
      } else if (raw.kind === 'scene') {
        if (raw.sceneMode === 'video' && sceneVideoUrl) mediaUrl = sceneVideoUrl;
        else if (raw.sceneMode === 'live') mediaUrl = sceneLiveUrl;
        else mediaUrl = thumbUrl || sceneLiveUrl;
      }

      const slides = raw.kind === 'slideshow' && Array.isArray(fsMeta.slidesAbs)
        ? fsMeta.slidesAbs.slice(0, 500).map((_, idx) => `${origin}/slide/${encToken}/${idx}`)
        : undefined;

      const enrichedInternal = {
        ...raw,
        token,
        thumbUrl,
        mediaUrl,
        audioUrl,
        slidesUrl,
        ...(slides ? { slides } : {}),
        sceneVideoUrl,
        sceneLiveUrl,
        webUrl,
      };
      nextRegistry.set(token, enrichedInternal);

      const { _fs: _hiddenFs, ...publicItem } = enrichedInternal;
      publicItems.push(publicItem);
    }

    registry.clear();
    for (const [k, v] of nextRegistry.entries()) {
      registry.set(k, v);
    }
    return publicItems;
  }

  /** Register an individual file or directory entry directly (useful for unit tests & uploads). */
  function registerEntry(item) {
    if (!item || !item.id) return null;
    const existing = [];
    for (const val of registry.values()) {
      if (val.id !== item.id) existing.push(val);
    }
    existing.push(item);
    const pub = syncLibrary(existing);
    return pub.find((x) => x.id === item.id) || null;
  }

  function registerFile(id, absPath, kind = 'video') {
    const cleanAbs = resolve(absPath);
    return registerEntry({
      id,
      title: id,
      kind,
      source: 'local',
      workshopId: '',
      contentRating: 'everyone',
      tags: [],
      schemeColor: '#669DF6',
      sceneMode: null,
      properties: [],
      wireProps: {},
      fileSize: existsSync(cleanAbs) ? statSync(cleanAbs).size : 0,
      resolution: '',
      _fs: {
        projectDir: dirname(cleanAbs),
        primaryAbs: cleanAbs,
        previewAbs: kind === 'image' ? cleanAbs : null,
        slidesAbs: [],
        sceneContainerAbs: null,
        hasSceneVideo: false,
        hasSceneAudio: false,
        looseAudioAbs: null,
        webEntryRel: kind === 'web' ? posix.basename(cleanAbs.replace(/\\/g, '/')) : '',
      },
    });
  }

  function setRuntimeContextGetter(fn) {
    if (typeof fn === 'function') runtimeContextGetter = fn;
  }

  /**
   * In-process HTTP request injector (`{ method, url, headers } -> { status, headers, body }`).
   * Exercises the exact `server` request listener (including `Range`, `403`, `mp4-vfs` streams)
   * even inside network-isolated AppContainer sandboxes where loopback TCP `connect` is restricted.
   */
  function inject({ method = 'GET', url = '/', headers = {} } = {}) {
    return new Promise((resolveInject, rejectInject) => {
      const normHeaders = {};
      for (const [k, v] of Object.entries(headers || {})) {
        normHeaders[String(k).toLowerCase()] = v;
      }

      const req = new EventEmitter();
      req.method = String(method || 'GET').toUpperCase();
      req.url = String(url || '/');
      req.headers = normHeaders;

      const resHeaders = {};
      const chunks = [];
      let statusCode = 200;
      let headersSent = false;

      const res = new Writable({
        write(chunk, _enc, cb) {
          headersSent = true;
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          cb();
        },
      });

      Object.defineProperty(res, 'headersSent', {
        get: () => headersSent,
      });

      res.setHeader = (name, val) => {
        resHeaders[String(name).toLowerCase()] = val;
      };
      res.getHeader = (name) => resHeaders[String(name).toLowerCase()];
      res.writeHead = (code, hdrs = {}) => {
        statusCode = code;
        headersSent = true;
        for (const [k, v] of Object.entries(hdrs || {})) {
          resHeaders[String(k).toLowerCase()] = v;
        }
        return res;
      };

      res.on('finish', () => {
        res.emit('close');
        resolveInject({
          status: statusCode,
          statusCode,
          headers: resHeaders,
          body: Buffer.concat(chunks),
        });
      });
      res.on('error', rejectInject);

      try {
        server.emit('request', req, res);
      } catch (err) {
        rejectInject(err);
      }
    });
  }

  async function close() {
    for (const stream of activeStreams) {
      try { stream.destroy(); } catch { /* ignore */ }
    }
    activeStreams.clear();
    for (const sock of sockets) {
      try { sock.destroy(); } catch { /* ignore */ }
    }
    sockets.clear();
    scenePayloadCache.clear();
    sceneCacheBytes = 0;
    vfsKit.clear();
    await new Promise((resolveClose) => {
      try {
        server.close(() => resolveClose());
      } catch {
        resolveClose();
      }
    });
  }

  return {
    origin,
    port,
    server,
    vfsKit,
    getOrigin: () => origin,
    syncLibrary,
    registerEntry,
    registerFile,
    setRuntimeContextGetter,
    inject,
    close,
  };
}
