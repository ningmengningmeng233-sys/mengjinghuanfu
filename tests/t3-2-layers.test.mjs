// T3-2 tests: layered CSS generation + injection (plan 4.4 / 7.3 V-C5).
// 1) Equivalence: the composed RULES (parts templates x adapter parts-maps +
//    extra layer) must equal the 2.1 hand-written rule sheets, compared as
//    per-selector declaration sets against fixtures snapshotted from 2.1.
// 2) Layers generate independently: changing palette/values touches vars only.
// 3) Injection mechanics on a fake DOM: three independent <style> elements,
//    live layer last, removeExpr clears everything without a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { buildSkinLayers, joinLayers, layersLength, serializeSkinFile, parseSkinFile } from '../src/theme/layers.mjs';
import { makeInjectors, layerStyleIds } from '../src/core/inject.mjs';
// T1-3 起：规则三件套由适配器运行时组装（parts-map.json 渲染 + extra.css）。
const cherryProfile = appRuntimeById('cherry');
const zcodeProfile = appRuntimeById('zcode');
const RULES = cherryProfile.rules, CHERRY_PARTS_CSS = cherryProfile.partsCss, CHERRY_EXTRA_CSS = cherryProfile.extraCss;
const ZCODE_RULES = zcodeProfile.rules, ZCODE_PARTS_CSS = zcodeProfile.partsCss, ZCODE_EXTRA_CSS = zcodeProfile.extraCss;
const APPS = { cherry: cherryProfile, zcode: zcodeProfile };
import { resolvePalette } from '../src/theme/palettes.mjs';

// --- normalizer (same algorithm that produced the fixtures from 2.1) ---
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function splitRules(css) {
  const rules = []; let depth = 0, cur = '';
  for (const ch of css) { cur += ch; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { rules.push(cur); cur = ''; } } }
  if (cur.trim()) rules.push(cur);
  return rules;
}
function splitSelectors(sel) {
  const out = []; let d = 0, b = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') d++; else if (ch === ')') d--;
    else if (ch === '[') b++; else if (ch === ']') b--;
    if (ch === ',' && d === 0 && b === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.replace(/\s+/g, ' ').trim());
}
function normalizeRules(css) {
  const bySel = new Map();
  for (const rule of splitRules(stripComments(css))) {
    const open = rule.indexOf('{'); const close = rule.lastIndexOf('}');
    if (open < 0 || close < 0) continue;
    const decls = rule.slice(open + 1, close).split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const s of splitSelectors(rule.slice(0, open))) {
      const arr = bySel.get(s) || []; arr.push(...decls); bySel.set(s, arr);
    }
  }
  return [...bySel.entries()].map(([s, ds]) => s + ' :: ' + ds.sort().join(' ; ')).sort().join('\n') + '\n';
}
const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');

test('cherry RULES composed from templates matches the recorded baseline sheet', () => {
  assert.equal(normalizeRules(RULES), fixture('rules-cherry-2.1.6.txt'));
});

test('zcode RULES composed from templates is equivalent to the 2.1 sheet', () => {
  assert.equal(normalizeRules(ZCODE_RULES), fixture('rules-zcode-2.1.txt'));
});

test('RULES is the composition of parts + extra layers', () => {
  assert.ok(RULES.includes(CHERRY_PARTS_CSS) && RULES.includes(CHERRY_EXTRA_CSS));
  assert.ok(ZCODE_RULES.includes(ZCODE_PARTS_CSS) && ZCODE_RULES.includes(ZCODE_EXTRA_CSS));
});

test('layers generate independently: palette/value changes touch vars only', () => {
  const app = APPS.cherry;
  const a = buildSkinLayers(app, resolvePalette('ink-gold'), '', {});
  const b = buildSkinLayers(app, resolvePalette('b16-nord'), '', {});
  assert.equal(a.parts, b.parts);
  assert.equal(a.extra, b.extra);
  assert.notEqual(a.vars, b.vars);
  const c = buildSkinLayers(app, resolvePalette('ink-gold'), '', { blur: 33 });
  assert.equal(c.parts, a.parts);
  assert.notEqual(c.vars, a.vars);
  assert.ok(a.vars.includes('--ds-bg:'));
  assert.ok(a.parts.length > 1000 && a.extra.length > 0);
});

test('skin file serialize/parse round-trips; legacy plain CSS parses as parts layer', () => {
  const layers = buildSkinLayers(APPS.zcode, resolvePalette('ink-gold'), '', {});
  assert.deepEqual(parseSkinFile(serializeSkinFile(layers)), layers);
  assert.deepEqual(parseSkinFile('body { color: red; }'), { vars: '', parts: 'body { color: red; }', extra: '' });
  assert.equal(parseSkinFile(''), null);
  assert.equal(joinLayers(layers), [layers.parts, layers.extra, layers.vars].join('\n'));
  assert.equal(layersLength(layers), layers.parts.length + layers.extra.length + layers.vars.length);
});

// --- fake DOM for the page-side injection scripts ---
function fakeDom() {
  const head = {
    children: [],
    appendChild(el) {
      if (el.parentNode === head) head.children.splice(head.children.indexOf(el), 1);
      el.parentNode = head; head.children.push(el); return el;
    },
    get lastElementChild() { return head.children[head.children.length - 1] || null; },
  };
  const makeEl = (tag) => ({
    tagName: tag, id: '', textContent: '', parentNode: null,
    remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } },
  });
  const document = {
    head, documentElement: head, body: {}, readyState: 'complete',
    getElementById: (id) => head.children.find((c) => c.id === id) || null,
    createElement: (tag) => makeEl(tag),
    querySelector: () => ({}),
    addEventListener: () => {},
  };
  return { head, document, window: {} };
}

test('injection writes three independent styles; live sits last; remove clears all (V-C5 mechanics)', () => {
  const app = APPS.cherry;
  const { IDS, injectLayersExpr, liveExpr, removeExpr, verifyExpr } = makeInjectors(app);
  assert.deepEqual(IDS, layerStyleIds(app));
  const dom = fakeDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.getComputedStyle = () => ({ backgroundImage: 'none' });
  try {
    const layers = buildSkinLayers(app, resolvePalette('ink-gold'), '', {});
    const total = eval(injectLayersExpr(layers));
    assert.equal(total, layersLength(layers));
    assert.deepEqual(dom.head.children.map((c) => c.id), [IDS.parts, IDS.vars, IDS.extra]);
    assert.equal(dom.document.getElementById(IDS.parts).textContent, layers.parts);
    assert.equal(dom.document.getElementById(IDS.vars).textContent, layers.vars);
    assert.equal(dom.document.getElementById(IDS.extra).textContent, layers.extra);

    const v = eval(verifyExpr);
    assert.equal(v.len, total);
    assert.equal(v.last, true);
    assert.equal(v.sidebar, true);

    // Live preview goes into its own layer, after the three skin layers.
    assert.equal(eval(liveExpr('PV')), 2);
    assert.equal(dom.head.children[dom.head.children.length - 1].id, IDS.live);
    assert.equal(eval(liveExpr('')), 0);
    assert.equal(dom.document.getElementById(IDS.live), null);

    // Re-injecting with a different palette replaces only the vars element content.
    const layers2 = buildSkinLayers(app, resolvePalette('b16-nord'), '', {});
    eval(injectLayersExpr(layers2));
    assert.equal(dom.document.getElementById(IDS.parts).textContent, layers.parts);
    assert.equal(dom.document.getElementById(IDS.vars).textContent, layers2.vars);
    assert.equal(dom.document.getElementById(IDS.extra).textContent, layers.extra);

    // Restore: everything disappears, no restart involved.
    assert.equal(eval(removeExpr), true);
    assert.equal(dom.head.children.length, 0);
  } finally {
    delete globalThis.document; delete globalThis.window;
    delete globalThis.MutationObserver; delete globalThis.getComputedStyle;
  }
});
