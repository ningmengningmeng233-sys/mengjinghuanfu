import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStudioDaemon } from '../src/studio-daemon.mjs';

async function fetchJson(baseUrl, path, { method = 'GET', token = '', body } = {}) {
  const headers = {};
  if (token) headers['X-Sidecar-Token'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
}

test('studio daemon exposes 3-mode metadata, updates per-app mode/modules, and drives DSH native plugin hot-apply', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ds-studio-t6-'));
  const fakeDshPluginsDir = join(tmp, 'dsh-plugin-packages');
  const prevEnv = process.env.DREAMSKIN_DSH_PLUGINS_DIR;
  process.env.DREAMSKIN_DSH_PLUGINS_DIR = fakeDshPluginsDir;
  mkdirSync(fakeDshPluginsDir, { recursive: true });

  const daemon = await startStudioDaemon({
    port: 0,
    dataDir: join(tmp, 'v4'),
    legacyRoot: join(tmp, 'legacy'),
    skipV3Migration: true,
    skipStartupScan: true,
    disableDeferredScan: true,
    skipInitialAppsScan: true,
    autoPoll: false,
  });

  try {
    const base = `http://127.0.0.1:${daemon.port}`;
    const stateRes = await fetchJson(base, '/api/state', { token: daemon.token });
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.data.version, '4.1.0');
    assert.ok(stateRes.data.skinModes && stateRes.data.skinModes.optical && stateRes.data.skinModes.wallpaper && stateRes.data.skinModes.hybrid);
    assert.ok(Array.isArray(stateRes.data.excludedHostFeatures) && stateRes.data.excludedHostFeatures.length >= 3);
    assert.equal(stateRes.data.apps.length, 14);

    // 1. Switch DSH to optical mode via API
    const cfgRes = await fetchJson(base, '/api/apps/dsh/config', {
      method: 'POST',
      token: daemon.token,
      body: { skinMode: 'optical', companionStyle: 'neko', companionPosition: 'bottom-left' },
    });
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.data.effective.skinMode, 'optical');
    assert.equal(cfgRes.data.composition.effectiveModules.wallpaperLayer, false);
    assert.equal(cfgRes.data.composition.effectiveModules.pixelCompanion, true);

    // 2. Install & enable DSH native plugin via API (requires consent=true)
    const denyIns = await fetchJson(base, '/api/apps/dsh/plugin/install', {
      method: 'POST',
      token: daemon.token,
      body: { consent: false },
    });
    assert.equal(denyIns.status, 400);

    const okIns = await fetchJson(base, '/api/apps/dsh/plugin/install', {
      method: 'POST',
      token: daemon.token,
      body: { consent: true, enable: true },
    });
    assert.equal(okIns.status, 200);
    assert.equal(okIns.data.ok, true);
    assert.equal(okIns.data.installed, true);
    assert.equal(existsSync(join(fakeDshPluginsDir, 'dsh-plugin-dreamskin', 'lib', 'client.js')), true);

    const plugSt = await fetchJson(base, '/api/apps/dsh/plugin/status', { token: daemon.token });
    assert.equal(plugSt.status, 200);
    assert.equal(plugSt.data.installed, true);
    assert.equal(plugSt.data.enabled, true);

    // 3. Apply DSH without CDP port -> succeeds via dsh-plugin native channel!
    const applyRes = await fetchJson(base, '/api/apps/dsh/apply', {
      method: 'POST',
      token: daemon.token,
      body: {},
    });
    assert.equal(applyRes.status, 200);
    assert.equal(applyRes.data.ok, true);
    assert.equal(applyRes.data.via, 'dsh-plugin');
    assert.equal(applyRes.data.skinMode, 'optical');

    // 4. Switch to hybrid with wallpaperLayer=false & glassLayer=true -> returns conflict notice
    const mixRes = await fetchJson(base, '/api/apps/dsh/config', {
      method: 'POST',
      token: daemon.token,
      body: { skinMode: 'hybrid', modules: { wallpaperLayer: false, glassLayer: true, opticalFacet: true, pixelCompanion: true } },
    });
    assert.equal(mixRes.status, 200);
    assert.equal(mixRes.data.composition.effectiveModules.glassLayer, false);
    assert.ok(mixRes.data.composition.conflicts.some((c) => c.code === 'glass-without-wallpaper'));

    // 5. Restore DSH removes active skin via plugin channel
    const restRes = await fetchJson(base, '/api/apps/dsh/restore', {
      method: 'POST',
      token: daemon.token,
      body: {},
    });
    assert.equal(restRes.status, 200);
    assert.equal(restRes.data.ok, true);
  } finally {
    await daemon.close();
    if (prevEnv === undefined) delete process.env.DREAMSKIN_DSH_PLUGINS_DIR;
    else process.env.DREAMSKIN_DSH_PLUGINS_DIR = prevEnv;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Studio UI dist/index.html is built from source with 3-mode switcher, module toggles, and DSH plugin panel', () => {
  const html = readFileSync(new URL('../src/studio-ui/dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.length > 50000);
  assert.match(html, /纯黑曜光学/);
  assert.match(html, /纯梦境壁纸/);
  assert.match(html, /自由混搭/);
  assert.match(html, /data-skin-mode/);
  assert.match(html, /data-module-toggle/);
  assert.match(html, /data-dsh-plugin-action/);
  assert.doesNotMatch(html, /<!-- PRISM_INLINE_STYLE -->|<!-- PRISM_INLINE_SCRIPT -->/);
});
