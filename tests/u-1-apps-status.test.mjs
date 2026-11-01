// U-1 单测：全应用状态聚合（core/apps-status.mjs）——五态判定表、版本来源优先级、
// 已安装优先排序、单个应用失败不拖垮整表。全部用注入的假实现，不碰真实应用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appStateOf, sortAppsForList, collectAppsStatus } from '../src/core/apps-status.mjs';

test('appStateOf 五态判定表', () => {
  assert.equal(appStateOf({}), 'not-installed');
  assert.equal(appStateOf({ compatMode: true, skinActive: true }), 'not-installed'); // 没装时体检记录不作数
  assert.equal(appStateOf({ installed: true }), 'not-running');
  assert.equal(appStateOf({ installed: true, running: true }), 'running');
  assert.equal(appStateOf({ installed: true, skinActive: true }), 'skin-active');
  assert.equal(appStateOf({ installed: true, running: true, skinActive: true }), 'skin-active');
  assert.equal(appStateOf({ installed: true, running: true, compatMode: true }), 'compat');
  assert.equal(appStateOf({ installed: true, skinActive: true, compatMode: true }), 'compat');
  assert.equal(appStateOf({ installed: true, compatMode: true }), 'not-running'); // 没跑也没皮肤：兼容记录不单独点亮
});

test('sortAppsForList 已安装优先且稳定', () => {
  const rows = [{ id: 'a', installed: false }, { id: 'b', installed: true }, { id: 'c', installed: false }, { id: 'd', installed: true }];
  assert.deepEqual(sortAppsForList(rows).map((r) => r.id), ['b', 'd', 'a', 'c']);
});

const P = (id) => ({ id, name: 'App-' + id, channel: 'exe', testedVersions: ['1.0'] });

test('collectAppsStatus 聚合、版本优先级与排序', async () => {
  const status = {
    zeta: { installed: false, running: false, debugPort: 0, exe: '', skinActive: false, version: '' },
    alpha: { installed: true, running: true, debugPort: 9999, exe: 'a.exe', skinActive: true, version: '2.0' },
    mid: { installed: true, running: false, debugPort: 0, exe: 'm.exe', version: '' }, // 无 skinActive 字段 -> 走 skinFileExists
  };
  const r = await collectAppsStatus({
    profiles: [P('zeta'), P('alpha'), P('mid')],
    statusOf: async (p) => status[p.id],
    compatOf: (id) => (id === 'alpha' ? { mode: 'compat', appVersion: '1.9' } : id === 'mid' ? { mode: 'full', appVersion: '3.1' } : null),
    checkedVersionOf: (id) => (id === 'mid' ? '3.0' : ''),
    skinFileExists: () => false,
    errors: () => [],
  });
  assert.deepEqual(r.apps.map((a) => a.id), ['alpha', 'mid', 'zeta']); // 已装优先
  const alpha = r.apps[0];
  assert.equal(alpha.state, 'compat'); // 运行中 + 皮肤 + compat 记录
  assert.equal(alpha.appVersion, '2.0'); // 实时版本优先于体检记录
  const mid = r.apps[1];
  assert.equal(mid.state, 'not-running');
  assert.equal(mid.appVersion, '3.1'); // 无实时版本时用体检记录的版本（优先于 checked-version）
  assert.equal(r.apps[2].state, 'not-installed');
  assert.deepEqual(r.errors, []);
});

test('collectAppsStatus 单个应用失败只影响自己那行', async () => {
  const r = await collectAppsStatus({
    profiles: [P('good'), P('bad')],
    statusOf: async (p) => { if (p.id === 'bad') throw new Error('查询炸了'); return { installed: true, running: false, skinActive: false }; },
    compatOf: () => null, checkedVersionOf: () => '', skinFileExists: () => false,
    errors: () => [{ dir: 'broken', id: 'broken', errors: ['缺 name'] }],
  });
  const good = r.apps.find((a) => a.id === 'good');
  const bad = r.apps.find((a) => a.id === 'bad');
  assert.equal(good.state, 'not-running');
  assert.equal(bad.state, 'error');
  assert.match(bad.error, /查询炸了/);
  assert.equal(r.errors.length, 1); // 适配器加载错误清单原样带出（V-C3 的总控台展示面）
});
