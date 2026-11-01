// U-2 单测：多目标同步扇出（core/sync.mjs）+ 入口 sync --to 的端到端（临时数据目录）。
// 扇出层用假 runOne；入口级用例只选当前没在运行的应用作目标（运行中会真换肤，先查状态再决定跑不跑），
// 数据目录全程指向临时目录，不碰用户真实数据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncFanout, parseTargets } from '../src/core/sync.mjs';

test('parseTargets 拆分与容错', () => {
  assert.deepEqual(parseTargets('a, b,,c '), ['a', 'b', 'c']);
  assert.deepEqual(parseTargets(''), []);
  assert.deepEqual(parseTargets(undefined), []);
});

test('syncFanout 逐个独立：一个失败不影响其他，跳过来源与未知应用', async () => {
  const calls = [];
  const r = await syncFanout({
    from: 'cherry',
    targets: ['zcode', 'boom', 'cherry', 'nope', 'zcode'],
    knownIds: ['cherry', 'zcode', 'boom'],
    runOne: async (id) => { calls.push(id); if (id === 'boom') throw new Error('目标炸了'); return { ok: true, msg: 'done-' + id }; },
  });
  assert.deepEqual(calls, ['zcode', 'boom']); // 去重后只跑两个真实目标
  assert.equal(r.ok, false); // boom 失败 + nope 未知 -> 整体失败
  const byId = Object.fromEntries(r.results.map((x) => [x.app, x]));
  assert.equal(byId.zcode.ok, true);
  assert.match(byId.boom.msg, /目标炸了/);
  assert.equal(byId.cherry.skipped, true);
  assert.equal(byId.nope.ok, false);
  assert.match(byId.nope.msg, /未注册/);
});

test('syncFanout 全部成功 ok=true，runOne 返回 ok=false 也如实记', async () => {
  const r = await syncFanout({ from: 'a', targets: ['b', 'c'], runOne: async (id) => ({ ok: id === 'b', msg: id }) });
  assert.equal(r.ok, false);
  const r2 = await syncFanout({ from: 'a', targets: ['b'], runOne: async () => ({ ok: true, msg: 'x' }) });
  assert.equal(r2.ok, true);
});

const ENTRY = fileURLToPath(new URL('../src/dreamskin.mjs', import.meta.url));
function runEntry(args, env) {
  try {
    const out = execFileSync(process.execPath, [ENTRY, ...args], { encoding: 'utf8', env, windowsHide: true, timeout: 120000 });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
function appRunning(id, env) {
  const r = runEntry(['status', '--app', id], env);
  try { return JSON.parse(r.out).running === true; } catch { return true; } // 查不清就当在跑，宁可跳过
}

test('入口 sync --to：临时数据目录里多目标记录 + 未知目标单独失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-u2-'));
  try {
    const env = { ...process.env, DREAMSKIN_DATA_DIR: join(root, 'cherry') };
    // 目标必须没在运行（在跑会真的给它换肤）；本机当前 codex / minimax-design 应为未运行，在跑则跳过本用例。
    if (appRunning('codex', env) || appRunning('minimax-design', env)) return;
    mkdirSync(join(root, 'cherry'), { recursive: true });
    writeFileSync(join(root, 'cherry', 'last-choice.json'), JSON.stringify({ preset: 'ink-gold', image: '', values: { blur: 20 } }), 'utf8');
    const r = runEntry(['sync', '--from', 'cherry', '--to', 'codex,nope,minimax-design'], env);
    assert.equal(r.code, 1); // nope 失败 -> 整体 1
    const line = r.out.trim().split(/\r?\n/).find((s) => s.includes('"syncMulti"'));
    assert.ok(line, '应有 JSON 汇总行');
    const sum = JSON.parse(line);
    assert.equal(sum.ok, false);
    const byId = Object.fromEntries(sum.results.map((x) => [x.app, x]));
    assert.equal(byId.codex.ok, true);
    assert.equal(byId['minimax-design'].ok, true);
    assert.equal(byId.nope.ok, false);
    // 两个目标的数据目录都记下了来源的选择（没运行 -> 只记录，下次启动生效）
    for (const id of ['codex', 'minimax-design']) {
      const c = JSON.parse(readFileSync(join(root, id, 'last-choice.json'), 'utf8'));
      assert.equal(c.preset, 'ink-gold');
    }
    assert.ok(!existsSync(join(root, 'nope')));
    const r2 = runEntry(['sync', '--from', 'cherry', '--to', 'codex'], env);
    assert.equal(r2.code, 0); // 全部成功 -> 0
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
