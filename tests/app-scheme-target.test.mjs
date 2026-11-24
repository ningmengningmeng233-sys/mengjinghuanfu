// A-1/A-3/A-4 回填：主窗口判定改「协议由适配器数据驱动」（core/app-runtime.mjs 的
// makeIsMainTarget）。三家 P0 应用主窗口实测为 app:// 承载（Codex app://-/index.html、
// MiniMax Design app://./workspace、MiniMax Code app://./archon），原先写死只认
// file:// 会把三家全拒。本文件守住新口径：
//   - urlPattern 头部声明的 scheme 是唯一放行协议（三家靠各自落盘数据命中）；
//   - 未声明 scheme 时维持 2.1 的 file:// 口径（cherry/zcode 逐字节不变）；
//   - 不做任意 scheme 放行：伪造 http(s) 外部 URL、回环 http 一律不命中；
//   - rejectPattern 与 validatedDebuggerUrl（ws 端点校验）口径不变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appRuntimeById, makeIsMainTarget } from '../src/core/app-runtime.mjs';

const item = (url, port, extra = {}) => ({
  type: 'page', id: 'ABC1', url, title: '',
  webSocketDebuggerUrl: 'ws://127.0.0.1:' + port + '/devtools/page/ABC1',
  ...extra,
});

test('codex (msix) main target is the measured app:// window', () => {
  const p = appRuntimeById('codex');
  const port = 9347; // msix 专属段内
  assert.equal(p.isMainTarget(item('app://-/index.html', port), port), true);
  assert.equal(p.isMainTarget(item('app://-/index.html?x=1', port), port), true);
  assert.equal(p.isMainTarget(item('app://-/index.html#/home', port), port), true);
  // 协议与声明不符：一律拒绝（file 同路径、伪造 https、回环 https）。
  assert.equal(p.isMainTarget(item('file://-/index.html', port), port), false);
  assert.equal(p.isMainTarget(item('https://example.com/index.html', port), port), false);
  assert.equal(p.isMainTarget(item('https://127.0.0.1:9347/index.html', port), port), false);
  // urlPattern 仍管路径；ws 端点校验仍管端口与目标类型。
  assert.equal(p.isMainTarget(item('app://-/other.html', port), port), false);
  assert.equal(p.isMainTarget(item('app://-/index.html', port), 9999), false);
  assert.equal(p.isMainTarget(item('app://-/index.html', port, { type: 'other' }), port), false);
});

test('minimax-code main target is the measured app://./archon only', () => {
  const p = appRuntimeById('minimax-code');
  const port = 9222;
  assert.equal(p.isMainTarget(item('app://./archon', port), port), true);
  // 稳定态同进程的 file:// 截图组件页不是主窗口。
  assert.equal(p.isMainTarget(item('file:///C:/app/resources/react-screenshots/index.html', port), port), false);
  // 导航前根路由不命中（urlPattern 要求 /archon）。
  assert.equal(p.isMainTarget(item('app://./', port), port), false);
});

test('cherry/zcode keep the exact 2.1 file:// behaviour at scheme level', () => {
  const port = 9222;
  const cherry = appRuntimeById('cherry');
  assert.equal(cherry.isMainTarget(item('file:///X:/app/windows/main/index.html', port), port), true);
  assert.equal(cherry.isMainTarget(item('app:///X:/app/windows/main/index.html', port), port), false);
  const zcode = appRuntimeById('zcode');
  assert.equal(zcode.isMainTarget(item('file:///X:/ZCode/resources/app/out/renderer/index.html', port, { title: 'ZCode' }), port), true);
  assert.equal(zcode.isMainTarget(item('app:///X:/ZCode/resources/app/out/renderer/index.html', port, { title: 'ZCode' }), port), false);
});

test('undeclared scheme falls back to file:// only (no any-scheme opening)', () => {
  const port = 9222;
  const bare = makeIsMainTarget({});
  assert.equal(bare(item('file:///any/thing.html', port), port), true);
  assert.equal(bare(item('app://-/index.html', port), port), false);
  assert.equal(bare(item('https://example.com/index.html', port), port), false);
  // urlPattern 不带 scheme 前缀时只补路径约束，协议仍按 file:// 旧口径。
  const noScheme = makeIsMainTarget({ urlPattern: '.*/index\\.html' });
  assert.equal(noScheme(item('file:///x/index.html', port), port), true);
  assert.equal(noScheme(item('app://-/index.html', port), port), false);
  assert.equal(noScheme(item('https://example.com/index.html', port), port), false);
});

test('rejectPattern still applies on app:// urls (tail + title)', () => {
  const port = 9222;
  const f = makeIsMainTarget({ urlPattern: '^app://.*/index\\.html', rejectPattern: 'settings' });
  assert.equal(f(item('app://-/index.html', port, { title: 'Home' }), port), true);
  assert.equal(f(item('app://-/index.html#/settings', port, { title: 'Home' }), port), false);
  assert.equal(f(item('app://-/index.html', port, { title: 'Settings' }), port), false);
});
