// T2-2 tests: msix channel (plan 4.3 / T2-2). All system operations are
// injected fakes - no real app is launched, no package is queried for real.
// The MSIX package used below mirrors the S-1 measurements (package family,
// two apps in the manifest) but is pure test data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createMsixChannel, msixChannel, profileToMsixChannelAdapter,
  parsePackageInfo, pickAppId, aumidOf, isMsixPort, pickMsixPort, MSIX_PORT_RANGE,
} from '../src/channels/msix.mjs';
import { channelFor } from '../src/channels/index.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';

const FAMILY = 'OpenAI.Codex_2p2nqsd0c76g0';
const PKG = {
  name: 'OpenAI.Codex', packageFamilyName: FAMILY, version: '26.1021.3705.0',
  installLocation: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1021.3705.0_x64__2p2nqsd0c76g0',
  apps: [
    { id: 'CodexCoreCommandRunner', executable: 'app/resources/codex-command-runner.exe' },
    { id: 'App', executable: 'app/ChatGPT.exe' },
  ],
};

const fakeAdapter = (over = {}) => ({
  id: 'codex', name: 'Codex', channel: 'msix', packageFamily: FAMILY, exeName: 'ChatGPT.exe',
  isMainTarget: (t) => !!t && t.type === 'page', restartNote: '测试备注', uaToken: 'Codex',
  conflicts: ['codex-dream-skin'],
  ...over,
});

function fakeDeps(over = {}) {
  const calls = [];
  const deps = {
    queryPackage: async () => PKG,
    activate: async (aumid, args) => { calls.push(['activate', aumid, args]); return 777; },
    listProcesses: () => [],
    debugPortOf: (p) => (p && p.debugPort) || 0,
    portAlive: async () => false,
    stopApp: async (app, opts) => { calls.push(['stopApp', opts]); return { stopped: true, forced: false }; },
    listMainTargets: async (app, port) => [{ id: 't1', type: 'page', port }],
    waitForMainTargets: async (app, port) => { calls.push(['waitForMainTargets', port]); return [{ id: 't1', type: 'page' }]; },
    isPortFree: async () => true,
    rand: () => 0,
    ...over,
  };
  return { deps, calls };
}

test('channel exposes the plan 4.3 interface and is registered', () => {
  assert.equal(msixChannel.kind, 'msix');
  for (const m of ['status', 'launch', 'stop', 'targets']) assert.equal(typeof msixChannel[m], 'function', m);
  assert.equal(channelFor('msix'), msixChannel);
  assert.equal(channelFor({ channel: 'msix' }), msixChannel);
});

test('parsePackageInfo normalises PS output shapes and rejects garbage', () => {
  const fromJson = parsePackageInfo(JSON.stringify({
    Name: 'OpenAI.Codex', PackageFamilyName: FAMILY,
    Version: { Major: 26, Minor: 1021, Build: 3705, Revision: 0 },
    InstallLocation: 'X', Apps: [{ Id: 'App', Executable: 'app/ChatGPT.exe' }],
  }));
  assert.equal(fromJson.version, '26.1021.3705.0');
  assert.deepEqual(fromJson.apps, [{ id: 'App', executable: 'app/ChatGPT.exe' }]);
  assert.equal(parsePackageInfo('not json'), null);
  assert.equal(parsePackageInfo(''), null);
  assert.equal(parsePackageInfo({ Name: 'x' }), null);
  assert.equal(parsePackageInfo(null), null);
});

test('pickAppId prefers the executable match, then App, then the first entry', () => {
  assert.equal(pickAppId(PKG.apps, 'ChatGPT.exe'), 'App');
  assert.equal(pickAppId(PKG.apps, 'chatgpt.exe'), 'App');
  assert.equal(pickAppId([{ id: 'Runner', executable: 'r.exe' }, { id: 'App', executable: 'a.exe' }], 'zzz.exe'), 'App');
  assert.equal(pickAppId([{ id: 'Only', executable: 'o.exe' }], 'zzz.exe'), 'Only');
  assert.equal(pickAppId([], 'x.exe'), '');
  assert.equal(aumidOf(FAMILY, 'App'), FAMILY + '!App');
  assert.equal(aumidOf(FAMILY, ''), '');
});

test('port segment membership', () => {
  assert.ok(isMsixPort(MSIX_PORT_RANGE[0]) && isMsixPort(MSIX_PORT_RANGE[1]));
  assert.ok(!isMsixPort(MSIX_PORT_RANGE[0] - 1) && !isMsixPort(9229) && !isMsixPort(0));
});

test('pickMsixPort stays in segment and skips occupied ports', async () => {
  const busy = new Set([9340, 9341]);
  const p = await pickMsixPort(async (x) => !busy.has(x), () => 0);
  assert.equal(p, 9342);
  await assert.rejects(() => pickMsixPort(async () => false, () => 0), /全部占用/);
});

test('status: not installed', async () => {
  const { deps } = fakeDeps({ queryPackage: async () => null });
  const st = await createMsixChannel(deps).status(fakeAdapter());
  assert.equal(st.installed, false);
  assert.equal(st.running, false);
  assert.equal(st.version, '');
  assert.equal(st.aumid, '');
  assert.equal(st.conflict, null);
});

test('status: installed reports package version and the resolved AUMID', async () => {
  const { deps } = fakeDeps();
  const st = await createMsixChannel(deps).status(fakeAdapter({ skinActive: () => true }));
  assert.equal(st.installed, true);
  assert.equal(st.version, '26.1021.3705.0');
  assert.equal(st.aumid, FAMILY + '!App');
  assert.equal(st.exe, '');
  assert.equal(st.skinActive, true);
  assert.equal(st.conflict, null);
});

test('status: a live debug port outside our segment is flagged as a conflict', async () => {
  const { deps } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9229 }],
    portAlive: async (p) => p === 9229,
  });
  const st = await createMsixChannel(deps).status(fakeAdapter());
  assert.equal(st.debugPort, 9229);
  assert.deepEqual(st.conflict, { kind: 'foreign-debug-port', port: 9229 });
});

test('status: a live debug port inside our segment is not a conflict', async () => {
  const { deps } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9350 }],
    portAlive: async (p) => p === 9350,
  });
  const st = await createMsixChannel(deps).status(fakeAdapter());
  assert.equal(st.debugPort, 9350);
  assert.equal(st.conflict, null);
});

test('launch: cold start activates by AUMID with a segment port and waits for targets', async () => {
  const { deps, calls } = fakeDeps();
  const r = await createMsixChannel(deps).launch(fakeAdapter());
  assert.deepEqual(r, { port: 9340 });
  assert.deepEqual(calls, [
    ['activate', FAMILY + '!App', '--remote-debugging-port=9340'],
    ['waitForMainTargets', 9340],
  ]);
});

test('launch: an explicit port is honoured', async () => {
  const { deps, calls } = fakeDeps();
  const r = await createMsixChannel(deps).launch(fakeAdapter(), { port: 19399 });
  assert.deepEqual(r, { port: 19399 });
  assert.deepEqual(calls[0], ['activate', FAMILY + '!App', '--remote-debugging-port=19399']);
});

test('launch: a live debug port in our segment is reused, nothing is activated', async () => {
  const { deps, calls } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9350 }],
    portAlive: async (p) => p === 9350,
  });
  const r = await createMsixChannel(deps).launch(fakeAdapter());
  assert.deepEqual(r, { port: 9350 });
  assert.deepEqual(calls, []);
});

test('launch: a foreign debug port is refused with the pick-one message (coexistence rule)', async () => {
  const { deps, calls } = fakeDeps({
    listProcesses: () => [{ pid: 7, isMain: true, debugPort: 9229 }],
    portAlive: async (p) => p === 9229,
  });
  const ch = createMsixChannel(deps);
  await assert.rejects(() => ch.launch(fakeAdapter()), /二选一/);
  await assert.rejects(() => ch.launch(fakeAdapter()), /Codex-Dream-Skin/);
  assert.deepEqual(calls, []);
});

test('launch: running without a debug port refuses without restart, restarts on request', async () => {
  const seq = [];
  const { deps, calls } = fakeDeps({
    listProcesses: () => (seq.includes('stopped') ? [] : [{ pid: 7, isMain: true }]),
    stopApp: async () => { seq.push('stopped'); return { stopped: true, forced: false }; },
  });
  const ch = createMsixChannel(deps);
  await assert.rejects(() => ch.launch(fakeAdapter()), /正在运行/);
  await assert.rejects(() => ch.launch(fakeAdapter()), /测试备注/);
  const r = await ch.launch(fakeAdapter(), { restart: true });
  assert.equal(r.port, 9340);
  assert.deepEqual(seq, ['stopped']);
  assert.equal(calls[0][0], 'activate');
});

test('launch: not installed is a clear error', async () => {
  const { deps } = fakeDeps({ queryPackage: async () => null });
  await assert.rejects(() => createMsixChannel(deps).launch(fakeAdapter()), /未检测到 Codex 的 MSIX 安装包/);
});

test('launch: a package whose manifest yields no app id is a clear error', async () => {
  const { deps } = fakeDeps({ queryPackage: async () => ({ ...PKG, apps: [] }) });
  await assert.rejects(() => createMsixChannel(deps).launch(fakeAdapter()), /AUMID/);
});

test('launch: without a launcher the activation bridge fails honestly', async () => {
  const { deps } = fakeDeps({ findLauncher: () => '' });
  delete deps.activate; // fall back to the default bridge (launcher --activate)
  await assert.rejects(() => createMsixChannel(deps).launch(fakeAdapter()), /DREAMSKIN_LAUNCHER/);
});

test('stop and targets delegate to app-process primitives', async () => {
  const { deps, calls } = fakeDeps();
  const ch = createMsixChannel(deps);
  await ch.stop(fakeAdapter());
  await ch.stop(fakeAdapter(), { graceful: false });
  assert.deepEqual(calls, [['stopApp', { force: false }], ['stopApp', { force: true }]]);
  const ts = await ch.targets(fakeAdapter(), 9340);
  assert.equal(ts[0].port, 9340);
});

test('bad adapters are rejected with a clear error', async () => {
  const { deps } = fakeDeps();
  const ch = createMsixChannel(deps);
  await assert.rejects(() => ch.status(null), /adapter 不能为空/);
  await assert.rejects(() => ch.status({ id: 'x' }), /缺少 packageFamily/);
});

test('runtime profile carries msix facts and the profile adapter maps them', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-t22-'));
  try {
    const dir = join(root, 'codex');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'adapter.json'), JSON.stringify({
      id: 'codex', name: 'Codex', schema: 'dreamskin-adapter/1', channel: 'msix',
      discover: { msixPackageFamily: FAMILY, exeNames: ['ChatGPT.exe'], envExe: 'DREAMSKIN_CODEX_EXE' },
      target: { urlPattern: '^app://.*/index\\.html', uaToken: 'Codex' },
      conflicts: ['codex-dream-skin'],
    }), 'utf8');
    const profile = appRuntimeById('codex', root);
    assert.equal(profile.channel, 'msix');
    assert.equal(profile.msixPackageFamily, FAMILY);
    assert.deepEqual(profile.conflicts, ['codex-dream-skin']);
    const a = profileToMsixChannelAdapter(profile, { skinActive: () => true });
    assert.equal(a.packageFamily, FAMILY);
    assert.equal(a.exeName, 'ChatGPT.exe');
    assert.deepEqual(a.conflicts, ['codex-dream-skin']);
    assert.equal(a.skinActive(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('entry ensurePort delegates msix cold start to the channel launch (regression: Codex apply)', () => {
  // The CLI entry (src/dreamskin.mjs) used to gate every channel on status.exe;
  // for msix that is always empty by design, so Codex apply died with a bogus
  // not-installed message. ensurePort is not exported, so this pins the wiring
  // at source level: the msix branch must run before the exe fallback, delegate
  // to CHANNEL.launch, and keep the NEEDS_RESTART exit-code pre-check.
  const src = readFileSync(new URL('../src/dreamskin.mjs', import.meta.url), 'utf8');
  const ensure = src.slice(src.indexOf('async function ensurePort'));
  const branchAt = ensure.indexOf('CHANNEL.kind === ' + String.fromCharCode(39) + 'msix' + String.fromCharCode(39));
  const exeAt = ensure.indexOf('const exe = cs.exe;');
  assert.ok(branchAt > 0 && exeAt > branchAt, 'msix branch precedes the exe fallback');
  const branch = ensure.slice(branchAt, exeAt);
  assert.ok(branch.includes('CHANNEL.launch(CHANNEL_ADAPTER'), 'cold start delegated to channel launch');
  assert.ok(branch.includes('mcs.debugPort') && branch.includes('EXIT.NEEDS_RESTART'), 'running-without-port keeps the NEEDS_RESTART code');
  assert.ok(ensure.includes('安装位置。可设置环境变量'), 'exe fallback wording unchanged (2.1 parity)');
});
