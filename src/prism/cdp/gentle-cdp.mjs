// Gentle Fail-Open Ephemeral Chrome DevTools Protocol (CDP) Client (DreamSkin Prism v4).
// Zero Page.enable, zero Runtime.enable, zero addScriptToEvaluateOnNewDocument, zero app.asar writes.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { homedir } from 'node:os';
import { basename, delimiter, join } from 'node:path';

// Bypass system proxies (e.g. Clash) for loopback CDP/media sockets
for (const key of ['NO_PROXY', 'no_proxy']) {
  const cur = String(process.env[key] || '').trim();
  const needed = ['127.0.0.1', 'localhost', '::1', '[::1]'];
  const parts = cur ? cur.split(',').map((s) => s.trim()).filter(Boolean) : [];
  for (const h of needed) if (!parts.includes(h)) parts.push(h);
  process.env[key] = parts.join(',');
}

const HOSTILE_ENV_KEYS = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
];

const APP_DEFAULT_PORTS = Object.freeze({
  antigravity: 9339,
  cherry: 9341,
  zcode: 9342,
  dsh: 9343,
  'minimax-code': 9344,
  'minimax-design': 9345,
  codex: 9346,
  windsurf: 9347,
  kiro: 9348,
});

export function defaultPortForApp(appId = '') {
  const id = String(appId || '').trim().toLowerCase();
  if (APP_DEFAULT_PORTS[id]) return APP_DEFAULT_PORTS[id];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 45;
  return 9350 + hash;
}

export function cleanHostEnv(extra = {}, baseEnv = process.env) {
  const out = { ...baseEnv, ...extra };
  for (const k of HOSTILE_ENV_KEYS) delete out[k];
  return out;
}

let cachedNode = null;
export function resolveNodeExe() {
  if (cachedNode) return cachedNode;
  const self = process.execPath || '';
  if (process.env.AGY_NODE_EXE && existsSync(process.env.AGY_NODE_EXE)) {
    cachedNode = { exe: process.env.AGY_NODE_EXE, env: {} };
    return cachedNode;
  }
  if (/^node(\.exe)?$/i.test(basename(self)) && existsSync(self)) {
    cachedNode = { exe: self, env: {} };
    return cachedNode;
  }
  const candidates = [];
  for (const dir of String(process.env.PATH || process.env.Path || '').split(delimiter)) {
    if (dir) candidates.push(join(dir, process.platform === 'win32' ? 'node.exe' : 'node'));
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    candidates.push(join(local, 'Programs', 'nodejs', 'node.exe'));
    candidates.push('C:\\Program Files\\nodejs\\node.exe');
  }
  for (const c of candidates) {
    if (existsSync(c)) {
      cachedNode = { exe: c, env: {} };
      return cachedNode;
    }
  }
  cachedNode = { exe: self, env: { ELECTRON_RUN_AS_NODE: '1' } };
  return cachedNode;
}

export function readDevToolsActivePort(profileDir = '') {
  const roaming = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  const dir = profileDir || join(roaming, 'Antigravity');
  const file = join(dir, 'DevToolsActivePort');
  try {
    if (!existsSync(file)) return null;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const port = Number(lines[0]);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    return { port, browserPath: (lines[1] || '').trim(), file };
  } catch {
    return null;
  }
}

export function fetchJsonLoopback(host, port, pathname, timeoutMs = 1500) {
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest({ host, port, path: pathname, method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(text));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('CDP timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function probeCdpPort(port, host = '', timeoutMs = 900) {
  const hosts = host ? [host] : ['127.0.0.1', '::1'];
  let lastErr = 'unreachable';
  for (const h of hosts) {
    try {
      const v = await fetchJsonLoopback(h, port, '/json/version', timeoutMs);
      return { ok: true, host: h, port, browser: v.Browser || '', webSocketDebuggerUrl: v.webSocketDebuggerUrl || '' };
    } catch (err) {
      lastErr = err.message;
    }
  }
  return { ok: false, host: hosts[0], port, error: lastErr };
}

export async function listCdpTargets(port, host = '127.0.0.1') {
  try {
    const list = await fetchJsonLoopback(host, port, '/json/list', 1800);
    return Array.isArray(list) ? list : [];
  } catch {
    const alt = host === '127.0.0.1' ? '::1' : '127.0.0.1';
    const list = await fetchJsonLoopback(alt, port, '/json/list', 1800);
    return Array.isArray(list) ? list : [];
  }
}

export function selectHubTargets(targets = []) {
  const pages = targets.filter((t) => t && t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string');
  const scored = pages
    .map((t) => {
      const url = String(t.url || '');
      const title = String(t.title || '');
      if (/^(plugin|devtools|data):/i.test(url) || /^about:blank/i.test(url)) return { t, score: -200 };
      let score = 0;
      if (/^https:\/\/127\.0\.0\.1:\d+\//i.test(url)) score += 160;
      else if (/^http:\/\/127\.0\.0\.1:\d+\//i.test(url) && !url.includes('/prism_studio')) score += 40;
      if (/monaco-workbench|workbench\.html/i.test(url)) score += 120;
      if (/^vscode-file:\/\//i.test(url)) score += 40;
      if (/antigravity/i.test(title)) score += 50;
      if (/curtain|splash|loading/i.test(title)) score -= 100;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  const high = scored.filter((x) => x.score >= 100).map((x) => x.t);
  if (high.length > 0) return high;
  return scored[0] && scored[0].score > 0 ? [scored[0].t] : [];
}

function encodeWsClientTextFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const len = payload.length;
  const mask = randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | len;
    mask.copy(header, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    mask.copy(header, 10);
  }
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i += 1) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, masked]);
}

function encodeWsClientCloseFrame() {
  const mask = randomBytes(4);
  const frame = Buffer.alloc(6);
  frame[0] = 0x88;
  frame[1] = 0x80;
  mask.copy(frame, 2);
  return frame;
}

export class CdpSession {
  constructor(socket, initialHead = Buffer.alloc(0)) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.closeHandlers = [];
    this.closed = false;
    this._rxBuf = initialHead && initialHead.length ? Buffer.from(initialHead) : Buffer.alloc(0);
    this._fragChunks = [];

    socket.on('data', (chunk) => this._onData(chunk));
    const onEnd = () => {
      if (this.closed) return;
      this.closed = true;
      for (const [, p] of this.pending) p.reject(new Error('CDP socket closed'));
      this.pending.clear();
      for (const fn of this.closeHandlers) {
        try { fn(); } catch {}
      }
    };
    socket.on('close', onEnd);
    socket.on('end', onEnd);
    socket.on('error', onEnd);
    if (this._rxBuf.length) queueMicrotask(() => this._drainFrames());
  }

  _onData(chunk) {
    this._rxBuf = this._rxBuf.length ? Buffer.concat([this._rxBuf, chunk]) : Buffer.from(chunk);
    this._drainFrames();
  }

  _drainFrames() {
    while (this._rxBuf.length >= 2) {
      const b0 = this._rxBuf[0];
      const b1 = this._rxBuf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const isMasked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;
      if (payloadLen === 126) {
        if (this._rxBuf.length < 4) return;
        payloadLen = this._rxBuf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._rxBuf.length < 10) return;
        payloadLen = Number(this._rxBuf.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLen = isMasked ? 4 : 0;
      if (this._rxBuf.length < offset + maskLen + payloadLen) return;

      let body = this._rxBuf.subarray(offset + maskLen, offset + maskLen + payloadLen);
      if (isMasked) {
        const mask = this._rxBuf.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i += 1) unmasked[i] = body[i] ^ mask[i & 3];
        body = unmasked;
      }
      this._rxBuf = this._rxBuf.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x08) {
        this.close();
        return;
      }
      if (opcode === 0x09) {
        const pongMask = randomBytes(4);
        const pong = Buffer.alloc(6 + Math.min(125, body.length));
        pong[0] = 0x8a;
        pong[1] = 0x80 | Math.min(125, body.length);
        pongMask.copy(pong, 2);
        for (let i = 0; i < Math.min(125, body.length); i += 1) pong[6 + i] = body[i] ^ pongMask[i & 3];
        try { this.socket.write(pong); } catch {}
        continue;
      }
      if (opcode === 0x0a) continue;
      if (opcode === 0x01 || opcode === 0x00) {
        this._fragChunks.push(Buffer.from(body));
        if (!fin) continue;
        const fullText = Buffer.concat(this._fragChunks).toString('utf8');
        this._fragChunks = [];
        this._dispatchMessage(fullText);
      }
    }
  }

  _dispatchMessage(rawText) {
    let msg;
    try { msg = JSON.parse(rawText); } catch { return; }
    if (msg.id != null && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message || 'CDP error'));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const fn of this.handlers.get(msg.method) || []) {
        try { fn(msg.params || {}); } catch {}
      }
    }
  }

  static async connect(wsUrl, timeoutMs = 3500) {
    const u = new URL(wsUrl);
    const port = Number(u.port || 80);
    const host = u.hostname || '127.0.0.1';
    const pathAndQuery = `${u.pathname || '/'}${u.search || ''}`;
    const wsKey = randomBytes(16).toString('base64');

    return new Promise((resolvePromise, reject) => {
      let settled = false;
      const req = httpRequest({
        host,
        port,
        path: pathAndQuery,
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': wsKey,
        },
        timeout: timeoutMs,
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { req.destroy(); } catch {}
        reject(new Error(`CDP WebSocket timeout: ${wsUrl}`));
      }, timeoutMs);

      req.on('upgrade', (_res, socket, head) => {
        if (settled) {
          try { socket.destroy(); } catch {}
          return;
        }
        settled = true;
        clearTimeout(timer);
        socket.setNoDelay?.(true);
        resolvePromise(new CdpSession(socket, head));
      });

      req.on('response', (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res.resume();
        reject(new Error(`CDP upgrade rejected (${res.statusCode}): ${wsUrl}`));
      });

      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      req.end();
    });
  }

  send(method, params = {}, timeoutMs = 4500) {
    if (this.closed) return Promise.reject(new Error('CDP session closed'));
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolvePromise(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try {
        this.socket.write(encodeWsClientTextFrame(JSON.stringify({ id, method, params })));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async evaluate(expression, { returnByValue = true, awaitPromise = false, timeoutMs = 4500 } = {}) {
    const res = await this.send(
      'Runtime.evaluate',
      { expression, returnByValue, awaitPromise, userGesture: true },
      timeoutMs,
    );
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Evaluate failed');
    }
    return returnByValue ? res?.result?.value : res?.result;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.write(encodeWsClientCloseFrame()); } catch {}
    try {
      this.socket.end();
      setTimeout(() => { try { this.socket.destroy(); } catch {} }, 40).unref?.();
    } catch {}
  }
}

export async function evaluateTargetEphemeral(wsUrl, expression, opts = {}) {
  const session = await CdpSession.connect(wsUrl, opts.connectTimeoutMs || 2800);
  try {
    return await session.evaluate(expression, opts);
  } finally {
    session.close();
  }
}
