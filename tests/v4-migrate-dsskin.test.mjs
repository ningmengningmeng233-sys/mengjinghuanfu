import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateV3DataIfNeeded } from '../src/store/migrate-v3.mjs';
import { importLegacyDsskin } from '../src/theme/dsskin-compat.mjs';

function makeTinyPng() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf0000020501025a3492720000000049454e44ae426082',
    'hex',
  );
}

test('migrate-v3: read-only imports gallery & user-skins, skips corrupt JSON, idempotent, zero writes to legacy root', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-mig-'));
  const legacyRoot = join(root, 'legacy');
  const v4Dir = join(root, 'v4');
  const uploadDir = join(v4Dir, 'uploads');
  try {
    // Prepare mock v3 gallery + user-skins + corrupt JSON
    const galItem = join(legacyRoot, 'gallery', 'ver_abc12345');
    mkdirSync(galItem, { recursive: true });
    writeFileSync(join(galItem, 'info.json'), JSON.stringify({ id: 'ver_abc12345', name: '蔚蓝星海', author: 'Alice' }));
    writeFileSync(join(galItem, 'theme.json'), JSON.stringify({ appearance: 'dark', colors: { background: '#101218', accent: '#669df6' } }));
    writeFileSync(join(galItem, 'background.png'), makeTinyPng());

    const badGal = join(legacyRoot, 'gallery', 'ver_broken99');
    mkdirSync(badGal, { recursive: true });
    writeFileSync(join(badGal, 'info.json'), '{broken json');

    const skinsDir = join(legacyRoot, 'skins');
    mkdirSync(join(skinsDir, 'images'), { recursive: true });
    writeFileSync(join(skinsDir, 'images', 'abc123.png'), makeTinyPng());
    writeFileSync(
      join(skinsDir, 'skin001.json'),
      JSON.stringify({
        schema: 'dream-skin-user-skin/1',
        id: 'skin001',
        name: '我的夜空',
        palette: { dark: true, bg: '#111116', accent: '#c9a96e' },
        values: { scrim: 120 },
        image: 'images/abc123.png',
      }),
    );

    const beforeGalleryInfo = readFileSync(join(galItem, 'info.json'), 'utf8');

    const res1 = migrateV3DataIfNeeded({ legacyRoot, v4DataDir: v4Dir, uploadDir });
    assert.equal(res1.migrated, true);
    assert.equal(res1.importedWallpapers.length, 2);
    assert.ok(res1.importedWallpapers.some((w) => w.title.includes('蔚蓝星海')));
    assert.ok(res1.importedWallpapers.some((w) => w.title.includes('我的夜空')));
    assert.ok(res1.skipped.length >= 1);
    assert.equal(readFileSync(join(galItem, 'info.json'), 'utf8'), beforeGalleryInfo);

    // Second run is idempotent
    const res2 = migrateV3DataIfNeeded({ legacyRoot, v4DataDir: v4Dir, uploadDir });
    assert.equal(res2.migrated, false);
    assert.equal(res2.alreadyMigrated, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dsskin-compat: imports valid JSON .dsskin and rejects malformed/traversal inputs with zero disk writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-dsskin-'));
  const uploadDir = join(dir, 'uploads');
  try {
    const validPath = join(dir, 'good.dsskin');
    writeFileSync(
      validPath,
      JSON.stringify({
        schema: 'dream-skin-share/1',
        name: '樱花玻璃',
        palette: { dark: false, bg: '#faf4ed', accent: '#d7827e' },
        values: { scrim: 90, blur: 18 },
        imageData: 'data:image/png;base64,' + makeTinyPng().toString('base64'),
      }),
    );

    const ok = importLegacyDsskin({ filePath: validPath, uploadDir });
    assert.equal(ok.ok, true);
    assert.equal(ok.title, '樱花玻璃');
    assert.ok(existsSync(ok.imagePath));
    assert.equal(ok.suggestedConfig.themeMode, 'light');

    // Bad schema or fake image rejected without writing to uploadDir
    const emptyUploads = join(dir, 'uploads-bad');
    const badPath = join(dir, 'bad.dsskin');
    writeFileSync(badPath, JSON.stringify({ schema: 'wrong/1', name: '../evil', imageData: 'data:image/png;base64,bm90cG5n' }));
    const bad = importLegacyDsskin({ filePath: badPath, uploadDir: emptyUploads });
    assert.equal(bad.ok, false);
    assert.equal(existsSync(emptyUploads) ? readdirSync(emptyUploads).length : 0, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
