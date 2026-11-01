// A-3: MiniMax Design adapter (exe channel, Velopack layout per S-3).
//
// S-3 verified read-only: version 3.0.13, Electron, Velopack layout (root
// exe + Update.exe + current/ + packages/), and the uninstall registry
// InstallLocation pointing at the install ROOT with the launcher exe in
// that root. DOM anchors and the main-window URL were NOT verified, so the
// adapter declares no target/readySelector and parts-map.json stays empty:
// only the variables layer can apply until Q-1 captures a sanitized DOM
// snapshot. This file locks the loader facts, the profile assembly and the
// exe-channel behavior against fake dependencies (no app is started).
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterById, loadAdapters } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { channelFor } from '../src/channels/index.mjs';
import { exeChannel } from '../src/channels/index.mjs';
import { createExeChannel, profileToChannelAdapter } from '../src/channels/exe.mjs';

test('loader: minimax-design loads with the S-3 facts and no errors anywhere', () => {
  const { errors } = loadAdapters();
  assert.deepEqual(errors, []);
  const a = adapterById('minimax-design');
  assert.equal(a.name, 'MiniMax Design');
  assert.equal(a.channel, 'exe');
  assert.equal(a.discover.uninstallDisplayName, 'MiniMax Design');
  assert.deepEqual(a.discover.exeNames, ['MiniMax Design.exe']);
  assert.equal(a.discover.envExe, 'DREAMSKIN_MINIMAX_DESIGN_EXE');
  assert.deepEqual(a.testedVersions, ['3.0.13']); // S-3 read-only inventory; full flow unverified
  // Nothing unverified is declared: DOM anchors + main-window URL wait for Q-1.
  assert.equal(a.target, undefined);
  assert.equal(a.readySelector, undefined);
  assert.equal(a.partsMap, 'parts-map.json');
  assert.equal(a.extraCss, 'extra.css');
});

test('profile: exe runtime facts, own style id, empty parts layer', () => {
  const p = appRuntimeById('minimax-design');
  assert.equal(p.id, 'minimax-design');
  assert.equal(p.name, 'MiniMax Design');
  assert.equal(p.channel, 'exe');
  assert.equal(p.styleId, 'dream-skin-2-minimax-design');
  assert.equal(p.liveId, 'dream-skin-2-minimax-design-live');
  assert.equal(p.uninstallName, 'MiniMax Design');
  assert.equal(p.envExe, 'DREAMSKIN_MINIMAX_DESIGN_EXE');
  if (process.platform === 'win32') assert.equal(p.exeName, 'MiniMax Design.exe');
  assert.deepEqual(p.partsMap, {});
  assert.equal(p.partsCss, '');
  // extra.css is header-comment only for now: rules text carries no rule block.
  assert.equal(typeof p.rules, 'string');
  assert.ok(!p.rules.includes('{'), 'extra layer must not contain rules yet');
  // No target facts yet: target matcher falls back to the plain file:// rule.
  assert.equal(p.uaToken, '');
  assert.equal(p.restartNote, '');
});

test('discovery facts: registry name for the Velopack root + per-user default candidate', () => {
  const p = appRuntimeById('minimax-design');
  // S-3: the uninstall entry's InstallLocation IS the install root and the
  // launcher exe sits in that root, so the exe channel's registry fallback
  // (InstallLocation + exeName) resolves the real install; the static
  // candidate covers the Velopack per-user default location.
  assert.equal(p.uninstallName, 'MiniMax Design');
  if (process.platform === 'win32') {
    const cands = p.candidates();
    assert.equal(cands.length, 1);
    assert.ok(cands[0].endsWith('Programs\\MiniMax Design\\MiniMax Design.exe'.replaceAll('\\\\', '\\')), cands[0]);
  }
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    findExe: () => 'MiniMax Design.exe',
    freePort: async () => 54321,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    launchWithPort: async (exe, port) => { calls.push(['launchWithPort', exe, port]); return 4242; },
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    fetchVersion: async () => ({ 'User-Agent': 'Mozilla/5.0 MiniMaxDesign/3.0.13' }),
    ...over,
  };
  return { deps, calls };
}

test('channel: minimax-design routes to the exe channel', () => {
  assert.equal(channelFor(appRuntimeById('minimax-design')), exeChannel);
});

test('channel status three states with fake deps', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('minimax-design'));
  const notInstalled = await createExeChannel(fakeDeps({ findExe: () => '' }).deps).status(adapter);
  assert.deepEqual(notInstalled, { installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '' });
  const idle = await createExeChannel(fakeDeps().deps).status(adapter);
  assert.deepEqual(idle, { installed: true, running: false, debugPort: 0, skinActive: false, exe: 'MiniMax Design.exe', version: '' });
  const running = await createExeChannel(fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9222 }],
    portAlive: async (p) => p === 9222,
  }).deps).status(adapter);
  assert.equal(running.installed, true);
  assert.equal(running.running, true);
  assert.equal(running.debugPort, 9222);
  // The adapter declares no uaToken yet (unverified), so no version is parsed
  // from the UA even though the fake UA carries one - honest until Q-1.
  assert.equal(running.version, '');
});

test('channel launch: cold start goes through launchWithPort with a free port', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('minimax-design'));
  const { deps, calls } = fakeDeps();
  const r = await createExeChannel(deps).launch(adapter);
  assert.deepEqual(r, { port: 54321 });
  assert.deepEqual(calls.filter((c) => c[0] === 'launchWithPort'), [['launchWithPort', 'MiniMax Design.exe', 54321]]);
});
