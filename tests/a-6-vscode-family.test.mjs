// A-6: VS Code family base + Cursor / Trae adapters (exe channel).
//
// Family design (S-6): the IDE skeleton is shared, the AI chat layer is
// per-app. The repo has no adapter inheritance mechanism, so the shared
// skeleton lives as data in src/adapters/vscode-base/parts-map.json (a
// directory without adapter.json, skipped by the loader) and each
// adapter copies + trims it against its own measured snapshot; these
// tests guard the no-drift rule (any skeleton part an adapter keeps
// must match the base selector-for-selector).
//
// Measured 2026-11-02: Cursor 3.27.22 (official user setup, per-user
// Inno install) accepts the debug port; its main window is the VS Code
// workbench page but a first-run logged-out screen leaves only
// .monaco-workbench rendered, so its map carries app.root only. Trae CN
// 3.3.84 (official CN edition, per-user Inno install) accepts the debug
// port (UA token TraeCN) but first run stops at a setup page, so its
// workbench is unmeasured: no target, empty map (dsh-style treatment).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adapterById, loadAdapters } from '../src/core/adapters.mjs';
import { parseSnapshotHtml } from '../src/core/dom-snapshot.mjs';
import { hitReport } from '../src/core/parts-hit.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { loadParts } from '../src/parts/parts.mjs';
import { channelFor, exeChannel } from '../src/channels/index.mjs';
import { createExeChannel, profileToChannelAdapter } from '../src/channels/exe.mjs';

const baseMap = JSON.parse(readFileSync(new URL('../src/adapters/vscode-base/parts-map.json', import.meta.url), 'utf8'));

test('base: skeleton only uses catalogue part ids and app.root is fully formed', () => {
  const ids = new Set(loadParts().parts.map((p) => p.id));
  for (const id of Object.keys(baseMap)) assert.ok(ids.has(id), 'base part in catalogue: ' + id);
  assert.deepEqual(Object.keys(baseMap['app.root']).sort(), ['required', 'scope', 'scopeBody', 'selector']);
  assert.equal(baseMap['app.root'].selector, '.monaco-workbench');
});

test('loader: cursor loads with the measured facts and no errors anywhere', () => {
  const { errors } = loadAdapters();
  assert.deepEqual(errors, []);
  const a = adapterById('cursor');
  assert.equal(a.name, 'Cursor');
  assert.equal(a.channel, 'exe');
  assert.equal(a.discover.uninstallDisplayName, 'Cursor');
  assert.deepEqual(a.discover.exeNames, ['Cursor.exe']);
  assert.equal(a.discover.envExe, 'DREAMSKIN_CURSOR_EXE');
  assert.deepEqual(a.testedVersions, ['3.27.22']);
  assert.deepEqual(a.target, { uaToken: 'Cursor', urlPattern: '^vscode-file://.*/workbench/workbench\\.html' });
  assert.equal(a.readySelector, '.monaco-workbench');
});

test('loader: trae loads with the measured facts; workbench facts stay undeclared', () => {
  const a = adapterById('trae');
  assert.equal(a.name, 'Trae CN');
  assert.equal(a.channel, 'exe');
  assert.equal(a.discover.uninstallDisplayName, 'Trae CN');
  assert.deepEqual(a.discover.exeNames, ['Trae CN.exe']);
  assert.equal(a.discover.envExe, 'DREAMSKIN_TRAE_EXE');
  assert.deepEqual(a.testedVersions, ['3.3.84']);
  assert.equal(a.target, undefined); // workbench URL unmeasured (first-run setup page)
  assert.equal(a.readySelector, undefined);
});

test('profile: cursor style id, measured parts layer, skeleton entry identical to base', () => {
  const p = appRuntimeById('cursor');
  assert.equal(p.styleId, 'dream-skin-2-cursor');
  assert.equal(p.liveId, 'dream-skin-2-cursor-live');
  assert.equal(p.channel, 'exe');
  assert.equal(p.uaToken, 'Cursor');
  if (process.platform === 'win32') assert.equal(p.exeName, 'Cursor.exe');
  assert.deepEqual(Object.keys(p.partsMap), ['app.root']);
  assert.deepEqual(p.partsMap['app.root'], baseMap['app.root']);
  assert.ok(p.partsCss.includes('.monaco-workbench'), 'parts layer renders the measured root anchor');
});

test('profile: trae style id and an honestly empty parts layer', () => {
  const p = appRuntimeById('trae');
  assert.equal(p.styleId, 'dream-skin-2-trae');
  assert.equal(p.channel, 'exe');
  if (process.platform === 'win32') assert.equal(p.exeName, 'Trae CN.exe');
  assert.deepEqual(Object.keys(p.partsMap), []);
  assert.equal(p.partsCss, '');
});

test('no drift: every skeleton part kept by cursor/trae matches the base verbatim', () => {
  for (const id of ['cursor', 'trae']) {
    const map = appRuntimeById(id).partsMap;
    for (const [part, entry] of Object.entries(map)) {
      if (baseMap[part]) assert.deepEqual(entry, baseMap[part], id + ' ' + part + ' must equal the base entry');
    }
  }
});

test('real snapshot: cursor mapped parts all hit on the measured logged-out DOM', () => {
  const html = readFileSync(new URL('./fixtures/dom-cursor-real.html', import.meta.url), 'utf8');
  const tree = parseSnapshotHtml(html);
  const rep = hitReport(appRuntimeById('cursor').partsMap, tree);
  assert.deepEqual(rep.partsMissing, []);
  assert.equal(rep.requiredMissing, 0);
  assert.equal(rep.mode, 'full');
});

test('real snapshot: trae setup-page fixture documents the pre-workbench state', () => {
  const html = readFileSync(new URL('./fixtures/dom-trae-real.html', import.meta.url), 'utf8');
  const tree = parseSnapshotHtml(html);
  // The setup page has no workbench at all: even the base app.root
  // selector must miss here, which is why trae declares no target/map.
  const rep = hitReport({ 'app.root': baseMap['app.root'] }, tree);
  assert.deepEqual(rep.partsOk, []);
  assert.equal(rep.requiredMissing, 1);
});

function fakeDeps(exeName, ua, over = {}) {
  const calls = [];
  const deps = {
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    findExe: () => exeName,
    freePort: async () => 54321,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    launchWithPort: async (exe, port) => { calls.push(['launchWithPort', exe, port]); return 4242; },
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    fetchVersion: async () => ({ 'User-Agent': ua }),
    ...over,
  };
  return { deps, calls };
}

test('channel: cursor and trae both route to the exe channel', () => {
  assert.equal(channelFor(appRuntimeById('cursor')), exeChannel);
  assert.equal(channelFor(appRuntimeById('trae')), exeChannel);
});

test('channel status: cursor three states with fake deps', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('cursor'));
  const ua = 'Mozilla/5.0 Cursor/3.27.22 Chrome/148.0.0.0 Electron/42.0.0';
  const notInstalled = await createExeChannel(fakeDeps('Cursor.exe', ua, { findExe: () => '' }).deps).status(adapter);
  assert.deepEqual(notInstalled, { installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '' });
  const idle = await createExeChannel(fakeDeps('Cursor.exe', ua).deps).status(adapter);
  assert.deepEqual(idle, { installed: true, running: false, debugPort: 0, skinActive: false, exe: 'Cursor.exe', version: '' });
  const running = await createExeChannel(fakeDeps('Cursor.exe', ua, {
    listProcesses: () => [{ pid: 9, isMain: true, debugPort: 9223 }],
    portAlive: async (p) => p === 9223,
  }).deps).status(adapter);
  assert.equal(running.running, true);
  assert.equal(running.debugPort, 9223);
  assert.equal(running.version, '3.27.22'); // uaToken Cursor measured on the real machine
});

test('channel status: trae installed/idle with fake deps', async () => {
  const adapter = profileToChannelAdapter(appRuntimeById('trae'));
  const notInstalled = await createExeChannel(fakeDeps('Trae CN.exe', '', { findExe: () => '' }).deps).status(adapter);
  assert.equal(notInstalled.installed, false);
  const idle = await createExeChannel(fakeDeps('Trae CN.exe', '').deps).status(adapter);
  assert.deepEqual(idle, { installed: true, running: false, debugPort: 0, skinActive: false, exe: 'Trae CN.exe', version: '' });
});
