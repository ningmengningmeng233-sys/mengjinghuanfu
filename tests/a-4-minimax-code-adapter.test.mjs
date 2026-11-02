// A-4: MiniMax Code adapter (exe channel, electron-builder install per S-4).
//
// S-4 verified read-only: version 3.1.0, Electron, electron-builder
// per-user install tooling (Uninstall exe, app-update.yml, elevate.exe);
// the exe name "MiniMax Code.exe" comes from the Start Menu shortcut
// target. Measured limits on this machine: custom install directory and
// an EMPTY InstallLocation in the uninstall entry, so static discovery
// cannot locate it while it is not running (process scan / env override
// still can). DOM anchors and the main-window URL were verified later
// (2026-11-02 real-machine verification, see the A-4 evidence addendum):
// the settled main window is app://./archon, the UA token is
// MiniMaxAgent/<version>, and parts-map.json carries the 7 parts that
// were present in the real home-view snapshot. Note the measured launch
// behaviour: a cold start with our debug port only lives in a bootstrap
// instance; the durable main process re-spawns with its OWN debug port.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adapterById, loadAdapters } from '../src/core/adapters.mjs';
import { parseSnapshotHtml } from '../src/core/dom-snapshot.mjs';
import { hitReport } from '../src/core/parts-hit.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { channelFor, exeChannel } from '../src/channels/index.mjs';
import { createExeChannel, profileToChannelAdapter } from '../src/channels/exe.mjs';

test('loader: minimax-code loads with the S-4 facts and no errors anywhere', () => {
  const { errors } = loadAdapters();
  assert.deepEqual(errors, []);
  const a = adapterById('minimax-code');
  assert.equal(a.name, 'MiniMax Code');
  assert.equal(a.channel, 'exe');
  assert.equal(a.discover.uninstallDisplayName, 'MiniMax Code');
  assert.deepEqual(a.discover.exeNames, ['MiniMax Code.exe']);
  assert.equal(a.discover.envExe, 'DREAMSKIN_MINIMAX_CODE_EXE');
  assert.deepEqual(a.testedVersions, ['3.1.0']); // S-4 read-only inventory; full flow unverified
  assert.deepEqual(a.target, { uaToken: 'MiniMaxAgent', urlPattern: '^app://.*/archon' });
  assert.equal(a.readySelector, '[data-testid="sidebar-base-card"]');
  assert.equal(a.partsMap, 'parts-map.json');
  assert.equal(a.extraCss, 'extra.css');
});

test('profile: exe runtime facts, own style id, measured parts layer', () => {
  const p = appRuntimeById('minimax-code');
  assert.equal(p.id, 'minimax-code');
  assert.equal(p.name, 'MiniMax Code');
  assert.equal(p.channel, 'exe');
  assert.equal(p.styleId, 'dream-skin-2-minimax-code');
  assert.equal(p.liveId, 'dream-skin-2-minimax-code-live');
  assert.equal(p.uninstallName, 'MiniMax Code');
  assert.equal(p.envExe, 'DREAMSKIN_MINIMAX_CODE_EXE');
  if (process.platform === 'win32') assert.equal(p.exeName, 'MiniMax Code.exe');
  assert.deepEqual(Object.keys(p.partsMap), [
    'app.root', 'app.sidebar', 'app.sidebar.item', 'app.topbar',
    'app.content', 'chat.composer', 'chat.composer.input',
  ]);
  assert.ok(p.partsCss.includes('[data-testid="sidebar-base-card"]'), 'parts layer renders the measured anchors');
  assert.equal(typeof p.rules, 'string');
  assert.equal(p.uaToken, 'MiniMaxAgent');
  assert.equal(p.restartNote, '');
});

test('discovery facts: per-user default candidate for the electron-builder layout', () => {
  const p = appRuntimeById('minimax-code');
  assert.equal(p.uninstallName, 'MiniMax Code');
  if (process.platform === 'win32') {
    const cands = p.candidates();
    assert.equal(cands.length, 1);
    assert.ok(cands[0].endsWith('Programs\\MiniMax Code\\MiniMax Code.exe'.replaceAll('\\\\', '\\')), cands[0]);
  }
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    findExe: () => 'MiniMax Code.exe',
    freePort: async () => 54321,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    launchWithPort: async (exe, port) => { calls.push(['launchWithPort', exe, port]); return 4242; },
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    fetchVersion: async () => ({ 'User-Agent': 'Mozilla/5.0 MiniMaxAgent/3.1.0' }),
    ...over,
  };
  return { deps, calls };
}

test('channel: minimax-code routes to the exe channel', () => {
  assert.equal(channelFor(appRuntimeById('minimax-code')), exeChannel);
});

test('channel status three states with fake deps', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('minimax-code'));
  const notInstalled = await createExeChannel(fakeDeps({ findExe: () => '' }).deps).status(adapter);
  assert.deepEqual(notInstalled, { installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '' });
  const idle = await createExeChannel(fakeDeps().deps).status(adapter);
  assert.deepEqual(idle, { installed: true, running: false, debugPort: 0, skinActive: false, exe: 'MiniMax Code.exe', version: '' });
  const running = await createExeChannel(fakeDeps({
    listProcesses: () => [{ pid: 9, isMain: true, debugPort: 9223 }],
    portAlive: async (p) => p === 9223,
  }).deps).status(adapter);
  assert.equal(running.installed, true);
  assert.equal(running.running, true);
  assert.equal(running.debugPort, 9223);
  assert.equal(running.version, '3.1.0'); // uaToken MiniMaxAgent measured on the real machine
});

test('real snapshot: every mapped part hits on the measured home-view DOM', () => {
  const html = readFileSync(new URL('./fixtures/dom-minimax-code-real.html', import.meta.url), 'utf8');
  const tree = parseSnapshotHtml(html);
  const p = appRuntimeById('minimax-code');
  const rep = hitReport(p.partsMap, tree);
  assert.deepEqual(rep.partsMissing, []);
  assert.equal(rep.requiredMissing, 0);
  assert.equal(rep.mode, 'full');
});

test('channel launch: cold start goes through launchWithPort with a free port', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('minimax-code'));
  const { deps, calls } = fakeDeps();
  const r = await createExeChannel(deps).launch(adapter);
  assert.deepEqual(r, { port: 54321 });
  assert.deepEqual(calls.filter((c) => c[0] === 'launchWithPort'), [['launchWithPort', 'MiniMax Code.exe', 54321]]);
});
