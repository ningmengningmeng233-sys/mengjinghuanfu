// Single-Daemon Lock & Discovery Arbitration (DreamSkin Prism v4).
// Prevents split-brain between standalone desktop shell and Antigravity Sidecar.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';

export function readDaemonLock(lockFile) {
  try {
    if (!existsSync(lockFile)) return null;
    const raw = JSON.parse(readFileSync(lockFile, 'utf8').replace(/^\uFEFF/, ''));
    if (!raw || typeof raw !== 'object') return null;
    const port = Number(raw.port);
    const pid = Number(raw.pid);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return {
      pid,
      port,
      token: String(raw.token || ''),
      mediaPort: Number(raw.mediaPort) || 0,
      version: String(raw.version || ''),
      mode: String(raw.mode || 'daemon'),
      startedAt: String(raw.startedAt || ''),
    };
  } catch {
    return null;
  }
}

export function defaultProbeDaemon(record, timeoutMs = 800) {
  if (!record || !record.port) return Promise.resolve({ ok: false });
  return new Promise((resolvePromise) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolvePromise(val);
    };
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: record.port,
        path: '/api/ping',
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const ok = res.statusCode === 200 && body && body.ok === true && Number(body.pid) === record.pid;
            done({ ok, pid: Number(body?.pid) || 0, version: String(body?.version || '') });
          } catch {
            done({ ok: false });
          }
        });
      },
    );
    req.on('timeout', () => {
      try { req.destroy(); } catch {}
      done({ ok: false });
    });
    req.on('error', () => done({ ok: false }));
    req.end();
  });
}

function writeLockAtomic(lockFile, record) {
  mkdirSync(dirname(lockFile), { recursive: true });
  const payload = JSON.stringify(record, null, 2) + '\n';
  const tmp = `${lockFile}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, payload, 'utf8');
  try {
    renameSync(tmp, lockFile);
  } catch {
    writeFileSync(lockFile, payload, 'utf8');
    try { rmSync(tmp, { force: true }); } catch {}
  }
}

export async function acquireOrReuseDaemonLock({
  lockFile,
  port,
  token,
  mediaPort = 0,
  version = '4.0.0',
  mode = 'daemon',
  pid = process.pid,
  probeFn = defaultProbeDaemon,
} = {}) {
  const existing = readDaemonLock(lockFile);
  if (existing) {
    let alive = false;
    try {
      const res = await probeFn(existing);
      alive = Boolean(res && res.ok);
    } catch {
      alive = false;
    }
    if (alive) {
      return {
        role: 'reuse',
        lock: existing,
        release: () => {},
      };
    }
  }

  const record = {
    pid: Number(pid),
    port: Number(port),
    token: String(token || ''),
    mediaPort: Number(mediaPort) || 0,
    version: String(version || ''),
    mode: String(mode || 'daemon'),
    startedAt: new Date().toISOString(),
  };
  writeLockAtomic(lockFile, record);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const cur = readDaemonLock(lockFile);
      if (cur && cur.pid === record.pid && cur.token === record.token) {
        rmSync(lockFile, { force: true });
      }
    } catch {
      // ignore cleanup error
    }
  };

  return { role: 'primary', lock: record, release };
}
