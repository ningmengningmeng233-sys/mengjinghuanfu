/**
 * Multi-Source Wallpaper Scanner, Steam `431960` Discovery & Inventory Cache (`scanner.mjs`)
 *
 * Ports `dsh-plugin-wallpaper-engine`:
 * - Multi-tier Steam & Wallpaper Engine (`431960`) discovery (`AGY_PRISM_STEAM_ROOT` /
 *   `DSH_WE_STEAM_ROOT` env override -> Windows Registry `HKCU\Software\Valve\Steam` ->
 *   drive roots `C:..Z:` -> WSL `/mnt/*` -> `libraryfolders.vdf` + `visibility.json`).
 * - Chunked async scanning (`CHUNK = 24`) across Workshop `431960`, WE `defaultprojects` &
 *   `myprojects`, `uploadDir` (`.meta.json` + extracted project dirs), and `customFolders`
 *   (standalone media + WE project subfolders), plus built-in `builtin-prism-aurora`.
 * - Full `project.json` parser (`video`, `scene`, `web`, `image`, `slideshow` up to 2,000
 *   natural-sorted frames, `imageswitchtimes` tiers 1..5, `contentrating`, `schemecolor`,
 *   `general.properties` + `condition`), symlink/traversal fencing, MP4/image dimension probe,
 *   and persistent SHA-1 `inventory-index.json` metadata cache.
 */

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import {
  inspectSceneContainer,
  parseWeProjectProperties,
  weColorToHex,
} from './pkg-scene.mjs';
import { probeMp4Metadata } from './mp4-vfs.mjs';

export const WE_APP_ID = '431960';
const DISCOVERY_TTL_MS = 60_000;
const SCAN_CHUNK_SIZE = 12;
const MAX_SLIDESHOW_FRAMES = 2000;
const INVENTORY_CACHE_VERSION = 2;

export const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.svg']);
export const VIDEO_EXTS = new Set(['.mp4', '.webm', '.m4v', '.mov', '.ogv']);
export const WEB_EXTS = new Set(['.html', '.htm']);
export const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.oga', '.wav', '.m4a', '.flac', '.aac']);

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const IMAGE_SWITCH_TIERS_MS = Object.freeze({
  1: 10_000,
  2: 30_000,
  3: 60_000,
  4: 300_000,
  5: 1_800_000,
});

let cachedDiscovery = null;
let cachedDiscoveryAt = 0;
let cachedDiscoveryKey = '';
let inflightDiscovery = null;

/** Strip Electron/Node injection env vars before spawning external Windows binaries. */
export function cleanHostEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  delete env.NODE_OPTIONS;
  return env;
}

function sha1Short(text, len = 12) {
  return createHash('sha1').update(String(text)).digest('hex').slice(0, len);
}

function safeStat(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

function safeLstat(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function isDirSafe(p) {
  const st = safeStat(p);
  return Boolean(st && st.isDirectory());
}

function isFileSafe(p) {
  const st = safeLstat(p);
  return Boolean(st && st.isFile() && !st.isSymbolicLink());
}

/**
 * Resolve `relFile` inside `rootDir` while enforcing strict directory & symlink containment.
 * Returns `null` on any `..` traversal or symlink escape.
 */
export function resolveFencedPath(rootDir, relFile) {
  if (!rootDir || typeof relFile !== 'string') return null;
  const cleaned = relFile.trim().replace(/^[/\\]+/, '');
  if (!cleaned || cleaned.includes('\0')) return null;

  const absRoot = resolve(rootDir);
  const candidate = resolve(absRoot, cleaned);
  const rel = relative(absRoot, candidate);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(absRoot, rel) !== candidate) {
    return null;
  }

  let realRoot = absRoot;
  try {
    realRoot = realpathSync(absRoot);
  } catch {
    return null;
  }

  if (!existsSync(candidate)) return null;
  try {
    const lst = lstatSync(candidate);
    if (lst.isSymbolicLink()) return null;
    const realCand = realpathSync(candidate);
    if (realCand !== realRoot && !realCand.startsWith(realRoot + sep)) {
      return null;
    }
    return realCand;
  } catch {
    return null;
  }
}

/** Parse Valve `libraryfolders.vdf` and return all valid library root paths. */
export function parseLibraryFoldersVdf(vdfText) {
  if (typeof vdfText !== 'string' || !vdfText) return [];
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const unescaped = String(raw || '').replace(/\\\\/g, '\\').trim();
    if (!unescaped) return;
    const norm = resolve(unescaped);
    const key = process.platform === 'win32' ? norm.toLowerCase() : norm;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(norm);
  };

  // VDF v2: "path"   "D:\\SteamLibrary"
  const pathRe = /"path"\s+"([^"]+)"/gi;
  let m;
  while ((m = pathRe.exec(vdfText)) !== null) {
    add(m[1]);
  }
  // Legacy VDF v1: "1"  "D:\\SteamLibrary"
  const legacyRe = /^\s*"\d+"\s+"([A-Za-z]:\\[^"]+|\/[^"]+)"\s*$/gm;
  while ((m = legacyRe.exec(vdfText)) !== null) {
    add(m[1]);
  }
  return out;
}

function queryWindowsRegistrySteamPath(timeoutMs = 5000) {
  if (process.platform !== 'win32') return Promise.resolve('');
  return new Promise((resolveDone) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolveDone(val || '');
    };
    try {
      const child = execFile(
        'reg.exe',
        ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
        { timeout: timeoutMs, windowsHide: true, env: cleanHostEnv() },
        (err, stdout) => {
          if (err || !stdout) return finish('');
          const match = /SteamPath\s+REG_SZ\s+(.+)/i.exec(String(stdout));
          if (!match) return finish('');
          const raw = match[1].trim().replace(/\//g, '\\');
          finish(isDirSafe(raw) ? resolve(raw) : '');
        },
      );
      child.on('error', () => finish(''));
    } catch {
      finish('');
    }
  });
}

function collectCandidateSteamRootsSync() {
  const candidates = [];
  const pushIfDir = (p) => {
    if (p && isDirSafe(p)) candidates.push(resolve(p));
  };

  if (process.platform === 'win32') {
    pushIfDir('C:\\Program Files (x86)\\Steam');
    pushIfDir('C:\\Program Files\\Steam');
    for (let code = 67; code <= 90; code += 1) {
      const letter = String.fromCharCode(code);
      pushIfDir(`${letter}:\\Steam`);
      pushIfDir(`${letter}:\\SteamLibrary`);
      pushIfDir(`${letter}:\\Games\\Steam`);
      pushIfDir(`${letter}:\\Program Files (x86)\\Steam`);
    }
  } else {
    const home = homedir();
    pushIfDir(join(home, '.steam', 'steam'));
    pushIfDir(join(home, '.local', 'share', 'Steam'));
    pushIfDir(join(home, 'Library', 'Application Support', 'Steam'));
    // WSL /mnt/<drive>
    if (isDirSafe('/mnt')) {
      try {
        for (const d of readdirSync('/mnt')) {
          if (/^[a-z]$/i.test(d)) {
            pushIfDir(`/mnt/${d}/Program Files (x86)/Steam`);
            pushIfDir(`/mnt/${d}/Steam`);
            pushIfDir(`/mnt/${d}/SteamLibrary`);
          }
        }
      } catch { /* ignore */ }
    }
  }
  return candidates;
}

function readHiddenWorkshopSet(dirs) {
  const hidden = new Set();
  for (const dir of dirs) {
    if (!dir) continue;
    const visFile = join(dir, 'visibility.json');
    if (!isFileSafe(visFile)) continue;
    try {
      const obj = JSON.parse(readFileSync(visFile, 'utf8').replace(/^\uFEFF/, ''));
      const mapCandidates = [obj, obj?.items, obj?.visibility, obj?.workshop];
      for (const mapObj of mapCandidates) {
        if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) continue;
        for (const [k, v] of Object.entries(mapObj)) {
          if (v === false || (v && typeof v === 'object' && v.visible === false) || v === 0 || v === 'hidden') {
            hidden.add(String(k).trim());
          }
        }
      }
    } catch { /* ignore malformed visibility.json */ }
  }
  return hidden;
}

function loadCachedSteamRootsDisk(steamCachePath) {
  if (!steamCachePath || !isFileSafe(steamCachePath)) return null;
  try {
    const saved = JSON.parse(readFileSync(steamCachePath, 'utf8'));
    if (saved?.version !== 1 || !Array.isArray(saved.steamRoots)) return null;
    if (saved.steamRoots.length === 0 && !saved.weInstallDir) return null;
    for (const r of saved.steamRoots) {
      if (!isDirSafe(r)) return null;
    }
    if (saved.weInstallDir && !isDirSafe(saved.weInstallDir)) return null;
    for (const ws of saved.workshopDirs || []) {
      if (!isDirSafe(ws)) return null;
    }
    const visDirs = [...(saved.workshopDirs || [])];
    if (saved.weInstallDir) visDirs.push(saved.weInstallDir);
    return {
      steamRoots: saved.steamRoots,
      weInstallDir: saved.weInstallDir || '',
      defaultProjectsDirs: (saved.defaultProjectsDirs || []).filter(isDirSafe),
      myProjectsDirs: (saved.myProjectsDirs || []).filter(isDirSafe),
      workshopDirs: (saved.workshopDirs || []).filter(isDirSafe),
      hiddenWorkshopIds: readHiddenWorkshopSet(visDirs),
      discoveredAt: Date.now(),
      fromDiskCache: true,
    };
  } catch {
    return null;
  }
}

function saveCachedSteamRootsDisk(steamCachePath, data) {
  if (!steamCachePath) return;
  try {
    mkdirSync(dirname(steamCachePath), { recursive: true });
    const tmp = `${steamCachePath}.tmp${process.pid}.${Date.now()}`;
    writeFileSync(
      tmp,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        steamRoots: data.steamRoots || [],
        weInstallDir: data.weInstallDir || '',
        defaultProjectsDirs: data.defaultProjectsDirs || [],
        myProjectsDirs: data.myProjectsDirs || [],
        workshopDirs: data.workshopDirs || [],
      }),
      'utf8',
    );
    renameSync(tmp, steamCachePath);
  } catch { /* ignore */ }
}

/**
 * Discover Steam libraries, Wallpaper Engine (`431960`) install path, Workshop `431960` dirs,
 * and hidden Workshop item IDs (`visibility.json`).
 */
export async function discoverSteamWeEnvironment(opts = {}) {
  const explicitOverride = String(
    opts.steamRoot
    ?? process.env.AGY_PRISM_STEAM_ROOT
    ?? process.env.DSH_WE_STEAM_ROOT
    ?? '',
  ).trim();
  const cacheDir = typeof opts.cacheDir === 'string' ? opts.cacheDir.trim() : '';
  const steamCachePath = !explicitOverride && cacheDir ? join(cacheDir, 'steam-roots.json') : '';
  const cacheKey = explicitOverride || '__auto__';
  const now = Date.now();

  if (!opts.refresh && cachedDiscovery && cachedDiscoveryKey === cacheKey && (now - cachedDiscoveryAt) < DISCOVERY_TTL_MS) {
    return cachedDiscovery;
  }
  if (!opts.refresh && steamCachePath) {
    const diskHit = loadCachedSteamRootsDisk(steamCachePath);
    if (diskHit) {
      cachedDiscovery = diskHit;
      cachedDiscoveryKey = cacheKey;
      cachedDiscoveryAt = now;
      return diskHit;
    }
  }
  if (!opts.refresh && inflightDiscovery && cachedDiscoveryKey === cacheKey) {
    return inflightDiscovery;
  }

  const run = async () => {
    const seedRoots = [];
    if (explicitOverride) {
      if (isDirSafe(explicitOverride)) {
        seedRoots.push(resolve(explicitOverride));
      }
    } else {
      for (const c of collectCandidateSteamRootsSync()) {
        seedRoots.push(c);
      }
      // Only spawn `reg.exe` on cold machines where standard drive candidates found nothing!
      const hasCandidateWe = seedRoots.some((r) =>
        isDirSafe(join(r, 'steamapps', 'common', 'wallpaper_engine'))
        || isDirSafe(join(r, 'steamapps', 'workshop', 'content', WE_APP_ID))
        || isFileSafe(join(r, 'steamapps', 'libraryfolders.vdf')));
      if (!hasCandidateWe) {
        const regRoot = await queryWindowsRegistrySteamPath();
        if (regRoot) seedRoots.unshift(regRoot);
      }
    }

    const libraryRoots = [];
    const seenLib = new Set();
    const addLibrary = (libPath) => {
      if (!libPath || !isDirSafe(libPath)) return;
      const abs = resolve(libPath);
      const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
      if (seenLib.has(key)) return;
      seenLib.add(key);
      libraryRoots.push(abs);
    };

    for (const root of seedRoots) {
      addLibrary(root);
      const vdfCandidates = [
        join(root, 'steamapps', 'libraryfolders.vdf'),
        join(root, 'config', 'libraryfolders.vdf'),
        join(root, 'libraryfolders.vdf'),
      ];
      for (const vdfPath of vdfCandidates) {
        if (!isFileSafe(vdfPath)) continue;
        try {
          const parsed = parseLibraryFoldersVdf(readFileSync(vdfPath, 'utf8'));
          for (const lib of parsed) addLibrary(lib);
        } catch { /* ignore */ }
      }
    }

    let weInstallDir = '';
    const defaultProjectsDirs = [];
    const myProjectsDirs = [];
    const workshopDirs = [];
    const visibilityCheckDirs = [];

    for (const lib of libraryRoots) {
      const steamapps = isDirSafe(join(lib, 'steamapps')) ? join(lib, 'steamapps') : lib;
      const weDir = join(steamapps, 'common', 'wallpaper_engine');
      if (isDirSafe(weDir)) {
        if (!weInstallDir) weInstallDir = weDir;
        visibilityCheckDirs.push(weDir);
        const defCandidates = [
          join(weDir, 'projects', 'defaultprojects'),
          join(weDir, 'distribution', 'projects', 'defaultprojects'),
        ];
        for (const d of defCandidates) {
          if (isDirSafe(d) && !defaultProjectsDirs.includes(d)) defaultProjectsDirs.push(d);
        }
        const myDir = join(weDir, 'projects', 'myprojects');
        if (isDirSafe(myDir) && !myProjectsDirs.includes(myDir)) myProjectsDirs.push(myDir);
      }

      const wsDir = join(steamapps, 'workshop', 'content', WE_APP_ID);
      if (isDirSafe(wsDir) && !workshopDirs.includes(wsDir)) {
        workshopDirs.push(wsDir);
        visibilityCheckDirs.push(wsDir);
      }
    }

    // Also allow explicit override pointing directly at a `wallpaper_engine` or `431960` folder
    if (explicitOverride && isDirSafe(explicitOverride)) {
      const absOv = resolve(explicitOverride);
      visibilityCheckDirs.push(absOv);
      if (isDirSafe(join(absOv, 'projects', 'defaultprojects'))) {
        if (!weInstallDir) weInstallDir = absOv;
        const d = join(absOv, 'projects', 'defaultprojects');
        if (!defaultProjectsDirs.includes(d)) defaultProjectsDirs.push(d);
      }
      if (basename(absOv) === WE_APP_ID && !workshopDirs.includes(absOv)) {
        workshopDirs.push(absOv);
      }
    }

    const hiddenWorkshopIds = readHiddenWorkshopSet(visibilityCheckDirs);
    const result = {
      steamRoots: libraryRoots,
      weInstallDir,
      defaultProjectsDirs,
      myProjectsDirs,
      workshopDirs,
      hiddenWorkshopIds,
      discoveredAt: Date.now(),
    };
    if (steamCachePath) {
      saveCachedSteamRootsDisk(steamCachePath, result);
    }
    cachedDiscovery = result;
    cachedDiscoveryKey = cacheKey;
    cachedDiscoveryAt = Date.now();
    return result;
  };

  inflightDiscovery = run().finally(() => {
    inflightDiscovery = null;
  });
  cachedDiscoveryKey = cacheKey;
  return inflightDiscovery;
}

/** Read playlists defined in Wallpaper Engine's `wallpaper_engine/config.json` for first-run seeding. */
export function readWePlaylists(weInstallDir) {
  if (!weInstallDir) return [];
  const cfgPath = join(weInstallDir, 'config.json');
  if (!isFileSafe(cfgPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
    const playlists = [];
    const seenNames = new Set();

    const extractFromNode = (node) => {
      if (!node || typeof node !== 'object') return;
      const list = node?.general?.playlists;
      if (Array.isArray(list)) {
        for (const pl of list) {
          if (!pl || typeof pl !== 'object' || !Array.isArray(pl.items)) continue;
          const name = String(pl.name || 'WE Playlist').trim();
          if (!name || seenNames.has(name)) continue;
          const workshopIds = [];
          for (const rawItem of pl.items) {
            const s = String(rawItem || '').replace(/\\/g, '/');
            const m = /\/431960\/(\d+)(?:\/|$)/.exec(s);
            if (m) workshopIds.push(`ws-${m[1]}`);
          }
          if (workshopIds.length > 0) {
            seenNames.add(name);
            const delayMin = Number(pl?.settings?.delay);
            playlists.push({
              id: `we-${sha1Short(name, 8)}`,
              name,
              wallpaperIds: workshopIds,
              order: pl?.settings?.order === 'sorted' ? 'sequence' : 'random',
              trigger: pl?.settings?.mode === 'timer' || !pl?.settings?.mode ? 'interval' : 'videoEnd',
              interval: Number.isFinite(delayMin) && delayMin >= 1 ? Math.min(1440, Math.round(delayMin)) : 15,
            });
          }
        }
      }
      for (const child of Object.values(node)) {
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          extractFromNode(child);
        }
      }
    };

    extractFromNode(raw);
    return playlists;
  } catch {
    return [];
  }
}

/** Lightweight header-only image dimension reader (`PNG`, `JPEG`, `GIF`, `WebP`). */
export function probeImageDimensions(absPath) {
  let fd;
  try {
    const st = statSync(absPath);
    if (!st.isFile() || st.size < 16) return null;
    const cap = Math.min(st.size, 65536);
    const buf = Buffer.allocUnsafe(cap);
    fd = openSync(absPath, 'r');
    const n = readSync(fd, buf, 0, cap, 0);
    if (n < 16) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && n >= 24) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }

    // GIF87a / GIF89a
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && n >= 10) {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      if (width > 0 && height > 0) return { width, height };
    }

    // WebP: RIFF....WEBP
    if (
      buf.toString('latin1', 0, 4) === 'RIFF'
      && buf.toString('latin1', 8, 12) === 'WEBP'
      && n >= 30
    ) {
      const chunk = buf.toString('latin1', 12, 16);
      if (chunk === 'VP8 ' && n >= 30) {
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      } else if (chunk === 'VP8L' && n >= 25) {
        const bits = buf.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        if (width > 0 && height > 0) return { width, height };
      } else if (chunk === 'VP8X' && n >= 30) {
        const width = 1 + buf.readUIntLE(24, 3);
        const height = 1 + buf.readUIntLE(27, 3);
        if (width > 0 && height > 0) return { width, height };
      }
    }

    // JPEG: FF D8 ... SOF0/SOF1/SOF2
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off + 9 < n) {
        if (buf[off] !== 0xff) { off += 1; continue; }
        const marker = buf[off + 1];
        if (marker === 0xff) { off += 1; continue; }
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          off += 2;
          continue;
        }
        const segLen = buf.readUInt16BE(off + 2);
        if (segLen < 2 || off + 2 + segLen > n) break;
        if (
          (marker >= 0xc0 && marker <= 0xc3)
          || (marker >= 0xc5 && marker <= 0xc7)
          || (marker >= 0xc9 && marker <= 0xcb)
          || (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buf.readUInt16BE(off + 5);
          const width = buf.readUInt16BE(off + 7);
          if (width > 0 && height > 0) return { width, height };
          break;
        }
        off += 2 + segLen;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

function parseLenientJson(text) {
  const stripped = String(text || '').replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Tolerate trailing commas common in hand-edited Workshop project.json files
    const repaired = stripped.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(repaired);
  }
}

export function normalizeContentRating(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'everyone' || s === 'general' || s === 'safe') return 'everyone';
  if (s === 'questionable' || s === 'pg13' || s === 'pg-13' || s === 'teen') return 'pg13';
  if (s === 'mature' || s === 'adult' || s === 'nsfw' || s === 'r18') return 'mature';
  return 'unrated';
}

function normalizeTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 24);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 24);
  }
  return [];
}

function findFallbackPreview(projectDir) {
  const commonNames = [
    'preview.jpg', 'preview.gif', 'preview.png', 'preview.webp', 'preview.jpeg',
    'thumb.jpg', 'thumb.png',
  ];
  for (const name of commonNames) {
    const abs = resolveFencedPath(projectDir, name);
    if (abs) return abs;
  }
  return null;
}

function findFirstAudioInDir(projectDir) {
  try {
    const entries = readdirSync(projectDir);
    for (const name of entries) {
      if (AUDIO_EXTS.has(extname(name).toLowerCase())) {
        const abs = resolveFencedPath(projectDir, name);
        if (abs) return abs;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function collectPresetSlides(projectDir, projectObj) {
  const slides = [];
  const seen = new Set();
  const absProjectDir = resolve(projectDir);
  let realProjectRoot = absProjectDir;
  try { realProjectRoot = realpathSync(absProjectDir); } catch { /* ignore */ }

  const pushAbsSlide = (absFile) => {
    if (!absFile || slides.length >= MAX_SLIDESHOW_FRAMES || seen.has(absFile)) return;
    if (!IMAGE_EXTS.has(extname(absFile).toLowerCase())) return;
    seen.add(absFile);
    slides.push(absFile);
  };

  const pushSlide = (relPath) => {
    if (slides.length >= MAX_SLIDESHOW_FRAMES) return;
    const abs = resolveFencedPath(projectDir, relPath);
    if (!abs) return;
    let st;
    try { st = statSync(abs); } catch { return; }
    if (st.isFile()) {
      pushAbsSlide(abs);
    }
  };

  const walkSlidesDir = (dirAbs, depth = 0) => {
    if (depth > 3 || slides.length >= MAX_SLIDESHOW_FRAMES) return;
    let names = [];
    try { names = readdirSync(dirAbs); } catch { return; }
    names.sort((a, b) => naturalCollator.compare(a, b));
    for (const name of names) {
      if (slides.length >= MAX_SLIDESHOW_FRAMES) break;
      if (name.startsWith('.')) continue;
      const full = join(dirAbs, name);
      let lst;
      try {
        lst = lstatSync(full);
        if (lst.isSymbolicLink()) continue;
        const real = realpathSync(full);
        if (real !== realProjectRoot && !real.startsWith(realProjectRoot + sep)) continue;
        if (lst.isDirectory()) {
          walkSlidesDir(real, depth + 1);
        } else if (lst.isFile()) {
          pushAbsSlide(real);
        }
      } catch {
        continue;
      }
    }
  };

  const preset = projectObj?.preset;
  if (Array.isArray(preset)) {
    for (const entry of preset) {
      if (typeof entry === 'string') pushSlide(entry);
      else if (entry && typeof entry.file === 'string') pushSlide(entry.file);
    }
  } else if (preset && typeof preset === 'object') {
    const files = Array.isArray(preset.files)
      ? preset.files
      : Object.entries(preset)
          .filter(([k]) => k !== 'customdirectory' && k !== 'wallpapermode' && k !== 'imageswitchtimes')
          .map(([, v]) => v);
    for (const entry of files) {
      if (typeof entry === 'string') pushSlide(entry);
      else if (entry && typeof entry.file === 'string') pushSlide(entry.file);
    }

    const customDirRaw = typeof preset.customdirectory === 'string' ? preset.customdirectory.trim() : '';
    if (customDirRaw && (Number(preset.wallpapermode) === 2 || slides.length === 0)) {
      const customDirAbs = customDirRaw === '.'
        ? realProjectRoot
        : resolveFencedPath(projectDir, customDirRaw);
      if (customDirAbs && isDirSafe(customDirAbs)) {
        walkSlidesDir(customDirAbs, 0);
      }
    }
  }

  slides.sort((a, b) => naturalCollator.compare(
    relative(realProjectRoot, a).split(sep).join('/'),
    relative(realProjectRoot, b).split(sep).join('/'),
  ));

  let slideIntervalMs = 30_000;
  const rawTier = Number(
    projectObj?.preset?.imageswitchtimes
    ?? projectObj?.imageswitchtimes
    ?? projectObj?.general?.properties?.imageswitchtimes?.value
    ?? 0,
  );
  if (IMAGE_SWITCH_TIERS_MS[rawTier]) {
    slideIntervalMs = IMAGE_SWITCH_TIERS_MS[rawTier];
  } else if (Number.isFinite(rawTier) && rawTier > 5) {
    slideIntervalMs = Math.min(86_400_000, Math.max(2000, Math.round(rawTier * 1000)));
  }

  return { slides, slideIntervalMs };
}

export function computeInventoryScopeKey({ steamRoot = undefined, uploadDir = '', customFolders = [] } = {}) {
  const explicitOverride = String(
    steamRoot
    ?? process.env.AGY_PRISM_STEAM_ROOT
    ?? process.env.DSH_WE_STEAM_ROOT
    ?? '',
  ).trim();
  const normFolders = Array.isArray(customFolders)
    ? customFolders.map((f) => resolve(String(f || '')).toLowerCase()).sort().join(';')
    : '';
  return `${explicitOverride || '__auto__'}|${uploadDir ? resolve(uploadDir).toLowerCase() : ''}|${normFolders}`;
}

function loadInventoryCache(cachePath) {
  if (!cachePath || !isFileSafe(cachePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    if ((parsed?.version !== 1 && parsed?.version !== INVENTORY_CACHE_VERSION) || typeof parsed.items !== 'object') {
      return {};
    }
    return parsed.items || {};
  } catch {
    return {};
  }
}

function saveInventoryCache(cachePath, itemsMap, extraPayload = {}) {
  if (!cachePath) return;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    const sigSource = Object.keys(itemsMap)
      .sort()
      .map((id) => `${id}:${itemsMap[id]?.fp || ''}`)
      .join('|');
    const sha1 = createHash('sha1').update(sigSource).digest('hex');
    const tmp = `${cachePath}.tmp${process.pid}.${Date.now()}`;
    writeFileSync(
      tmp,
      JSON.stringify({
        version: INVENTORY_CACHE_VERSION,
        sha1,
        signature: sha1,
        updatedAt: Date.now(),
        ...extraPayload,
        items: itemsMap,
      }),
      'utf8',
    );
    renameSync(tmp, cachePath);
  } catch { /* ignore cache write error */ }
}

/**
 * Load a warm library snapshot directly from `<cacheDir>/inventory-index.json` in `<5ms`
 * without walking Workshop directories on cold boot.
 */
export function loadWarmInventorySnapshot({
  cacheDir = '',
  config = {},
  uploadDir = '',
  steamRoot = undefined,
} = {}) {
  if (!cacheDir) return null;
  const cachePath = join(cacheDir, 'inventory-index.json');
  if (!isFileSafe(cachePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (parsed?.version !== INVENTORY_CACHE_VERSION) return null;
    const expectedScope = computeInventoryScopeKey({
      steamRoot,
      uploadDir,
      customFolders: config?.customFolders || [],
    });
    if (parsed.scopeKey !== expectedScope) return null;
    const snap = parsed.snapshot;
    if (!snap || !Array.isArray(snap.items) || snap.items.length === 0) return null;

    // Verify active wallpaper's primary path still exists on disk (`<0.1ms`)
    const activeId = String(config?.activeWallpaperId || config?.wallpaperId || '').trim();
    if (activeId && activeId !== 'builtin-prism-aurora') {
      const activeRaw = snap.items.find((it) => it && it.id === activeId);
      if (activeRaw?._fs?.primaryAbs && !existsSync(activeRaw._fs.primaryAbs)) {
        return null;
      }
      if (activeRaw?._fs?.projectDir && !existsSync(activeRaw._fs.projectDir)) {
        return null;
      }
    }

    return {
      items: snap.items,
      stats: snap.stats || {},
      discovery: snap.discovery || {},
      wePlaylists: Array.isArray(snap.wePlaylists) ? snap.wePlaylists : [],
      fromWarmCache: true,
    };
  } catch {
    return null;
  }
}

/** Parse a Wallpaper Engine project directory containing `project.json` into a raw library record. */
function inspectWeProjectDir({
  id,
  source,
  workshopId = '',
  projectDir,
  config,
  cacheMap,
  nextCacheMap,
  forceRefresh,
}) {
  const projectJsonPath = resolveFencedPath(projectDir, 'project.json');
  if (!projectJsonPath) return null;

  let projectObj;
  let projStat;
  try {
    projStat = statSync(projectJsonPath);
  } catch {
    return null;
  }

  const projStamp = `${projectDir}|${Math.trunc(projStat.mtimeMs)}|${projStat.size}|${config?.language || 'zh'}`;
  const cachedEntry = !forceRefresh ? cacheMap[id] : null;
  if (cachedEntry && cachedEntry.projStamp === projStamp && cachedEntry.rawItem) {
    const cachedRaw = cachedEntry.rawItem;
    const primaryOk = !cachedRaw._fs?.primaryAbs || existsSync(cachedRaw._fs.primaryAbs);
    if (primaryOk) {
      nextCacheMap[id] = cachedEntry;
      return cachedRaw;
    }
  }

  try {
    projectObj = parseLenientJson(readFileSync(projectJsonPath, 'utf8'));
  } catch {
    return null;
  }
  if (!projectObj || typeof projectObj !== 'object') return null;

  const rawType = String(projectObj.type || '').trim().toLowerCase();
  if (rawType === 'application' || rawType === 'wallpaper_application') {
    return null;
  }

  const rawFile = typeof projectObj.file === 'string' ? projectObj.file.trim() : '';
  const fencedFile = rawFile ? resolveFencedPath(projectDir, rawFile) : null;
  // Security: if `project.file` was specified and attempted path traversal (`../`), fail closed!
  if (rawFile && !fencedFile && (rawFile.includes('..') || /^[a-zA-Z]:/.test(rawFile) || rawFile.startsWith('/'))) {
    return null;
  }

  const previewAbs = (typeof projectObj.preview === 'string' && projectObj.preview.trim()
    ? resolveFencedPath(projectDir, projectObj.preview.trim())
    : null) || findFallbackPreview(projectDir);

  const { slides, slideIntervalMs } = collectPresetSlides(projectDir, projectObj);
  const ext = fencedFile ? extname(fencedFile).toLowerCase() : '';

  let kind = 'scene';
  if (slides.length > 1) {
    kind = 'slideshow';
  } else if (rawType === 'video' || VIDEO_EXTS.has(ext)) {
    kind = 'video';
  } else if (rawType === 'web' || WEB_EXTS.has(ext)) {
    kind = 'web';
  } else if (IMAGE_EXTS.has(ext) || slides.length === 1 || rawType === 'image' || rawType === 'preset') {
    if (slides.length === 1 || IMAGE_EXTS.has(ext)) {
      kind = 'image';
    }
  } else if (rawType === 'scene' || ext === '.pkg' || ext === '.json' || !rawType) {
    kind = 'scene';
  }

  let primaryAbs = fencedFile;
  if (kind === 'image' && !primaryAbs && slides.length === 1) {
    primaryAbs = slides[0];
  }
  if (kind === 'image' && !primaryAbs && previewAbs) {
    primaryAbs = previewAbs;
  }
  if (kind === 'video' && !primaryAbs) return null;
  if (kind === 'web' && !primaryAbs) {
    const fallbackHtml = resolveFencedPath(projectDir, 'index.html');
    if (!fallbackHtml) return null;
    primaryAbs = fallbackHtml;
  }

  let sceneContainerAbs = null;
  if (kind === 'scene') {
    const pkgCand = resolveFencedPath(projectDir, 'scene.pkg')
      || (fencedFile && fencedFile.toLowerCase().endsWith('.pkg') ? fencedFile : null);
    sceneContainerAbs = pkgCand || projectDir;
  }

  const primaryStat = primaryAbs ? safeStat(primaryAbs) : null;
  const sceneStat = sceneContainerAbs ? safeStat(sceneContainerAbs) : null;

  const fingerprint = sha1Short(
    [
      projectDir,
      projStat.mtimeMs,
      projStat.size,
      primaryStat?.mtimeMs || 0,
      primaryStat?.size || 0,
      sceneStat?.mtimeMs || 0,
      sceneStat?.size || 0,
      slides.length,
    ].join('|'),
    20,
  );

  let probe = !forceRefresh && cacheMap[id]?.fp === fingerprint ? cacheMap[id].probe : null;
  if (!probe) {
    let width = null;
    let height = null;
    let durationSec = null;
    let fps = null;
    let hasSceneVideo = false;
    let hasSceneAudio = false;
    let fileSize = primaryStat?.size || sceneStat?.size || 0;

    if (kind === 'video' && primaryAbs) {
      const mp4 = probeMp4Metadata(primaryAbs);
      if (mp4) {
        width = mp4.width;
        height = mp4.height;
        durationSec = mp4.durationSec;
        fps = mp4.fps;
        fileSize = mp4.fileSize || fileSize;
      }
    } else if (kind === 'image' && primaryAbs) {
      const dim = probeImageDimensions(primaryAbs);
      if (dim) {
        width = dim.width;
        height = dim.height;
      }
    } else if (kind === 'slideshow' && slides[0]) {
      const dim = probeImageDimensions(slides[0]);
      if (dim) {
        width = dim.width;
        height = dim.height;
      }
      fileSize = slides.reduce((acc, s) => acc + (safeStat(s)?.size || 0), 0);
    } else if (kind === 'scene' && sceneContainerAbs) {
      const sceneInfo = inspectSceneContainer(sceneContainerAbs);
      hasSceneVideo = Boolean(sceneInfo.hasVideo);
      hasSceneAudio = Boolean(sceneInfo.hasAudio);
      if (sceneInfo.videoSource?.width && sceneInfo.videoSource?.height) {
        width = sceneInfo.videoSource.width;
        height = sceneInfo.videoSource.height;
      } else if (previewAbs) {
        const dim = probeImageDimensions(previewAbs);
        if (dim) { width = dim.width; height = dim.height; }
      }
    }

    probe = { width, height, durationSec, fps, hasSceneVideo, hasSceneAudio, fileSize };
  }
  nextCacheMap[id] = { fp: fingerprint, probe };

  const rawScheme = projectObj?.general?.properties?.schemecolor?.value ?? projectObj?.schemecolor ?? '';
  const schemeColor = rawScheme
    ? (/^#[0-9a-f]{3,8}$/i.test(String(rawScheme).trim()) ? String(rawScheme).trim() : weColorToHex(String(rawScheme)))
    : '#669DF6';

  const userOverrides = config?.userProps?.[id] || {};
  const parsedProps = parseWeProjectProperties(projectObj, userOverrides, config?.language || 'zh');

  let sceneMode = null;
  if (kind === 'scene') {
    const failedLive = Array.isArray(config?.sceneLiveFailures) && config.sceneLiveFailures.includes(id);
    if (probe.hasSceneVideo) {
      sceneMode = 'video';
    } else if (config?.sceneLive !== false && !failedLive) {
      sceneMode = 'live';
    } else {
      sceneMode = 'preview';
    }
  }

  const looseAudioAbs = kind !== 'video' ? findFirstAudioInDir(projectDir) : null;
  const resolution = probe.width && probe.height ? `${probe.width}x${probe.height}` : '';

  const rawItem = {
    id,
    title: String(projectObj.title || basename(projectDir) || id).trim().slice(0, 200),
    description: typeof projectObj.description === 'string' ? projectObj.description.slice(0, 600) : '',
    kind,
    source,
    workshopId: String(workshopId || projectObj.workshopid || '').trim(),
    contentRating: normalizeContentRating(projectObj.contentrating),
    tags: normalizeTags(projectObj.tags),
    schemeColor,
    sceneMode,
    properties: parsedProps.list,
    wireProps: parsedProps.wire,
    fileSize: probe.fileSize || 0,
    width: probe.width || null,
    height: probe.height || null,
    resolution,
    durationSec: probe.durationSec || null,
    fps: probe.fps || null,
    slideCount: slides.length,
    slideIntervalMs: kind === 'slideshow' ? slideIntervalMs : 0,
    updatedAt: Math.round(projStat.mtimeMs || Date.now()),
    // Internal filesystem pointers consumed ONLY by media-server.mjs (stripped or kept safe)
    _fs: {
      projectDir: resolve(projectDir),
      primaryAbs: primaryAbs || null,
      previewAbs: previewAbs || (kind === 'image' ? primaryAbs : (slides[0] || null)),
      slidesAbs: slides,
      sceneContainerAbs,
      hasSceneVideo: Boolean(probe.hasSceneVideo),
      hasSceneAudio: Boolean(probe.hasSceneAudio),
      looseAudioAbs,
      webEntryRel: kind === 'web' && primaryAbs
        ? relative(resolve(projectDir), primaryAbs).split(sep).join('/')
        : '',
    },
  };
  nextCacheMap[id] = { fp: fingerprint, projStamp, probe, rawItem };
  return rawItem;
}

/** Inspect a standalone image or video file (from `uploadDir` or `customFolders`). */
function inspectStandaloneMediaFile({
  id,
  title,
  source,
  absPath,
  addedAt,
  cacheMap,
  nextCacheMap,
  forceRefresh,
}) {
  if (!isFileSafe(absPath)) return null;
  const ext = extname(absPath).toLowerCase();
  const isImg = IMAGE_EXTS.has(ext);
  const isVid = VIDEO_EXTS.has(ext);
  if (!isImg && !isVid) return null;

  const st = safeStat(absPath);
  if (!st) return null;
  const kind = isVid ? 'video' : 'image';
  const fp = sha1Short(`${absPath}|${st.mtimeMs}|${st.size}`, 20);

  let probe = !forceRefresh && cacheMap[id]?.fp === fp ? cacheMap[id].probe : null;
  if (!probe) {
    let width = null;
    let height = null;
    let durationSec = null;
    let fps = null;
    if (kind === 'video') {
      const mp4 = probeMp4Metadata(absPath);
      if (mp4) {
        width = mp4.width;
        height = mp4.height;
        durationSec = mp4.durationSec;
        fps = mp4.fps;
      }
    } else {
      const dim = probeImageDimensions(absPath);
      if (dim) {
        width = dim.width;
        height = dim.height;
      }
    }
    probe = { width, height, durationSec, fps, fileSize: st.size };
  }
  nextCacheMap[id] = { fp, probe };

  const cleanTitle = String(title || basename(absPath, ext) || id).trim().slice(0, 200);
  const resolution = probe.width && probe.height ? `${probe.width}x${probe.height}` : '';

  return {
    id,
    title: cleanTitle,
    description: '',
    kind,
    source,
    workshopId: '',
    contentRating: 'everyone',
    tags: [kind === 'video' ? 'Video' : 'Image'],
    schemeColor: '#669DF6',
    sceneMode: null,
    properties: [],
    wireProps: {},
    fileSize: probe.fileSize || st.size,
    width: probe.width || null,
    height: probe.height || null,
    resolution,
    durationSec: probe.durationSec || null,
    fps: probe.fps || null,
    slideCount: 0,
    slideIntervalMs: 0,
    updatedAt: Math.round(addedAt || st.mtimeMs || Date.now()),
    _fs: {
      projectDir: dirname(resolve(absPath)),
      primaryAbs: resolve(absPath),
      previewAbs: kind === 'image' ? resolve(absPath) : null,
      slidesAbs: [],
      sceneContainerAbs: null,
      hasSceneVideo: false,
      hasSceneAudio: false,
      looseAudioAbs: null,
      webEntryRel: '',
    },
  };
}

/** Built-in procedural Prism Aurora wallpaper item so empty libraries always render cleanly. */
export function createBuiltinAuroraItem() {
  return {
    id: 'builtin-prism-aurora',
    title: 'Prism Aurora · 棱镜极光',
    description: 'Obsidian Prism procedural ambient aurora stage (zero external assets required).',
    kind: 'scene',
    source: 'default',
    workshopId: '',
    contentRating: 'everyone',
    tags: ['Prism', 'Ambient', 'Aurora'],
    schemeColor: '#669DF6',
    sceneMode: 'live',
    properties: [],
    wireProps: {},
    fileSize: 0,
    width: 3840,
    height: 2160,
    resolution: '3840x2160',
    durationSec: null,
    fps: 30,
    slideCount: 0,
    slideIntervalMs: 0,
    updatedAt: 0,
    _fs: {
      isBuiltinAurora: true,
      projectDir: null,
      primaryAbs: null,
      previewAbs: null,
      slidesAbs: [],
      sceneContainerAbs: null,
      hasSceneVideo: false,
      hasSceneAudio: false,
      looseAudioAbs: null,
      webEntryRel: '',
    },
  };
}

async function processTasksInChunks(tasks, chunkSize = SCAN_CHUNK_SIZE) {
  const results = [];
  for (let i = 0; i < tasks.length; i += chunkSize) {
    const slice = tasks.slice(i, i + chunkSize);
    for (const taskFn of slice) {
      try {
        const item = taskFn();
        if (item) results.push(item);
      } catch { /* skip broken item */ }
    }
    if (i + chunkSize < tasks.length) {
      await new Promise((r) => setImmediate(r));
    }
  }
  return results;
}

/**
 * Scan all configured wallpaper sources (`workshop`, `default`, `upload`, `local`)
 * and return `{ items, stats, discovery, wePlaylists }`.
 */
export async function scanWallpaperLibrary({
  config = {},
  uploadDir = '',
  cacheDir = '',
  uploadMetaItems = [],
  steamRoot = undefined,
  includeDefaultPictures = true,
  refresh = false,
} = {}) {
  const startedAt = Date.now();
  const discovery = await discoverSteamWeEnvironment({ steamRoot, cacheDir, refresh });
  const cachePath = cacheDir ? join(cacheDir, 'inventory-index.json') : '';
  const cacheMap = refresh ? {} : loadInventoryCache(cachePath);
  const nextCacheMap = {};

  const tasks = [];
  const seenIds = new Set();

  // 1. Uploads (`uploadMetaItems` + extracted WE project dirs inside `uploadDir`)
  const trackedUploadPaths = new Set();
  if (Array.isArray(uploadMetaItems)) {
    for (const meta of uploadMetaItems) {
      if (!meta || !meta.id || !meta.absPath) continue;
      if (seenIds.has(meta.id)) continue;
      seenIds.add(meta.id);
      trackedUploadPaths.add(resolve(meta.absPath).toLowerCase());
      tasks.push(() => inspectStandaloneMediaFile({
        id: meta.id,
        title: meta.title || meta.originalName || basename(meta.absPath),
        source: 'upload',
        absPath: meta.absPath,
        addedAt: meta.createdAt,
        cacheMap,
        nextCacheMap,
        forceRefresh: refresh,
      }));
    }
  }

  if (uploadDir && isDirSafe(uploadDir)) {
    try {
      for (const name of readdirSync(uploadDir)) {
        if (name.startsWith('.') || name.includes('.tmp')) continue;
        const full = join(uploadDir, name);
        const lst = safeLstat(full);
        if (!lst || lst.isSymbolicLink()) continue;
        if (lst.isDirectory() && isFileSafe(join(full, 'project.json'))) {
          const id = `up-dir-${sha1Short(name, 10)}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          tasks.push(() => inspectWeProjectDir({
            id,
            source: 'upload',
            projectDir: full,
            config,
            cacheMap,
            nextCacheMap,
            forceRefresh: refresh,
          }));
        } else if (lst.isFile() && !trackedUploadPaths.has(resolve(full).toLowerCase())) {
          const ext = extname(name).toLowerCase();
          if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
            const id = `up-${sha1Short(name, 12)}`;
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            tasks.push(() => inspectStandaloneMediaFile({
              id,
              title: basename(name, ext),
              source: 'upload',
              absPath: full,
              cacheMap,
              nextCacheMap,
              forceRefresh: refresh,
            }));
          }
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Steam Workshop `431960`
  for (const wsRoot of discovery.workshopDirs) {
    let subdirs = [];
    try { subdirs = readdirSync(wsRoot); } catch { continue; }
    for (const sub of subdirs) {
      if (discovery.hiddenWorkshopIds.has(sub)) continue;
      const projDir = join(wsRoot, sub);
      const lst = safeLstat(projDir);
      if (!lst || !lst.isDirectory() || lst.isSymbolicLink()) continue;
      if (!isFileSafe(join(projDir, 'project.json'))) continue;
      const id = `ws-${sub}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      tasks.push(() => inspectWeProjectDir({
        id,
        source: 'workshop',
        workshopId: sub,
        projectDir: projDir,
        config,
        cacheMap,
        nextCacheMap,
        forceRefresh: refresh,
      }));
    }
  }

  // 3. Wallpaper Engine `myprojects` & `defaultprojects`
  for (const myRoot of discovery.myProjectsDirs) {
    let subdirs = [];
    try { subdirs = readdirSync(myRoot); } catch { continue; }
    for (const sub of subdirs) {
      const projDir = join(myRoot, sub);
      const lst = safeLstat(projDir);
      if (!lst || !lst.isDirectory() || lst.isSymbolicLink()) continue;
      if (!isFileSafe(join(projDir, 'project.json'))) continue;
      const id = `my-${sub.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}-${sha1Short(projDir, 6)}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      tasks.push(() => inspectWeProjectDir({
        id,
        source: 'default',
        projectDir: projDir,
        config,
        cacheMap,
        nextCacheMap,
        forceRefresh: refresh,
      }));
    }
  }

  for (const defRoot of discovery.defaultProjectsDirs) {
    let subdirs = [];
    try { subdirs = readdirSync(defRoot); } catch { continue; }
    for (const sub of subdirs) {
      const projDir = join(defRoot, sub);
      const lst = safeLstat(projDir);
      if (!lst || !lst.isDirectory() || lst.isSymbolicLink()) continue;
      if (!isFileSafe(join(projDir, 'project.json'))) continue;
      const id = `def-${sub.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      tasks.push(() => inspectWeProjectDir({
        id,
        source: 'default',
        projectDir: projDir,
        config,
        cacheMap,
        nextCacheMap,
        forceRefresh: refresh,
      }));
    }
  }

  // 4. Local Custom Folders (+ optional `%USERPROFILE%/Pictures/agy-wallpapers`)
  const localFolders = [];
  const seenFolders = new Set();
  const addLocalFolder = (dir) => {
    if (!dir || !isDirSafe(dir)) return;
    const abs = resolve(dir);
    const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
    if (seenFolders.has(key)) return;
    seenFolders.add(key);
    localFolders.push(abs);
  };

  if (includeDefaultPictures && !steamRoot && !process.env.AGY_PRISM_STEAM_ROOT) {
    addLocalFolder(join(homedir(), 'Pictures', 'agy-wallpapers'));
  }
  if (Array.isArray(config.customFolders)) {
    for (const f of config.customFolders) addLocalFolder(f);
  }

  for (const folder of localFolders) {
    if (isFileSafe(join(folder, 'project.json'))) {
      const id = `loc-${sha1Short(folder, 12)}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        tasks.push(() => inspectWeProjectDir({
          id,
          source: 'local',
          projectDir: folder,
          config,
          cacheMap,
          nextCacheMap,
          forceRefresh: refresh,
        }));
      }
      continue;
    }

    let names = [];
    try { names = readdirSync(folder); } catch { continue; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const full = join(folder, name);
      const lst = safeLstat(full);
      if (!lst || lst.isSymbolicLink()) continue;
      if (lst.isDirectory() && isFileSafe(join(full, 'project.json'))) {
        const id = `loc-${sha1Short(full, 12)}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        tasks.push(() => inspectWeProjectDir({
          id,
          source: 'local',
          projectDir: full,
          config,
          cacheMap,
          nextCacheMap,
          forceRefresh: refresh,
        }));
      } else if (lst.isFile()) {
        const ext = extname(name).toLowerCase();
        if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
          const id = `loc-${sha1Short(full, 12)}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          tasks.push(() => inspectStandaloneMediaFile({
            id,
            title: basename(name, ext),
            source: 'local',
            absPath: full,
            cacheMap,
            nextCacheMap,
            forceRefresh: refresh,
          }));
        }
      }
    }
  }

  const scannedItems = await processTasksInChunks(tasks);

  // Sort: Uploads newest first -> Workshop newest first -> Local -> Default -> Builtin Aurora
  const sourceRank = { upload: 0, workshop: 1, local: 2, default: 3 };
  scannedItems.sort((a, b) => {
    const ra = sourceRank[a.source] ?? 9;
    const rb = sourceRank[b.source] ?? 9;
    if (ra !== rb) return ra - rb;
    if ((b.updatedAt || 0) !== (a.updatedAt || 0)) return (b.updatedAt || 0) - (a.updatedAt || 0);
    return naturalCollator.compare(a.title, b.title);
  });

  if (!seenIds.has('builtin-prism-aurora')) {
    scannedItems.push(createBuiltinAuroraItem());
  }

  const byKind = { image: 0, video: 0, slideshow: 0, web: 0, scene: 0 };
  const bySource = { workshop: 0, default: 0, upload: 0, local: 0 };
  for (const item of scannedItems) {
    if (item.kind in byKind) byKind[item.kind] += 1;
    if (item.source in bySource) bySource[item.source] += 1;
  }

  const wePlaylists = discovery.weInstallDir ? readWePlaylists(discovery.weInstallDir) : [];
  const discoverySummary = {
    steamFound: discovery.steamRoots.length > 0,
    weInstalled: Boolean(discovery.weInstallDir),
    weInstallDir: discovery.weInstallDir || '',
    steamRootsCount: discovery.steamRoots.length,
    workshopDirsCount: discovery.workshopDirs.length,
    hiddenWorkshopCount: discovery.hiddenWorkshopIds.size,
  };
  const statsSummary = {
    total: scannedItems.length,
    byKind,
    bySource,
    scanDurationMs: Date.now() - startedAt,
    scannedAt: Date.now(),
    steamFound: discovery.steamRoots.length > 0,
    weInstalled: Boolean(discovery.weInstallDir),
    weInstallDir: discovery.weInstallDir || '',
  };

  if (cachePath) {
    saveInventoryCache(cachePath, nextCacheMap, {
      scopeKey: computeInventoryScopeKey({
        steamRoot,
        uploadDir,
        customFolders: config.customFolders || [],
      }),
      snapshot: {
        items: scannedItems,
        stats: statsSummary,
        discovery: discoverySummary,
        wePlaylists,
      },
    });
  }

  return {
    items: scannedItems,
    wePlaylists,
    discovery: discoverySummary,
    stats: statsSummary,
  };
}

/**
 * Optional Windows Desktop Wallpaper Engine CLI Synchronizer (`wallpaper64.exe` / `wallpaper32.exe`).
 * Non-blocking detached spawn with `cleanHostEnv` so Electron env vars never leak.
 */
export function syncDesktopWallpaper(weInstallDir, command, projectJsonPath = '') {
  if (process.platform !== 'win32' || !weInstallDir) return false;
  const bin64 = join(weInstallDir, 'wallpaper64.exe');
  const bin32 = join(weInstallDir, 'wallpaper32.exe');
  const exe = isFileSafe(bin64) ? bin64 : isFileSafe(bin32) ? bin32 : '';
  if (!exe) return false;

  const args = ['-control', command];
  if (command === 'openWallpaper' && projectJsonPath && isFileSafe(projectJsonPath)) {
    args.push('-file', resolve(projectJsonPath));
  }
  try {
    const child = spawn(exe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: cleanHostEnv(),
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
