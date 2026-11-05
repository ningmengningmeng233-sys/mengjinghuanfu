// Q-4 发布前修复：照片壁纸直接绘制规则的锚点按各应用 app.root 的 scopeBody 派生。
// 背景（更新韧性批附带发现 1）：变量层里照片不走 var(--ds-art)（Chromium var() 代入有大小上限），
// 靠 buildVarsCss 文末一条直接规则把 url 写给外壳 ::before；旧规则写死锚点
// body:has(#app-sidebar)（cherry 旧外壳）与 body:has([data-workspace-shell])（zcode 外壳），
// cherry 2.1.6 / codex / minimax-design / minimax-code / dsh 在完整模式下选了照片也画不出来。
// 本测试守：①六家派生锚点各自命中自己的 scopeBody；②zcode 派生结果与旧规则的 zcode 分支逐字相同（不回退）；
// ③无照片时输出与不传锚点逐字节一致（纯色/渐变/环境光路径不变）；④不传锚点时旧规则原文兜底不变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appRuntimeById, buildCherryCss } from '../src/core/app-runtime.mjs';
import { buildVarsCss } from '../src/theme/cherry-skin-css.mjs';
import { buildSkinLayers } from '../src/theme/layers.mjs';
import { resolvePalette } from '../src/theme/palettes.mjs';

const PALETTE = resolvePalette('ink-gold');
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const APPS = ['cherry', 'zcode', 'codex', 'dsh', 'minimax-design', 'minimax-code'];
const scopeBodyOf = (id) => appRuntimeById(id).partsMap['app.root'].scopeBody;

test('photo wallpaper rule is derived from each app scopeBody', () => {
  for (const id of APPS) {
    const layers = buildSkinLayers(appRuntimeById(id), PALETTE, PHOTO, {});
    const want = `${scopeBodyOf(id)}::before { background-image: url("${PHOTO}") !important; }`;
    assert.ok(layers.vars.includes(want), id + ' vars must carry its own scopeBody photo rule');
    assert.ok(!layers.vars.includes('#app-sidebar'), id + ' vars must not keep the legacy cherry anchor');
    assert.ok(layers.vars.includes('--ds-art: none'), id + ' photo mode keeps --ds-art none (direct rule draws)');
  }
});

test('zcode derived anchor is byte-identical to its legacy branch (no regression)', () => {
  assert.equal(scopeBodyOf('zcode'), 'body:has([data-workspace-shell])');
  const layers = buildSkinLayers(appRuntimeById('zcode'), PALETTE, PHOTO, {});
  assert.ok(layers.vars.includes('body:has([data-workspace-shell])::before { background-image: url("' + PHOTO + '") !important; }'));
});

test('no-photo output is byte-identical with and without the anchor argument', () => {
  for (const id of APPS) {
    const withAnchor = buildVarsCss(PALETTE, '', {}, scopeBodyOf(id));
    const without = buildVarsCss(PALETTE, '', {});
    assert.equal(withAnchor, without, id + ' no-photo vars must not change');
    assert.ok(withAnchor.includes('radial-gradient'), id + ' ambient-light path intact');
    assert.ok(!withAnchor.includes('background-image: url('), id + ' no photo rule without a photo');
  }
});

test('legacy fallback: no anchor argument keeps the historic two-anchor rule verbatim', () => {
  const vars = buildVarsCss(PALETTE, PHOTO, {});
  assert.ok(vars.includes('body:has(#app-sidebar)::before, body:has([data-workspace-shell])::before { background-image: url("' + PHOTO + '") !important; }'));
});

test('buildCherryCss (2.1 compat entry) derives the cherry 2.1.6 anchor', () => {
  const css = buildCherryCss('ink-gold', PHOTO, {});
  assert.ok(css.includes('body:has([data-ui="app.main"])::before { background-image: url("' + PHOTO + '") !important; }'));
  assert.ok(!css.includes('body:has(#app-sidebar)::before'));
});
