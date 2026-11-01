// T2-4 tests: dsh-plugin channel + plugin package template (plan 4.3 / 4.8).
// Everything runs against temp directories and fake documents - the plugin
// is NEVER installed into a real DSH profile in tests, and no DSH process
// is started or stopped (real-machine install needs the owner's explicit
// consent, V-CH-dsh-plugin, still pending).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDshPluginChannel, dshPluginChannel, buildPluginFiles, PLUGIN_NAME, PLUGIN_FILES } from '../src/channels/dsh-plugin.mjs';
import { channelFor } from '../src/channels/index.mjs';
import { VERSION } from '../src/core/version.mjs';
import { parseSkinFile } from '../src/theme/layers.mjs';
import { STYLE_IDS, applyLayers, removeLayers, parseSkinFile as parsePluginSkinFile } from '../src/channels/dsh-plugin/lib/overlay.js';
import { createSkinSync, skinFilePath } from '../src/channels/dsh-plugin/lib/main.js';

const adapter = { id: 'dsh', name: 'DeepSeek Harness' };

test('channel exposes the plan 4.3 interface plus install/uninstall/switch, and is registered', () => {
  assert.equal(dshPluginChannel.kind, 'dsh-plugin');
  for (const m of ['status', 'launch', 'stop', 'targets', 'install', 'uninstall', 'setEnabled', 'isEnabled']) {
    assert.equal(typeof dshPluginChannel[m], 'function', m);
  }
  assert.equal(channelFor('dsh-plugin'), dshPluginChannel);
  assert.equal(channelFor({ channel: 'dsh-plugin' }), dshPluginChannel);
});

test('plugin package builds: valid manifest, version substituted, all files present', () => {
  const files = buildPluginFiles();
  assert.deepEqual(Object.keys(files).sort(), [...PLUGIN_FILES].sort());
  const pkg = JSON.parse(files['package.json']);
  assert.equal(pkg.name, PLUGIN_NAME);
  assert.equal(pkg.main, 'lib/main.js');
  assert.equal(pkg.version, VERSION);
  for (const [rel, content] of Object.entries(files)) assert.ok(!content.includes('{{version}}'), rel + ' still has the placeholder');
});

test('plan 4.8 static assertions: no network, storage, cookie or session access anywhere', () => {
  const forbidden = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'document.cookie', 'sendBeacon', 'http://', 'https://'];
  const sources = {
    'channels/dsh-plugin.mjs': readFileSync(new URL('../src/channels/dsh-plugin.mjs', import.meta.url), 'utf8'),
    ...Object.fromEntries(Object.entries(buildPluginFiles()).map(([rel, c]) => ['plugin/' + rel, c])),
  };
  for (const [name, src] of Object.entries(sources)) {
    for (const token of forbidden) assert.ok(!src.includes(token), name + ' must not contain ' + token);
  }
  // The page-side layer applier must not read files or evaluate code either.
  const overlay = buildPluginFiles()['lib/overlay.js'];
  assert.ok(!overlay.includes('node:') && !overlay.includes('eval') && !overlay.includes('innerHTML'));
});

function fakeDoc() {
  const head = {
    children: [],
    appendChild(el) { if (!head.children.includes(el)) head.children.push(el); },
  };
  return {
    head,
    documentElement: head,
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(), id: '', textContent: '',
        remove() { const i = head.children.indexOf(el); if (i >= 0) head.children.splice(i, 1); },
      };
      return el;
    },
    getElementById(id) { return head.children.find((el) => el.id === id) || null; },
  };
}

test('overlay: applies three layers under the DreamSkin ids, empty layer removes, removeLayers clears', () => {
  const doc = fakeDoc();
  const total = applyLayers(doc, { parts: 'P', vars: 'VV', extra: '' });
  assert.equal(total, 3);
  assert.equal(doc.getElementById(STYLE_IDS.parts).textContent, 'P');
  assert.equal(doc.getElementById(STYLE_IDS.vars).textContent, 'VV');
  assert.equal(doc.getElementById(STYLE_IDS.extra), null); // empty layer = not created
  applyLayers(doc, { parts: '', vars: 'VV', extra: 'E' });
  assert.equal(doc.getElementById(STYLE_IDS.parts), null); // emptied layer is removed
  assert.equal(doc.getElementById(STYLE_IDS.extra).textContent, 'E');
  assert.equal(removeLayers(doc), 2);
  assert.equal(doc.head.children.length, 0);
});

test('overlay: skin file parsing matches the layered format contract', () => {
  const layered = JSON.stringify({ format: 'dreamskin-skin/1', layers: { vars: 'V', parts: 'P', extra: 'E' } });
  assert.deepEqual(parsePluginSkinFile(layered), { vars: 'V', parts: 'P', extra: 'E' });
  assert.deepEqual(parsePluginSkinFile('plain css'), { vars: '', parts: 'plain css', extra: '' });
  assert.equal(parsePluginSkinFile(''), null);
});

test('plugin sync core: follows the skin file under a fake LOCALAPPDATA', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-t24-sync-'));
  const skinDir = join(root, 'DreamSkin', 'dsh');
  mkdirSync(skinDir, { recursive: true });
  const env = { LOCALAPPDATA: root };
  assert.equal(skinFilePath(env), join(skinDir, 'active-skin.css'));
  const doc = fakeDoc();
  const { sync } = createSkinSync({ env, document: doc });
  assert.equal(sync(), true);
  assert.equal(doc.head.children.length, 0); // no skin file yet -> nothing injected
  writeFileSync(join(skinDir, 'active-skin.css'), JSON.stringify({ format: 'dreamskin-skin/1', layers: { vars: 'V', parts: 'P', extra: '' } }), 'utf8');
  sync();
  assert.equal(doc.getElementById(STYLE_IDS.parts).textContent, 'P');
  assert.equal(doc.getElementById(STYLE_IDS.vars).textContent, 'V');
});

function tempChannel(over = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ds-t24-'));
  const data = join(root, 'data');
  const host = join(root, 'host');
  mkdirSync(data, { recursive: true });
  mkdirSync(host, { recursive: true });
  let version = '9.9.9';
  const ch = createDshPluginChannel({
    dataDir: () => data,
    pluginsDir: () => host,
    version: () => version,
    now: () => '2026-01-01T00:00:00.000Z',
    ...over,
  });
  return { ch, root, data, host, setVersion: (v) => { version = v; } };
}

test('status defaults: switch off, plugin not installed, no skin', async () => {
  const { ch } = tempChannel();
  assert.deepEqual(await ch.status(adapter), {
    installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '',
    enabled: false, pluginInstalled: false,
  });
  assert.deepEqual(await ch.targets(adapter, 0), []);
  assert.equal(await ch.isEnabled(adapter), false);
});

test('install without consent is refused and writes nothing (V-CH-dsh-plugin)', async () => {
  const { ch, data, host } = tempChannel();
  await assert.rejects(() => ch.install(adapter), /明确同意/);
  await assert.rejects(() => ch.install(adapter, { consent: false }), /明确同意/);
  assert.deepEqual(readdirSync(host), []);
  assert.deepEqual(readdirSync(data), []);
});

test('install with an unconfigured plugin directory fails honestly, writes nothing', async () => {
  const { ch, data, host } = tempChannel({ pluginsDir: () => '' });
  await assert.rejects(() => ch.install(adapter, { consent: true }), /未配置/);
  assert.deepEqual(readdirSync(host), []);
  assert.deepEqual(readdirSync(data), []);
});

test('install with consent places the package and records a hashed manifest', async () => {
  const { ch, data, host } = tempChannel();
  const r = await ch.install(adapter, { consent: true });
  assert.equal(r.installed, true);
  assert.equal(r.version, '9.9.9');
  const target = join(host, PLUGIN_NAME);
  for (const rel of PLUGIN_FILES) assert.ok(existsSync(join(target, rel)), rel);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '9.9.9');
  const manifest = JSON.parse(readFileSync(join(data, 'plugin-install.json'), 'utf8'));
  assert.equal(manifest.files.length, PLUGIN_FILES.length);
  assert.ok(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  const st = await ch.status(adapter);
  assert.equal(st.pluginInstalled, true);
  assert.equal(st.installed, true);
  assert.equal(st.version, '9.9.9');
});

test('install refuses to overwrite a foreign directory of the same name', async () => {
  const { ch, host } = tempChannel();
  const target = join(host, PLUGIN_NAME);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'keep.txt'), 'not ours', 'utf8');
  await assert.rejects(() => ch.install(adapter, { consent: true }), /拒绝覆盖/);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'not ours');
});

test('launch gating: switch first, then install, then the skin file is written layered', async () => {
  const { ch, data } = tempChannel();
  await ch.install(adapter, { consent: true });
  await assert.rejects(() => ch.launch(adapter, { css: 'x' }), /默认关闭/);
  assert.deepEqual(await ch.setEnabled(adapter, true), { enabled: true });
  const r = await ch.launch(adapter, { layers: { vars: 'V', parts: 'P', extra: 'E' } });
  assert.deepEqual(r, { port: 0 });
  const written = parseSkinFile(readFileSync(join(data, 'active-skin.css'), 'utf8'));
  assert.deepEqual(written, { vars: 'V', parts: 'P', extra: 'E' });
  assert.equal((await ch.status(adapter)).skinActive, true);
});

test('launch when enabled but not installed is refused', async () => {
  const { ch } = tempChannel();
  await ch.setEnabled(adapter, true);
  await assert.rejects(() => ch.launch(adapter, { css: 'x' }), /尚未安装/);
});

test('stop removes the skin but keeps the plugin; switching off also removes the skin', async () => {
  const { ch, data } = tempChannel();
  await ch.install(adapter, { consent: true });
  await ch.setEnabled(adapter, true);
  await ch.launch(adapter, { css: 'body {}' });
  assert.deepEqual(await ch.stop(adapter), { stopped: true });
  assert.ok(!existsSync(join(data, 'active-skin.css')));
  assert.equal((await ch.status(adapter)).pluginInstalled, true);
  await ch.launch(adapter, { css: 'body {}' });
  await ch.setEnabled(adapter, false);
  assert.ok(!existsSync(join(data, 'active-skin.css')));
  assert.equal((await ch.status(adapter)).skinActive, false);
});

test('uninstall removes exactly what install placed and restores the host dir', async () => {
  const { ch, data, host } = tempChannel();
  writeFileSync(join(host, 'other.txt'), 'pre-existing', 'utf8'); // unrelated file must survive
  await ch.install(adapter, { consent: true });
  const r = await ch.uninstall(adapter);
  assert.equal(r.installed, false);
  assert.deepEqual([...r.removed].sort(), [...PLUGIN_FILES].sort());
  assert.deepEqual(r.leftBehind, []);
  assert.ok(!existsSync(join(host, PLUGIN_NAME)));
  assert.ok(!existsSync(join(data, 'plugin-install.json')));
  assert.equal(readFileSync(join(host, 'other.txt'), 'utf8'), 'pre-existing');
  // Second uninstall is a clean no-op.
  assert.deepEqual(await ch.uninstall(adapter), { installed: false, removed: [], leftBehind: [] });
});

test('reinstall upgrades in place using the previous manifest', async () => {
  const { ch, host, setVersion } = tempChannel();
  await ch.install(adapter, { consent: true });
  setVersion('9.9.10');
  const r = await ch.install(adapter, { consent: true });
  assert.equal(r.version, '9.9.10');
  const pkg = JSON.parse(readFileSync(join(host, PLUGIN_NAME, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '9.9.10');
  assert.equal((await ch.status(adapter)).version, '9.9.10');
});
