// 更新韧性批：tools/recheck-after-update.mjs 的主干判定单测（夹具驱动，不启动任何应用）。
// 覆盖：版本比对、命中结论映射（§4.5 口径）、DSH 长窗口下限、基线文件形状。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersion, decideConclusion, startWaitFor, readyWaitFor, DSH_MIN_WAIT_MS, DEFAULT_WAIT_MS } from '../tools/recheck-after-update.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

test('compareVersion: 同版本未变化、异版本已变化、取不到算未安装', () => {
  assert.deepEqual(compareVersion('2.1.6', '2.1.6'), { installed: true, changed: false });
  assert.deepEqual(compareVersion('2.1.7', '2.1.6'), { installed: true, changed: true });
  assert.deepEqual(compareVersion(null, '2.1.6'), { installed: false, changed: false });
  assert.deepEqual(compareVersion('', '2.1.6'), { installed: false, changed: false });
  assert.deepEqual(compareVersion(' 3.1.0 ', '3.1.0'), { installed: true, changed: false });
});

test('decideConclusion: 五种结论映射', () => {
  assert.equal(decideConclusion({ installed: false }), '未安装');
  assert.equal(decideConclusion({ installed: true, needsIdle: true, versionChanged: true }), '待复检');
  assert.equal(decideConclusion({ installed: true, snapshotOk: false }), '需刷新部件表');
  assert.equal(decideConclusion({ installed: true, snapshotOk: true, mode: 'full' }), '完好 full');
  assert.equal(decideConclusion({ installed: true, snapshotOk: true, mode: 'full', versionChanged: true }), '完好 full');
  assert.equal(decideConclusion({ installed: true, snapshotOk: true, mode: 'compat', versionChanged: true }), '需刷新部件表');
  assert.equal(decideConclusion({ installed: true, snapshotOk: true, mode: 'compat', versionChanged: false }), '降级可用 compat');
});

test('startWaitFor: DSH 窗口不低于 15 分钟，其余按基线/默认', () => {
  assert.equal(DSH_MIN_WAIT_MS, 15 * 60 * 1000);
  assert.equal(startWaitFor({ id: 'dsh', startWaitMs: 60000 }), DSH_MIN_WAIT_MS);
  assert.equal(startWaitFor({ id: 'dsh', startWaitMs: 18 * 60 * 1000 }), 18 * 60 * 1000);
  assert.equal(startWaitFor({ id: 'dsh' }), DSH_MIN_WAIT_MS);
  assert.equal(startWaitFor({ id: 'cherry', startWaitMs: 240000 }), 240000);
  assert.equal(startWaitFor({ id: 'cherry' }), DEFAULT_WAIT_MS);
});

test('readyWaitFor: DSH 就绪窗口最长（Web UI 渲染晚），其余统一 120 秒', () => {
  assert.equal(readyWaitFor({ id: 'dsh' }), 300000);
  assert.equal(readyWaitFor({ id: 'cherry' }), 120000);
  assert.ok(readyWaitFor({ id: 'dsh' }) > readyWaitFor({ id: 'minimax-code' }));
});

test('recheck-baseline.json: 五家齐全、版本与探查口径与预期 mode 都在', () => {
  const baseline = JSON.parse(readFileSync(join(HERE, '..', 'tools', 'recheck-baseline.json'), 'utf8'));
  assert.equal(baseline.schema, 'dreamskin-recheck-baseline/1');
  const ids = baseline.apps.map((a) => a.id).sort();
  assert.deepEqual(ids, ['cherry', 'codex', 'dsh', 'minimax-code', 'zcode']);
  for (const app of baseline.apps) {
    assert.ok(app.version && app.version.length > 0, app.id + ' 应有基线版本');
    assert.ok(app.probe && (app.probe.kind === 'registry' || app.probe.kind === 'appx'), app.id + ' 应有探查口径');
    assert.equal(app.expectedMode, 'full', app.id + ' 基线预期应为 full');
    assert.ok(app.partsTotal > 0 && app.partsRequired > 0, app.id + ' 部件计数应在');
  }
  const dsh = baseline.apps.find((a) => a.id === 'dsh');
  assert.ok(dsh.startWaitMs >= DSH_MIN_WAIT_MS, 'DSH 基线等待窗口不得低于 15 分钟');
});

test('recheck 工具 exe 启动走产品 exe 通道（与入口 ensurePort 同口径，Q-4 接线守卫）', () => {
  const src = readFileSync(join(HERE, '..', 'tools', 'recheck-after-update.mjs'), 'utf8');
  assert.ok(src.includes('channelFor(adapter.channel)'), '应按适配器通道取 exe 通道');
  assert.ok(src.includes('channel.status(channelAdapter)'), 'exe 应由通道 status 解析（与 ensurePort 同一条发现链）');
  assert.ok(!src.includes('findExe(adapter)'), '不许再绕开通道直接 findExe');
  assert.ok(!/import \{[^}]*findExe/.test(src), '不许再从 app-process 导入 findExe');
});
