import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BUILTIN_DYNAMIC_THEMES,
  getBuiltinDynamicTheme,
  listBuiltinDynamicThemes,
  materializeDynamicTheme,
} from '../src/prism/dynamic-themes/index.mjs';
import { startStudioDaemon } from '../src/studio-daemon.mjs';

test('dynamic-themes: ships 8 self-contained interactive HTML5 canvas themes and materializes cleanly', () => {
  const list = listBuiltinDynamicThemes();
  assert.equal(list.length, 8);
  assert.equal(BUILTIN_DYNAMIC_THEMES.length, 8);
  for (const t of list) {
    assert.ok(t.id && t.title && t.thumbUrl.startsWith('data:image/svg+xml'));
    const full = getBuiltinDynamicTheme(t.id);
    assert.ok(full && full.html.includes('<canvas') && full.html.includes('requestAnimationFrame'));
  }

  const tmp = mkdtempSync(join(tmpdir(), 'ds-dyn-mat-'));
  try {
    const mat = materializeDynamicTheme({ id: 'aurora-drift', uploadDir: tmp });
    assert.equal(mat.exists, true);
    assert.equal(existsSync(join(mat.dir, 'index.html')), true);
    assert.equal(existsSync(join(mat.dir, 'project.json')), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('studio-daemon: serves /api/dynamic-themes, preview.html, install, and /api/apps/:id/icon', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ds-dyn-api-'));
  const d = await startStudioDaemon({
    dataDir: tmp,
    legacyRoot: tmp,
    steamRoot: tmp,
    includeDefaultPictures: false,
    skipV3Migration: true,
    skipStartupScan: true,
    disableDeferredScan: true,
    skipInitialAppsScan: true,
  });
  try {
    const base = `http://127.0.0.1:${d.port}`;
    const listRes = await fetch(`${base}/api/dynamic-themes`).then((r) => r.json());
    assert.equal(listRes.ok, true);
    assert.equal(listRes.themes.length, 8);

    const previewRes = await fetch(`${base}/api/dynamic-themes/sakura-nightfall/preview.html`);
    assert.equal(previewRes.status, 200);
    const html = await previewRes.text();
    assert.ok(html.includes('<canvas'));

    const instRes = await fetch(`${base}/api/dynamic-themes/aurora-drift/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sidecar-Token': d.token },
      body: '{}',
    }).then((r) => r.json());
    assert.equal(instRes.ok, true);
    assert.equal(instRes.theme.id, 'aurora-drift');
    assert.ok(instRes.item && instRes.item.kind === 'web');

    const iconRes = await fetch(`${base}/api/apps/kiro/icon`);
    assert.equal(iconRes.status, 200);
    assert.ok((iconRes.headers.get('content-type') || '').includes('image/'));
  } finally {
    await d.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
