// A-1 tests: Codex adapter (plan 4.2 / A-1) + page-level conflict detection
// (plan 3 coexistence / 7.5 V-A10). Everything runs on fakes / pure data -
// no real app is launched and no real package is queried.
// The MSIX package fixture mirrors the S-1 measurements (package family,
// version, two apps in the manifest) but is pure test data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterById, loadAdapters, adapterErrors } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { channelFor } from '../src/channels/index.mjs';
import { createMsixChannel, profileToMsixChannelAdapter } from '../src/channels/msix.mjs';
import { profileToChannelAdapter } from '../src/channels/exe.mjs';
import {
  FOREIGN_SKIN_TOOLS, conflictToolsOf, pageStyleIdsExpr, detectForeignStyles, foreignStyleMessage,
} from '../src/core/conflicts.mjs';
import { partChecksOf } from '../src/core/health.mjs';

const FAMILY = 'OpenAI.Codex_2p2nqsd0c76g0';
const PKG = {
  name: 'OpenAI.Codex', packageFamilyName: FAMILY, version: '26.1021.3705.0',
  installLocation: '',
  apps: [
    { id: 'CodexCoreCommandRunner', executable: 'app/resources/codex-command-runner.exe' },
    { id: 'App', executable: 'app/ChatGPT.exe' },
  ],
};

test('codex adapter loads through the loader with no validation errors anywhere', () => {
  const ids = loadAdapters().adapters.map((a) => a.id);
  assert.ok(ids.includes('codex'), 'registered: ' + ids.join(', '));
  assert.deepEqual(adapterErrors(), []);
  const data = adapterById('codex');
  assert.equal(data.channel, 'msix');
  assert.equal(data.discover.msixPackageFamily, FAMILY); // S-1 measurement
  assert.deepEqual(data.discover.exeNames, ['ChatGPT.exe']); // S-1: manifest entry app/ChatGPT.exe
  assert.deepEqual(data.conflicts, ['codex-dream-skin']); // plan 3 / 4.2
});

test('profile assembly: msix facts, own style id, empty parts layer (no verified anchors yet)', () => {
  const p = appRuntimeById('codex');
  assert.equal(p.channel, 'msix');
  assert.equal(p.msixPackageFamily, FAMILY);
  assert.equal(p.exeName, 'ChatGPT.exe');
  assert.equal(p.styleId, 'dream-skin-2-codex'); // ours, derived from id - different from the other tool (plan 3)
  assert.equal(p.liveId, 'dream-skin-2-codex-live');
  assert.deepEqual(p.partsMap, {}); // S-1: no DOM anchor is verified - empty map, health/downloads degrade path
  assert.equal(p.partsCss, '');
  assert.ok(!/[{}]/.test(p.rules), 'no style rules before real-machine anchors exist: ' + p.rules);
  assert.deepEqual(partChecksOf(p.partsMap), []);
  assert.equal(typeof p.isMainTarget, 'function');
  assert.equal(channelFor(p).kind, 'msix');
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    queryPackage: async () => PKG,
    activate: async (aumid, args) => { calls.push(['activate', aumid, args]); return 777; },
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    portAlive: async () => false,
    stopApp: async () => ({ stopped: true, forced: false }),
    listMainTargets: async () => [{ id: 't1', type: 'page' }],
    waitForMainTargets: async () => [{ id: 't1', type: 'page' }],
    isPortFree: async () => true,
    rand: () => 0,
    ...over,
  };
  return { deps, calls };
}

test('end to end on fakes: profile -> msix channel adapter -> status resolves the S-1 AUMID', async () => {
  const adapter = profileToMsixChannelAdapter(appRuntimeById('codex'));
  assert.equal(adapter.packageFamily, FAMILY);
  const { deps } = fakeDeps();
  const st = await createMsixChannel(deps).status(adapter);
  assert.equal(st.installed, true);
  assert.equal(st.version, '26.1021.3705.0');
  // pickAppId matched the ChatGPT.exe entry (not the command runner) via profile.exeName.
  assert.equal(st.aumid, FAMILY + '!App');
  assert.equal(st.conflict, null);
});

test('end to end on fakes: fresh launch activates through the bridge with an in-segment port', async () => {
  const adapter = profileToMsixChannelAdapter(appRuntimeById('codex'));
  const { deps, calls } = fakeDeps();
  const r = await createMsixChannel(deps).launch(adapter, {});
  assert.equal(r.port, 9340); // first port of our own segment (rand () => 0)
  assert.deepEqual(calls.filter((c) => c[0] === 'activate'), [['activate', FAMILY + '!App', '--remote-debugging-port=9340']]);
});

test('entry-shaped adapter (shared profileToChannelAdapter) also satisfies the msix channel', async () => {
  // dreamskin.mjs builds ONE channel adapter for every channel via exe.mjs's
  // profileToChannelAdapter; the msix channel asserts `packageFamily` - this
  // locks the A-1 wiring that `status --app codex` depends on.
  const adapter = profileToChannelAdapter(appRuntimeById('codex'));
  assert.equal(adapter.channel, 'msix');
  assert.equal(adapter.packageFamily, FAMILY);
  const { deps } = fakeDeps();
  const st = await createMsixChannel(deps).status(adapter);
  assert.equal(st.installed, true);
  assert.equal(st.aumid, FAMILY + '!App');
});

test('channel conflict states: foreign debug port is flagged and launch refuses (choose one)', async () => {
  const adapter = profileToMsixChannelAdapter(appRuntimeById('codex'));
  const { deps } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9229 }],
    portAlive: async (p) => p === 9229,
  });
  const ch = createMsixChannel(deps);
  const st = await ch.status(adapter);
  assert.deepEqual(st.conflict, { kind: 'foreign-debug-port', port: 9229 });
  await assert.rejects(() => ch.launch(adapter, {}), /二选一/);
});

test('channel conflict states: our own in-segment port is reused, not a conflict', async () => {
  const adapter = profileToMsixChannelAdapter(appRuntimeById('codex'));
  const { deps, calls } = fakeDeps({
    listProcesses: () => [{ pid: 8, isMain: true, debugPort: 9350 }],
    portAlive: async (p) => p === 9350,
  });
  const ch = createMsixChannel(deps);
  const st = await ch.status(adapter);
  assert.equal(st.conflict, null);
  const r = await ch.launch(adapter, {});
  assert.equal(r.port, 9350);
  assert.deepEqual(calls.filter((c) => c[0] === 'activate'), []);
});

const CODEX = appRuntimeById('codex');
const TOOLS = conflictToolsOf(CODEX);
const OWN = [CODEX.styleId, CODEX.styleId + '-vars', CODEX.styleId + '-extra', CODEX.liveId];

test('conflict tooling: only adapters declaring conflicts get tools; cherry gets none', () => {
  assert.equal(TOOLS.length, 1);
  assert.equal(TOOLS[0].id, 'codex-dream-skin');
  assert.equal(TOOLS[0].name, FOREIGN_SKIN_TOOLS['codex-dream-skin'].name);
  assert.deepEqual(conflictToolsOf(appRuntimeById('cherry')), []);
  assert.deepEqual(conflictToolsOf({}), []);
  assert.deepEqual(conflictToolsOf({ conflicts: ['no-such-tool'] }), []);
});

test('page conflict state 1: no foreign style -> null', () => {
  assert.equal(detectForeignStyles([], { ownIds: OWN, tools: TOOLS }), null);
  assert.equal(detectForeignStyles(['some-app-own-style'], { ownIds: OWN, tools: TOOLS }), null);
  assert.equal(detectForeignStyles(null, { ownIds: OWN, tools: TOOLS }), null);
});

test('page conflict state 2: only our own styles -> null (not mistaken for foreign)', () => {
  assert.equal(detectForeignStyles([...OWN], { ownIds: OWN, tools: TOOLS }), null);
});

test('page conflict state 3: foreign style present -> hit with tool + ids, message says choose one', () => {
  const hit = detectForeignStyles([...OWN, 'codex-dream-skin'], { ownIds: OWN, tools: TOOLS });
  assert.equal(hit.tool, 'codex-dream-skin');
  assert.equal(hit.name, 'Codex-Dream-Skin');
  assert.deepEqual(hit.hits, ['codex-dream-skin']);
  const hit2 = detectForeignStyles(['codex-dream-skin-style'], { ownIds: OWN, tools: TOOLS });
  assert.deepEqual(hit2.hits, ['codex-dream-skin-style']); // brand prefix match
  const msg = foreignStyleMessage('Codex', hit);
  assert.ok(msg.includes('Codex') && msg.includes('Codex-Dream-Skin') && msg.includes('二选一'));
  assert.ok(msg.includes('没有注入任何样式'));
});

test('page style id expression only lists style ids (plan 4.8: no content, no storage, no network)', () => {
  const expr = pageStyleIdsExpr();
  assert.ok(expr.includes("querySelectorAll('style[id]')"));
  assert.ok(!/localStorage|cookie|fetch\(|XMLHttpRequest|textContent/.test(expr), expr);
});
