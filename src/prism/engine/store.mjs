/**
 * Atomic Config Store, Whole-Profile Presets Manager, SHA-256 Streaming Upload Store,
 * Storage Migrator & Directory Browser (`store.mjs`)
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import {
  mkdir as mkdirAsync,
  rename as renameAsync,
  unlink as unlinkAsync,
  writeFile as writeFileAsync,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import {
  applyResetScope,
  DEFAULT_CONFIG,
  FACTORY_PRESETS,
  PER_WALLPAPER_OVERRIDE_KEYS,
  resolveEffectiveConfig,
   sanitizeConfig,
  SCENE_PRESETS,
} from '../shared/schema.mjs';
import { IMAGE_EXTS, VIDEO_EXTS } from './scanner.mjs';

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MiB

const EXT_FROM_CONTENT_TYPE = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v',
  'video/ogg': '.ogv',
});

// Keys captured when saving a whole-profile user preset (excludes machine-local paths & caches)
const PROFILE_PRESET_KEYS = Object.freeze([
  'preset',
  'layoutMode',
  'islandGap',
  'workspacePad',
  'cornerStyle',
  'leftSidebarRadius',
  'rightSidebarRadius',
  'borders',
  'shadows',
  'themeMode',
  'themeFollow',
  'colorScheme',
  'accentMode',
  'customAccent',
  'wallTintMix',
  'glassSurfaces',
  'glassOpacity',
  'glassBlur',
  'glassFidelity',
  'chatGlassFidelity',
  'codeReadabilityMode',
  'contrastFloor',
  'floaterSolidBase',
  'caretColor',
  'scrimOpacity',
  'scrimColor',
  'vignette',
  'mediaOpacity',
  'mediaBlur',
  'mediaBrightness',
  'mediaContrast',
  'mediaSaturate',
  'grainAlpha',
  'filterPreset',
  'fit',
  'flip',
  'layerPosX',
  'layerPosY',
  'layerScale',
  'paused',
  'muted',
  'audioEnabled',
  'volume',
  'playbackRate',
  'fpsCap',
  'sceneLive',
  'sceneLiveFps',
  'switchTransition',
  'switchTransitionDir',
  'switchTransitionSpeed',
  'fxEnabled',
  'fxClickMode',
  'fxTrailMode',
  'parallaxEnabled',
  'parallaxStrength',
  'triggerMode',
]);

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
let atomicSeq = 0;

function makeError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Crash-consistent synchronous JSON writer (`openSync` -> `writeSync` -> `fsyncSync` -> `closeSync` -> `renameSync`).
 * Used for `canary.json` so pre-injection state hits disk before any CDP socket opens.
 */
export function writeFsyncJsonSync(targetPath, data) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  atomicSeq += 1;
  const tmpPath = `${targetPath}.tmp${process.pid}.${Date.now()}.${atomicSeq}`;
  const buf = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8');

  const fd = openSync(tmpPath, 'w', 0o600);
  try {
    writeSync(fd, buf, 0, buf.length, 0);
    fsyncSync(fd);
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }

  try {
    renameSync(tmpPath, targetPath);
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY')) {
      try {
        if (existsSync(targetPath)) unlinkSync(targetPath);
        renameSync(tmpPath, targetPath);
        return;
      } catch (retryErr) {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        throw retryErr;
      }
    }
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Resolve the authoritative persistent data directory for Wallpaper Prism:
 *   1. Explicit `explicitDir` (used by isolated unit/E2E tests)
 *   2. `AGY_PRISM_DATA_DIR` override
 *   3. `ANTIGRAVITY_EXECUTABLE_DATA_DIR` (injected by Antigravity into Sidecar runtime)
 *   4. Deterministic `~/.gemini/antigravity/sidecar_data/agy-wallpaper-prism/prism_studio/data`
 *      so external CLI (`host/cli.mjs`) resolves the exact same directory outside Sidecar env!
 */
export function resolveDefaultPrismDataDir(explicitDir = '') {
  if (explicitDir && String(explicitDir).trim()) return resolve(String(explicitDir).trim());
  if (process.env.DREAMSKIN_DATA_DIR && process.env.DREAMSKIN_DATA_DIR.trim()) {
    return join(resolve(process.env.DREAMSKIN_DATA_DIR.trim()), 'v4');
  }
  if (process.env.AGY_PRISM_DATA_DIR && process.env.AGY_PRISM_DATA_DIR.trim()) {
    return resolve(process.env.AGY_PRISM_DATA_DIR.trim());
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'DreamSkin', 'v4');
  }
  const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return join(base, 'DreamSkin', 'v4');
}

/**
 * Non-destructively migrate user config, presets, shortcut backups & uploads from legacy
 * `~/.agy-wallpaper-prism` into `ANTIGRAVITY_EXECUTABLE_DATA_DIR` on first v2.0 boot.
 * Never runs when an explicit test `dataDir` or `AGY_PRISM_DATA_DIR` is supplied.
 */
export function migrateLegacyPrismDataIfNeeded(targetDataDir) {
  const legacyDir = join(homedir(), '.agy-wallpaper-prism');
  const absTarget = resolve(targetDataDir);
  if (absTarget.toLowerCase() === resolve(legacyDir).toLowerCase()) return false;
  const markerPath = join(absTarget, '.migrated-from-legacy.json');
  if (existsSync(markerPath) || existsSync(join(absTarget, 'config.json'))) return false;
  if (!existsSync(legacyDir)) return false;

  try {
    mkdirSync(absTarget, { recursive: true });
    for (const fileName of ['config.json', 'shortcut-backup.json']) {
      const src = join(legacyDir, fileName);
      const dst = join(absTarget, fileName);
      if (existsSync(src) && !existsSync(dst)) {
        try { copyFileSync(src, dst); } catch { /* non-fatal */ }
      }
    }

    const legacyPresets = join(legacyDir, 'presets');
    const dstPresets = join(absTarget, 'presets');
    if (existsSync(legacyPresets)) {
      mkdirSync(dstPresets, { recursive: true });
      for (const f of readdirSync(legacyPresets)) {
        if (!f.endsWith('.json') || f.includes('.tmp')) continue;
        const s = join(legacyPresets, f);
        const d = join(dstPresets, f);
        if (!existsSync(d)) {
          try { copyFileSync(s, d); } catch { /* ignore */ }
        }
      }
    }

    const legacyUploads = join(legacyDir, 'uploads');
    const dstUploads = join(absTarget, 'uploads');
    if (existsSync(legacyUploads)) {
      mkdirSync(dstUploads, { recursive: true });
      for (const f of readdirSync(legacyUploads)) {
        if (f.endsWith('.tmp')) continue;
        const s = join(legacyUploads, f);
        const d = join(dstUploads, f);
        if (!existsSync(d)) {
          try {
            if (lstatSync(s).isFile()) copyFileSync(s, d);
          } catch { /* ignore */ }
        }
      }
    }

    writeAtomicJsonSync(markerPath, {
      version: 2,
      migratedAt: new Date().toISOString(),
      from: legacyDir,
    });
    return true;
  } catch {
    return false;
  }
}

/** Crash-safe atomic JSON writer: `.tmp<pid>.<seq>` -> `renameSync` (zero blocking `fsync`). */
export function writeAtomicJsonSync(targetPath, data) {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  atomicSeq += 1;
  const tmpPath = `${targetPath}.tmp${process.pid}.${Date.now()}.${atomicSeq}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });

  try {
    renameSync(tmpPath, targetPath);
  } catch (err) {
    // On Windows, AV scanners occasionally lock targetPath for ~5ms; retry once cleanly
    if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY')) {
      try {
        if (existsSync(targetPath)) unlinkSync(targetPath);
        renameSync(tmpPath, targetPath);
        return;
      } catch (retryErr) {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
        throw retryErr;
      }
    }
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/** Non-blocking async atomic JSON writer (`.tmp<pid>.<seq>` -> `rename`). */
export async function writeAtomicJsonAsync(targetPath, data) {
  const dir = dirname(targetPath);
  await mkdirAsync(dir, { recursive: true });
  atomicSeq += 1;
  const tmpPath = `${targetPath}.tmp${process.pid}.${Date.now()}.${atomicSeq}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  await writeFileAsync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
  try {
    await renameAsync(tmpPath, targetPath);
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY')) {
      try {
        if (existsSync(targetPath)) await unlinkAsync(targetPath);
        await renameAsync(tmpPath, targetPath);
        return;
      } catch (retryErr) {
        try { await unlinkAsync(tmpPath); } catch { /* ignore */ }
        throw retryErr;
      }
    }
    try { await unlinkAsync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

function sweepOrphanTempFiles(dir) {
  if (!dir || !existsSync(dir)) return;
  try {
    for (const name of readdirSync(dir)) {
      if (name.includes('.tmp') || (name.startsWith('.upload-') && name.endsWith('.tmp'))) {
        const full = join(dir, name);
        try {
          const st = lstatSync(full);
          if (st.isFile()) unlinkSync(full);
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function slugifyId(text, prefix = 'preset') {
  const ascii = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  const hash = createHash('sha1').update(`${text}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 6);
  return ascii ? `${prefix}-${ascii}-${hash}` : `${prefix}-${hash}`;
}

function extractPresetPatch(rawPatch) {
  if (!rawPatch || typeof rawPatch !== 'object') return {};
  const cleanFull = sanitizeConfig(rawPatch, DEFAULT_CONFIG);
  const out = {};
  for (const key of PROFILE_PRESET_KEYS) {
    if (key in rawPatch) {
      out[key] = cleanFull[key];
    }
  }
  // If caller passed a full config object without selective keys, snapshot all profile keys
  if (Object.keys(out).length === 0) {
    for (const key of PROFILE_PRESET_KEYS) {
      out[key] = cleanFull[key];
    }
  }
  return out;
}

function moveFileCrossDeviceSafe(srcFile, dstFile) {
  mkdirSync(dirname(dstFile), { recursive: true });
  try {
    renameSync(srcFile, dstFile);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      copyFileSync(srcFile, dstFile);
      unlinkSync(srcFile);
    } else {
      throw err;
    }
  }
}

export async function createPrismStore(opts = {}) {
  const hasExplicitDir = Boolean(opts.dataDir || process.env.AGY_PRISM_DATA_DIR);
  const dataDir = resolveDefaultPrismDataDir(opts.dataDir || '');
  if (!hasExplicitDir) {
    migrateLegacyPrismDataIfNeeded(dataDir);
  }
  const configPath = join(dataDir, 'config.json');
  const presetsDir = join(dataDir, 'presets');
  const defaultUploadsDir = join(dataDir, 'uploads');
  const defaultCacheDir = join(dataDir, 'cache');

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(presetsDir, { recursive: true });

  let config = sanitizeConfig({}, DEFAULT_CONFIG);
  let writeQueue = Promise.resolve();
  let uploadSeq = 0;
  let cachedUserPresets = null;
  let configDirty = false;
  let microtaskScheduled = false;
  let debounceTimer = null;
  let pendingFlushResolvers = [];

  function enqueueWrite(fn) {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.catch(() => {});
    return next;
  }

  function flushConfigNow() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    microtaskScheduled = false;
    if (!configDirty) {
      const waiters = pendingFlushResolvers.splice(0);
      for (const r of waiters) r();
      return writeQueue;
    }
    configDirty = false;
    const snapshot = { ...config };
    const waiters = pendingFlushResolvers.splice(0);
    return enqueueWrite(async () => {
      await writeAtomicJsonAsync(configPath, snapshot);
    }).finally(() => {
      for (const r of waiters) r();
    });
  }

  function scheduleConfigPersist({ debounceMs = 0 } = {}) {
    configDirty = true;
    if (debounceMs > 0) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        flushConfigNow();
      }, debounceMs);
      if (typeof debounceTimer.unref === 'function') debounceTimer.unref();
      return Promise.resolve();
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    return new Promise((resolveFlush) => {
      pendingFlushResolvers.push(resolveFlush);
      if (!microtaskScheduled) {
        microtaskScheduled = true;
        queueMicrotask(() => {
          flushConfigNow();
        });
      }
    });
  }

  async function flush() {
    await flushConfigNow();
    await writeQueue;
  }

  function getUploadDir() {
    return config.uploadDir ? resolve(config.uploadDir) : defaultUploadsDir;
  }

  function getCacheDir() {
    return config.cacheDir ? resolve(config.cacheDir) : defaultCacheDir;
  }

  function ensureStorageDirs() {
    mkdirSync(getUploadDir(), { recursive: true });
    mkdirSync(getCacheDir(), { recursive: true });
  }

  function loadConfigFromDisk() {
    if (!existsSync(configPath)) {
      config = sanitizeConfig({}, DEFAULT_CONFIG);
      writeAtomicJsonSync(configPath, config);
      return config;
    }
    try {
      const rawText = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(rawText);
      config = sanitizeConfig(parsed, DEFAULT_CONFIG);
    } catch {
      // Back up corrupt config before re-initializing cleanly
      try {
        copyFileSync(configPath, `${configPath}.corrupt-${Date.now()}.bak`);
      } catch { /* ignore */ }
      config = sanitizeConfig({}, DEFAULT_CONFIG);
      writeAtomicJsonSync(configPath, config);
    }
    return config;
  }

  // ── Upload Metadata (`.meta.json`) ──────────────────────────────────────────────────────────
  function getUploadMetaPath(dir = getUploadDir()) {
    return join(dir, '.meta.json');
  }

  function readUploadMetaList(dir = getUploadDir()) {
    const metaPath = getUploadMetaPath(dir);
    if (!existsSync(metaPath)) return [];
    try {
      const raw = JSON.parse(readFileSync(metaPath, 'utf8'));
      const arr = Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw) ? raw : []);
      const valid = [];
      for (const entry of arr) {
        if (!entry || typeof entry !== 'object' || !entry.filename) continue;
        const absPath = join(dir, basename(entry.filename));
        if (!existsSync(absPath)) continue;
        valid.push({
          id: String(entry.id || `up-${String(entry.sha256 || '').slice(0, 12)}`),
          sha256: String(entry.sha256 || ''),
          filename: basename(entry.filename),
          originalName: String(entry.originalName || entry.filename),
          title: String(entry.title || basename(entry.filename, extname(entry.filename))),
          size: Number(entry.size) || 0,
          createdAt: Number(entry.createdAt) || Date.now(),
          absPath,
        });
      }
      return valid;
    } catch {
      return [];
    }
  }

  function writeUploadMetaList(items, dir = getUploadDir()) {
    const serializable = items.map(({ absPath: _omit, ...rest }) => rest);
    writeAtomicJsonSync(getUploadMetaPath(dir), { version: 1, items: serializable });
  }

  // ── User Presets (`presets/*.json`) ─────────────────────────────────────────────────────────
  function readUserPresets() {
    if (cachedUserPresets) return cachedUserPresets;
    if (!existsSync(presetsDir)) {
      cachedUserPresets = [];
      return cachedUserPresets;
    }
    const out = [];
    try {
      for (const fname of readdirSync(presetsDir)) {
        if (!fname.endsWith('.json') || fname.includes('.tmp')) continue;
        const full = join(presetsDir, fname);
        try {
          const obj = JSON.parse(readFileSync(full, 'utf8'));
          if (!obj || typeof obj !== 'object' || !obj.id || !obj.patch) continue;
          out.push({
            id: String(obj.id),
            name: String(obj.name || obj.id).slice(0, 80),
            nameEn: String(obj.nameEn || obj.name || obj.id).slice(0, 80),
            description: String(obj.description || '').slice(0, 240),
            descriptionEn: String(obj.descriptionEn || obj.description || '').slice(0, 240),
            builtin: false,
            createdAt: Number(obj.createdAt) || 0,
            updatedAt: Number(obj.updatedAt) || 0,
            patch: extractPresetPatch(obj.patch),
          });
        } catch { /* skip malformed preset file */ }
      }
    } catch { /* ignore */ }
    out.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    cachedUserPresets = out;
    return out;
  }

  function listPresets() {
    const tombstones = new Set(config.deletedFactoryPresets || []);
    const builtins = FACTORY_PRESETS
      .filter((p) => !tombstones.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        description: p.description,
        descriptionEn: p.descriptionEn,
        builtin: true,
        patch: { ...p.patch },
      }));
    return [...builtins, ...readUserPresets()];
  }

  function getPresetById(presetId) {
    const id = String(presetId || '').trim();
    if (!id) return null;
    if (SCENE_PRESETS[id]) {
      const sp = SCENE_PRESETS[id];
      return {
        id: sp.id,
        name: sp.nameZh,
        nameEn: sp.nameEn,
        description: '',
        descriptionEn: '',
        builtin: true,
        isScenePreset: true,
        patch: { ...sp.patch },
      };
    }
    const all = listPresets();
    return all.find((p) => p.id === id) || null;
  }

  // ── Public Store Methods ────────────────────────────────────────────────────────────────────
  async function init() {
    cachedUserPresets = null;
    loadConfigFromDisk();
    ensureStorageDirs();
    sweepOrphanTempFiles(dataDir);
    sweepOrphanTempFiles(presetsDir);
    sweepOrphanTempFiles(getUploadDir());
    sweepOrphanTempFiles(getCacheDir());
    return getConfig();
  }

  function getConfig() {
    return { ...config };
  }

  function getEffectiveConfig(wallpaperId = config.activeWallpaperId) {
    return resolveEffectiveConfig(config, wallpaperId);
  }

  async function updateConfig(patch = {}, writeOpts = {}) {
    if (!patch || typeof patch !== 'object') return getConfig();
    const prevUploadDir = config.uploadDir;
    const prevCacheDir = config.cacheDir;

    // Expand quick optical scene preset (`preset: 'crystal' | 'islands' | 'focus' | 'eco'`)
    // when caller changes `preset` without explicitly overriding its optical keys
    let mergedPatch = { ...patch };
    if (
      typeof patch.preset === 'string'
      && SCENE_PRESETS[patch.preset]
      && patch.preset !== config.preset
    ) {
      mergedPatch = { ...SCENE_PRESETS[patch.preset].patch, ...patch };
    }

    // Mutate in-memory config synchronously (`<0.05ms`)
    config = sanitizeConfig(mergedPatch, config);
    if (config.uploadDir !== prevUploadDir || config.cacheDir !== prevCacheDir) {
      ensureStorageDirs();
    }

    const debounceMs = writeOpts?.debounce ? (Number(writeOpts.debounceMs) || 250) : 0;
    await scheduleConfigPersist({ debounceMs });
    return getConfig();
  }

  async function resetConfig(scope = 'all') {
    const validScope = ['all', 'skin', 'optics', 'playback'].includes(scope) ? scope : 'all';
    config = applyResetScope(config, validScope);
    await scheduleConfigPersist({ debounceMs: 0 });
    return getConfig();
  }

  async function applyPreset(presetId) {
    const found = getPresetById(presetId);
    if (!found) {
      throw makeError(`Unknown preset: ${presetId}`, 404);
    }
    const patch = found.isScenePreset
      ? { ...found.patch }
      : { ...found.patch, activeProfilePresetId: found.id };
    const nextCfg = await updateConfig(patch);
    return { config: nextCfg, preset: found };
  }

  async function savePreset({ name, description = '', patch = null } = {}) {
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) {
      throw makeError('Preset name is required', 400);
    }
    const cleanDesc = String(description || '').trim().slice(0, 240);
    const snapshotSource = patch && typeof patch === 'object'
      ? sanitizeConfig(patch, config)
      : getEffectiveConfig();
    const presetPatch = {};
    for (const k of PROFILE_PRESET_KEYS) {
      presetPatch[k] = snapshotSource[k];
    }

    const now = Date.now();
    const existingUser = readUserPresets().find(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase(),
    );
    const id = existingUser ? existingUser.id : slugifyId(cleanName, 'user');
    const record = {
      id,
      name: cleanName,
      nameEn: cleanName,
      description: cleanDesc,
      descriptionEn: cleanDesc,
      builtin: false,
      createdAt: existingUser?.createdAt || now,
      updatedAt: now,
      patch: presetPatch,
    };

    await enqueueWrite(async () => {
      await writeAtomicJsonAsync(join(presetsDir, `${id}.json`), record);
      cachedUserPresets = null;
      config = sanitizeConfig({ activeProfilePresetId: id }, config);
      await writeAtomicJsonAsync(configPath, config);
    });

    return { preset: record, presets: listPresets(), config: getConfig() };
  }

  async function deletePreset(presetId) {
    const id = String(presetId || '').trim();
    if (!id) throw makeError('Preset id is required', 400);

    await enqueueWrite(async () => {
      const userFile = join(presetsDir, `${basename(id)}.json`);
      if (existsSync(userFile)) {
        try { unlinkSync(userFile); } catch { /* ignore */ }
        cachedUserPresets = null;
      } else if (FACTORY_PRESETS.some((p) => p.id === id)) {
        const deleted = new Set(config.deletedFactoryPresets || []);
        deleted.add(id);
        config = sanitizeConfig({ deletedFactoryPresets: [...deleted] }, config);
        await writeAtomicJsonAsync(configPath, config);
      } else {
        throw makeError(`Preset not found: ${id}`, 404);
      }
      if (config.activeProfilePresetId === id) {
        config = sanitizeConfig({ activeProfilePresetId: '' }, config);
        await writeAtomicJsonAsync(configPath, config);
      }
    });

    return { ok: true, id, presets: listPresets(), config: getConfig() };
  }

  function exportPreset(presetId) {
    const found = getPresetById(presetId);
    if (!found) throw makeError(`Preset not found: ${presetId}`, 404);
    return {
      format: 'agy-wallpaper-prism-preset',
      version: 1,
      exportedAt: new Date().toISOString(),
      preset: {
        id: found.id,
        name: found.name,
        nameEn: found.nameEn || found.name,
        description: found.description || '',
        patch: { ...found.patch },
      },
    };
  }

  async function importPreset(payload) {
    if (!payload || typeof payload !== 'object') {
      throw makeError('Invalid preset JSON payload', 400);
    }
    const raw = payload.preset && typeof payload.preset === 'object' ? payload.preset : payload;
    const rawPatch = raw.patch && typeof raw.patch === 'object'
      ? raw.patch
      : raw.config && typeof raw.config === 'object'
        ? raw.config
        : raw;

    const patch = extractPresetPatch(rawPatch);
    if (Object.keys(patch).length === 0) {
      throw makeError('Preset contains no valid configuration properties', 400);
    }

    const existingNames = new Set(listPresets().map((p) => p.name.toLowerCase()));
    const baseName = String(raw.name || raw.title || 'Imported Preset').trim().slice(0, 72) || 'Imported Preset';
    let finalName = baseName;
    let suffix = 2;
    while (existingNames.has(finalName.toLowerCase())) {
      finalName = `${baseName} (${suffix})`;
      suffix += 1;
    }

    const now = Date.now();
    const id = slugifyId(finalName, 'import');
    const record = {
      id,
      name: finalName,
      nameEn: String(raw.nameEn || finalName).slice(0, 80),
      description: String(raw.description || '').slice(0, 240),
      descriptionEn: String(raw.descriptionEn || raw.description || '').slice(0, 240),
      builtin: false,
      createdAt: now,
      updatedAt: now,
      patch,
    };

    await enqueueWrite(async () => {
      await writeAtomicJsonAsync(join(presetsDir, `${id}.json`), record);
      cachedUserPresets = null;
    });

    return { ok: true, preset: record, presets: listPresets() };
  }

  async function updateUserProps(wallpaperId, propsPatch = {}) {
    const id = String(wallpaperId || '').trim();
    if (!id) throw makeError('wallpaperId is required', 400);
    if (!propsPatch || typeof propsPatch !== 'object' || Array.isArray(propsPatch)) {
      throw makeError('props must be an object', 400);
    }

    return enqueueWrite(() => {
      const nextUserProps = { ...(config.userProps || {}) };
      const currentForId = { ...(nextUserProps[id] || {}) };
      for (const [k, v] of Object.entries(propsPatch)) {
        if (v === null || v === undefined) {
          delete currentForId[k];
        } else if (typeof v === 'object' && 'value' in v) {
          currentForId[k] = v.value;
        } else {
          currentForId[k] = v;
        }
      }
      if (Object.keys(currentForId).length > 0) {
        nextUserProps[id] = currentForId;
      } else {
        delete nextUserProps[id];
      }
      config = sanitizeConfig({ userProps: nextUserProps }, config);
      writeAtomicJsonSync(configPath, config);
      return { config: getConfig(), props: nextUserProps[id] || {} };
    });
  }

  async function savePerWallpaperOverride(wallpaperId, patch = null) {
    const id = String(wallpaperId || '').trim();
    if (!id) throw makeError('wallpaperId is required', 400);
    return enqueueWrite(() => {
      const map = { ...(config.perWallpaperOverrides || {}) };
      if (patch === null) {
        delete map[id];
      } else {
        const clean = sanitizeConfig(patch, config);
        const filtered = { ...(map[id] || {}) };
        for (const k of PER_WALLPAPER_OVERRIDE_KEYS) {
          if (k in patch) filtered[k] = clean[k];
        }
        map[id] = filtered;
      }
      config = sanitizeConfig({ perWallpaperOverrides: map }, config);
      writeAtomicJsonSync(configPath, config);
      return getConfig();
    });
  }

  /**
   * Stream or write uploaded wallpaper media (up to 512 MiB) into `uploadDir` with
   * SHA-256 content deduplication.
   */
  async function uploadMedia({ filename = '', contentType = '', streamOrBuffer, title = '' } = {}) {
    if (!streamOrBuffer) {
      throw makeError('Missing upload media body', 400);
    }

    const cleanOriginal = basename(String(filename || 'wallpaper')).replace(/[\0<>:"/\\|?*]+/g, '_');
    let ext = extname(cleanOriginal).toLowerCase();
    if (!ext && contentType) {
      const baseCt = String(contentType).split(';')[0].trim().toLowerCase();
      ext = EXT_FROM_CONTENT_TYPE[baseCt] || '';
    }
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) {
      throw makeError(`Unsupported wallpaper media extension: ${ext || '(none)'}`, 415);
    }

    const dir = getUploadDir();
    mkdirSync(dir, { recursive: true });
    uploadSeq += 1;
    const tmpPath = join(dir, `.upload-${process.pid}-${Date.now()}-${uploadSeq}.tmp`);
    const hash = createHash('sha256');
    let totalBytes = 0;

    try {
      if (
        Buffer.isBuffer(streamOrBuffer)
        || streamOrBuffer instanceof Uint8Array
        || streamOrBuffer instanceof ArrayBuffer
        || typeof streamOrBuffer === 'string'
      ) {
        const buf = Buffer.isBuffer(streamOrBuffer)
          ? streamOrBuffer
          : streamOrBuffer instanceof ArrayBuffer
            ? Buffer.from(streamOrBuffer)
            : typeof streamOrBuffer === 'string'
              ? Buffer.from(streamOrBuffer, 'utf8')
              : Buffer.from(streamOrBuffer.buffer, streamOrBuffer.byteOffset, streamOrBuffer.byteLength);

        if (buf.length === 0) throw makeError('Uploaded file is empty', 400);
        if (buf.length > MAX_UPLOAD_BYTES) {
          throw makeError(`Upload exceeds maximum size (${MAX_UPLOAD_BYTES} bytes)`, 413);
        }
        totalBytes = buf.length;
        hash.update(buf);
        const fd = openSync(tmpPath, 'w', 0o600);
        try {
          writeSync(fd, buf, 0, buf.length, 0);
          try { fsyncSync(fd); } catch { /* ignore */ }
        } finally {
          closeSync(fd);
        }
      } else if (typeof streamOrBuffer.on === 'function') {
        await new Promise((resolveStream, rejectStream) => {
          const out = createWriteStream(tmpPath, { mode: 0o600 });
          let aborted = false;

          const fail = (err) => {
            if (aborted) return;
            aborted = true;
            try { out.destroy(); } catch { /* ignore */ }
            rejectStream(err);
          };

          streamOrBuffer.on('data', (chunk) => {
            if (aborted) return;
            const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += b.length;
            if (totalBytes > MAX_UPLOAD_BYTES) {
              fail(makeError(`Upload exceeds maximum size (${MAX_UPLOAD_BYTES} bytes)`, 413));
              return;
            }
            hash.update(b);
            if (!out.write(b)) {
              try { streamOrBuffer.pause?.(); } catch { /* ignore */ }
              out.once('drain', () => {
                try { streamOrBuffer.resume?.(); } catch { /* ignore */ }
              });
            }
          });

          streamOrBuffer.on('error', fail);
          out.on('error', fail);
          streamOrBuffer.on('end', () => {
            if (aborted) return;
            out.end(() => resolveStream());
          });
        });

        if (totalBytes === 0) {
          throw makeError('Uploaded stream was empty', 400);
        }
      } else {
        throw makeError('Unsupported streamOrBuffer type', 400);
      }

      const sha256 = hash.digest('hex');

      return await enqueueWrite(() => {
        const metaList = readUploadMetaList(dir);
        const existing = metaList.find((m) => m.sha256 === sha256 && existsSync(m.absPath));
        if (existing) {
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
          return { ok: true, duplicate: true, meta: existing };
        }

        const id = `up-${sha256.slice(0, 12)}`;
        const storedFilename = `${id}${ext}`;
        const finalPath = join(dir, storedFilename);
        moveFileCrossDeviceSafe(tmpPath, finalPath);

        const cleanTitle = String(
          title || basename(cleanOriginal, extname(cleanOriginal)) || id,
        ).trim().slice(0, 200);

        const meta = {
          id,
          sha256,
          filename: storedFilename,
          originalName: cleanOriginal,
          title: cleanTitle,
          size: totalBytes,
          createdAt: Date.now(),
          absPath: finalPath,
        };
        const updated = [meta, ...metaList.filter((m) => m.id !== id)];
        writeUploadMetaList(updated, dir);
        return { ok: true, duplicate: false, meta };
      });
    } catch (err) {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch { /* ignore */ }
      throw err;
    }
  }

  async function removeUpload(wallpaperId) {
    const id = String(wallpaperId || '').trim();
    if (!id.startsWith('up-')) {
      throw makeError('Only uploaded wallpapers (up-*) can be removed via removeUpload', 403);
    }

    return enqueueWrite(() => {
      const dir = getUploadDir();
      const realDir = existsSync(dir) ? realpathSync(dir) : resolve(dir);
      const metaList = readUploadMetaList(dir);
      const targetMeta = metaList.find((m) => m.id === id);

      let targetAbs = targetMeta ? targetMeta.absPath : '';
      if (!targetAbs && existsSync(dir)) {
        for (const name of readdirSync(dir)) {
          if (name.startsWith(`${id}.`) || `up-${createHash('sha1').update(name).digest('hex').slice(0, 12)}` === id) {
            targetAbs = join(dir, name);
            break;
          }
        }
      }

      if (!targetAbs || !existsSync(targetAbs)) {
        throw makeError(`Uploaded wallpaper not found: ${id}`, 404);
      }

      const realTarget = realpathSync(targetAbs);
      const rel = relative(realDir, realTarget);
      if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) {
        throw makeError('Refusing to remove file outside upload directory', 403);
      }

      unlinkSync(realTarget);
      writeUploadMetaList(metaList.filter((m) => m.id !== id), dir);

      // Clean up references in config
      const favs = (config.favorites || []).filter((x) => x !== id);
      const hidden = (config.hiddenIds || []).filter((x) => x !== id);
      const nextPatch = { favorites: favs, hiddenIds: hidden };
      if (config.activeWallpaperId === id) {
        nextPatch.activeWallpaperId = '';
        nextPatch.wallpaperId = '';
      }
      config = sanitizeConfig(nextPatch, config);
      writeAtomicJsonSync(configPath, config);

      return { ok: true, removedId: id, config: getConfig() };
    });
  }

  async function setStorageDir(kind, rawPath) {
    const targetRaw = String(rawPath || '').trim();
    if (!targetRaw) throw makeError('Path is required', 400);
    const absTarget = resolve(targetRaw);

    if (kind === 'addCustomFolder') {
      if (!existsSync(absTarget) || !statSync(absTarget).isDirectory()) {
        throw makeError(`Directory does not exist: ${absTarget}`, 404);
      }
      const next = [...new Set([...(config.customFolders || []), absTarget])];
      const cfg = await updateConfig({ customFolders: next });
      return { ok: true, kind, path: absTarget, config: cfg };
    }

    if (kind === 'removeCustomFolder') {
      const normKey = process.platform === 'win32' ? absTarget.toLowerCase() : absTarget;
      const next = (config.customFolders || []).filter((f) => {
        const k = process.platform === 'win32' ? resolve(f).toLowerCase() : resolve(f);
        return k !== normKey;
      });
      const cfg = await updateConfig({ customFolders: next });
      return { ok: true, kind, path: absTarget, config: cfg };
    }

    if (kind === 'uploadDir') {
      const prevDir = getUploadDir();
      mkdirSync(absTarget, { recursive: true });
      let migratedCount = 0;
      if (resolve(prevDir) !== absTarget && existsSync(prevDir)) {
        for (const name of readdirSync(prevDir)) {
          if (name.includes('.tmp')) continue;
          const src = join(prevDir, name);
          const dst = join(absTarget, name);
          try {
            if (lstatSync(src).isFile() && !existsSync(dst)) {
              moveFileCrossDeviceSafe(src, dst);
              migratedCount += 1;
            }
          } catch { /* skip locked file */ }
        }
      }
      const cfg = await updateConfig({ uploadDir: absTarget });
      return { ok: true, kind, path: absTarget, migratedCount, config: cfg };
    }

    if (kind === 'cacheDir') {
      const prevDir = getCacheDir();
      mkdirSync(absTarget, { recursive: true });
      if (resolve(prevDir) !== absTarget) {
        const idxSrc = join(prevDir, 'inventory-index.json');
        const idxDst = join(absTarget, 'inventory-index.json');
        if (existsSync(idxSrc) && !existsSync(idxDst)) {
          try { moveFileCrossDeviceSafe(idxSrc, idxDst); } catch { /* ignore */ }
        }
      }
      const cfg = await updateConfig({ cacheDir: absTarget });
      return { ok: true, kind, path: absTarget, config: cfg };
    }

    throw makeError(`Unsupported storage directory kind: ${kind}`, 400);
  }

  function browseDirs(targetPath = '') {
    const home = homedir();
    const quickRoots = [];
    const pushRoot = (label, p) => {
      if (p && existsSync(p)) {
        try {
          if (statSync(p).isDirectory()) quickRoots.push({ label, path: resolve(p) });
        } catch { /* ignore */ }
      }
    };

    if (process.platform === 'win32') {
      for (let code = 65; code <= 90; code += 1) {
        const drive = `${String.fromCharCode(code)}:\\`;
        pushRoot(drive, drive);
      }
    } else {
      pushRoot('/', '/');
    }

    pushRoot('Home', home);
    pushRoot('Pictures', join(home, 'Pictures'));
    pushRoot('Desktop', join(home, 'Desktop'));
    pushRoot('Downloads', join(home, 'Downloads'));
    pushRoot('Uploads', getUploadDir());
    pushRoot('Cache', getCacheDir());

    const requested = String(targetPath || '').trim();
    if (requested === '__drives__' && process.platform === 'win32') {
      return {
        current: '',
        parent: '',
        quickRoots,
        entries: quickRoots
          .filter((r) => /^[A-Z]:\\$/i.test(r.label))
          .map((r) => ({ name: r.label, path: r.path, isDirectory: true })),
      };
    }

    const current = requested && existsSync(requested) && statSync(requested).isDirectory()
      ? resolve(requested)
      : resolve(home);

    const parentCandidate = dirname(current);
    const parent = parentCandidate && parentCandidate !== current
      ? parentCandidate
      : (process.platform === 'win32' ? '__drives__' : '');

    const skipNames = new Set(['$recycle.bin', 'system volume information', '$winreagent', 'recovery']);
    const entries = [];
    try {
      for (const dirent of readdirSync(current, { withFileTypes: true })) {
        const name = dirent.name;
        if (name.startsWith('.') || skipNames.has(name.toLowerCase())) continue;
        if (!dirent.isDirectory()) continue;
        entries.push({
          name,
          path: join(current, name),
          isDirectory: true,
        });
      }
    } catch { /* inaccessible folder returns empty entries gracefully */ }

    entries.sort((a, b) => naturalCollator.compare(a.name, b.name));

    return {
      current,
      parent,
      quickRoots,
      entries,
    };
  }

  return {
    dataDir,
    configPath,
    presetsDir,
    init,
    flush,
    getConfig,
    getEffectiveConfig,
    getUploadDir,
    getCacheDir,
    readUploadMetaList,
    updateConfig,
    resetConfig,
    listPresets,
    getPresetById,
    applyPreset,
    savePreset,
    deletePreset,
    exportPreset,
    importPreset,
    updateUserProps,
    savePerWallpaperOverride,
    uploadMedia,
    removeUpload,
    setStorageDir,
    browseDirs,
  };
}
