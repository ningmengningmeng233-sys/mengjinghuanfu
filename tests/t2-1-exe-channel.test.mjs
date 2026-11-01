// T2-1 tests: exe channel implements the plan 4.3 Channel interface on top of
// core/app-process.mjs. All system operations are injected fakes - no real app
// is ever launched. The only real-OS test is freePort (binds loopback only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createExeChannel, exeChannel, profileToChannelAdapter } from '../src/channels/exe.mjs';
import { channelFor } from '../src/channels/index.mjs';
import { freePort } from '../src/core/app-process.mjs';
import { APPS } from '../src/core/apps.mjs';

const fakeAdapter = (over = {}) => ({
  id: 'fake', name: 'Fake App', exeName: 'Fake.exe', envExe: 'DREAMSKIN_FAKE_EXE', uninstallName: 'Fake',
  candidates: () => [], isMainTarget: (t) => !!t && t.type === 'page',
  restartNote: '测试备注', uaToken: 'FakeApp',
  ...over,
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    findExe: () => 'Fake.exe',
    freePort: async () => 54321,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    launchWithPort: async (exe, port) => { calls.push(['launchWithPort', exe, port]); return 4242; },
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    fetchVersion: async () => ({ 'User-Agent': 'Mozilla/5.0 FakeApp/9.8.7' }),
    ...over,
  };
  return { deps, calls };
}

test('channel exposes the plan 4.3 interface', () => {
  assert.equal(exeChannel.kind, 'exe');
  for (const m of ['status', 'launch', 'stop', 'targets']) assert.equal(typeof exeChannel[m], 'function', m);
});

test('status: not installed, not running', async () => {
  const { deps } = fakeDeps({ findExe: () => '' });
  const ch = createExeChannel(deps);
  const st = await ch.status(fakeAdapter());
  assert.deepEqual(st, { installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '' });
});

test('status: running with a live debug port reports port, version and skin state', async () => {
  const { deps } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9222 }],
    portAlive: async (p) => p === 9222,
  });
  const ch = createExeChannel(deps);
  const st = await ch.status(fakeAdapter({ skinActive: () => true }));
  assert.deepEqual(st, { installed: true, running: true, debugPort: 9222, skinActive: true, exe: 'Fake.exe', version: '9.8.7' });
});

test('status: a debug port in the command line that is not serving does not count', async () => {
  const { deps } = fakeDeps({ listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9222 }] });
  const ch = createExeChannel(deps);
  const st = await ch.status(fakeAdapter());
  assert.equal(st.running, true);
  assert.equal(st.debugPort, 0);
  assert.equal(st.version, '');
});

test('launch: cold start takes a free port, launches and waits for the main window', async () => {
  const { deps, calls } = fakeDeps();
  const ch = createExeChannel(deps);
  const r = await ch.launch(fakeAdapter());
  assert.deepEqual(r, { port: 54321 });
  assert.deepEqual(calls, [['launchWithPort', 'Fake.exe', 54321], ['waitForMainTargets', 54321]]);
});

test('launch: already running with a live debug port is reused, nothing is launched', async () => {
  const { deps, calls } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9222 }],
    portAlive: async (p) => p === 9222,
  });
  const ch = createExeChannel(deps);
  assert.deepEqual(await ch.launch(fakeAdapter()), { port: 9222 });
  assert.deepEqual(calls, []);
});

test('launch: running without a debug port refuses without restart and quotes restartNote', async () => {
  const { deps } = fakeDeps({ listProcesses: () => [{ pid: 7, isMain: true }] });
  const ch = createExeChannel(deps);
  await assert.rejects(() => ch.launch(fakeAdapter()), /正在运行/);
  await assert.rejects(() => ch.launch(fakeAdapter()), /测试备注/);
});

test('launch: restart closes the app first, then launches', async () => {
  const seq = [];
  const { deps } = fakeDeps({
    listProcesses: () => (seq.includes('stopped') ? [] : [{ pid: 7, isMain: true }]),
    stopApp: async () => { seq.push('stopped'); return { stopped: true, forced: false }; },
    launchWithPort: async () => { seq.push('launched'); return 1; },
  });
  const ch = createExeChannel(deps);
  assert.deepEqual(await ch.launch(fakeAdapter(), { restart: true }), { port: 54321 });
  assert.deepEqual(seq, ['stopped', 'launched']);
});

test('launch: missing installation is a clear error naming the env var', async () => {
  const { deps } = fakeDeps({ findExe: () => '' });
  const ch = createExeChannel(deps);
  await assert.rejects(() => ch.launch(fakeAdapter()), /找不到 Fake App 安装位置/);
  await assert.rejects(() => ch.launch(fakeAdapter()), /DREAMSKIN_FAKE_EXE/);
});

test('launch: an explicit free port is honoured and freePort is not consulted', async () => {
  let freeCalled = false;
  const { deps, calls } = fakeDeps({ freePort: async () => { freeCalled = true; return 11111; } });
  const ch = createExeChannel(deps);
  assert.deepEqual(await ch.launch(fakeAdapter(), { port: 46000 }), { port: 46000 });
  assert.equal(freeCalled, false);
  assert.deepEqual(calls[0], ['launchWithPort', 'Fake.exe', 46000]);
});

test('stop: graceful maps to a non-forced stop, non-graceful allows force', async () => {
  const { deps, calls } = fakeDeps();
  const ch = createExeChannel(deps);
  await ch.stop(fakeAdapter());
  await ch.stop(fakeAdapter(), { graceful: false });
  assert.deepEqual(calls, [['stopApp', { force: false }], ['stopApp', { force: true }]]);
});

test('targets: delegates to listMainTargets with adapter and port', async () => {
  const { deps } = fakeDeps();
  const ch = createExeChannel(deps);
  const a = fakeAdapter();
  const ts = await ch.targets(a, 46000);
  assert.equal(ts.length, 1);
  assert.equal(ts[0].port, 46000);
});

test('bad adapters are rejected with a clear error', async () => {
  const { deps } = fakeDeps();
  const ch = createExeChannel(deps);
  await assert.rejects(() => ch.status(null), /adapter 不能为空/);
  await assert.rejects(() => ch.status({ id: 'x' }), /缺少 exeName/);
});

test('profileToChannelAdapter carries the apps.mjs profile facts', () => {
  const a = profileToChannelAdapter(APPS.cherry);
  assert.equal(a.id, 'cherry');
  assert.equal(a.exeName, APPS.cherry.exeName);
  assert.equal(a.envExe, APPS.cherry.envExe);
  assert.equal(a.uaToken, APPS.cherry.uaToken);
  assert.equal(a.restartNote, APPS.cherry.restartNote);
  assert.equal(a.isMainTarget, APPS.cherry.isMainTarget);
  assert.ok(Array.isArray(a.candidates()) && a.candidates().length > 0);
  assert.equal(a.skinActive, undefined);
  const b = profileToChannelAdapter(APPS.zcode, { skinActive: () => true });
  assert.equal(b.skinActive(), true);
  assert.equal(b.isHelperCmd, APPS.zcode.isHelperCmd);
});

test('channelFor resolves exe and refuses unimplemented channels', () => {
  assert.equal(channelFor('exe'), exeChannel);
  assert.equal(channelFor({ channel: 'exe' }), exeChannel);
  assert.throws(() => channelFor('msix'), /尚未实现/);
  assert.throws(() => channelFor({ channel: 'webview2' }), /尚未实现/);
});

test('freePort really avoids occupied ports (V-CH-exe, loopback only)', async () => {
  const srv = createServer();
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  try {
    const occupied = srv.address().port;
    const p = await freePort();
    assert.ok(p > 0 && p !== occupied, 'freePort returned ' + p + ', occupied is ' + occupied);
  } finally {
    await new Promise((res) => srv.close(res));
  }
});
