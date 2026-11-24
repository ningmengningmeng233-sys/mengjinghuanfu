import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';

import { startStudioDaemon } from '../src/studio-daemon.mjs';

function reqJson(url, { method = 'GET', token = '', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body !== null ? JSON.stringify(body) : null;
    const headers = {};
    if (token) headers['X-Sidecar-Token'] = token;
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = httpRequest(
      { host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

test('studio-daemon: unified API enforces token, isolates per-app configs, syncs, prevents restore bounce, and reuses single daemon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-daemon-'));
  const d1 = await startStudioDaemon({
    dataDir: dir,
    port: 0,
    autoPoll: false,
    skipStartupScan: true,
    disableDeferredScan: true,
    steamRoot: join(dir, 'no-steam'),
    includeDefaultPictures: false,
    skipInitialAppsScan: true,
  });

  try {
    assert.equal(d1.role, 'primary');
    const base = `http://127.0.0.1:${d1.port}`;

    // 1. /api/ping works without token
    const ping = await reqJson(`${base}/api/ping`);
    assert.equal(ping.status, 200);
    assert.equal(ping.json.ok, true);

    // 2. Second daemon on same dataDir reuses primary instead of split-brain
    const d2 = await startStudioDaemon({
      dataDir: dir,
      port: 0,
      autoPoll: false,
      skipStartupScan: true,
      skipInitialAppsScan: true,
    });
    assert.equal(d2.role, 'reuse');
    assert.equal(d2.port, d1.port);
    assert.equal(d2.token, d1.token);
    await d2.close();

    // 3. POST without token -> 401
    const unauth = await reqJson(`${base}/api/config`, { method: 'POST', body: { glassOpacity: 0.7 } });
    assert.equal(unauth.status, 401);

    // 4. GET /api/state returns 8 adapters including antigravity
    const st = await reqJson(`${base}/api/state`);
    assert.equal(st.status, 200);
    assert.equal(st.json.apps.length, 8);
    assert.ok(st.json.apps.some((a) => a.id === 'antigravity'));

    // 5. Per-app independent config does not pollute sibling app
    const upCherry = await reqJson(`${base}/api/apps/cherry/config`, {
      method: 'POST',
      token: d1.token,
      body: { colorScheme: 'nord', glassOpacity: 0.66 },
    });
    assert.equal(upCherry.status, 200);
    assert.equal(upCherry.json.effective.colorScheme, 'nord');

    const st2 = await reqJson(`${base}/api/state`);
    assert.equal(st2.json.v4Store.apps.cherry.overrides.colorScheme, 'nord');
    assert.notEqual(st2.json.v4Store.apps.antigravity?.overrides?.colorScheme, 'nord');

    // 6. One-click sync copies cherry overrides to target apps
    const synced = await reqJson(`${base}/api/sync`, {
      method: 'POST',
      token: d1.token,
      body: { from: 'cherry', targets: ['antigravity', 'zcode'] },
    });
    assert.equal(synced.status, 200);
    assert.deepEqual(synced.json.syncedApps, ['antigravity', 'zcode']);

    const st3 = await reqJson(`${base}/api/state`);
    assert.equal(st3.json.v4Store.apps.antigravity.overrides.colorScheme, 'nord');
    assert.equal(st3.json.v4Store.apps.zcode.overrides.colorScheme, 'nord');

    // 7. Restore sets skinEnabled=false so guardian never auto-reinjects
    const rest = await reqJson(`${base}/api/apps/antigravity/restore`, { method: 'POST', token: d1.token });
    assert.equal(rest.status, 200);
    const st4 = await reqJson(`${base}/api/state`);
    assert.equal(st4.json.v4Store.apps.antigravity.skinEnabled, false);

    // 8. Focus arbitration endpoint freezes background dynamic app
    const f1 = await reqJson(`${base}/api/focus`, {
      method: 'POST',
      token: d1.token,
      body: { appId: 'cherry', focused: true, visible: true, dynamic: true },
    });
    assert.equal(f1.status, 200);
    const f2 = await reqJson(`${base}/api/focus`, {
      method: 'POST',
      token: d1.token,
      body: { appId: 'antigravity', focused: true, visible: true, dynamic: true },
    });
    assert.equal(f2.status, 200);
    assert.equal(f2.json.focus.directives.antigravity.paused, false);
    assert.equal(f2.json.focus.directives.cherry.paused, true);
  } finally {
    await d1.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
