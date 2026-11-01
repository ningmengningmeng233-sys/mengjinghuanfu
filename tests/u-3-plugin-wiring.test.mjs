// U-3 单测：通道选择（core/channel-select.mjs）+ 插件桥（core/plugin-bridge.mjs）+ 入口接线冒烟。
// 桥的测试用临时目录的真 dsh-plugin 通道跑完整流程（开关 / 拒装 / 安装 / 卸载），不碰用户真实 DSH 数据；
// 入口冒烟用临时 DREAMSKIN_DATA_DIR，只调 plugin-status / 无 consent 的 plugin-install 这类不落真盘的命令。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectChannelKind } from '../src/core/channel-select.mjs';
import { createPluginBridge, pluginShellOf } from '../src/core/plugin-bridge.mjs';
import { createDshPluginChannel } from '../src/channels/dsh-plugin.mjs';

const DSH = { id: 'dsh', name: 'DSH', channel: 'exe', shells: [
  { id: 'desktop', channel: 'exe' }, { id: 'tauri', channel: 'webview2' }, { id: 'web', channel: 'dsh-plugin' }] };
const CHERRY = { id: 'cherry', name: 'Cherry Studio', channel: 'exe' };

test('selectChannelKind：默认通道 / 按外壳选 / 未知外壳报错', () => {
  assert.deepEqual(selectChannelKind(DSH), { kind: 'exe', shell: null });
  assert.equal(selectChannelKind(DSH, 'web').kind, 'dsh-plugin');
  assert.equal(selectChannelKind(DSH, 'tauri').kind, 'webview2');
  assert.throws(() => selectChannelKind(DSH, 'nope'), /没有名为 nope 的外壳/);
  assert.throws(() => selectChannelKind(CHERRY, 'web'), /没有声明任何外壳/);
  assert.equal(pluginShellOf(DSH).id, 'web');
  assert.equal(pluginShellOf(CHERRY), null);
});

test('plugin-bridge：临时目录里走完 开关->拒装->安装->关闭->卸载', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-u3-'));
  try {
    const data = join(root, 'data');
    const plugins = join(root, 'plugins');
    // dataDir 注入要跟 core/env.mjs 的真实契约一致：返回前先把目录建好（env.dataDir 就是这么做的）。
    const channel = createDshPluginChannel({ dataDir: () => { mkdirSync(data, { recursive: true }); return data; }, pluginsDir: () => plugins });
    const bridge = createPluginBridge({ channel, adapterOf: (id) => (id === 'dsh' ? DSH : CHERRY) });
    await assert.rejects(() => bridge.status('cherry'), /没有插件通道/);
    let s = await bridge.status('dsh');
    assert.deepEqual([s.enabled, s.installed], [false, false]); // 默认关闭、未安装
    await assert.rejects(() => bridge.install('dsh', false), /明确同意/); // 无 consent 拒装
    assert.equal(existsSync(join(plugins, 'dsh-plugin-dreamskin')), false); // 零写入
    await bridge.setEnabled('dsh', true);
    s = await bridge.status('dsh');
    assert.equal(s.enabled, true);
    const ins = await bridge.install('dsh', true);
    assert.equal(ins.installed, true);
    assert.equal(existsSync(join(plugins, 'dsh-plugin-dreamskin', 'package.json')), true);
    s = await bridge.status('dsh');
    assert.equal(s.installed, true);
    await bridge.setEnabled('dsh', false); // 关开关：皮肤覆盖移除（本流程没写皮肤，只验状态）
    s = await bridge.status('dsh');
    assert.equal(s.enabled, false);
    const un = await bridge.uninstall('dsh');
    assert.ok(un.removed.length >= 4);
    assert.equal(existsSync(join(plugins, 'dsh-plugin-dreamskin')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const ENTRY = fileURLToPath(new URL('../src/dreamskin.mjs', import.meta.url));
function runEntry(args, env) {
  try {
    const out = execFileSync(process.execPath, [ENTRY, ...args], { encoding: 'utf8', env, windowsHide: true, timeout: 120000 });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

test('入口接线冒烟：plugin-status 只读、无 consent 的 plugin-install 被拒、--shell 校验', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-u3e-'));
  try {
    const env = { ...process.env, DREAMSKIN_DATA_DIR: join(root, 'cherry') };
    delete env.DREAMSKIN_DSH_PLUGINS_DIR;
    const st = runEntry(['plugin-status', '--app', 'dsh'], env);
    assert.equal(st.code, 0, st.out);
    const j = JSON.parse(st.out);
    assert.deepEqual([j.enabled, j.installed], [false, false]);
    const ins = runEntry(['plugin-install', '--app', 'dsh'], env);
    assert.equal(ins.code, 1);
    assert.match(ins.out, /明确同意/);
    const bad = runEntry(['status', '--app', 'dsh', '--shell', 'nope'], env);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /没有名为 nope 的外壳/);
    const web = runEntry(['status', '--app', 'dsh', '--shell', 'web'], env);
    assert.equal(web.code, 0, web.out);
    const wj = JSON.parse(web.out);
    assert.equal(wj.channel, 'dsh-plugin');
    assert.deepEqual(wj.pluginChannel, { enabled: false, installed: false });
    assert.ok(!existsSync(join(root, 'dsh', 'plugin-install.json'))); // 全程没真装
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
