// T3-3 tests: health check, compat matrix store and auto-degrade (plan 4.5).
// Pure logic only - no app is launched. The three states required by the work
// order are covered: all parts present (full), required missing over the 30%
// limit (compat), and contrast below the threshold (scrim raise + warning).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  partChecksOf, partsProbeExpr, evaluateHealth, wallpaperPartsCss, degradeLayers, bumpScrim,
  REQUIRED_MISSING_LIMIT,
} from '../src/core/health.mjs';
import { readCompat, writeCompatRecord, compatRecordOf, compatFile } from '../src/store/compat.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { SETTINGS } from '../src/theme/cherry-skin-css.mjs';
import { renderPartsCss } from '../src/parts/parts.mjs';

const CHERRY = appRuntimeById('cherry');
const ZCODE = appRuntimeById('zcode');
const checksOf = (profile) => partChecksOf(profile.partsMap);
const allPresent = (checks) => Object.fromEntries(checks.map((c) => [c.id, 'present']));

test('partChecksOf reads the real parts-maps: required parts and selectors', () => {
  for (const profile of [CHERRY, ZCODE]) {
    const checks = checksOf(profile);
    const required = checks.filter((c) => c.required).map((c) => c.id).sort();
    assert.deepEqual(required, ['app.content', 'app.root', 'app.sidebar', 'chat.composer'], profile.id);
    for (const c of checks) assert.ok(c.selectors.length > 0, profile.id + '/' + c.id);
  }
});

test('partsProbeExpr embeds every part id and only queries selectors', () => {
  const expr = partsProbeExpr(checksOf(CHERRY));
  for (const c of checksOf(CHERRY)) assert.ok(expr.includes(c.id), c.id);
  assert.ok(expr.includes('querySelector'));
  assert.ok(!/cookie|localStorage|fetch\(/.test(expr), 'probe must not read page data or use the network');
});

test('state 1 - all parts present: full mode, nothing missing', () => {
  const checks = checksOf(CHERRY);
  const h = evaluateHealth({ partStates: allPresent(checks), checks, contrast: 7.2 });
  assert.equal(h.mode, 'full');
  assert.deepEqual(h.partsMissing, []);
  assert.equal(h.partsOk.length, checks.length);
  assert.equal(h.requiredMissing, 0);
  assert.equal(h.contrastOk, true);
  assert.equal(h.needsScrimRaise, false);
});

test('state 2 - required missing over 30%: compat mode, optional misses listed but not counted', () => {
  const checks = checksOf(CHERRY);
  const states = allPresent(checks);
  states['app.root'] = 'missing'; // required
  states['app.sidebar'] = 'missing'; // required -> 2/4 = 50% > 30%
  states['chat.messages'] = 'missing'; // optional: listed, not in the ratio
  const h = evaluateHealth({ partStates: states, checks, contrast: null });
  assert.equal(h.mode, 'compat');
  assert.equal(h.requiredTotal, 4);
  assert.equal(h.requiredMissing, 2);
  assert.ok(h.requiredMissingRatio > REQUIRED_MISSING_LIMIT);
  assert.deepEqual(h.partsMissing.sort(), ['app.root', 'app.sidebar', 'chat.messages']);
});

test('boundary: exactly 30% required missing stays full, one more flips to compat', () => {
  const checks = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, required: true, requiredWhen: '', selectors: ['#x'] }));
  const states = allPresent(checks);
  states.p0 = 'missing'; states.p1 = 'missing'; states.p2 = 'missing';
  assert.equal(evaluateHealth({ partStates: states, checks }).mode, 'full'); // 30% is not > 30%
  states.p3 = 'missing';
  assert.equal(evaluateHealth({ partStates: states, checks }).mode, 'compat'); // 40%
});

test('requiredWhen unmet (skip) parts are excluded from the totals', () => {
  const checks = [
    { id: 'a', required: true, requiredWhen: '', selectors: ['#a'] },
    { id: 'b', required: true, requiredWhen: '#gate', selectors: ['#b'] },
  ];
  const h = evaluateHealth({ partStates: { a: 'present', b: 'skip' }, checks });
  assert.equal(h.requiredTotal, 1);
  assert.equal(h.mode, 'full');
  assert.deepEqual(h.partsOk, ['a']);
  assert.deepEqual(h.partsMissing, []);
});

test('state 3 - contrast below 4.5: body fails, large text may pass, scrim raise requested', () => {
  const checks = checksOf(CHERRY);
  const h = evaluateHealth({ partStates: allPresent(checks), checks, contrast: 3.2 });
  assert.equal(h.contrastOk, false); // body text threshold 4.5
  assert.equal(h.contrastLargeOk, true); // large text threshold 3
  assert.equal(h.needsScrimRaise, true);
  const h2 = evaluateHealth({ partStates: allPresent(checks), checks, contrast: 2.4 });
  assert.equal(h2.contrastLargeOk, false);
  const h3 = evaluateHealth({ partStates: allPresent(checks), checks, contrast: null });
  assert.equal(h3.contrastOk, null);
  assert.equal(h3.needsScrimRaise, false);
});

test('bumpScrim raises the mask one notch, respects the cap and other values', () => {
  assert.equal(bumpScrim({}, SETTINGS).scrim, 125); // default 100 + 25
  assert.equal(bumpScrim({ scrim: 90, blur: 10 }, SETTINGS).scrim, 115);
  assert.equal(bumpScrim({ scrim: 90, blur: 10 }, SETTINGS).blur, 10);
  assert.equal(bumpScrim({ scrim: 190 }, SETTINGS).scrim, 200); // capped at max
  assert.equal(bumpScrim({ scrim: 200 }, SETTINGS), null); // cannot raise further
  const orig = { scrim: 90 };
  bumpScrim(orig, SETTINGS);
  assert.equal(orig.scrim, 90); // input not mutated
});

test('degradeLayers keeps vars and the wallpaper mount (app.root), drops extra', () => {
  const layers = { vars: 'VARS', parts: CHERRY.partsCss, extra: CHERRY.extraCss };
  const d = degradeLayers(layers, CHERRY.partsMap);
  assert.equal(d.vars, 'VARS');
  assert.equal(d.extra, '');
  assert.equal(d.parts, renderPartsCss({ 'app.root': CHERRY.partsMap['app.root'] }));
  assert.ok(d.parts.includes('#app-sidebar'), 'wallpaper mount rules kept');
  assert.ok(!d.parts.includes('resource-list-pane'), 'other parts rules dropped');
  assert.equal(wallpaperPartsCss(null), '');
  assert.equal(wallpaperPartsCss({}), '');
});

test('compat store: records round-trip per adapter with the plan 4.5 shape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-t33-'));
  try {
    assert.deepEqual(readCompat(dir), {});
    const checks = checksOf(CHERRY);
    const health = evaluateHealth({ partStates: allPresent(checks), checks, contrast: 7.25 });
    const rec = compatRecordOf(health, { adapterId: 'cherry', appVersion: '2.1.4', at: '2026-11-02T00:00:00.000Z' });
    for (const k of ['adapterId', 'appVersion', 'partsOk', 'partsMissing', 'contrast', 'mode', 'at']) {
      assert.ok(k in rec, 'record field ' + k);
    }
    writeCompatRecord(rec, dir);
    writeCompatRecord(compatRecordOf(health, { adapterId: 'zcode', appVersion: '3.15.3' }), dir);
    const all = readCompat(dir);
    assert.equal(all.cherry.appVersion, '2.1.4');
    assert.equal(all.cherry.contrast, 7.25);
    assert.equal(all.cherry.mode, 'full');
    assert.equal(all.zcode.appVersion, '3.15.3');
    assert.ok(compatFile(dir).endsWith('compat.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
