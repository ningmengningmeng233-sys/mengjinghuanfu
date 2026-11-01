// launcher 第二批接线测试：msix 通道的包查询「总控台 --resolve-aumid 优先、PowerShell 兜底」。
// 全部用注入假实现，不真启总控台、不真查包。总控台输出形状用的是第二批真机实测的
// Codex 解析结果（应用列表只有开始菜单条目 App 一条，与 PowerShell 的全清单口径差异见 msix.mjs 文件头）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMsixChannel, queryPackageDefault, queryPackageViaLauncher,
} from '../src/channels/msix.mjs';

const FAMILY = 'OpenAI.Codex_2p2nqsd0c76g0';
// 总控台 --resolve-aumid 的真实输出形状（2026-11-02 真机实测后按其字段复刻的夹具）。
const LAUNCHER_JSON = JSON.stringify({
  Name: 'OpenAI.Codex', PackageFamilyName: FAMILY, Version: '26.1021.3705.0',
  InstallLocation: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1021.3705.0_x64__2p2nqsd0c76g0',
  Apps: [{ Id: 'App', Executable: 'app/ChatGPT.exe' }],
  AppId: 'App', Aumid: FAMILY + '!App',
});
// PowerShell 查询的包信息（规范化后形状，含清单全部应用）。
const PS_PKG = {
  name: 'OpenAI.Codex', packageFamilyName: FAMILY, version: '26.1021.3705.0',
  installLocation: 'X',
  apps: [
    { id: 'CodexCoreCommandRunner', executable: 'app/resources/codex-command-runner.exe' },
    { id: 'App', executable: 'app/ChatGPT.exe' },
  ],
};

test('queryPackageViaLauncher parses launcher JSON and passes --exe through', () => {
  const seen = [];
  const run = (file, argv) => { seen.push([file, argv]); return LAUNCHER_JSON + '\n'; };
  const info = queryPackageViaLauncher(FAMILY, 'ChatGPT.exe', 'L:\\launcher.exe', run);
  assert.deepEqual(seen, [['L:\\launcher.exe', ['--resolve-aumid', FAMILY, '--exe', 'ChatGPT.exe']]]);
  assert.equal(info.packageFamilyName, FAMILY);
  assert.equal(info.version, '26.1021.3705.0');
  assert.deepEqual(info.apps, [{ id: 'App', executable: 'app/ChatGPT.exe' }]);
});

test('queryPackageViaLauncher omits --exe when no exe name is given', () => {
  const seen = [];
  const run = (file, argv) => { seen.push(argv); return LAUNCHER_JSON; };
  queryPackageViaLauncher(FAMILY, '', 'L:\\launcher.exe', run);
  assert.deepEqual(seen, [['--resolve-aumid', FAMILY]]);
});

test('queryPackageViaLauncher returns null without calling run when no launcher', () => {
  let called = false;
  const run = () => { called = true; return LAUNCHER_JSON; };
  assert.equal(queryPackageViaLauncher(FAMILY, 'ChatGPT.exe', '', run), null);
  assert.equal(called, false);
});

test('queryPackageViaLauncher tolerates failure and garbage output', () => {
  assert.equal(queryPackageViaLauncher(FAMILY, '', 'L', () => { throw new Error('exit 1'); }), null);
  assert.equal(queryPackageViaLauncher(FAMILY, '', 'L', () => 'not json at all'), null);
  const emptyApps = JSON.stringify({ Name: 'x', PackageFamilyName: FAMILY, Apps: [] });
  assert.equal(queryPackageViaLauncher(FAMILY, '', 'L', () => emptyApps), null);
});

test('queryPackageViaLauncher picks the JSON line out of noisy output', () => {
  const run = () => 'some log line\n' + LAUNCHER_JSON + '\n';
  const info = queryPackageViaLauncher(FAMILY, '', 'L', run);
  assert.equal(info.packageFamilyName, FAMILY);
});

test('queryPackageDefault prefers the launcher and never touches PowerShell on a hit', () => {
  let psCalled = false;
  const info = queryPackageDefault(FAMILY, 'ChatGPT.exe', {
    findLauncher: () => 'L:\\launcher.exe',
    run: () => LAUNCHER_JSON,
    queryPs: () => { psCalled = true; return PS_PKG; },
  });
  assert.equal(info.apps.length, 1);
  assert.equal(psCalled, false);
});

test('queryPackageDefault falls back to PowerShell when the launcher is missing or fails', () => {
  const missing = queryPackageDefault(FAMILY, '', {
    findLauncher: () => '',
    queryPs: () => PS_PKG,
  });
  assert.equal(missing, PS_PKG);
  const failing = queryPackageDefault(FAMILY, '', {
    findLauncher: () => 'L:\\launcher.exe',
    run: () => { throw new Error('boom'); },
    queryPs: () => PS_PKG,
  });
  assert.equal(failing, PS_PKG);
});

test('msix channel resolves through the composed default query (launcher first)', async () => {
  const queryPackage = (fam, exe) => queryPackageDefault(fam, exe, {
    findLauncher: () => 'L:\\launcher.exe',
    run: () => LAUNCHER_JSON,
    queryPs: () => null,
  });
  const ch = createMsixChannel({
    queryPackage,
    listProcesses: () => [],
    debugPortOf: () => 0,
    portAlive: async () => false,
  });
  const st = await ch.status({
    id: 'codex', name: 'Codex', packageFamily: FAMILY, exeName: 'ChatGPT.exe',
    isMainTarget: () => true,
  });
  assert.equal(st.installed, true);
  assert.equal(st.version, '26.1021.3705.0');
  assert.equal(st.aumid, FAMILY + '!App');
});
