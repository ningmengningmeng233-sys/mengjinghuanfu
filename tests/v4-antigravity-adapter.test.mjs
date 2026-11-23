import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAdapters } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { detectInstalledPluginConflicts, conflictToolsOf, detectForeignStyles } from '../src/core/conflicts.mjs';

test('antigravity adapter: loads cleanly with zero schema errors as first-class adapter', () => {
  const { adapters, errors } = loadAdapters();
  assert.deepEqual(errors, []);
  const agy = adapters.find((a) => a.id === 'antigravity');
  assert.ok(agy, 'antigravity adapter must be registered');
  assert.equal(agy.channel, 'exe');

  const profile = appRuntimeById('antigravity');
  assert.equal(profile.id, 'antigravity');
  assert.equal(profile.prism.defaultDebugPort, 9339);
  assert.equal(profile.prism.browserHoleSupport, true);

  // Main target matcher accepts Antigravity Hub https://127.0.0.1:<port>/ and rejects DevTools/plugin://
  assert.equal(
    profile.isMainTarget(
      {
        type: 'page',
        id: 'HUB1',
        url: 'https://127.0.0.1:64016/',
        title: 'Antigravity',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9339/devtools/page/HUB1',
      },
      9339,
    ),
    true,
  );
  assert.equal(
    profile.isMainTarget(
      {
        type: 'page',
        id: 'DEV1',
        url: 'devtools://devtools/bundled/inspector.html',
        title: 'DevTools',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9339/devtools/page/DEV1',
      },
      9339,
    ),
    false,
  );
});

test('conflicts: detects installed & enabled obsidian-prism plugin and returns user-friendly Chinese guidance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-conf-'));
  const pluginsDir = join(dir, 'plugins');
  const configPath = join(dir, 'config.json');
  try {
    mkdirSync(join(pluginsDir, 'obsidian-prism'), { recursive: true });
    writeFileSync(join(pluginsDir, 'obsidian-prism', 'plugin.json'), JSON.stringify({ name: 'obsidian-prism', disabled: false }));
    writeFileSync(configPath, JSON.stringify({ plugins: { 'obsidian-prism': { enabled: true } } }));

    const profile = appRuntimeById('antigravity');
    const hits = detectInstalledPluginConflicts({ app: profile, pluginsDir, configPath });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].tool, 'obsidian-prism');
    assert.ok(hits[0].message.includes('Obsidian Prism'));

    // When disabled in config.json -> no conflict
    writeFileSync(configPath, JSON.stringify({ plugins: { 'obsidian-prism': { enabled: false } } }));
    const none = detectInstalledPluginConflicts({ app: profile, pluginsDir, configPath });
    assert.equal(none.length, 0);

    // Page-level conflict detection also recognizes legacy agy-ws-css
    const tools = conflictToolsOf(profile);
    const pageHit = detectForeignStyles(['agy-ws-css'], { ownIds: ['agy-prism-css'], tools });
    assert.ok(pageHit && pageHit.tool === 'agy-plugin-wallpaper-engine');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
