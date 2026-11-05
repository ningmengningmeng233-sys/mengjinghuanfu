// mac 适配批单测：平台判定 / mac 路径构造 / Info.plist 夹具解析 / Windows 行为不变。
// 全部在本机（Windows）上跑：mac 分支靠注入 platform 值、夹具文本与 deps 验证，
// 只证明代码层口径，不声称任何 mac 真机验证。真机清单见 证据/mac适配批报告.md。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM, IS_WINDOWS, IS_MAC, platformKind, defaultDataRoot,
  macAppDirs, macBundleBinary, macCandidateBinaries, macBundleOf,
  plistString, parseInfoPlist, readBundleInfo, macExecutableName,
  macOpenArgv, openMacApp,
} from '../src/core/platform.mjs';
import { adapterErrors, validateAdapter } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { rootDir } from '../src/core/env.mjs';

const FIXTURE = readFileSync(fileURLToPath(new URL('./fixtures/info-plist-cherry.xml', import.meta.url)), 'utf8');

test('平台判定：常量与本机一致，platformKind 三分', () => {
  assert.equal(PLATFORM, process.platform);
  assert.equal(IS_WINDOWS, process.platform === 'win32');
  assert.equal(IS_MAC, process.platform === 'darwin');
  assert.equal(platformKind('win32'), 'windows');
  assert.equal(platformKind('darwin'), 'mac');
  assert.equal(platformKind('linux'), 'other');
  assert.equal(platformKind(), platformKind(process.platform));
});

test('defaultDataRoot：win32 口径与 env.mjs 原内联表达式一致', () => {
  const home = join('X:', 'Users', 'T');
  const la = join('X:', 'LocalAppData');
  assert.equal(defaultDataRoot({ platform: 'win32', env: { LOCALAPPDATA: la }, home }), join(la, 'DreamSkin'));
  assert.equal(defaultDataRoot({ platform: 'win32', env: {}, home }), join(home, 'AppData', 'Local', 'DreamSkin'));
});

test('defaultDataRoot：darwin 走 Library/Application Support，忽略 LOCALAPPDATA', () => {
  const home = join('Users', 't');
  const want = join(home, 'Library', 'Application Support', 'DreamSkin');
  assert.equal(defaultDataRoot({ platform: 'darwin', env: {}, home }), want);
  assert.equal(defaultDataRoot({ platform: 'darwin', env: { LOCALAPPDATA: 'X:\\nope' }, home }), want);
});

test('rootDir()：真实调用产出仍是 <LOCALAPPDATA>/DreamSkin（Windows 行为不变）', () => {
  const fake = join(tmpdir(), 'dreamskin-mac-batch-test');
  const savedLa = process.env.LOCALAPPDATA;
  const savedDd = process.env.DREAMSKIN_DATA_DIR;
  try {
    process.env.LOCALAPPDATA = fake;
    delete process.env.DREAMSKIN_DATA_DIR;
    assert.equal(rootDir(), join(fake, 'DreamSkin'));
  } finally {
    if (savedLa === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = savedLa;
    if (savedDd === undefined) delete process.env.DREAMSKIN_DATA_DIR; else process.env.DREAMSKIN_DATA_DIR = savedDd;
    rmSync(fake, { recursive: true, force: true });
  }
});

test('mac 路径构造：应用目录、包内主程序、候选展开', () => {
  const home = join('Users', 't');
  assert.deepEqual(macAppDirs(home), ['/Applications', join(home, 'Applications')]);
  const bundlePath = join('/Applications', 'ZCode.app');
  assert.equal(macBundleBinary(bundlePath, 'ZCode'), join(bundlePath, 'Contents', 'MacOS', 'ZCode'));
  assert.deepEqual(macCandidateBinaries('ZCode', 'ZCode', home), [
    join('/Applications', 'ZCode.app', 'Contents', 'MacOS', 'ZCode'),
    join(home, 'Applications', 'ZCode.app', 'Contents', 'MacOS', 'ZCode'),
  ]);
  assert.deepEqual(macCandidateBinaries('', 'ZCode', home), []);
  assert.deepEqual(macCandidateBinaries('ZCode', '', home), []);
});

test('macBundleOf：macBundle 优先、其次 discover.mac.bundle、都没有为空', () => {
  assert.equal(macBundleOf({ macBundle: 'A' }), 'A');
  assert.equal(macBundleOf({ mac: { bundle: 'B' } }), 'B');
  assert.equal(macBundleOf({ macBundle: 'A', mac: { bundle: 'B' } }), 'A');
  assert.equal(macBundleOf({}), '');
  assert.equal(macBundleOf(null), '');
  assert.equal(macBundleOf(undefined), '');
});

test('parseInfoPlist：夹具四字段齐全，非 plist 返回 null', () => {
  const info = parseInfoPlist(FIXTURE);
  assert.equal(info.executable, 'Cherry Studio');
  assert.equal(info.identifier, 'com.example.cherry-studio');
  assert.equal(info.name, 'Cherry Studio');
  assert.equal(info.shortVersion, '2.1.6');
  assert.equal(parseInfoPlist('not a plist'), null);
  assert.equal(parseInfoPlist('<plist version="1.0"><dict></dict></plist>'), null);
  assert.equal(parseInfoPlist(null), null);
});

test('plistString：实体解码、缺键返回空、不误匹配更长的同前缀键', () => {
  const xml = '<plist><dict><key>CFBundleName</key><string>A &amp; B</string></dict></plist>';
  assert.equal(plistString(xml, 'CFBundleName'), 'A & B');
  assert.equal(plistString(xml, 'CFBundleMissing'), '');
  // 夹具里 CFBundleDisplayName 在 CFBundleName 之前，取 CFBundleName 不能取到它
  assert.equal(plistString(FIXTURE, 'CFBundleName'), 'Cherry Studio');
});

test('readBundleInfo / macExecutableName：注入读文件，plist 优先、失败回退', () => {
  const bundlePath = join('/Applications', 'Cherry Studio.app');
  const seen = [];
  const info = readBundleInfo(bundlePath, { readFile: (p) => { seen.push(p); return FIXTURE; } });
  assert.deepEqual(seen, [join(bundlePath, 'Contents', 'Info.plist')]);
  assert.equal(info.executable, 'Cherry Studio');
  assert.equal(readBundleInfo(bundlePath, { readFile: () => { throw new Error('nope'); } }), null);
  assert.equal(macExecutableName(bundlePath, 'Fallback', { readFile: () => FIXTURE }), 'Cherry Studio');
  assert.equal(macExecutableName(bundlePath, 'Fallback', { readFile: () => { throw new Error('nope'); } }), 'Fallback');
  assert.equal(macExecutableName(bundlePath, '', { readFile: () => { throw new Error('nope'); } }), '');
});

test('macOpenArgv / openMacApp：open 命令口径（预留分支，注入执行验证 argv）', () => {
  assert.deepEqual(macOpenArgv('Cherry Studio'), ['-a', 'Cherry Studio']);
  assert.deepEqual(macOpenArgv('Cherry Studio', ['--remote-debugging-port=9341']),
    ['-a', 'Cherry Studio', '--args', '--remote-debugging-port=9341']);
  const calls = [];
  openMacApp('ZCode', [], { execFileSync: (file, argv) => { calls.push([file, argv]); } });
  assert.deepEqual(calls, [['/usr/bin/open', ['-a', 'ZCode']]]);
});

test('Windows 行为不变：六家 profile 的 channel / exeName / macBundle 与 candidates 形状', () => {
  const want = {
    cherry: { channel: 'exe', exeName: 'Cherry Studio.exe', macBundle: 'Cherry Studio', candidates: 3 },
    zcode: { channel: 'exe', exeName: 'ZCode.exe', macBundle: 'ZCode', candidates: 2 },
    codex: { channel: 'msix', exeName: 'ChatGPT.exe', macBundle: 'Codex' },
    dsh: { channel: 'exe', exeName: 'DSH Desktop.exe', macBundle: 'DSH Desktop', candidates: 1 },
    'minimax-code': { channel: 'exe', exeName: 'MiniMax Code.exe', macBundle: 'MiniMax Code', candidates: 1 },
    'minimax-design': { channel: 'exe', exeName: 'MiniMax Design.exe', macBundle: 'MiniMax Design', candidates: 1 },
  };
  for (const [id, w] of Object.entries(want)) {
    const p = appRuntimeById(id);
    assert.equal(p.channel, w.channel, id + ' channel');
    assert.equal(p.macBundle, w.macBundle, id + ' macBundle');
    if (process.platform === 'win32') {
      assert.equal(p.exeName, w.exeName, id + ' exeName');
      if (w.candidates) assert.equal(p.candidates().length, w.candidates, id + ' candidates 数');
    }
  }
});

test('适配器校验：现有全部适配器零错误；discover.mac 的 status 只许 unverified', () => {
  assert.deepEqual(adapterErrors(), []);
  const base = {
    id: 'x1', name: 'X', schema: 'dreamskin-adapter/1', channel: 'exe',
    discover: { exeNames: ['X.exe'] },
  };
  assert.deepEqual(validateAdapter(base), []);
  const bad = { ...base, discover: { exeNames: ['X.exe'], mac: { bundle: 'X', source: 's', status: 'verified' } } };
  assert.ok(validateAdapter(bad).some((e) => e.includes('discover.mac.status')), 'status=verified 应被拒');
  const ok = { ...base, discover: { exeNames: ['X.exe'], mac: { bundle: 'X', source: 's', status: 'unverified' } } };
  assert.deepEqual(validateAdapter(ok), []);
  const badShape = { ...base, discover: { exeNames: ['X.exe'], mac: 'X' } };
  assert.ok(validateAdapter(badShape).some((e) => e.includes('discover.mac must be an object')));
});
