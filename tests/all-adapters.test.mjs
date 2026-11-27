import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdapters } from '../src/core/adapters.mjs';
import { listRuntimeProfiles } from '../src/core/app-runtime.mjs';
import { getFallbackAppIconSvg } from '../src/core/app-icons.mjs';
import { defaultPortForApp } from '../src/prism/cdp/gentle-cdp.mjs';
import { compileAdapterPrismCss } from '../src/theme/prism-bridge.mjs';
import { applySkinModePreset, DEFAULT_CONFIG, resolveSkinComposition } from '../src/prism/shared/schema.mjs';
import { findExe } from '../src/core/app-process.mjs';

const EXPECTED_ADAPTERS = [
  'antigravity',
  'cherry',
  'codex',
  'dsh',
  'kiro',
  'minimax-code',
  'minimax-design',
  'opencode',
  'qoder',
  't3code',
  'vscode',
  'windsurf',
  'workbuddy',
  'zcode',
];

test('all 14 cross-platform adapters load with zero validation errors and zero absolute paths', () => {
  const { adapters, errors } = loadAdapters();
  assert.deepEqual(errors, [], `adapter validation errors: ${JSON.stringify(errors)}`);
  const ids = adapters.map((a) => a.id).sort();
  assert.deepEqual(ids, EXPECTED_ADAPTERS);
});

test('all 14 runtime profiles compile cleanly across optical, wallpaper, and hybrid modes with unique ports & bespoke SVG icons', () => {
  const profiles = listRuntimeProfiles();
  assert.equal(profiles.length, EXPECTED_ADAPTERS.length);

  const seenPorts = new Map();
  for (const p of profiles) {
    const port = p.prism?.defaultDebugPort || defaultPortForApp(p.id);
    assert.ok(port >= 9339 && port <= 9399, `port out of range for ${p.id}: ${port}`);
    assert.equal(seenPorts.has(port), false, `port collision ${port} between ${seenPorts.get(port)} and ${p.id}`);
    seenPorts.set(port, p.id);

    const svg = getFallbackAppIconSvg(p.id);
    assert.match(svg, /^<svg\b/, `missing bespoke fallback SVG for ${p.id}`);
    assert.doesNotMatch(svg, /#15192B/, `${p.id} fell back to generic default icon instead of bespoke brand icon`);

    for (const mode of ['optical', 'wallpaper', 'hybrid']) {
      const cfg = applySkinModePreset(DEFAULT_CONFIG, mode);
      const comp = resolveSkinComposition(cfg, { appId: p.id, hasWallpaper: true });
      const res = compileAdapterPrismCss({
        appId: p.id,
        partsMap: p.partsMap,
        extraCss: p.extraCss,
        mode: 'full',
        composition: comp,
      });
      assert.equal(res.skinMode, mode);
      assert.ok(res.adapterCss.length > 80, `compiled CSS too short for ${p.id} (${mode})`);
      assert.ok(res.coveredParts.includes('chat.composer'), `${p.id} must cover chat.composer for unclipped mascot + prism rim`);
      assert.ok(res.coveredParts.includes('app.sidebar'), `${p.id} must cover app.sidebar`);
    }
  }
});

test('real-machine discovery locates installed local Electron clients without hardcoded absolute paths', () => {
  const profiles = new Map(listRuntimeProfiles().map((p) => [p.id, p]));
  const mustFindExe = ['antigravity', 'dsh', 'cherry', 'zcode', 'minimax-code', 'minimax-design', 'qoder', 'opencode', 'workbuddy', 't3code', 'vscode'];
  for (const id of mustFindExe) {
    const p = profiles.get(id);
    assert.ok(p, `missing profile ${id}`);
    const exe = findExe(p, []);
    assert.ok(exe && exe.toLowerCase().endsWith('.exe'), `expected to auto-discover ${id}, got: "${exe}"`);
  }
  assert.match(findExe(profiles.get('dsh'), []), /DSH NEXT\.exe$/i);
});
