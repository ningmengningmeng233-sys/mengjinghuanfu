// T0-1 单测：ZCode 不再写死开发机路径，装在自定义目录时靠卸载注册表 InstallLocation 找到。
// 注册表与文件存在性都用 deps 注入模拟，不碰真机注册表。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findExe, exeFromInstallLocation } from '../src/cherry/cdp/app-process.mjs';
import { APPS } from '../src/cherry/lib/apps.mjs';

const sep = '\\';
const customDir = ['X:', 'CustomApps', 'ZCode'].join(sep); // 测试夹具路径，拼出来避免出现真实盘符字面量
const customExe = customDir + sep + 'ZCode.exe';

test('ZCode candidates 里没有写死的盘符路径', () => {
  if (process.platform !== 'win32') return;
  for (const c of APPS.zcode.candidates()) {
    assert.ok(!c.includes(sep + 'AI' + sep), '候选路径不应含开发机目录: ' + c);
  }
});

test('模拟注册表返回自定义 InstallLocation 时能找到 exe', () => {
  delete process.env.DREAMSKIN_ZCODE_EXE;
  const got = findExe(APPS.zcode, [], {
    exists: (p) => p === customExe,
    queryInstallLocation: (app) => {
      assert.equal(app.uninstallName, 'ZCode');
      return customDir;
    },
  });
  assert.equal(got, customExe);
});

test('注册表没有 InstallLocation 时返回空字符串，不乱猜', () => {
  delete process.env.DREAMSKIN_ZCODE_EXE;
  const got = findExe(APPS.zcode, [], {
    exists: () => false,
    queryInstallLocation: () => '',
  });
  assert.equal(got, '');
});

test('exeFromInstallLocation：目录下没有 exe 时返回空', () => {
  assert.equal(exeFromInstallLocation(customDir, 'ZCode.exe', () => false), '');
  assert.equal(exeFromInstallLocation('', 'ZCode.exe', () => true), '');
});
