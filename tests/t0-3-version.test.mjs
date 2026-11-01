// T0-3 单测：版本号单一来源。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, USER_AGENT } from '../src/cherry/lib/version.mjs';
import { RULES } from '../src/cherry/lib/cherry-skin-css.mjs';
import { ZCODE_RULES } from '../src/cherry/lib/zcode-skin-css.mjs';

test('VERSION 是 x.y.z 且 UA 带它', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(USER_AGENT.includes(VERSION));
});

test('规则段注释里的版本来自 version.mjs', () => {
  assert.ok(RULES.includes('Dream Skin ' + VERSION), 'Cherry 规则段版本不对');
  assert.ok(ZCODE_RULES.includes('Dream Skin ' + VERSION), 'ZCode 规则段版本不对');
});

test('源码里不再写死旧 UA 版本', () => {
  const g = readFileSync(new URL('../src/cherry/lib/gallery.mjs', import.meta.url), 'utf8');
  assert.ok(!g.includes('DreamSkin-2.0'));
  assert.ok(g.includes('USER_AGENT'));
});
