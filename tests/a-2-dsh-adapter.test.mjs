// A-2: DSH adapter (plan A-2: one Web UI, channel auto-selected per shell).
//
// Facts are from spike S-2 (read-only inventory) plus a read-only recheck
// during this work order: DSH Desktop 2.0.18 is installed (community
// Electron shell by Anywhere Labs, embedded harness 0.2.1-rc.2), its exe
// is "DSH Desktop.exe", the uninstall entry is "DSH Desktop 2.0.18" with an
// EMPTY InstallLocation - so static discovery relies on the running
// process / candidates / env override, exactly like A-4. The Web UI has
// NO verified DOM anchors (S-2: no data-* anchors in the bundle), so
// parts-map.json stays empty and no target/readySelector is declared:
// only the variables layer can apply until Q-1 captures a sanitized DOM
// snapshot. The adapter declares three shells (desktop exe / tauri
// webview2 / browser-mode dsh-plugin); the tauri shell deliberately has
// no exeNames - its binaries were never measured on a real machine, so
// it can never be auto-detected yet (no guessed selectors or exe names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterById, loadAdapters, validateAdapter } from '../src/core/adapters.mjs';
import { appRuntimeById, selectShell } from '../src/core/app-runtime.mjs';
import { channelFor, exeChannel } from '../src/channels/index.mjs';
import { createExeChannel, profileToChannelAdapter } from '../src/channels/exe.mjs';

test('loader: dsh loads with the S-2 facts and no errors anywhere', () => {
  const { errors } = loadAdapters();
  assert.deepEqual(errors, []);
  const a = adapterById('dsh');
  assert.equal(a.name, 'DeepSeek Harness');
  assert.equal(a.channel, 'exe'); // default route: the installed desktop shell
  assert.equal(a.discover.uninstallDisplayName, 'DSH Desktop');
  assert.deepEqual(a.discover.exeNames, ['DSH Desktop.exe']);
  assert.equal(a.discover.envExe, 'DREAMSKIN_DSH_EXE');
  assert.deepEqual(a.testedVersions, ['2.0.18']); // DSH Desktop shell version, S-2 inventory
  // Nothing unverified is declared: DOM anchors + main-window URL wait for Q-1.
  assert.equal(a.target, undefined);
  assert.equal(a.readySelector, undefined);
  assert.equal(a.partsMap, 'parts-map.json');
  assert.equal(a.extraCss, 'extra.css');
});

test('loader: shells declaration covers exe / webview2 / dsh-plugin, tauri without exe names', () => {
  const a = adapterById('dsh');
  assert.deepEqual(a.shells.map((s) => [s.id, s.channel]), [
    ['desktop', 'exe'],
    ['tauri', 'webview2'],
    ['web', 'dsh-plugin'],
  ]);
  assert.deepEqual(a.shells[0].exeNames, ['DSH Desktop.exe']);
  // Not measured on any real machine -> not declared (no guessing).
  assert.equal(a.shells[1].exeNames, undefined);
  assert.equal(a.shells[2].url, 'http://127.0.0.1:3080'); // S-2: dsh web default
});

test('loader validation: malformed shells are rejected with clear errors', () => {
  const base = adapterById('dsh');
  const badChannel = { ...base, shells: [{ id: 'x', channel: 'nope' }] };
  assert.ok(validateAdapter(badChannel).some((e) => e.includes('shells[0].channel')));
  const dup = { ...base, shells: [{ id: 'x', channel: 'exe' }, { id: 'x', channel: 'exe' }] };
  assert.ok(validateAdapter(dup).some((e) => e.includes('duplicates')));
  const badExe = { ...base, shells: [{ id: 'x', channel: 'exe', exeNames: [] }] };
  assert.ok(validateAdapter(badExe).some((e) => e.includes('shells[0].exeNames')));
  const abs = { ...base, shells: [{ id: 'x', channel: 'exe', exeNames: ['D:\\Apps\\X.exe'] }] };
  assert.ok(validateAdapter(abs).some((e) => e.includes('absolute path')));
});

test('profile: exe runtime facts, own style id, empty parts layer, shells passthrough', () => {
  const p = appRuntimeById('dsh');
  assert.equal(p.id, 'dsh');
  assert.equal(p.name, 'DeepSeek Harness');
  assert.equal(p.channel, 'exe');
  assert.equal(p.styleId, 'dream-skin-2-dsh');
  assert.equal(p.liveId, 'dream-skin-2-dsh-live');
  assert.equal(p.uninstallName, 'DSH Desktop');
  assert.equal(p.envExe, 'DREAMSKIN_DSH_EXE');
  if (process.platform === 'win32') assert.equal(p.exeName, 'DSH Desktop.exe');
  assert.deepEqual(p.partsMap, {});
  assert.equal(p.partsCss, '');
  assert.equal(typeof p.rules, 'string');
  assert.ok(!p.rules.includes('{'), 'extra layer must not contain rules yet');
  assert.equal(p.uaToken, '');
  assert.equal(p.shells.length, 3);
  assert.deepEqual(p.shells[1].exeNames, []); // normalized: undeclared -> empty
  assert.equal(p.shells[2].url, 'http://127.0.0.1:3080');
});

test('discovery facts: per-user default candidate (custom installs need process/env)', () => {
  const p = appRuntimeById('dsh');
  if (process.platform === 'win32') {
    const cands = p.candidates();
    assert.equal(cands.length, 1);
    assert.ok(cands[0].endsWith('Programs\\DSH Desktop\\DSH Desktop.exe'.replaceAll('\\\\', '\\')), cands[0]);
  }
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    findExe: () => 'DSH Desktop.exe',
    freePort: async () => 54321,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    launchWithPort: async (exe, port) => { calls.push(['launchWithPort', exe, port]); return 4242; },
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    fetchVersion: async () => ({ 'User-Agent': 'Mozilla/5.0 DSH/2.0.18' }),
    ...over,
  };
  return { deps, calls };
}

test('channel: dsh default route is the exe channel', () => {
  assert.equal(channelFor(appRuntimeById('dsh')), exeChannel);
});

test('channel status three states with fake deps', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('dsh'));
  const notInstalled = await createExeChannel(fakeDeps({ findExe: () => '' }).deps).status(adapter);
  assert.deepEqual(notInstalled, { installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '' });
  const idle = await createExeChannel(fakeDeps().deps).status(adapter);
  assert.deepEqual(idle, { installed: true, running: false, debugPort: 0, skinActive: false, exe: 'DSH Desktop.exe', version: '' });
  const running = await createExeChannel(fakeDeps({
    listProcesses: () => [{ pid: 9, isMain: true, debugPort: 9222 }],
    portAlive: async (p) => p === 9222,
  }).deps).status(adapter);
  assert.equal(running.running, true);
  assert.equal(running.debugPort, 9222);
  // No uaToken declared yet (unverified), so no version is parsed - honest until Q-1.
  assert.equal(running.version, '');
});

test('selectShell: a running shell wins over an installed one', () => {
  const p = appRuntimeById('dsh');
  const hit = selectShell(p, (s) => ({ installed: true, running: true }));
  assert.equal(hit.id, 'desktop');
  assert.equal(hit.channel, 'exe');
  assert.equal(hit.via, 'running');
});

test('selectShell: installed-only picks the shell and its webview2 channel', () => {
  // Synthetic profile: same shape as a future fully-measured DSH adapter
  // whose tauri shell DOES declare exe names (none are declared today).
  const profile = {
    shells: [
      { id: 'desktop', name: 'd', channel: 'exe', exeNames: ['DSH Desktop.exe'] },
      { id: 'tauri', name: 't', channel: 'webview2', exeNames: ['dsh-tauri.exe'] },
      { id: 'web', name: 'w', channel: 'dsh-plugin', exeNames: [] },
    ],
  };
  const hit = selectShell(profile, (s) => ({ installed: s.id === 'tauri', running: false }));
  assert.equal(hit.id, 'tauri');
  assert.equal(hit.channel, 'webview2');
  assert.equal(hit.via, 'installed');
});

test('selectShell: nothing detected -> null, browser mode is never auto-selected', () => {
  const p = appRuntimeById('dsh');
  assert.equal(selectShell(p, () => ({ installed: false, running: false })), null);
  // Even if a detect callback claims everything, shells without exeNames
  // (tauri today, and the web shell by design) are skipped.
  const hit = selectShell(p, () => ({ installed: true, running: false }));
  assert.equal(hit.id, 'desktop');
});
