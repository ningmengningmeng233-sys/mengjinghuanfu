// T0-1 续：卸载注册表条目推导。自定义安装目录的 NSIS 应用常把 InstallLocation 留空，
// 但 DisplayIcon / UninstallString 就落在安装目录里——findExe 靠条目推导在干净环境
// （无环境变量、应用未运行、默认候选不存在）找到它们。注册表与存在性全部 deps 注入模拟。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findExe, exeFromUninstallEntry, parseRegPath } from '../src/core/app-process.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';

const sep = '\\';
const dir = ['X:', 'CustomApps', 'MiniMax Code'].join(sep); // 夹具路径，避免真实盘符字面量
const exe = dir + sep + 'MiniMax Code.exe';
const onlyExe = (p) => p === exe;

test('parseRegPath：引号路径、图标序号、带参数的卸载串都能洗干净', () => {
  assert.equal(parseRegPath('"' + exe + '" /currentuser'), exe);
  assert.equal(parseRegPath(exe + ',0'), exe);
  assert.equal(parseRegPath(exe + ' /S'), exe);
  assert.equal(parseRegPath(dir + sep + 'uninstallerIcon.ico'), dir + sep + 'uninstallerIcon.ico');
  assert.equal(parseRegPath(''), '');
  assert.equal(parseRegPath(null), '');
});

test('exeFromUninstallEntry：InstallLocation 有值时仍走老口径优先', () => {
  const got = exeFromUninstallEntry({ installLocation: dir, displayIcon: '', uninstallString: '' }, 'MiniMax Code.exe', onlyExe);
  assert.equal(got, exe);
});

test('exeFromUninstallEntry：DisplayIcon 本身就是 exe（带 ,0）时直接命中', () => {
  const got = exeFromUninstallEntry({ installLocation: '', displayIcon: exe + ',0', uninstallString: '' }, 'MiniMax Code.exe', onlyExe);
  assert.equal(got, exe);
});

test('exeFromUninstallEntry：InstallLocation 空、DisplayIcon 是安装目录里的图标时按目录拼接命中', () => {
  const entry = { installLocation: '', displayIcon: dir + sep + 'uninstallerIcon.ico', uninstallString: '' };
  assert.equal(exeFromUninstallEntry(entry, 'MiniMax Code.exe', onlyExe), exe);
});

test('exeFromUninstallEntry：DisplayIcon 缺失时靠 UninstallString 所在目录命中', () => {
  const entry = { installLocation: '', displayIcon: '', uninstallString: '"' + dir + sep + 'Uninstall MiniMax Code.exe" /currentuser' };
  assert.equal(exeFromUninstallEntry(entry, 'MiniMax Code.exe', onlyExe), exe);
});

test('exeFromUninstallEntry：条目里什么都推不中时返回空，不乱猜', () => {
  const entry = { installLocation: '', displayIcon: dir + sep + 'uninstallerIcon.ico', uninstallString: '' };
  assert.equal(exeFromUninstallEntry(entry, 'MiniMax Code.exe', () => false), '');
  assert.equal(exeFromUninstallEntry(null, 'MiniMax Code.exe', onlyExe), '');
  assert.equal(exeFromUninstallEntry({}, 'MiniMax Code.exe', onlyExe), '');
});

test('findExe：多条同前缀条目逐条试，推不中的跳过、推中的返回', () => {
  delete process.env.DREAMSKIN_MINIMAX_CODE_EXE;
  const app = appRuntimeById('minimax-code');
  const other = ['X:', 'Other', 'MiniMax Code Tools'].join(sep);
  const got = findExe(app, [], {
    exists: onlyExe,
    queryUninstallEntries: () => [
      { displayName: 'MiniMax Code Tools', installLocation: other, displayIcon: '', uninstallString: '' },
      { displayName: 'MiniMax Code 3.1.0', installLocation: '', displayIcon: dir + sep + 'uninstallerIcon.ico', uninstallString: '' },
    ],
  });
  assert.equal(got, exe);
});

test('findExe：注入了旧口径 queryInstallLocation 时不碰新条目查询', () => {
  delete process.env.DREAMSKIN_MINIMAX_CODE_EXE;
  const app = appRuntimeById('minimax-code');
  let entriesCalled = false;
  const got = findExe(app, [], {
    exists: onlyExe,
    queryInstallLocation: () => dir,
    queryUninstallEntries: () => { entriesCalled = true; return []; },
  });
  assert.equal(got, exe);
  assert.equal(entriesCalled, false);
});
