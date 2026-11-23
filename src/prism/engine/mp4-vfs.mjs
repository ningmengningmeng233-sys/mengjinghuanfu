/**
 * Zero-Disk-Copy Virtual MP4 Faststart & Metadata Probe (`mp4-vfs.mjs`)
 *
 * Ports `dsh-plugin-wallpaper-engine/lib/mp4-vfs.js` + `mp4-probe.js`:
 * - Many Steam Workshop `.mp4` wallpapers place the `moov` box after `mdat` (at EOF).
 *   Chromium's `<video>` loader must otherwise read hundreds of MB sequentially before
 *   decoding frame 1.
 * - `layoutFor(absPath)` inspects top-level ISO BMFF boxes via tiny 16-byte file reads,
 *   loads ONLY `moov` (capped at 8 MiB) into memory, shifts every `stco` / `co64` chunk
 *   offset inside `mdat` by `+moov.length`, and synthesizes a virtual byte layout:
 *     `[prefix boxes (ftyp/free)] + [patched moov buffer] + [mdat & trailing boxes]`
 *   Total virtual byte length equals the original file size byte-for-byte, with 0 disk writes.
 * - Fragmented or encrypted MP4s (`moof`, `mvex`, `senc`, `saio`, etc.) safely bail out to
 *   `{ kind: 'plain' }` so the caller streams the untouched original file.
 */

import { closeSync, createReadStream, openSync, readSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

export const MP4_VFS_MAX_MOOV_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 32;
const DEFAULT_MAX_CACHE_BYTES = 64 * 1024 * 1024;
const TOP_BOX_MAX = 64;
const HEADER_PROBE = 16;

const BAIL_MARKERS = [
  'moof', 'mvex', 'traf', 'tfhd', 'tfdt', 'trun', 'saio', 'senc', 'mfra', 'tfra',
].map((tag) => Buffer.from(tag, 'latin1'));

const VFS_EXTS = new Set(['.mp4', '.m4v', '.mov']);

/** Parse a single ISO BMFF box header inside `buf` bounded by `[off, limit)`. */
export function boxAt(buf, off, limit) {
  if (off + 8 > limit) return null;
  const size32 = buf.readUInt32BE(off);
  const type = buf.toString('latin1', off + 4, off + 8);
  let size = size32;
  let header = 8;
  if (size32 === 1) {
    if (off + 16 > limit) return null;
    const big = buf.readBigUInt64BE(off + 8);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(big);
    header = 16;
  } else if (size32 === 0) {
    size = limit - off;
  }
  if (!Number.isSafeInteger(size) || size < header || off + size > limit) return null;
  return { start: off, size, header, type, end: off + size };
}

/** Enumerate contiguous child boxes in `[start, end)`. Any malformed gap returns `null`. */
export function listBoxes(buf, start, end) {
  const out = [];
  let off = start;
  while (off < end) {
    const b = boxAt(buf, off, end);
    if (!b) return null;
    out.push(b);
    off = b.end;
  }
  return off === end ? out : null;
}

function childBox(buf, parent, type) {
  const kids = listBoxes(buf, parent.start + parent.header, parent.end);
  if (!kids) return null;
  return kids.find((b) => b.type === type) || null;
}

function listTopBoxes(fd, fileSize, { earlyStopOnFrontMoov = false } = {}) {
  const head = Buffer.alloc(HEADER_PROBE);
  const out = [];
  let off = 0;
  let seenMdat = false;
  while (off < fileSize) {
    const readLen = Math.min(HEADER_PROBE, fileSize - off);
    if (readLen < 8) return null;
    const n = readSync(fd, head, 0, readLen, off);
    if (n < 8) return null;
    const size32 = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let boxSize = size32;
    let header = 8;
    if (size32 === 1) {
      if (n < 16) return null;
      const big = head.readBigUInt64BE(8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      boxSize = Number(big);
      header = 16;
    } else if (size32 === 0) {
      boxSize = fileSize - off;
    }
    if (!Number.isSafeInteger(boxSize) || boxSize < header || off + boxSize > fileSize) return null;
    if (type === 'moov' && !seenMdat && earlyStopOnFrontMoov) {
      return { earlyFrontMoov: true, boxes: out };
    }
    if (type === 'mdat') seenMdat = true;
    out.push({ start: off, size: boxSize, header, end: off + boxSize, type });
    off += boxSize;
    if (out.length > TOP_BOX_MAX) return null;
  }
  return off === fileSize ? { earlyFrontMoov: false, boxes: out } : null;
}

function hasBailMarker(moovBuf) {
  for (const marker of BAIL_MARKERS) {
    if (moovBuf.indexOf(marker) !== -1) return true;
  }
  return false;
}

function chunkOffsetTables(moovBuf) {
  const moov = boxAt(moovBuf, 0, moovBuf.length);
  if (!moov || moov.type !== 'moov') return null;
  const top = listBoxes(moovBuf, moov.start + moov.header, moov.end);
  if (!top) return null;
  const tables = [];
  let trakCount = 0;
  for (const trak of top.filter((b) => b.type === 'trak')) {
    trakCount += 1;
    const mdia = childBox(moovBuf, trak, 'mdia');
    const minf = mdia ? childBox(moovBuf, mdia, 'minf') : null;
    const stbl = minf ? childBox(moovBuf, minf, 'stbl') : null;
    if (!stbl) return null;
    const kids = listBoxes(moovBuf, stbl.start + stbl.header, stbl.end);
    if (!kids) return null;
    for (const box of kids) {
      if (box.type !== 'stco' && box.type !== 'co64') continue;
      const wide = box.type === 'co64';
      if (box.size < box.header + 8) return null;
      const count = moovBuf.readUInt32BE(box.start + box.header + 4);
      const entriesStart = box.start + box.header + 8;
      if (entriesStart + count * (wide ? 8 : 4) > box.end) return null;
      tables.push({ box, wide, count, entriesStart });
    }
  }
  if (trakCount === 0 || tables.length === 0) return null;
  return { tables, tracks: trakCount };
}

function patchMoovBuffer(moovBuf, tables, delta, mdat) {
  const out = Buffer.from(moovBuf);
  let patched = 0;
  for (const t of tables) {
    const step = t.wide ? 8 : 4;
    for (let i = 0; i < t.count; i += 1) {
      const pos = t.entriesStart + i * step;
      if (t.wide) {
        const cur = out.readBigUInt64BE(pos);
        const num = Number(cur);
        if (!Number.isSafeInteger(num) || num < mdat.start || num >= mdat.end) return null;
        const next = cur + BigInt(delta);
        if (next > 0xffff_ffff_ffff_ffffn) return null;
        out.writeBigUInt64BE(next, pos);
      } else {
        const cur = out.readUInt32BE(pos);
        if (cur < mdat.start || cur >= mdat.end) return null;
        const next = cur + delta;
        // If shifting overflows 32-bit stco (>4 GiB), safely bail out to original file
        if (next > 0xffff_ffff) return null;
        out.writeUInt32BE(next >>> 0, pos);
      }
      patched += 1;
    }
  }
  return { buf: out, patched };
}

/**
 * Compute virtual faststart layout directly from a Buffer (for unit tests) or file path.
 * Segments are ordered contiguous virtual ranges:
 *   - `{ kind: 'file', fileOffset, length, virtualStart, virtualEnd }`
 *   - `{ kind: 'mem', buffer, length, virtualStart, virtualEnd }`
 */
export function buildVirtualFaststartFromFile(absPath, maxMoovBytes = MP4_VFS_MAX_MOOV_BYTES) {
  const ext = extname(String(absPath || '')).toLowerCase();
  if (!VFS_EXTS.has(ext)) return { kind: 'none', reason: 'unsupported-ext' };

  let st;
  try {
    st = statSync(absPath);
  } catch {
    return { kind: 'none', reason: 'stat-failed' };
  }
  if (!st.isFile() || st.size < 32) return { kind: 'none', reason: 'too-small' };

  let fd;
  try {
    fd = openSync(absPath, 'r');
  } catch {
    return { kind: 'none', reason: 'open-failed' };
  }

  try {
    const topRes = listTopBoxes(fd, st.size, { earlyStopOnFrontMoov: true });
    if (!topRes) return { kind: 'none', reason: 'bad-top-boxes' };
    if (topRes.earlyFrontMoov) {
      // moov precedes mdat: bypass VFS completely (`0ms` CPU, raw createReadStream)
      return { kind: 'plain', size: st.size, mtimeMs: Math.round(st.mtimeMs) };
    }
    const boxes = topRes.boxes;

    const moovs = boxes.filter((b) => b.type === 'moov');
    const mdats = boxes.filter((b) => b.type === 'mdat');
    if (moovs.length !== 1 || mdats.length === 0) {
      return { kind: 'none', reason: 'multi-or-missing-moov-mdat' };
    }
    const moov = moovs[0];
    const firstMdat = mdats[0];
    const lastMdat = mdats[mdats.length - 1];

    // Already faststart (moov precedes mdat): stream plain file directly
    if (moov.start < firstMdat.start) {
      return { kind: 'plain', size: st.size, mtimeMs: Math.round(st.mtimeMs) };
    }
    if (lastMdat.end > moov.start) {
      return { kind: 'none', reason: 'mdat-after-moov' };
    }
    if (moov.size > maxMoovBytes) {
      return { kind: 'none', reason: 'moov-too-large' };
    }

    const moovRaw = Buffer.allocUnsafe(moov.size);
    const n = readSync(fd, moovRaw, 0, moov.size, moov.start);
    if (n !== moov.size) return { kind: 'none', reason: 'short-moov-read' };
    if (hasBailMarker(moovRaw)) return { kind: 'none', reason: 'fragmented-or-encrypted' };

    const parsed = chunkOffsetTables(moovRaw);
    if (!parsed) return { kind: 'none', reason: 'unsupported-stbl' };

    // Insert patched moov right before firstMdat. Everything in [firstMdat.start, moov.start) shifts by +moov.size.
    const insertAt = firstMdat.start;
    const delta = moov.size;
    const mdatSpan = { start: firstMdat.start, end: lastMdat.end };
    const patched = patchMoovBuffer(moovRaw, parsed.tables, delta, mdatSpan);
    if (!patched) return { kind: 'none', reason: 'offset-out-of-bounds' };

    const segments = [];
    let vPos = 0;
    const pushFile = (fileOffset, length) => {
      if (length <= 0) return;
      segments.push({
        kind: 'file',
        fileOffset,
        length,
        virtualStart: vPos,
        virtualEnd: vPos + length,
      });
      vPos += length;
    };
    const pushMem = (buffer) => {
      segments.push({
        kind: 'mem',
        buffer,
        length: buffer.length,
        virtualStart: vPos,
        virtualEnd: vPos + buffer.length,
      });
      vPos += buffer.length;
    };

    pushFile(0, insertAt);
    pushMem(patched.buf);
    pushFile(insertAt, moov.start - insertAt);
    pushFile(moov.end, st.size - moov.end);

    if (vPos !== st.size) {
      return { kind: 'none', reason: 'size-mismatch' };
    }

    return {
      kind: 'virtual',
      size: st.size,
      mtimeMs: Math.round(st.mtimeMs),
      moov: patched.buf,
      segments,
      delta,
      patched: patched.patched,
      tracks: parsed.tracks,
    };
  } catch {
    return { kind: 'none', reason: 'exception' };
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

/** Materialize a byte slice `[start, endInclusive]` from a virtual layout into a Buffer (great for tests/small ranges). */
export function readVirtualSliceSync(absPath, layout, start = 0, endInclusive = layout.size - 1) {
  const s = Math.max(0, start);
  const e = Math.min(layout.size - 1, endInclusive);
  if (e < s) return Buffer.alloc(0);
  const out = Buffer.allocUnsafe(e - s + 1);
  let writePos = 0;
  const fd = openSync(absPath, 'r');
  try {
    for (const seg of layout.segments) {
      if (seg.virtualEnd <= s || seg.virtualStart > e) continue;
      const segStart = Math.max(s, seg.virtualStart) - seg.virtualStart;
      const segEnd = Math.min(e + 1, seg.virtualEnd) - seg.virtualStart;
      const len = segEnd - segStart;
      if (seg.kind === 'mem') {
        seg.buffer.copy(out, writePos, segStart, segEnd);
      } else {
        const n = readSync(fd, out, writePos, len, seg.fileOffset + segStart);
        if (n !== len) throw new Error('Virtual MP4 short read');
      }
      writePos += len;
    }
    return out;
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

/** Create a backpressure-safe Node `Readable` stream over `[start, endInclusive]` of a virtual MP4 layout. */
export function createVirtualSegmentStream(absPath, layout, start = 0, endInclusive = layout.size - 1) {
  const s = Math.max(0, start);
  const e = Math.min(layout.size - 1, endInclusive);
  let activeFsStream = null;
  let aborted = false;

  async function* generateChunks() {
    if (e < s) return;
    for (const seg of layout.segments) {
      if (aborted) return;
      if (seg.virtualEnd <= s || seg.virtualStart > e) continue;
      const segStart = Math.max(s, seg.virtualStart) - seg.virtualStart;
      const segEnd = Math.min(e + 1, seg.virtualEnd) - seg.virtualStart;
      const len = segEnd - segStart;
      if (len <= 0) continue;

      if (seg.kind === 'mem') {
        yield seg.buffer.subarray(segStart, segEnd);
      } else {
        const fsStream = createReadStream(absPath, {
          start: seg.fileOffset + segStart,
          end: seg.fileOffset + segEnd - 1,
          highWaterMark: 256 * 1024,
        });
        activeFsStream = fsStream;
        try {
          for await (const chunk of fsStream) {
            if (aborted) break;
            yield chunk;
          }
        } finally {
          if (activeFsStream === fsStream) activeFsStream = null;
          try { fsStream.destroy(); } catch { /* ignore */ }
        }
      }
    }
  }

  const stream = Readable.from(generateChunks());
  stream.once('close', () => {
    aborted = true;
    if (activeFsStream) {
      try { activeFsStream.destroy(); } catch { /* ignore */ }
      activeFsStream = null;
    }
  });
  return stream;
}

/** Create a bounded LRU cache + session-pinned selector for virtual MP4 faststart layouts. */
export function createMp4VfsKit({
  maxMoovBytes = MP4_VFS_MAX_MOOV_BYTES,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_CACHE_BYTES,
} = {}) {
  const cache = new Map(); // cacheKey -> layout
  const pinnedByToken = new Map(); // token -> { stamp, layout }
  let cachedBytes = 0;

  function stampOf(absPath) {
    try {
      const st = statSync(absPath);
      if (!st.isFile()) return null;
      return `${absPath}:${Math.round(st.mtimeMs)}:${st.size}`;
    } catch {
      return null;
    }
  }

  function evictIfNeeded() {
    while (cache.size > maxEntries || cachedBytes > maxBytes) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      const prev = cache.get(oldest.value);
      cache.delete(oldest.value);
      if (prev && prev.kind === 'virtual' && prev.moov) {
        cachedBytes = Math.max(0, cachedBytes - prev.moov.length);
      }
    }
  }

  function layoutFor(absPath) {
    const key = stampOf(absPath);
    if (!key) return { kind: 'none', reason: 'missing' };
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const res = buildVirtualFaststartFromFile(absPath, maxMoovBytes);
    cache.set(key, res);
    if (res.kind === 'virtual' && res.moov) {
      cachedBytes += res.moov.length;
    }
    evictIfNeeded();
    return res;
  }

  /**
   * Pin the layout decision per token+mtime so concurrent Range requests during the
   * same `<video>` playback session ALWAYS observe identical byte offsets.
   */
  function pinnedFaststartVariant(absPath, token) {
    const key = stampOf(absPath);
    if (!key) return null;
    const pinKey = String(token || absPath);
    const prev = pinnedByToken.get(pinKey);
    if (prev && prev.stamp === key) {
      return prev.layout.kind === 'virtual' ? prev.layout : null;
    }
    const layout = layoutFor(absPath);
    pinnedByToken.set(pinKey, { stamp: key, layout });
    if (pinnedByToken.size > maxEntries * 4) {
      const first = pinnedByToken.keys().next();
      if (!first.done) pinnedByToken.delete(first.value);
    }
    return layout.kind === 'virtual' ? layout : null;
  }

  function clear() {
    cache.clear();
    pinnedByToken.clear();
    cachedBytes = 0;
  }

  return {
    layoutFor,
    pinnedFaststartVariant,
    clear,
    stats: () => ({ entries: cache.size, cachedBytes, pinned: pinnedByToken.size }),
  };
}

/**
 * Lightweight zero-dependency MP4 `moov` metadata probe (`width`, `height`, `durationSec`, `fps`, `codec`, `hasAudio`, `moovAtFront`).
 */
export function probeMp4Metadata(absPath) {
  let st;
  try {
    st = statSync(absPath);
    if (!st.isFile() || st.size < 32) return null;
  } catch {
    return null;
  }

  let fd;
  try {
    fd = openSync(absPath, 'r');
    const topRes = listTopBoxes(fd, st.size);
    const boxes = topRes?.boxes;
    if (!boxes) return null;
    const moovBox = boxes.find((b) => b.type === 'moov');
    const mdatBox = boxes.find((b) => b.type === 'mdat');
    if (!moovBox || moovBox.size > MP4_VFS_MAX_MOOV_BYTES) return null;

    const moovBuf = Buffer.allocUnsafe(moovBox.size);
    if (readSync(fd, moovBuf, 0, moovBox.size, moovBox.start) !== moovBox.size) return null;
    const moov = boxAt(moovBuf, 0, moovBuf.length);
    if (!moov) return null;
    const kids = listBoxes(moovBuf, moov.start + moov.header, moov.end) || [];

    let durationSec = null;
    const mvhd = kids.find((b) => b.type === 'mvhd');
    if (mvhd && mvhd.size >= mvhd.header + 20) {
      const ver = moovBuf.readUInt8(mvhd.start + mvhd.header);
      if (ver === 1 && mvhd.size >= mvhd.header + 32) {
        const scale = moovBuf.readUInt32BE(mvhd.start + mvhd.header + 20);
        const dur = Number(moovBuf.readBigUInt64BE(mvhd.start + mvhd.header + 24));
        if (scale > 0) durationSec = Math.round((dur / scale) * 100) / 100;
      } else if (ver === 0) {
        const scale = moovBuf.readUInt32BE(mvhd.start + mvhd.header + 12);
        const dur = moovBuf.readUInt32BE(mvhd.start + mvhd.header + 16);
        if (scale > 0) durationSec = Math.round((dur / scale) * 100) / 100;
      }
    }

    let width = 0;
    let height = 0;
    let fps = null;
    let codec = null;
    let hasAudio = false;

    for (const trak of kids.filter((b) => b.type === 'trak')) {
      const tkhd = childBox(moovBuf, trak, 'tkhd');
      const mdia = childBox(moovBuf, trak, 'mdia');
      const hdlr = mdia ? childBox(moovBuf, mdia, 'hdlr') : null;
      const mdhd = mdia ? childBox(moovBuf, mdia, 'mdhd') : null;
      const minf = mdia ? childBox(moovBuf, mdia, 'minf') : null;
      const stbl = minf ? childBox(moovBuf, minf, 'stbl') : null;

      let handlerType = '';
      if (hdlr && hdlr.size >= hdlr.header + 12) {
        handlerType = moovBuf.toString('latin1', hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12);
      }
      if (handlerType === 'soun') {
        hasAudio = true;
        continue;
      }
      if (handlerType !== 'vide') continue;

      if (tkhd && tkhd.size >= tkhd.header + 84) {
        const ver = moovBuf.readUInt8(tkhd.start + tkhd.header);
        const wOff = tkhd.start + tkhd.header + (ver === 1 ? 88 : 76);
        if (wOff + 8 <= tkhd.end) {
          width = Math.round(moovBuf.readUInt32BE(wOff) / 65536);
          height = Math.round(moovBuf.readUInt32BE(wOff + 4) / 65536);
        }
      }

      let trackScale = 0;
      let trackDuration = 0;
      if (mdhd && mdhd.size >= mdhd.header + 20) {
        const ver = moovBuf.readUInt8(mdhd.start + mdhd.header);
        if (ver === 1 && mdhd.size >= mdhd.header + 32) {
          trackScale = moovBuf.readUInt32BE(mdhd.start + mdhd.header + 20);
          trackDuration = Number(moovBuf.readBigUInt64BE(mdhd.start + mdhd.header + 24));
        } else if (ver === 0) {
          trackScale = moovBuf.readUInt32BE(mdhd.start + mdhd.header + 12);
          trackDuration = moovBuf.readUInt32BE(mdhd.start + mdhd.header + 16);
        }
      }

      if (stbl) {
        const stsd = childBox(moovBuf, stbl, 'stsd');
        if (stsd && stsd.size >= stsd.header + 16) {
          const sampleEntry = boxAt(moovBuf, stsd.start + stsd.header + 8, stsd.end);
          if (sampleEntry) {
            codec = sampleEntry.type.trim();
            if ((!width || !height) && sampleEntry.size >= 36) {
              width = moovBuf.readUInt16BE(sampleEntry.start + 32);
              height = moovBuf.readUInt16BE(sampleEntry.start + 34);
            }
          }
        }
        const stts = childBox(moovBuf, stbl, 'stts');
        if (stts && stts.size >= stts.header + 8 && trackScale > 0) {
          const entryCount = moovBuf.readUInt32BE(stts.start + stts.header + 4);
          let totalSamples = 0;
          let totalDelta = 0;
          const maxScan = Math.min(entryCount, 4096);
          let p = stts.start + stts.header + 8;
          for (let i = 0; i < maxScan && p + 8 <= stts.end; i += 1) {
            const sc = moovBuf.readUInt32BE(p);
            const sd = moovBuf.readUInt32BE(p + 4);
            totalSamples += sc;
            totalDelta += sc * sd;
            p += 8;
          }
          if (totalSamples > 0 && totalDelta > 0) {
            fps = Math.round((totalSamples / (totalDelta / trackScale)) * 100) / 100;
          } else if (totalSamples > 0 && trackDuration > 0) {
            fps = Math.round((totalSamples / (trackDuration / trackScale)) * 100) / 100;
          }
        }
      }
    }

    return {
      width: width || null,
      height: height || null,
      durationSec,
      fps,
      codec,
      hasAudio,
      moovAtFront: mdatBox ? moovBox.start < mdatBox.start : true,
      fileSize: st.size,
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}
