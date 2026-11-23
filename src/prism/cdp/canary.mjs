// Per-App Two-Phase fsync Boot Canary (DreamSkin Prism v4).
// Automatically trips safe mode for an app if 2 unfinished injection boots happen within 90s.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDefaultPrismDataDir, writeFsyncJsonSync } from '../engine/store.mjs';

const CANARY_WINDOW_MS = 90_000;

function defaultAppEntry() {
  return {
    state: 'idle', // 'idle' | 'arming' | 'healthy' | 'tripped'
    sessionId: '',
    lastArmTs: 0,
    lastHealthyTs: 0,
    trippedAt: 0,
    trippedReason: '',
    unfinishedAttempts: [],
  };
}

export function createMultiAppCanary({ dataDir = '', windowMs = CANARY_WINDOW_MS } = {}) {
  const resolvedDir = resolveDefaultPrismDataDir(dataDir);
  const canaryPath = join(resolvedDir, 'canary.json');

  function readAll() {
    try {
      if (!existsSync(canaryPath)) return { version: 4, apps: {} };
      const raw = JSON.parse(readFileSync(canaryPath, 'utf8').replace(/^\uFEFF/, ''));
      if (!raw || typeof raw !== 'object' || typeof raw.apps !== 'object') return { version: 4, apps: {} };
      return { version: 4, apps: { ...raw.apps } };
    } catch {
      return { version: 4, apps: {} };
    }
  }

  function writeAll(doc) {
    mkdirSync(resolvedDir, { recursive: true });
    writeFsyncJsonSync(canaryPath, doc);
  }

  function getEntry(doc, appId) {
    const raw = doc.apps[appId];
    if (!raw || typeof raw !== 'object') return defaultAppEntry();
    return {
      ...defaultAppEntry(),
      ...raw,
      unfinishedAttempts: Array.isArray(raw.unfinishedAttempts)
        ? raw.unfinishedAttempts.map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : [],
    };
  }

  function evaluateBoot(appId, sessionId = '') {
    const id = String(appId || 'default');
    const doc = readAll();
    const cur = getEntry(doc, id);
    const now = Date.now();
    const recent = cur.unfinishedAttempts.filter((ts) => now - ts <= windowMs);

    if (cur.state === 'tripped') {
      return { allowInject: false, tripped: true, reason: cur.trippedReason || 'safe-mode', entry: cur };
    }

    // If previous boot armed in a different session and never reached healthy -> record unfinished attempt
    if (cur.state === 'arming' && cur.sessionId && cur.sessionId !== sessionId) {
      recent.push(cur.lastArmTs || now);
      cur.unfinishedAttempts = recent;
      if (recent.length >= 2) {
        cur.state = 'tripped';
        cur.trippedAt = now;
        cur.trippedReason = '连续启动未完成健康校验，已自动开启保护模式以防卡死';
        doc.apps[id] = cur;
        writeAll(doc);
        return { allowInject: false, tripped: true, reason: cur.trippedReason, entry: cur };
      }
      cur.state = 'idle';
      doc.apps[id] = cur;
      writeAll(doc);
    }

    return { allowInject: true, tripped: false, reason: '', entry: cur };
  }

  function arm(appId, sessionId = '') {
    const id = String(appId || 'default');
    const doc = readAll();
    const cur = getEntry(doc, id);
    cur.state = 'arming';
    cur.sessionId = String(sessionId || '');
    cur.lastArmTs = Date.now();
    doc.apps[id] = cur;
    writeAll(doc);
    return cur;
  }

  function markHealthy(appId, sessionId = '') {
    const id = String(appId || 'default');
    const doc = readAll();
    const cur = getEntry(doc, id);
    cur.state = 'healthy';
    if (sessionId) cur.sessionId = String(sessionId);
    cur.lastHealthyTs = Date.now();
    cur.unfinishedAttempts = [];
    cur.trippedReason = '';
    doc.apps[id] = cur;
    writeAll(doc);
    return cur;
  }

  function reset(appId) {
    const id = String(appId || 'default');
    const doc = readAll();
    doc.apps[id] = defaultAppEntry();
    writeAll(doc);
    return doc.apps[id];
  }

  function status(appId = '') {
    const doc = readAll();
    if (appId) return getEntry(doc, String(appId));
    return doc.apps;
  }

  return {
    canaryPath,
    evaluateBoot,
    arm,
    markHealthy,
    reset,
    status,
  };
}
