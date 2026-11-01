// T0-4 单测：anime 分组与 WALL_DIR 死代码已删除，配色列表正常。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROUPS, listPalettes, bundledImage } from '../src/theme/palettes.mjs';

test('GROUPS 里没有 anime 分组', () => {
  assert.equal(GROUPS.anime, undefined);
});

test('配色列表正常且没有任何 anime 分组条目', () => {
  const list = listPalettes({ all: true });
  assert.ok(list.length > 10, '配色数量异常: ' + list.length);
  assert.ok(list.every((p) => p.group !== 'anime'));
  assert.ok(list.some((p) => p.group === 'builtin'));
});

test('内置预设不再自带壁纸（bundledImage 只认主题库）', () => {
  assert.equal(bundledImage('ink-gold'), '');
});

test('源码里没有 WALL_DIR', () => {
  for (const f of ['../src/theme/palettes.mjs', '../src/dreamskin.mjs']) {
    const t = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!t.includes('WALL_DIR'), f + ' 还有 WALL_DIR');
  }
});
