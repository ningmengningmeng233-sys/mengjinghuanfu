// Q-1 tests (2/2): parts hit-rate fixture framework. Synthetic snapshots plus
// the real cherry/zcode parts-maps run the full pipeline
// snapshot -> per-part present/missing/skip -> hit-rate report, and the verdict
// must agree with core/health.mjs on the same missing list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSnapshotHtml, parseSnapshotMeta } from '../src/core/dom-snapshot.mjs';
import { queryAll, queryFirst, partStatesOf, hitReport } from '../src/core/parts-hit.mjs';
import { evaluateHealth, partChecksOf } from '../src/core/health.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';

const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const CHERRY = appRuntimeById('cherry');
const ZCODE = appRuntimeById('zcode');

const node = (tag, attrs = {}, children = []) => ({ tag, attrs, children });
const tree = node('html', {}, [node('body', {}, [
  node('div', { id: 'a', class: 'x y', 'data-k': 'hello world', 'data-n': '42' }, [
    node('span', { class: 'y' }),
    node('section', { 'data-role': 'main-panel' }, [node('p', { class: 'x' })]),
  ]),
  node('footer', { id: 'f' }),
])]);

test('selector engine: tag / id / class / compound / attribute operators', () => {
  assert.equal(queryAll(tree, 'div').length, 1);
  assert.equal(queryAll(tree, '#a').length, 1);
  assert.equal(queryAll(tree, '.x').length, 2); // div.x and p.x
  assert.equal(queryAll(tree, 'div.x.y').length, 1);
  assert.equal(queryAll(tree, '[data-k]').length, 1);
  assert.equal(queryAll(tree, '[data-k="hello world"]').length, 1);
  assert.equal(queryAll(tree, '[data-k*="lo wo"]').length, 1);
  assert.equal(queryAll(tree, '[data-k^="hello"]').length, 1);
  assert.equal(queryAll(tree, '[data-k$="world"]').length, 1);
  assert.equal(queryAll(tree, '[data-k~="world"]').length, 1);
  assert.equal(queryAll(tree, '[data-n="42"]').length, 1);
  assert.equal(queryAll(tree, '[data-missing]').length, 0);
});

test('selector engine: combinators, comma lists, :has and :not', () => {
  assert.equal(queryAll(tree, 'div p').length, 1); // descendant
  assert.equal(queryAll(tree, 'div > p').length, 0); // p is not a direct child of div
  assert.equal(queryAll(tree, 'section > p').length, 1);
  assert.equal(queryAll(tree, 'span, footer').length, 2);
  assert.equal(queryAll(tree, 'body:has(#a)').length, 1);
  assert.equal(queryAll(tree, 'html:has([data-role="main-panel"])').length, 1);
  assert.equal(queryAll(tree, 'div:has(> section)').length, 1); // relative :has - section is a direct child of div
  assert.equal(queryAll(tree, 'body:has(> section)').length, 0); // ...but not of body (grandchild does not count)
  assert.equal(queryAll(tree, 'body:has(> div)').length, 1);
  assert.equal(queryAll(tree, 'span:has(> section)').length, 0);
  assert.equal(queryAll(tree, 'div:not(.z)').length, 1);
  assert.equal(queryAll(tree, 'div:not(.x)').length, 0);
  assert.equal(queryAll(tree, 'p:not([data-k])').length, 1);
  assert.throws(() => queryAll(tree, 'div + p'), /暂不支持组合子/);
});

test('cherry synthetic snapshot: every part present, full mode, agrees with health', () => {
  const snap = parseSnapshotHtml(fixture('dom-cherry-synthetic.html'));
  assert.deepEqual(parseSnapshotMeta(fixture('dom-cherry-synthetic.html')), { schema: 'dreamskin-dom-snapshot/1', app: 'cherry', synthetic: true });
  const report = hitReport(CHERRY.partsMap, snap);
  assert.equal(report.mode, 'full');
  assert.equal(report.hitRate, 1);
  assert.equal(report.requiredHitRate, 1);
  assert.deepEqual(report.partsMissing, []);
  assert.equal(report.requiredTotal, 4);
  // same states fed to health directly must give the same verdict
  const { checks, states } = partStatesOf(CHERRY.partsMap, snap);
  const health = evaluateHealth({ partStates: states, checks });
  assert.equal(health.mode, report.mode);
  assert.deepEqual(health.partsMissing, report.partsMissing);
});

test('zcode synthetic snapshot: every part present (covers :has / child / :not forms)', () => {
  const snap = parseSnapshotHtml(fixture('dom-zcode-synthetic.html'));
  const report = hitReport(ZCODE.partsMap, snap);
  assert.equal(report.mode, 'full');
  assert.deepEqual(report.partsMissing, []);
  assert.equal(report.requiredTotal, 4);
});

test('cherry degraded snapshot: required missing over 30% -> compat, same as health', () => {
  const snap = parseSnapshotHtml(fixture('dom-cherry-degraded.html'));
  const report = hitReport(CHERRY.partsMap, snap);
  assert.equal(report.mode, 'compat');
  assert.equal(report.requiredTotal, 4);
  assert.equal(report.requiredMissing, 2); // app.content + chat.composer
  assert.equal(report.requiredMissingRatio, 0.5);
  assert.ok(report.partsMissing.includes('app.content'));
  assert.ok(report.partsMissing.includes('chat.composer'));
  const { checks, states } = partStatesOf(CHERRY.partsMap, snap);
  assert.equal(evaluateHealth({ partStates: states, checks }).mode, 'compat');
  assert.equal(partChecksOf(CHERRY.partsMap).length, report.parts.length);
});

test('requiredWhen not present in snapshot -> part is skipped and out of the denominator', () => {
  const map = {
    'app.root': { selector: 'html', required: true },
    'ide.only': { selector: '#editor', required: true, requiredWhen: '[data-mode="ide"]' },
  };
  const snap = node('html', {}, [node('body')]);
  const { states } = partStatesOf(map, snap);
  assert.equal(states['ide.only'], 'skip');
  const report = hitReport(map, snap);
  assert.equal(report.requiredTotal, 1);
  assert.equal(report.mode, 'full');
});

test('empty parts-map (new adapters before real anchors): no countable parts, honestly reported', () => {
  const report = hitReport({}, parseSnapshotHtml(fixture('dom-cherry-synthetic.html')));
  assert.equal(report.requiredTotal, 0);
  assert.equal(report.hitRate, null);
  assert.equal(report.mode, 'full'); // means "nothing to degrade on", NOT "adapter verified"
  assert.deepEqual(report.parts, []);
});
