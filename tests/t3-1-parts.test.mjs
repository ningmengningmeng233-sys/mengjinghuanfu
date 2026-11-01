// T3-1 tests: parts catalogue + templates + renderer (plan 4.4).
// Proves: the catalogue is exactly the plan's part list and validates; every
// template references a catalogued part; rendering the transitional cherry /
// zcode maps expands all placeholders and keeps the 2.1 selectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadParts, validateParts, partIds, loadTemplates, validateTemplates, validatePartsMap, renderPartsCss } from '../src/parts/parts.mjs';
import { CHERRY_PARTS_MAP, ZCODE_PARTS_MAP } from '../src/parts/maps.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// The part list from plan 4.4, verbatim.
const PLAN_PARTS = ['app.root', 'app.sidebar', 'app.sidebar.item', 'app.sidebar.item.active', 'app.topbar',
  'app.content', 'chat.messages', 'chat.bubble.user', 'chat.bubble.assistant', 'chat.composer',
  'chat.composer.input', 'code.block', 'overlay.panel', 'ide.editor', 'ide.terminal', 'ide.panel'];

test('parts.json is exactly the plan 4.4 catalogue and validates clean', () => {
  const data = loadParts();
  assert.deepEqual(validateParts(data), []);
  assert.deepEqual([...partIds(data)].sort(), [...PLAN_PARTS].sort());
});

test('validateParts catches duplicates, bad ids, bad scope, wrong schema', () => {
  const good = loadParts();
  const dup = { ...good, parts: [...good.parts, good.parts[0]] };
  assert.ok(validateParts(dup).some((e) => /重复/.test(e)));
  const badId = { ...good, parts: [{ id: 'App Root', name: 'x', scope: 'all' }] };
  assert.ok(validateParts(badId).some((e) => /id 不合规/.test(e)));
  const badScope = { ...good, parts: [{ id: 'app.root', name: 'x', scope: 'everywhere' }] };
  assert.ok(validateParts(badScope).some((e) => /scope/.test(e)));
  assert.ok(validateParts({ ...good, schema: 'other/9' }).some((e) => /schema/.test(e)));
});

test('every bundled template references a catalogued part, no duplicates, no stray placeholders', () => {
  const parts = loadParts();
  const templates = loadTemplates();
  assert.ok(templates.length >= 8, 'expected at least 8 templates, got ' + templates.length);
  assert.deepEqual(validateTemplates(parts, templates), []);
});

test('a template for an unknown part is flagged', () => {
  const dir = mkdtempSync(join(root, 'build', 't31-templates-'));
  try {
    writeFileSync(join(dir, 'bogus.css'), '/* part: no.such.part */\n{{selector}} { color: red; }\n', 'utf8');
    writeFileSync(join(dir, 'noplace.css'), '/* part: app.root */\nhtml { color: red; }\n', 'utf8');
    const templates = loadTemplates(dir);
    // loadTemplates sorts by file name: bogus.css, noplace.css
    const errs = validateTemplates(loadParts(), templates);
    assert.ok(errs.some((e) => /no\.such\.part/.test(e)), errs.join(';'));
    assert.ok(errs.some((e) => /没有任何/.test(e)), errs.join(';'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('validatePartsMap flags unknown parts and empty entries; bundled maps are clean', () => {
  const parts = loadParts();
  assert.deepEqual(validatePartsMap(CHERRY_PARTS_MAP, parts), []);
  assert.deepEqual(validatePartsMap(ZCODE_PARTS_MAP, parts), []);
  assert.ok(validatePartsMap({ 'no.such.part': 'x' }, parts).some((e) => /不在 parts\.json/.test(e)));
  assert.ok(validatePartsMap({ 'app.root': {} }, parts).some((e) => /没有给出任何选择器/.test(e)));
});

test('rendering the cherry map expands everything and keeps the 2.1 selectors', () => {
  const css = renderPartsCss(CHERRY_PARTS_MAP);
  assert.ok(!css.includes('{{'), 'unexpanded placeholder left');
  for (const sel of ['html:has(#app-sidebar)', '#app-sidebar', '[data-ui="app.sidebar"]', '[data-ui="app.tab-bar"]',
    'main[data-ui="app.content"]', '[class*="resource-list-pane"]', '[data-ui="part:conversation-main"]',
    '[data-ui="chat.message-list"]', '.message-user .message-content-container', '#inputbar',
    '[data-ui="chat.composer"]', '[data-ui="part:code-block"]']) {
    assert.ok(css.includes(sel), 'missing selector: ' + sel);
  }
  assert.ok(css.includes('body:has(#app-sidebar)::before'));
});

test('rendering the zcode map expands everything and keeps the 2.1 selectors', () => {
  const css = renderPartsCss(ZCODE_PARTS_MAP);
  assert.ok(!css.includes('{{'), 'unexpanded placeholder left');
  for (const sel of ['[data-workspace-shell]', '[data-root-workspace-surface]', '#sidebar', '[data-testid="sidebar"]',
    '[data-purpose-section-list]', '[data-testid="v4-composer"]', '[data-v4-composer-dock]',
    '[data-slot="dialog-header"]', '[data-slot="tabs-trigger"][data-state="active"]']) {
    assert.ok(css.includes(sel), 'missing selector: ' + sel);
  }
});

test('rendering fails loudly when the map lacks a form the template needs', () => {
  const broken = { ...CHERRY_PARTS_MAP, 'app.root': { selector: 'body #root' } }; // scope form missing
  assert.throws(() => renderPartsCss(broken), /app\.root/);
  assert.throws(() => renderPartsCss(broken), /scope/);
});

test('parts without a map entry are skipped, not rendered empty', () => {
  const css = renderPartsCss({ 'code.block': { selector: 'pre' } });
  assert.ok(css.includes('pre {'));
  assert.ok(!css.includes('app-sidebar'));
});
