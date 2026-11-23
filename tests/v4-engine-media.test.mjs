import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';

import {
  createWallpaperPrismEngine,
  parseLibraryFoldersVdf,
  parseByteRange,
  hasRawTraversalAttempt,
  lz4DecompressBlock,
} from '../src/prism/engine/index.mjs';

function makeTinyPng() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf0000020501025a3492720000000049454e44ae426082',
    'hex',
  );
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpRequest({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('prism engine: pure helpers parse Steam VDF, HTTP byte ranges, traversal guard and LZ4 blocks', () => {
  const vdf = `"libraryfolders" { "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" } "1" { "path" "D:\\\\SteamLibrary" } }`;
  const roots = parseLibraryFoldersVdf(vdf);
  assert.ok(roots.some((r) => r.includes('SteamLibrary')));

  assert.deepEqual(parseByteRange('bytes=0-9', 100), { valid: true, start: 0, end: 9 });
  assert.equal(hasRawTraversalAttempt('/token/r/0/../../etc/passwd'), true);
  assert.equal(hasRawTraversalAttempt('/token/r/0/wall.jpg'), false);

  // LZ4 single literal block of 5 bytes "HELLO" (token 0x50 = 5 literals, 0 match)
  const raw = lz4DecompressBlock(Buffer.from([0x50, 0x48, 0x45, 0x4c, 0x4c, 0x4f]), 5);
  assert.equal(Buffer.from(raw).toString('ascii'), 'HELLO');
});

test('prism engine: uploads media with SHA-256 dedup, serves HTTP 206 Range and blocks path traversal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-prism-eng-'));
  const engine = await createWallpaperPrismEngine({
    dataDir: dir,
    steamRoot: join(dir, 'no-steam'),
    includeDefaultPictures: false,
    skipStartupScan: true,
    disableDeferredScan: true,
  });
  try {
    const png = makeTinyPng();
    const up1 = await engine.uploadBuffer(png, { filename: 'hero.png', contentType: 'image/png', title: 'Hero' });
    assert.equal(up1.duplicate, false);
    assert.ok(up1.item && up1.item.id);
    assert.ok(up1.item.mediaUrl.startsWith(engine.mediaOrigin));

    // Second identical upload deduplicates
    const up2 = await engine.uploadBuffer(png, { filename: 'hero-copy.png', contentType: 'image/png' });
    assert.equal(up2.duplicate, true);
    assert.equal(up2.item.id, up1.item.id);

    // HTTP 206 partial content check
    const r206 = await httpGet(up1.item.mediaUrl, { Range: 'bytes=0-7' });
    assert.equal(r206.status, 206);
    assert.equal(r206.body.length, 8);
    assert.equal(r206.body.readUInt32BE(0), 0x89504e47);

    // Path traversal blocked
    const bad = await httpGet(`${engine.mediaOrigin}/bad/r/0/..%2f..%2fsecret.txt`);
    assert.ok(bad.status === 403 || bad.status === 404);
  } finally {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
