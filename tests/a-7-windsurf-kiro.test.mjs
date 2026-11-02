// A-7: Windsurf / Kiro adapters (inherit the A-6 VS Code skeleton).
//
// UNVERIFIED adapters: neither app is installed on this machine (owner
// decision 2026-11-02: P2, do not install yet). Both adapters are pure
// plan + S-6 data: exe channel, the standard per-user Programs layout,
// and a parts-map that is a verbatim copy of the shared skeleton in
// src/adapters/vscode-base/. Nothing is measured, so there are no
// testedVersions, no target and no readySelector; each extra.css
// carries the UNVERIFIED marker. After either app gets installed, a
// real DOM snapshot must correct the map before it is trusted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adapterById, loadAdapters } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { channelFor, exeChannel } from '../src/channels/index.mjs';

const baseMap = JSON.parse(readFileSync(new URL('../src/adapters/vscode-base/parts-map.json', import.meta.url), 'utf8'));

for (const [id, name, exeName, envExe] of [
  ['windsurf', 'Windsurf', 'Windsurf.exe', 'DREAMSKIN_WINDSURF_EXE'],
  ['kiro', 'Kiro', 'Kiro.exe', 'DREAMSKIN_KIRO_EXE'],
]) {
  test('loader: ' + id + ' loads as an unverified skeleton adapter, no errors anywhere', () => {
    const { errors } = loadAdapters();
    assert.deepEqual(errors, []);
    const a = adapterById(id);
    assert.equal(a.name, name);
    assert.equal(a.channel, 'exe');
    assert.deepEqual(a.discover.exeNames, [exeName]);
    assert.equal(a.discover.envExe, envExe);
    assert.equal(a.discover.uninstallDisplayName, name);
    assert.equal(a.testedVersions, undefined); // nothing measured yet
    assert.equal(a.target, undefined);
    assert.equal(a.readySelector, undefined);
  });

  test('profile: ' + id + ' parts layer is the base skeleton verbatim and renders', () => {
    const p = appRuntimeById(id);
    assert.equal(p.styleId, 'dream-skin-2-' + id);
    assert.equal(p.channel, 'exe');
    assert.deepEqual(p.partsMap, baseMap);
    assert.ok(p.partsCss.includes('.monaco-workbench'), 'skeleton root renders');
    assert.ok(p.partsCss.includes('.part.sidebar'), 'skeleton sidebar renders');
    assert.equal(channelFor(p), exeChannel);
  });

  test('marker: ' + id + ' extra.css carries the UNVERIFIED notice', () => {
    const css = readFileSync(new URL('../src/adapters/' + id + '/extra.css', import.meta.url), 'utf8');
    assert.ok(css.includes('UNVERIFIED'), 'extra.css must say the adapter is unmeasured');
    const profile = appRuntimeById(id);
    assert.ok(profile.extraCss.includes('UNVERIFIED'), 'rendered extra layer keeps the marker');
  });
}
