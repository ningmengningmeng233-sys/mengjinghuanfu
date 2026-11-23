/**
 * Wallpaper Engine `scene.pkg` / `.tex` Binary Reader + WE `project.json` Properties Parser (`pkg-scene.mjs`)
 *
 * Ports `dsh-plugin-wallpaper-engine`:
 *   - `lib/pkg-read.js`: Bounds-checked `PKGV` container parser + official pure-JS `LZ4` block-chain
 *     decompressor (`MAX_DECOMPRESSED_BYTES = 256 MiB`, `MAX_PKG_ENTRY_BYTES = 512 MiB`).
 *   - `lib/scene-manifest.js` + `lib/media/scene-probe.js`: `TEXV0005` / `TEXI0001` / `TEXB0001..0004`
 *     texture container parser that locates and extracts author-embedded `MP4` video streams
 *     (`TEXB0004` with MP4 magic `ftyp` or video flag) and packaged BGM audio (`.mp3/.ogg/.wav/.flac/.m4a`),
 *     while filtering out mask/lut/flow/ripple helper textures and fencing symlinks/paths.
 *   - `lib/we-props.js` + `src/we-cond.js`: Parses `project.json` `general.properties` (float `order`
 *     sorting, mixed-type `combo` options, HTML stripping, `zh-chs -> zh-cht -> en-us` per-key
 *     localization) and evaluates Wallpaper Engine visibility `condition` expressions.
 */

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
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

export const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
export const MAX_PKG_ENTRY_BYTES = 512 * 1024 * 1024;
export const PKG_ENTRY_FLAG_LZ4 = 1;

const utf8Decoder = new TextDecoder('utf-8');

class BinaryReader {
  constructor(bytes, label = 'pkg') {
    this.data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.label = label;
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    this.pos = 0;
  }

  get remaining() {
    return this.view.byteLength - this.pos;
  }

  need(n) {
    if (n < 0 || this.pos + n > this.view.byteLength) {
      throw new Error(`${this.label}: unexpected end of data`);
    }
  }

  u8() {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  i32() {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u64() {
    const lo = this.u32();
    const hi = this.u32();
    return hi * 0x100000000 + lo;
  }

  bytes(n) {
    this.need(n);
    const sub = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return sub;
  }

  sizedString(maxLen = 4096) {
    const len = this.i32();
    if (len < 0 || len > maxLen) {
      throw new Error(`${this.label}: invalid string length ${len}`);
    }
    return utf8Decoder.decode(this.bytes(len));
  }

  nstring(maxLen = 65536) {
    const start = this.pos;
    const limit = Math.min(this.view.byteLength, start + maxLen);
    let end = start;
    while (end < limit && this.view.getUint8(end) !== 0) end += 1;
    if (end >= limit) throw new Error(`${this.label}: unterminated string`);
    const out = utf8Decoder.decode(this.data.subarray(start, end));
    this.pos = end + 1;
    return out;
  }
}

/**
 * Decompress a single raw LZ4 block (used in PKGV LZ4 block chains and TEXB mipmaps).
 */
export function lz4DecompressBlock(srcInput, dstSize) {
  const src = srcInput instanceof Uint8Array ? srcInput : new Uint8Array(srcInput);
  if (!Number.isInteger(dstSize) || dstSize < 0 || dstSize > MAX_DECOMPRESSED_BYTES) {
    throw new Error(`lz4: decompressed size out of bounds (${dstSize})`);
  }
  if (dstSize === 0) return new Uint8Array(0);

  const dst = new Uint8Array(dstSize);
  let ip = 0;
  let op = 0;

  while (ip < src.length) {
    const token = src[ip++];
    let literalLen = token >>> 4;
    if (literalLen === 15) {
      let s;
      do {
        if (ip >= src.length) throw new Error('lz4: truncated literal length');
        s = src[ip++];
        literalLen += s;
      } while (s === 255);
    }
    if (ip + literalLen > src.length || op + literalLen > dstSize) {
      throw new Error('lz4: literal run out of bounds');
    }
    dst.set(src.subarray(ip, ip + literalLen), op);
    ip += literalLen;
    op += literalLen;

    if (ip >= src.length) break;

    if (ip + 2 > src.length) throw new Error('lz4: truncated match offset');
    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    if (offset === 0 || offset > op) {
      throw new Error(`lz4: invalid match offset ${offset}`);
    }

    let matchLen = token & 0x0f;
    if (matchLen === 15) {
      let s;
      do {
        if (ip >= src.length) throw new Error('lz4: truncated match length');
        s = src[ip++];
        matchLen += s;
      } while (s === 255);
    }
    matchLen += 4;
    if (op + matchLen > dstSize) {
      throw new Error('lz4: match run out of bounds');
    }
    for (let i = 0; i < matchLen; i += 1) {
      dst[op] = dst[op - offset];
      op += 1;
    }
  }

  if (op !== dstSize) {
    throw new Error(`lz4: decoded ${op} bytes, expected ${dstSize}`);
  }
  return dst;
}

/**
 * Probe whether a PKG entry payload is an LZ4 block-chain (`[u64 origSize]` followed by
 * `[i32 decompSize][i32 compSize][compBytes]...` summing exactly to `origSize` and `entryLen`).
 */
export function probeLz4Chain(entryBytes) {
  if (entryBytes.byteLength < 16) return null;
  const r = new BinaryReader(entryBytes, 'pkg-lz4');
  const totalOrig = r.u64();
  if (totalOrig <= 0 || totalOrig > MAX_DECOMPRESSED_BYTES) return null;

  let sumOrig = 0;
  let blocks = 0;
  while (r.remaining > 0) {
    if (r.remaining < 8) return null;
    const decLen = r.i32();
    const cmpLen = r.i32();
    if (decLen <= 0 || decLen > MAX_DECOMPRESSED_BYTES || cmpLen <= 0 || cmpLen > r.remaining) {
      return null;
    }
    r.pos += cmpLen;
    sumOrig += decLen;
    blocks += 1;
    if (sumOrig > totalOrig) return null;
  }
  if (blocks === 0 || sumOrig !== totalOrig) return null;
  return { originalSize: totalOrig, blocks };
}

function decompressLz4Chain(entryBytes) {
  const r = new BinaryReader(entryBytes, 'pkg-lz4');
  const totalOrig = r.u64();
  if (totalOrig < 0 || totalOrig > MAX_DECOMPRESSED_BYTES) {
    throw new Error(`pkg: lz4 total size out of bounds (${totalOrig})`);
  }
  const out = new Uint8Array(totalOrig);
  let outPos = 0;
  while (r.remaining > 0) {
    const decLen = r.i32();
    const cmpLen = r.i32();
    if (decLen <= 0 || outPos + decLen > totalOrig || cmpLen <= 0 || cmpLen > r.remaining) {
      throw new Error('pkg: corrupted lz4 block chain');
    }
    const rawSlice = r.bytes(cmpLen);
    if (cmpLen === decLen) {
      out.set(rawSlice, outPos);
    } else {
      const block = lz4DecompressBlock(rawSlice, decLen);
      out.set(block, outPos);
    }
    outPos += decLen;
  }
  if (outPos !== totalOrig) throw new Error('pkg: incomplete lz4 chain');
  return out;
}

/**
 * Parse a `PKGVxxxx` package buffer and return normalized directory entries.
 */
export function parsePkg(pkgInput) {
  const pkgData = pkgInput instanceof Uint8Array ? pkgInput : new Uint8Array(pkgInput);
  const r = new BinaryReader(pkgData, 'pkg');
  const magic = r.sizedString(32);
  if (!magic.startsWith('PKGV')) {
    throw new Error(`pkg: unsupported magic "${magic}"`);
  }
  const count = r.i32();
  if (count < 0 || count > 200000) {
    throw new Error(`pkg: unreasonable entry count ${count}`);
  }
  const rawEntries = [];
  for (let i = 0; i < count; i += 1) {
    const path = r.sizedString(2048).replace(/\\/g, '/').replace(/^\/+/, '');
    const offset = r.u32();
    const length = r.u32();
    if (length > MAX_PKG_ENTRY_BYTES) {
      throw new Error(`pkg: entry "${path}" exceeds max bytes (${length})`);
    }
    rawEntries.push({ path, relOffset: offset, length });
  }
  const dataBase = r.pos;
  return rawEntries.map((e) => {
    const absOffset = dataBase + e.relOffset;
    if (absOffset < dataBase || absOffset + e.length > pkgData.byteLength) {
      throw new Error(`pkg: entry "${e.path}" out of package bounds`);
    }
    const slice = pkgData.subarray(absOffset, absOffset + e.length);
    const lz4 = probeLz4Chain(slice);
    return {
      path: e.path,
      offset: absOffset,
      length: e.length,
      flags: lz4 ? PKG_ENTRY_FLAG_LZ4 : 0,
      originalSize: lz4 ? lz4.originalSize : e.length,
    };
  });
}

/**
 * Parse only the header directory of a `.pkg` file on disk using progressive head reads (64KB -> 1MB -> 8MB -> full).
 */
export function parsePkgFile(absPkgPath) {
  const st = statSync(absPkgPath);
  if (!st.isFile() || st.size < 12) throw new Error('pkg: invalid file');
  const fd = openSync(absPkgPath, 'r');
  try {
    const steps = [64 * 1024, 1024 * 1024, 8 * 1024 * 1024, Math.min(st.size, 64 * 1024 * 1024)];
    for (const cap of steps) {
      const readLen = Math.min(st.size, cap);
      const buf = Buffer.allocUnsafe(readLen);
      const n = readSync(fd, buf, 0, readLen, 0);
      try {
        const r = new BinaryReader(buf.subarray(0, n), 'pkg-head');
        const magic = r.sizedString(32);
        if (!magic.startsWith('PKGV')) throw new Error(`bad magic ${magic}`);
        const count = r.i32();
        if (count < 0 || count > 200000) throw new Error('bad count');
        const raw = [];
        for (let i = 0; i < count; i += 1) {
          const path = r.sizedString(2048).replace(/\\/g, '/').replace(/^\/+/, '');
          const relOffset = r.u32();
          const length = r.u32();
          if (length > MAX_PKG_ENTRY_BYTES) throw new Error('entry too large');
          raw.push({ path, relOffset, length });
        }
        const dataBase = r.pos;
        return raw.map((e) => {
          const offset = dataBase + e.relOffset;
          if (offset + e.length > st.size) throw new Error('entry past EOF');
          return { path: e.path, offset, length: e.length };
        });
      } catch (err) {
        if (readLen >= st.size || !String(err.message).includes('unexpected end')) {
          if (readLen >= st.size) throw err;
        }
      }
    }
    throw new Error('pkg: header index exceeds 64 MiB');
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

/** Read and automatically decompress (if LZ4-chained) a PKG entry from memory. */
export function readPkgEntry(pkgInput, entry) {
  const pkgData = pkgInput instanceof Uint8Array ? pkgInput : new Uint8Array(pkgInput);
  if (entry.offset < 0 || entry.offset + entry.length > pkgData.byteLength) {
    throw new Error(`pkg: entry "${entry.path}" slice out of bounds`);
  }
  const raw = pkgData.subarray(entry.offset, entry.offset + entry.length);
  if ((entry.flags & PKG_ENTRY_FLAG_LZ4) || probeLz4Chain(raw)) {
    return decompressLz4Chain(raw);
  }
  return raw;
}

/** Read and automatically decompress a PKG entry from an open file path. */
export function readPkgFileEntry(absPkgPath, entry) {
  if (entry.length > MAX_PKG_ENTRY_BYTES) throw new Error('pkg: entry too large');
  const fd = openSync(absPkgPath, 'r');
  try {
    const buf = Buffer.allocUnsafe(entry.length);
    const n = readSync(fd, buf, 0, entry.length, entry.offset);
    if (n !== entry.length) throw new Error('pkg: short entry read');
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    if (probeLz4Chain(u8)) return Buffer.from(decompressLz4Chain(u8));
    return buf;
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

function isLikelyMaskOrHelper(texPath) {
  const lower = String(texPath || '').toLowerCase();
  const skipTokens = [
    '/masks/', '_mask', 'mask', 'flow', 'wave', 'noise', 'lut', 'distort', 'warp',
    'vortex', 'glow', 'neon', 'strip', 'bulb', 'led', 'combined', 'isometric',
    'lens', 'flare', 'prism', 'diffract', 'black', 'overlay', 'waterripple',
    'waterflow', 'phase', 'normal', 'foliagesway', 'cursorripple', 'particle',
  ];
  return skipTokens.some((tok) => lower.includes(tok));
}

function findMp4MagicOffset(bytes) {
  // Look for ISO BMFF `[size(4)]['ftyp']` within the first 64 bytes of payload or anywhere after TEX headers
  const limit = Math.min(bytes.length - 8, 4096);
  for (let i = 0; i <= limit; i += 1) {
    if (
      bytes[i + 4] === 0x66 && // 'f'
      bytes[i + 5] === 0x74 && // 't'
      bytes[i + 6] === 0x79 && // 'y'
      bytes[i + 7] === 0x70    // 'p'
    ) {
      const boxLen = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      if (boxLen >= 8 && boxLen <= 128) return i;
    }
  }
  return -1;
}

/**
 * Parse a Wallpaper Engine `.tex` binary (`TEXV0005` + `TEXI0001` + `TEXB0001..0004`)
 * and extract an embedded MP4 payload if present.
 */
export function extractMp4FromTexBytes(texInput) {
  const bytes = texInput instanceof Uint8Array ? texInput : new Uint8Array(texInput);
  if (bytes.byteLength < 32) return null;

  try {
    const r = new BinaryReader(bytes, 'tex');
    const texv = r.nstring(16);
    if (!texv.startsWith('TEXV')) return null;
    const texi = r.nstring(16);
    if (!texi.startsWith('TEXI')) return null;

    /* const format = */ r.i32();
    const flags = r.i32();
    const texWidth = r.i32();
    const texHeight = r.i32();
    /* const imgWidth = */ r.i32();
    /* const imgHeight = */ r.i32();
    /* const unk = */ r.u32();

    const texb = r.nstring(16);
    if (!texb.startsWith('TEXB')) return null;
    const containerVer = Number(texb.slice(4)) || 1;

    /* const imageCount = */ r.i32();
    let freeImageFormat = -1;
    let isVideoMp4 = false;
    if (containerVer >= 3) {
      freeImageFormat = r.i32();
    }
    if (containerVer >= 4) {
      isVideoMp4 = r.i32() === 1;
      if (freeImageFormat === -1 && isVideoMp4) {
        // Video MP4 container inside TEXB0004
      }
    }

    const mipCount = r.i32();
    if (mipCount <= 0 || mipCount > 64) return null;

    // Read mipmap 0 header
    const mipW = r.i32();
    const mipH = r.i32();
    let lz4Flag = 0;
    let decompressedSize = 0;
    if (containerVer >= 2) {
      lz4Flag = r.i32();
      decompressedSize = r.i32();
    }
    const byteCount = r.i32();
    if (byteCount <= 0 || byteCount > r.remaining || byteCount > MAX_PKG_ENTRY_BYTES) {
      return null;
    }
    let payload = r.bytes(byteCount);
    if (lz4Flag === 1 && decompressedSize > 0) {
      payload = lz4DecompressBlock(payload, decompressedSize);
    }

    const mp4Start = findMp4MagicOffset(payload);
    if (mp4Start >= 0 && (isVideoMp4 || (flags & 0x20) !== 0 || mp4Start === 0)) {
      return {
        bytes: Buffer.from(payload.subarray(mp4Start)),
        width: mipW || texWidth || 0,
        height: mipH || texHeight || 0,
      };
    }
  } catch {
    // Fallback scan if custom TEX header variant still holds a raw non-compressed ftyp/moov/mdat MP4
  }

  // Fallback check on raw uncompressed TEXB0004 header area
  const headStr = Buffer.from(bytes.subarray(0, Math.min(128, bytes.length))).toString('latin1');
  if (headStr.includes('TEXV') && headStr.includes('TEXB0004')) {
    const off = findMp4MagicOffset(bytes);
    if (off >= 0 && bytes.length - off >= 64) {
      return { bytes: Buffer.from(bytes.subarray(off)), width: 0, height: 0 };
    }
  }
  return null;
}

const AUDIO_EXT_RE = /\.(mp3|ogg|oga|wav|m4a|flac|aac)$/i;

/**
 * Fast header-only probe of `.tex` prefix bytes (`<= 256` bytes) so directory scanning skips
 * multi-megabyte `TEXB0001..0003` static RGBA/DXT textures in `0.02ms` without LZ4 decompression.
 */
function probeTexHeaderFast(headInput) {
  const bytes = headInput instanceof Uint8Array ? headInput : new Uint8Array(headInput);
  if (bytes.byteLength < 48) return { status: 'not-video' };
  try {
    const r = new BinaryReader(bytes, 'tex-head');
    const texv = r.nstring(16);
    if (!texv.startsWith('TEXV')) return { status: 'not-video' };
    const texi = r.nstring(16);
    if (!texi.startsWith('TEXI')) return { status: 'not-video' };
    r.i32(); // format
    r.i32(); // flags
    const texWidth = r.i32();
    const texHeight = r.i32();
    r.i32(); // imgWidth
    r.i32(); // imgHeight
    r.u32(); // unk
    const texb = r.nstring(16);
    if (!texb.startsWith('TEXB')) return { status: 'not-video' };
    const containerVer = Number(texb.slice(4)) || 1;
    if (containerVer < 4) return { status: 'not-video' };
    r.i32(); // imageCount
    r.i32(); // freeImageFormat
    const isVideoMp4 = r.i32() === 1;
    const mipCount = r.i32();
    let mipW = 0;
    let mipH = 0;
    if (mipCount > 0 && r.remaining >= 8) {
      mipW = r.i32();
      mipH = r.i32();
    }
    if (isVideoMp4) {
      return { status: 'video', width: mipW || texWidth || 0, height: mipH || texHeight || 0 };
    }
    return { status: 'maybe-video' };
  } catch {
    return { status: 'maybe-video' };
  }
}

function readPkgEntryHeaderPrefix(absPkgPath, entry, maxBytes = 256) {
  const fd = openSync(absPkgPath, 'r');
  try {
    const probeLen = Math.min(entry.length, Math.max(maxBytes, 512));
    const buf = Buffer.allocUnsafe(probeLen);
    const n = readSync(fd, buf, 0, probeLen, entry.offset);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, n);
    if (!probeLz4Chain(u8)) return u8.subarray(0, Math.min(n, maxBytes));
    // If PKGV entry itself is LZ4-chained, read first block if small enough
    if (n >= 16) {
      const decLen = buf.readInt32LE(8);
      const cmpLen = buf.readInt32LE(12);
      if (decLen > 0 && decLen <= 1024 * 1024 && cmpLen > 0 && 16 + cmpLen <= entry.length) {
        const blockBuf = Buffer.allocUnsafe(cmpLen);
        const bn = readSync(fd, blockBuf, 0, cmpLen, entry.offset + 16);
        if (bn === cmpLen) {
          return cmpLen === decLen ? blockBuf : lz4DecompressBlock(blockBuf, decLen);
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

function computeSceneContainerHash(fileOrDirAbs) {
  try {
    const abs = resolve(fileOrDirAbs);
    const st = statSync(abs);
    let extra = '';
    if (st.isDirectory()) {
      const names = readdirSync(abs).slice(0, 32).join(',');
      extra = names;
    }
    return createHash('sha1')
      .update(`${abs}|${st.size}|${Math.trunc(st.mtimeMs)}|${extra}`)
      .digest('hex')
      .slice(0, 20);
  } catch {
    return '';
  }
}

function persistBufferAtomically(targetPath, bytes) {
  const dir = resolve(targetPath, '..');
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.tmp${process.pid}.${Date.now()}`;
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    writeFileSync(tmpPath, buf);
    renameSync(tmpPath, targetPath);
    return true;
  } catch {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
    return existsSync(targetPath);
  }
}

/**
 * Inspect a packed `scene.pkg` file OR a loose scene project directory:
 * - Locates the highest-scoring embedded MP4 animation (`TEXB0004` or packaged `.mp4`)
 * - Locates packaged BGM audio (`.mp3/.ogg/.wav/...`)
 */
export function inspectSceneContainer(fileOrDirAbs) {
  let st;
  try {
    st = lstatSync(fileOrDirAbs);
    if (st.isSymbolicLink()) return { hasVideo: false, hasAudio: false, entriesCount: 0 };
  } catch {
    return { hasVideo: false, hasAudio: false, entriesCount: 0 };
  }

  if (st.isFile() && fileOrDirAbs.toLowerCase().endsWith('.pkg')) {
    try {
      const entries = parsePkgFile(fileOrDirAbs);
      const texCandidates = entries
        .filter((e) => e.path.toLowerCase().endsWith('.tex') && !isLikelyMaskOrHelper(e.path) && e.length >= 256)
        .sort((a, b) => b.length - a.length);
      const directMp4 = entries
        .filter((e) => e.path.toLowerCase().endsWith('.mp4') && !isLikelyMaskOrHelper(e.path))
        .sort((a, b) => b.length - a.length)[0] || null;
      const audioEntry = entries
        .filter((e) => AUDIO_EXT_RE.test(e.path))
        .sort((a, b) => b.length - a.length)[0] || null;

      let videoSource = directMp4 ? { kind: 'pkg-mp4', entry: directMp4 } : null;
      if (!videoSource) {
        for (const cand of texCandidates.slice(0, 12)) {
          try {
            const headPrefix = readPkgEntryHeaderPrefix(fileOrDirAbs, cand, 256);
            if (headPrefix) {
              const fast = probeTexHeaderFast(headPrefix);
              if (fast.status === 'not-video') continue;
              if (fast.status === 'video') {
                videoSource = { kind: 'pkg-tex-mp4', entry: cand, width: fast.width, height: fast.height };
                break;
              }
            }
            const raw = readPkgFileEntry(fileOrDirAbs, cand);
            const hit = extractMp4FromTexBytes(raw);
            if (hit && hit.bytes.length >= 64) {
              videoSource = { kind: 'pkg-tex-mp4', entry: cand, width: hit.width, height: hit.height };
              break;
            }
          } catch { /* skip unreadable tex */ }
        }
      }

      return {
        containerKind: 'pkg',
        entriesCount: entries.length,
        hasVideo: Boolean(videoSource),
        videoSource,
        hasAudio: Boolean(audioEntry),
        audioEntry,
      };
    } catch {
      return { containerKind: 'pkg', entriesCount: 0, hasVideo: false, hasAudio: false };
    }
  }

  // Loose scene directory (e.g. `scene.json` + `materials/*.tex` + `sounds/*.mp3`)
  const rootDir = st.isDirectory() ? resolve(fileOrDirAbs) : resolve(fileOrDirAbs, '..');
  let realRoot = rootDir;
  try { realRoot = realpathSync(rootDir); } catch { /* ignore */ }

  const texFiles = [];
  const mp4Files = [];
  const audioFiles = [];

  function walkLoose(dir, depth) {
    if (depth > 4) return;
    let names;
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      const full = join(dir, name);
      let lst;
      try {
        lst = lstatSync(full);
        if (lst.isSymbolicLink()) continue;
        const real = realpathSync(full);
        if (real !== realRoot && !real.startsWith(realRoot + sep)) continue;
      } catch {
        continue;
      }
      if (lst.isDirectory()) {
        walkLoose(full, depth + 1);
      } else if (lst.isFile()) {
        const lower = name.toLowerCase();
        if (lower.endsWith('.tex') && !isLikelyMaskOrHelper(full) && lst.size >= 256) {
          texFiles.push({ full, size: lst.size });
        } else if (lower.endsWith('.mp4') && !isLikelyMaskOrHelper(full)) {
          mp4Files.push({ full, size: lst.size });
        } else if (AUDIO_EXT_RE.test(lower)) {
          audioFiles.push({ full, size: lst.size });
        }
      }
    }
  }
  walkLoose(rootDir, 0);

  mp4Files.sort((a, b) => b.size - a.size);
  texFiles.sort((a, b) => b.size - a.size);
  audioFiles.sort((a, b) => b.size - a.size);

  let videoSource = mp4Files[0] ? { kind: 'loose-mp4', absPath: mp4Files[0].full } : null;
  if (!videoSource) {
    for (const cand of texFiles.slice(0, 12)) {
      try {
        const fd = openSync(cand.full, 'r');
        let headBuf;
        try {
          const cap = Math.min(cand.size, 256);
          headBuf = Buffer.allocUnsafe(cap);
          readSync(fd, headBuf, 0, cap, 0);
        } finally {
          closeSync(fd);
        }
        const fast = probeTexHeaderFast(headBuf);
        if (fast.status === 'not-video') continue;
        if (fast.status === 'video') {
          videoSource = { kind: 'loose-tex-mp4', absPath: cand.full, width: fast.width, height: fast.height };
          break;
        }
        const hit = extractMp4FromTexBytes(readFileSync(cand.full));
        if (hit && hit.bytes.length >= 64) {
          videoSource = { kind: 'loose-tex-mp4', absPath: cand.full, width: hit.width, height: hit.height };
          break;
        }
      } catch { /* ignore */ }
    }
  }

  return {
    containerKind: 'loose',
    entriesCount: texFiles.length + mp4Files.length + audioFiles.length,
    hasVideo: Boolean(videoSource),
    videoSource,
    hasAudio: Boolean(audioFiles[0]),
    audioAbsPath: audioFiles[0] ? audioFiles[0].full : null,
  };
}

/**
 * Extract the embedded MP4 from a Scene container.
 * When `opts.cacheDir` is provided, persists extracted `TEXB0004` / packaged MP4 bytes to
 * `<cacheDir>/scene-media/<hash>.mp4` on first extraction so all subsequent plays stream
 * directly from disk via `fs.createReadStream` (`<1.5ms` HTTP `206` Range + `mp4-vfs`).
 */
export function extractSceneVideoPayload(fileOrDirAbs, opts = {}) {
  const cacheDir = typeof opts?.cacheDir === 'string' ? opts.cacheDir.trim() : '';
  const containerHash = cacheDir ? computeSceneContainerHash(fileOrDirAbs) : '';
  const cachedMp4Path = cacheDir && containerHash
    ? join(cacheDir, 'scene-media', `${containerHash}.mp4`)
    : '';

  if (cachedMp4Path && existsSync(cachedMp4Path)) {
    try {
      const st = statSync(cachedMp4Path);
      if (st.isFile() && st.size >= 64) {
        return { kind: 'file', absPath: cachedMp4Path, mime: 'video/mp4', cached: true };
      }
    } catch { /* ignore */ }
  }

  const info = inspectSceneContainer(fileOrDirAbs);
  if (!info.hasVideo || !info.videoSource) return null;
  const vs = info.videoSource;
  if (vs.kind === 'loose-mp4') {
    return { kind: 'file', absPath: vs.absPath, mime: 'video/mp4' };
  }

  let extractedBytes = null;
  if (vs.kind === 'loose-tex-mp4') {
    const hit = extractMp4FromTexBytes(readFileSync(vs.absPath));
    extractedBytes = hit ? hit.bytes : null;
  } else if (vs.kind === 'pkg-mp4') {
    extractedBytes = readPkgFileEntry(fileOrDirAbs, vs.entry);
  } else if (vs.kind === 'pkg-tex-mp4') {
    const raw = readPkgFileEntry(fileOrDirAbs, vs.entry);
    const hit = extractMp4FromTexBytes(raw);
    extractedBytes = hit ? hit.bytes : null;
  }

  if (!extractedBytes || extractedBytes.byteLength < 16) return null;

  if (cachedMp4Path && persistBufferAtomically(cachedMp4Path, extractedBytes)) {
    return { kind: 'file', absPath: cachedMp4Path, mime: 'video/mp4', cached: false };
  }
  return { kind: 'buffer', bytes: extractedBytes, mime: 'video/mp4' };
}

/** Extract packaged audio bytes (persisted to `<cacheDir>/scene-media/<hash>-audio<ext>` when `cacheDir` is set). */
export function extractSceneAudioPayload(fileOrDirAbs, opts = {}) {
  const mimeByExt = {
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
  };

  const cacheDir = typeof opts?.cacheDir === 'string' ? opts.cacheDir.trim() : '';
  const info = inspectSceneContainer(fileOrDirAbs);
  if (!info.hasAudio) return null;

  if (info.audioAbsPath && existsSync(info.audioAbsPath)) {
    const ext = extname(info.audioAbsPath).toLowerCase();
    return { kind: 'file', absPath: info.audioAbsPath, mime: mimeByExt[ext] || 'audio/mpeg' };
  }
  if (info.audioEntry) {
    const ext = extname(info.audioEntry.path).toLowerCase() || '.mp3';
    const mime = mimeByExt[ext] || 'audio/mpeg';
    const containerHash = cacheDir ? computeSceneContainerHash(fileOrDirAbs) : '';
    const cachedAudioPath = cacheDir && containerHash
      ? join(cacheDir, 'scene-media', `${containerHash}-audio${ext}`)
      : '';

    if (cachedAudioPath && existsSync(cachedAudioPath)) {
      try {
        const st = statSync(cachedAudioPath);
        if (st.isFile() && st.size > 0) {
          return { kind: 'file', absPath: cachedAudioPath, mime, cached: true };
        }
      } catch { /* ignore */ }
    }

    const bytes = readPkgFileEntry(fileOrDirAbs, info.audioEntry);
    if (cachedAudioPath && persistBufferAtomically(cachedAudioPath, bytes)) {
      return { kind: 'file', absPath: cachedAudioPath, mime, cached: false };
    }
    return { kind: 'buffer', bytes, mime };
  }
  return null;
}

// ── Wallpaper Engine `project.json` User Properties & Condition Evaluator ─────────────────

const KNOWN_PROP_TYPES = new Set([
  'color', 'bool', 'slider', 'combo', 'text', 'textinput', 'file', 'directory', 'group', 'other',
]);

function stripHtmlTags(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function lookupWeLocalization(projectObj, key, preferredLang = 'zh') {
  if (!key) return undefined;
  const table = projectObj?.general?.localization;
  if (!table || typeof table !== 'object') return undefined;
  const byLang = {};
  for (const k of Object.keys(table)) byLang[k.toLowerCase()] = table[k];
  const order = String(preferredLang || '').toLowerCase().startsWith('en')
    ? ['en-us', 'en', 'zh-chs', 'zh', 'zh-cn', 'zh-cht']
    : ['zh-chs', 'zh', 'zh-cn', 'zh-cht', 'en-us', 'en'];
  for (const lang of order) {
    const entry = byLang[lang];
    if (entry && typeof entry === 'object' && typeof entry[key] === 'string' && entry[key].trim()) {
      return entry[key];
    }
  }
  return undefined;
}

function resolvePropText(projectObj, rawText, locKey, fallback, preferredLang) {
  const trimmedRaw = typeof rawText === 'string' ? rawText.trim() : '';
  const byTextKey = trimmedRaw ? lookupWeLocalization(projectObj, trimmedRaw, preferredLang) : undefined;
  const loc = (typeof byTextKey === 'string' && byTextKey.trim())
    ? byTextKey
    : lookupWeLocalization(projectObj, locKey, preferredLang);
  const src = typeof loc === 'string' && loc.trim() ? loc : rawText;
  const clean = stripHtmlTags(src);
  return clean || fallback;
}

/** Convert WE space-separated normalized float color (`"0.2 0.6 1.0"`) to CSS `#rrggbb` or `rgb(...)`. */
export function weColorToHex(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  const parts = trimmed.split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const scale = parts.slice(0, 3).some((n) => n > 1.001) ? 1 : 255;
  const toByte = (n) => Math.max(0, Math.min(255, Math.round(n * scale)));
  const [r, g, b] = parts.slice(0, 3).map(toByte);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Convert CSS `#rrggbb` back to Wallpaper Engine's `"r g b"` float wire string (`0..1`). */
export function hexToWeColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
  if (!m) return '1 1 1';
  return [m[1], m[2], m[3]]
    .map((h) => Math.round((parseInt(h, 16) / 255) * 1000) / 1000)
    .join(' ');
}

function normalizePropWireValue(ptype, def) {
  if (!def || !('value' in def)) return undefined;
  const raw = def.value;
  if (raw === null || raw === undefined) return undefined;
  switch (ptype) {
    case 'color':
      return typeof raw === 'string' ? raw : undefined;
    case 'bool':
      return typeof raw === 'boolean' ? raw : Boolean(raw);
    case 'slider': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'combo':
      // Preserve declared JSON primitive type (numbers/strings/booleans are mixed in WE!)
      return raw;
    default:
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
}

/**
 * Safe recursive-descent evaluator for Wallpaper Engine `condition` expressions:
 * e.g. `mycombo.value == 2 && showglow.value != false` or `!hide_clock`.
 */
export function evaluateWeCondition(expr, propValues = {}) {
  if (typeof expr !== 'string' || !expr.trim()) return true;
  const tokens = [];
  const src = expr.trim();
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    const two = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '>=', '<='].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if (src.slice(i, i + 3) === '===') { tokens.push({ type: 'op', value: '==' }); i += 3; continue; }
    if (src.slice(i, i + 3) === '!==') { tokens.push({ type: 'op', value: '!=' }); i += 3; continue; }
    if (['!', '(', ')', '<', '>'].includes(ch)) {
      tokens.push({ type: ch === '(' || ch === ')' ? 'paren' : 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let s = '';
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) { s += src[i + 1]; i += 2; }
        else { s += src[i]; i += 1; }
      }
      i += 1;
      tokens.push({ type: 'str', value: s });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] || ''))) {
      let numStr = ch;
      i += 1;
      while (i < src.length && /[0-9.]/.test(src[i])) { numStr += src[i]; i += 1; }
      tokens.push({ type: 'num', value: Number(numStr) });
      continue;
    }
    if (/[A-Za-z0-9_$.]/.test(ch)) {
      let id = '';
      while (i < src.length && /[A-Za-z0-9_$.]/.test(src[i])) { id += src[i]; i += 1; }
      if (id === 'true') tokens.push({ type: 'bool', value: true });
      else if (id === 'false') tokens.push({ type: 'bool', value: false });
      else if (id === 'null') tokens.push({ type: 'null', value: null });
      else tokens.push({ type: 'ident', value: id });
      continue;
    }
    // Unknown token -> fail-open visible
    return true;
  }

  let pos = 0;
  const peek = () => tokens[pos] || null;
  const next = () => tokens[pos++] || null;

  function resolveIdent(rawName) {
    const clean = rawName.endsWith('.value') ? rawName.slice(0, -6) : rawName;
    if (Object.prototype.hasOwnProperty.call(propValues, clean)) {
      const v = propValues[clean];
      return v && typeof v === 'object' && 'value' in v ? v.value : v;
    }
    if (Object.prototype.hasOwnProperty.call(propValues, rawName)) {
      return propValues[rawName];
    }
    return undefined;
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) return true;
    if (tok.type === 'op' && tok.value === '!') {
      next();
      return !Boolean(parsePrimary());
    }
    if (tok.type === 'paren' && tok.value === '(') {
      next();
      const val = parseOr();
      if (peek()?.type === 'paren' && peek()?.value === ')') next();
      return val;
    }
    next();
    if (tok.type === 'ident') return resolveIdent(tok.value);
    return tok.value;
  }

  function parseComparison() {
    const left = parsePrimary();
    const tok = peek();
    if (tok && tok.type === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(tok.value)) {
      next();
      const right = parsePrimary();
      // Loose numeric/string comparison matching WE JS semantics
      const lNum = Number(left);
      const rNum = Number(right);
      const bothNumeric = typeof left !== 'boolean' && typeof right !== 'boolean'
        && left !== '' && right !== '' && Number.isFinite(lNum) && Number.isFinite(rNum);
      switch (tok.value) {
        case '==': return bothNumeric ? lNum === rNum : String(left) === String(right) || left === right;
        case '!=': return bothNumeric ? lNum !== rNum : (String(left) !== String(right) && left !== right);
        case '<': return (bothNumeric ? lNum : left) < (bothNumeric ? rNum : right);
        case '>': return (bothNumeric ? lNum : left) > (bothNumeric ? rNum : right);
        case '<=': return (bothNumeric ? lNum : left) <= (bothNumeric ? rNum : right);
        case '>=': return (bothNumeric ? lNum : left) >= (bothNumeric ? rNum : right);
        default: return true;
      }
    }
    return Boolean(left);
  }

  function parseAnd() {
    let val = Boolean(parseComparison());
    while (peek()?.type === 'op' && peek()?.value === '&&') {
      next();
      const rhs = Boolean(parseComparison());
      val = val && rhs;
    }
    return val;
  }

  function parseOr() {
    let val = parseAnd();
    while (peek()?.type === 'op' && peek()?.value === '||') {
      next();
      const rhs = parseAnd();
      val = val || rhs;
    }
    return val;
  }

  try {
    return Boolean(parseOr());
  } catch {
    return true;
  }
}

/**
 * Parse Wallpaper Engine `project.json` `general.properties` into UI-ready descriptors + wire map.
 */
export function parseWeProjectProperties(projectObj, userOverrides = {}, preferredLang = 'zh') {
  const rawProps = projectObj?.general?.properties;
  if (!rawProps || typeof rawProps !== 'object') {
    return { list: [], wire: {} };
  }
  const ov = userOverrides && typeof userOverrides === 'object' ? userOverrides : {};

  const entries = Object.entries(rawProps)
    .filter(([, def]) => def && typeof def === 'object' && typeof def.type === 'string')
    .sort((a, b) => {
      const oa = Number.isFinite(Number(a[1].order)) ? Number(a[1].order) : 0;
      const ob = Number.isFinite(Number(b[1].order)) ? Number(b[1].order) : 0;
      if (oa !== ob) return oa - ob;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });

  const wire = {};
  const list = [];

  for (const [name, def] of entries) {
    const rawType = String(def.type || 'other').toLowerCase();
    const ptype = KNOWN_PROP_TYPES.has(rawType) ? rawType : 'other';
    const dflt = normalizePropWireValue(ptype, def);
    const hasOverride = Object.prototype.hasOwnProperty.call(ov, name);
    const value = hasOverride ? ov[name] : dflt;

    if (value !== undefined && value !== null) {
      wire[name] = { value };
    }
    if (def.editable === false) continue;

    const item = {
      name,
      type: ptype,
      label: resolvePropText(projectObj, typeof def.text === 'string' ? def.text : '', name, name, preferredLang),
      order: Number.isFinite(Number(def.order)) ? Number(def.order) : 0,
      value: value === undefined ? null : value,
      defaultValue: dflt === undefined ? null : dflt,
      hexValue: ptype === 'color' ? weColorToHex(String(value ?? dflt ?? '1 1 1')) : undefined,
      overridden: hasOverride,
    };

    if (typeof def.condition === 'string' && def.condition.trim()) {
      item.condition = def.condition.trim();
    }
    if (ptype === 'slider') {
      item.min = Number.isFinite(Number(def.min)) ? Number(def.min) : 0;
      item.max = Number.isFinite(Number(def.max)) ? Number(def.max) : 100;
      item.step = def.editable === true && def.fraction === false ? 1
        : (Number.isFinite(Number(def.step)) && Number(def.step) > 0 ? Number(def.step) : (item.max - item.min <= 2 ? 0.01 : 1));
    }
    if (Array.isArray(def.options)) {
      item.options = def.options
        .filter((o) => o && typeof o.label === 'string' && 'value' in o)
        .map((o) => ({
          label: resolvePropText(projectObj, o.label, o.label, String(o.value), preferredLang),
          value: o.value,
          ...(typeof o.condition === 'string' && o.condition.trim() ? { condition: o.condition.trim() } : {}),
        }));
    }
    list.push(item);
  }

  const flatValues = {};
  for (const [k, v] of Object.entries(wire)) flatValues[k] = v.value;
  for (const item of list) {
    item.visible = item.condition ? evaluateWeCondition(item.condition, flatValues) : true;
  }

  return { list, wire };
}
