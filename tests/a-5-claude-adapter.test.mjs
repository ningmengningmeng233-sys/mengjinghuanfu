// A-5: Claude adapter (msix channel; package facts measured 2026-11-02).
//
// Measured on the real machine after installing Claude 4.4212.0.0 from
// the official download endpoint (Anthropic-signed setup): the app is
// an MSIX package (family Claude_pzs8sxrjxfjjc, main entry
// app\Claude.exe, Electron 44) and the launcher bridge resolves its
// AUMID. BUT the app refuses --remote-debugging-port: activated with
// the flag the process never appears (60 s timeline, two ports), while
// no-args and a harmless custom flag both start normally. So no CDP
// session, no DOM snapshot, and parts-map.json is intentionally empty
// (no invented anchors). See the A-5 evidence file / S-5 addendum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterById, loadAdapters } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { channelFor, msixChannel } from '../src/channels/index.mjs';
import { aumidOf, pickAppId } from '../src/channels/msix.mjs';

test('loader: claude loads with the measured package facts and no errors anywhere', () => {
  const { errors } = loadAdapters();
  assert.deepEqual(errors, []);
  const a = adapterById('claude');
  assert.equal(a.name, 'Claude');
  assert.equal(a.channel, 'msix');
  assert.equal(a.discover.msixPackageFamily, 'Claude_pzs8sxrjxfjjc');
  assert.deepEqual(a.discover.exeNames, ['Claude.exe']);
  assert.equal(a.discover.envExe, 'DREAMSKIN_CLAUDE_EXE');
  assert.equal(a.discover.uninstallDisplayName, 'Claude');
  assert.deepEqual(a.testedVersions, ['4.4212.0.0']);
  assert.equal(a.partsMap, 'parts-map.json');
  assert.equal(a.extraCss, 'extra.css');
  // No main-window facts were measurable (no CDP session exists).
  assert.equal(a.target, undefined);
  assert.equal(a.readySelector, undefined);
});

test('profile: msix runtime facts, own style id, empty parts layer', () => {
  const p = appRuntimeById('claude');
  assert.equal(p.id, 'claude');
  assert.equal(p.name, 'Claude');
  assert.equal(p.channel, 'msix');
  assert.equal(p.styleId, 'dream-skin-2-claude');
  assert.equal(p.liveId, 'dream-skin-2-claude-live');
  assert.equal(p.envExe, 'DREAMSKIN_CLAUDE_EXE');
  assert.deepEqual(Object.keys(p.partsMap), []);
  assert.equal(p.partsCss, '');
  assert.equal(typeof p.rules, 'string');
});

test('msix facts: AUMID composition and main-entry pick among the package apps', () => {
  assert.equal(aumidOf('Claude_pzs8sxrjxfjjc', 'Claude'), 'Claude_pzs8sxrjxfjjc!Claude');
  // The measured package carries four applications; the main entry is
  // the one whose executable is app\Claude.exe (verified live through
  // the launcher --resolve-aumid bridge).
  const apps = [
    { id: 'Claude', executable: 'app\\Claude.exe' },
    { id: 'SshAskpass', executable: 'app\\resources\\claude-ssh-askpass.exe' },
    { id: 'SshProxy', executable: 'app\\resources\\claude-ssh-proxy.exe' },
    { id: 'MakeDataFolder', executable: 'app\\resources\\claude-make-data-folder.exe' },
  ];
  assert.equal(pickAppId(apps, 'Claude.exe'), 'Claude');
});

test('channel: claude routes to the msix channel', () => {
  assert.equal(channelFor(appRuntimeById('claude')), msixChannel);
});
