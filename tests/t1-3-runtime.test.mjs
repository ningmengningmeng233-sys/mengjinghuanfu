// T1-3 tests: Cherry / ZCode formally migrated to adapters (plan 4.2 / 6 T1-3).
// Proves: adapter.json + parts-map.json + extra.css are the single source of
// app facts (old core/apps.mjs, parts/maps.mjs, theme/zcode-skin-css.mjs are
// gone); the runtime builder assembles profiles the entry/channel consume;
// target matching is data-driven; unknown --app fails with a clear message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterById, loadAdapters } from '../src/core/adapters.mjs';
import { appRuntimeById, listRuntimeProfiles, makeIsMainTarget, buildCherryCss } from '../src/core/app-runtime.mjs';
import { renderPartsCss } from '../src/parts/parts.mjs';
import { VERSION } from '../src/core/version.mjs';
import { channelFor } from '../src/channels/index.mjs';
import { profileToChannelAdapter } from '../src/channels/exe.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const adaptersDir = join(root, 'src', 'adapters');

test('the old second source of app facts is gone', () => {
  for (const rel of ['src/core/apps.mjs', 'src/parts/maps.mjs', 'src/theme/zcode-skin-css.mjs']) {
    assert.equal(existsSync(join(root, rel)), false, rel + ' should have been retired');
  }
});

test('formal adapters load clean and declare their parts-map / extra.css', () => {
  const { adapters, errors } = loadAdapters();
  assert.deepEqual(errors, []);
  // 适配器集合随 A 系列增长，不再断言全表；下面的循环契约（每个适配器都声明并备齐
  // parts-map.json + extra.css）对新适配器同样成立、照常守住。
  const ids = adapters.map((a) => a.id).sort();
  for (const id of ['cherry', 'zcode']) assert.ok(ids.includes(id), 'missing bundled adapter ' + id + ' in: ' + ids.join(', '));
  for (const a of adapters) {
    assert.equal(a.partsMap, 'parts-map.json');
    assert.equal(a.extraCss, 'extra.css');
    assert.ok(existsSync(join(adaptersDir, a.id, 'parts-map.json')));
    assert.ok(existsSync(join(adaptersDir, a.id, 'extra.css')));
  }
});

test('runtime profiles carry the confirmed 2.1 facts', () => {
  const cherry = appRuntimeById('cherry');
  assert.equal(cherry.name, 'Cherry Studio');
  assert.equal(cherry.channel, 'exe');
  assert.equal(cherry.readySelector, '[data-ui="app.main"]');
  assert.equal(cherry.uaToken, 'CherryStudio');
  assert.equal(cherry.envExe, 'DREAMSKIN_CHERRY_EXE');
  assert.equal(cherry.uninstallName, 'Cherry Studio');
  assert.equal(cherry.styleId, 'dream-skin-2-cherry');
  assert.equal(cherry.liveId, 'dream-skin-2-cherry-live');
  assert.equal(cherry.userCssId, 'user-defined-custom-css');
  assert.equal(cherry.shortcutName, 'Cherry Studio (梦境换肤)');
  assert.equal(cherry.restartNote, '聊天记录不受影响，未发送的输入框内容会丢失');
  assert.deepEqual(cherry.testedVersions, ['2.1.4', '2.1.6']);
  assert.equal(cherry.isHelperCmd, undefined);

  const zcode = appRuntimeById('zcode');
  assert.equal(zcode.name, 'ZCode');
  assert.equal(zcode.readySelector, '[data-workspace-shell]');
  assert.equal(zcode.uaToken, 'ZCode');
  assert.equal(zcode.envExe, 'DREAMSKIN_ZCODE_EXE');
  assert.equal(zcode.styleId, 'dream-skin-2-zcode');
  assert.equal(zcode.userCssId, '');
  assert.equal(zcode.shortcutName, 'ZCode (梦境换肤)');
  assert.equal(zcode.restartNote, '正在跑的任务会被中断，项目和对话记录不受影响');
  assert.deepEqual(zcode.testedVersions, ['3.15.3']);
});

test('candidates expand %ENV% placeholders (win32)', () => {
  if (process.platform !== 'win32') return;
  const cherry = appRuntimeById('cherry');
  const cc = cherry.candidates();
  assert.equal(cc.length, 3);
  for (const c of cc) { assert.ok(!c.includes('%'), c); assert.ok(c.endsWith('Cherry Studio.exe'), c); }
  const zc = appRuntimeById('zcode').candidates();
  assert.equal(zc.length, 2);
  for (const c of zc) { assert.ok(!c.includes('%'), c); assert.ok(c.endsWith('ZCode.exe'), c); }
});

test('helper process pattern is data (zcode) and absent for cherry', () => {
  const zcode = appRuntimeById('zcode');
  assert.equal(typeof zcode.isHelperCmd, 'function');
  assert.equal(zcode.isHelperCmd('node zcode.cjs app-server'), true);
  assert.equal(zcode.isHelperCmd('electron __zcode-plugin-host'), true);
  assert.equal(zcode.isHelperCmd('ZCode.exe --type=renderer'), false);
});

const fileUrl = (...segs) => 'file:///' + segs.join('/');
const item = (url, extra = {}) => ({ type: 'page', id: 'ABC1', url, title: '', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/ABC1', ...extra });

test('cherry main target matching is data-driven and matches 2.1', () => {
  const cherry = appRuntimeById('cherry');
  assert.equal(cherry.isMainTarget(item(fileUrl('X:', 'app', 'windows', 'main', 'index.html')), 9222), true);
  assert.equal(cherry.isMainTarget(item(fileUrl('X:', 'app', 'windows', 'main', 'index.html') + '?x=1'), 9222), true);
  assert.equal(cherry.isMainTarget(item(fileUrl('X:', 'app', 'windows', 'other', 'index.html')), 9222), false);
  assert.equal(cherry.isMainTarget(item(fileUrl('X:', 'app', 'windows', 'main', 'index.html'), { type: 'other' }), 9222), false);
  assert.equal(cherry.isMainTarget(item(fileUrl('X:', 'app', 'windows', 'main', 'index.html')), 9999), false);
});

test('zcode main target matching is data-driven and matches 2.1', () => {
  const zcode = appRuntimeById('zcode');
  const main = fileUrl('X:', 'ZCode', 'resources', 'app', 'out', 'renderer', 'index.html');
  assert.equal(zcode.isMainTarget(item(main, { title: 'ZCode' }), 9222), true);
  // query is ignored (main window carries switches like supportsSettings=true)
  assert.equal(zcode.isMainTarget(item(main + '?supportsSettings=true', { title: 'ZCode' }), 9222), true);
  // reject by title and by url tail/hash, like the 2.1 hand-written matcher
  assert.equal(zcode.isMainTarget(item(main, { title: 'Settings' }), 9222), false);
  assert.equal(zcode.isMainTarget(item(main + '#/settings', { title: 'ZCode' }), 9222), false);
  assert.equal(zcode.isMainTarget(item(fileUrl('X:', 'ZCode', 'resources', 'app', 'out', 'renderer', 'login.html')), 9222), false);
});

test('parts-map lives in the adapter dirs and renders into the profile', () => {
  for (const id of ['cherry', 'zcode']) {
    const p = appRuntimeById(id);
    const mapFromFile = JSON.parse(readFileSync(join(adaptersDir, id, 'parts-map.json'), 'utf8'));
    assert.deepEqual(p.partsMap, mapFromFile);
    assert.equal(p.partsCss, renderPartsCss(mapFromFile));
    assert.ok(p.partsCss.length > 1000);
    assert.ok(!p.partsCss.includes('{{'), 'unexpanded placeholder in parts layer');
    const extraFromFile = readFileSync(join(adaptersDir, id, 'extra.css'), 'utf8');
    assert.equal(p.extraCss, extraFromFile.split('{{version}}').join(VERSION));
    assert.ok(!p.extraCss.includes('{{version}}'), 'version placeholder left in extra layer');
    assert.equal(p.rules, [p.partsCss, p.extraCss].join('\n\n'));
  }
  assert.ok(appRuntimeById('cherry').partsCss.includes('#app-sidebar'));
  assert.ok(appRuntimeById('zcode').partsCss.includes('[data-workspace-shell]'));
});

test('a data-only fake adapter also gets a runtime profile (V-C4 runtime part)', () => {
  const dir = mkdtempSync(join(root, 'build', 't13-runtime-'));
  try {
    const sub = join(dir, 'fake-good');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'adapter.json'), JSON.stringify({
      id: 'fake-good', name: 'Fake Good', schema: 'dreamskin-adapter/1', channel: 'exe',
      discover: { exeNames: ['Fake.exe'], envExe: 'DREAMSKIN_FAKE_EXE' }, partsMap: 'parts-map.json',
    }), 'utf8');
    writeFileSync(join(sub, 'parts-map.json'), '{}', 'utf8');
    const p = appRuntimeById('fake-good', dir);
    assert.equal(p.id, 'fake-good');
    assert.equal(p.name, 'Fake Good');
    assert.equal(p.partsCss, '');
    assert.equal(typeof p.isMainTarget, 'function');
    assert.equal(typeof p.candidates, 'function');
    assert.equal(listRuntimeProfiles(dir).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('channel wiring consumes runtime profiles unchanged', () => {
  const cherry = appRuntimeById('cherry');
  assert.equal(channelFor(cherry), channelFor('exe'));
  const ca = profileToChannelAdapter(cherry);
  assert.equal(ca.isMainTarget, cherry.isMainTarget);
  assert.equal(ca.exeName, cherry.exeName);
  assert.equal(ca.candidates, cherry.candidates);
});

test('buildCherryCss legacy interface still composes rules + vars', () => {
  const css = buildCherryCss('dark-gold');
  assert.ok(css.includes('--ds-bg:'));
  assert.ok(css.includes('#app-sidebar'));
  assert.ok(buildCherryCss('ink-gold').includes('--ds-bg:'));
  assert.throws(() => buildCherryCss('no-such-preset'), /未知预设/);
});

test('unknown --app fails clearly (entry + shim)', () => {
  for (const rel of ['src/dreamskin.mjs', 'src/skin-cherry.mjs']) {
    const r = spawnSync(process.execPath, [join(root, rel), 'status', '--app', 'no-such-app'], { encoding: 'utf8', timeout: 60000 });
    assert.notEqual(r.status, 0, rel + ' should fail');
    const out = (r.stdout || '') + (r.stderr || '');
    assert.ok(out.includes('Unknown adapter: no-such-app'), rel + ' output: ' + out.slice(0, 300));
    // 注册清单随新适配器增长（A 系列起）：断言首尾与分隔形态，不再写死全表。
    assert.ok(out.includes('registered: cherry'), rel + ' output: ' + out.slice(0, 300));
    assert.ok(/, zcode\)/.test(out), rel + ' output: ' + out.slice(0, 300));
  }
});
