// T2-3 tests: webview2 channel (plan 4.3 / T2-3). All system operations are
// injected fakes - no real Tauri/WebView2 shell is launched (none is installed
// on this machine, see spike S-2). The env-var contract is tested purely via
// webview2Env plus a spawn fake that applies it exactly like the default one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebview2Channel, webview2Channel, webview2Env, WEBVIEW2_ENV_KEY } from '../src/channels/webview2.mjs';
import { channelFor } from '../src/channels/index.mjs';

const fakeAdapter = (over = {}) => ({
  id: 'dsh-tauri', name: 'DSH (Tauri)', exeName: 'dsh_desktop.exe', envExe: 'DREAMSKIN_DSH_TAURI_EXE',
  uninstallName: 'dsh_desktop', candidates: () => [], isMainTarget: (t) => !!t && t.type === 'page',
  restartNote: '测试备注', uaToken: 'DSH',
  ...over,
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    findExe: () => 'dsh_desktop.exe',
    freePort: async () => 54321,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    // Mirrors the default spawnWithEnv contract: child env = webview2Env(base, port), no CLI args.
    spawnWithEnv: async (exe, port, base) => { calls.push(['spawnWithEnv', exe, port, webview2Env(base, port)]); return 4242; },
    envBase: () => ({ PATH: 'base-path' }),
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    fetchVersion: async () => ({ 'User-Agent': 'Mozilla/5.0 DSH/0.2.1' }),
    ...over,
  };
  return { deps, calls };
}

test('channel exposes the plan 4.3 interface and is registered', () => {
  assert.equal(webview2Channel.kind, 'webview2');
  for (const m of ['status', 'launch', 'stop', 'targets']) assert.equal(typeof webview2Channel[m], 'function', m);
  assert.equal(channelFor('webview2'), webview2Channel);
  assert.equal(channelFor({ channel: 'webview2' }), webview2Channel);
});

test('webview2Env sets the debug flag on an empty base', () => {
  const env = webview2Env({}, 9100);
  assert.equal(env[WEBVIEW2_ENV_KEY], '--remote-debugging-port=9100');
});

test('webview2Env preserves other keys and other arguments, replaces an old debug port', () => {
  const base = { PATH: 'p', [WEBVIEW2_ENV_KEY]: '--disable-gpu --remote-debugging-port=1111 --foo=bar' };
  const env = webview2Env(base, 9100);
  assert.equal(env.PATH, 'p');
  assert.equal(env[WEBVIEW2_ENV_KEY], '--disable-gpu --foo=bar --remote-debugging-port=9100');
  // the base object itself is not mutated
  assert.equal(base[WEBVIEW2_ENV_KEY], '--disable-gpu --remote-debugging-port=1111 --foo=bar');
});

test('launch: cold start spawns the host with the env var only, then waits for targets', async () => {
  const { deps, calls } = fakeDeps();
  const r = await createWebview2Channel(deps).launch(fakeAdapter());
  assert.deepEqual(r, { port: 54321 });
  assert.equal(calls[0][0], 'spawnWithEnv');
  assert.equal(calls[0][1], 'dsh_desktop.exe');
  assert.equal(calls[0][2], 54321);
  const childEnv = calls[0][3];
  assert.equal(childEnv[WEBVIEW2_ENV_KEY], '--remote-debugging-port=54321');
  assert.equal(childEnv.PATH, 'base-path');
  assert.deepEqual(calls[1], ['waitForMainTargets', 54321]);
});

test('launch: the parent process environment is never modified', async () => {
  const before = process.env[WEBVIEW2_ENV_KEY];
  process.env[WEBVIEW2_ENV_KEY] = '--preexisting';
  try {
    const { deps, calls } = fakeDeps({ envBase: () => process.env });
    await createWebview2Channel(deps).launch(fakeAdapter());
    assert.equal(process.env[WEBVIEW2_ENV_KEY], '--preexisting'); // untouched
    const childEnv = calls[0][3];
    assert.equal(childEnv[WEBVIEW2_ENV_KEY], '--preexisting --remote-debugging-port=54321'); // child got the merged copy
  } finally {
    if (before === undefined) delete process.env[WEBVIEW2_ENV_KEY];
    else process.env[WEBVIEW2_ENV_KEY] = before;
  }
});

test('status: running with a live debug port reports port and version', async () => {
  const { deps } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9222 }],
    portAlive: async (p) => p === 9222,
  });
  const st = await createWebview2Channel(deps).status(fakeAdapter({ skinActive: () => true }));
  assert.deepEqual(st, { installed: true, running: true, debugPort: 9222, skinActive: true, exe: 'dsh_desktop.exe', version: '0.2.1' });
});

test('status: not installed, not running', async () => {
  const { deps } = fakeDeps({ findExe: () => '' });
  const st = await createWebview2Channel(deps).status(fakeAdapter());
  assert.deepEqual(st, { installed: false, running: false, debugPort: 0, skinActive: false, exe: '', version: '' });
});

test('launch: already running with a live debug port is reused', async () => {
  const { deps, calls } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9222 }],
    portAlive: async (p) => p === 9222,
  });
  const r = await createWebview2Channel(deps).launch(fakeAdapter());
  assert.deepEqual(r, { port: 9222 });
  assert.deepEqual(calls, []);
});

test('launch: running without a debug port refuses without restart, restarts on request', async () => {
  const seq = [];
  const { deps, calls } = fakeDeps({
    listProcesses: () => (seq.includes('stopped') ? [] : [{ pid: 7, isMain: true }]),
    stopApp: async () => { seq.push('stopped'); return { stopped: true, forced: false }; },
  });
  const ch = createWebview2Channel(deps);
  await assert.rejects(() => ch.launch(fakeAdapter()), /正在运行/);
  await assert.rejects(() => ch.launch(fakeAdapter()), /测试备注/);
  assert.deepEqual(await ch.launch(fakeAdapter(), { restart: true }), { port: 54321 });
  assert.deepEqual(seq, ['stopped']);
  assert.equal(calls[0][0], 'spawnWithEnv');
});

test('launch: missing installation is a clear error naming the env var', async () => {
  const { deps } = fakeDeps({ findExe: () => '' });
  await assert.rejects(() => createWebview2Channel(deps).launch(fakeAdapter()), /找不到 DSH \(Tauri\) 安装位置/);
  await assert.rejects(() => createWebview2Channel(deps).launch(fakeAdapter()), /DREAMSKIN_DSH_TAURI_EXE/);
});

test('stop and targets delegate to app-process primitives', async () => {
  const { deps, calls } = fakeDeps();
  const ch = createWebview2Channel(deps);
  await ch.stop(fakeAdapter());
  await ch.stop(fakeAdapter(), { graceful: false });
  assert.deepEqual(calls, [['stopApp', { force: false }], ['stopApp', { force: true }]]);
  const ts = await ch.targets(fakeAdapter(), 46000);
  assert.equal(ts[0].port, 46000);
});

test('bad adapters are rejected with a clear error', async () => {
  const { deps } = fakeDeps();
  const ch = createWebview2Channel(deps);
  await assert.rejects(() => ch.status(null), /adapter 不能为空/);
  await assert.rejects(() => ch.status({ id: 'x' }), /缺少 exeName/);
});
