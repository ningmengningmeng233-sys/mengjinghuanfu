// Q-1 tests (1/2): sanitized DOM snapshot tooling. No app is launched and no
// real page is touched - extraction runs against a synthetic fake DOM, and the
// CLI is only exercised on paths that fail before any connection succeeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  extractSkeleton, snapshotExpr, captureSnapshotTree, treeToHtml, snapshotFileText,
  parseSnapshotHtml, parseSnapshotMeta, isKeptAttr,
} from '../src/core/dom-snapshot.mjs';

// Minimal DOM-like node: the extractor only reads tagName / attributes / children.
const el = (tag, attrs = {}, children = []) => ({
  tagName: tag.toUpperCase(),
  attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  children,
});

const SECRET_TITLE = 'USER-SECRET-TITLE';
const SECRET_VALUE = 'USER-SECRET-VALUE';
const fakePage = () => el('html', { lang: 'zh-CN' }, [
  el('head', {}, [el('title', {}, [])]),
  el('body', {}, [
    el('div', {
      id: 'root', class: 'h-screen w-screen', 'data-ui': 'app.main',
      title: SECRET_TITLE, style: 'color:red', 'data-note': 'a&"b',
    }, [
      el('input', { id: 'inputbar', value: SECRET_VALUE, placeholder: SECRET_TITLE }),
      el('img', { src: 'https://example.invalid/pic.png', alt: SECRET_TITLE }),
      el('a', { href: 'https://example.invalid/', 'data-testid': 'link' }),
    ]),
    el('script', { src: 'app.js' }),
  ]),
]);

test('extractSkeleton keeps only tag / id / class / data-* and drops every user-content carrier', () => {
  const tree = extractSkeleton(fakePage());
  const json = JSON.stringify(tree);
  assert.ok(!json.includes(SECRET_TITLE), 'title/placeholder/alt content must not survive');
  assert.ok(!json.includes(SECRET_VALUE), 'input value must not survive');
  assert.ok(!json.includes('example.invalid'), 'href/src must not survive');
  assert.ok(!json.includes('app.js'), 'script src must not survive');
  const root = tree.children.find((c) => c.tag === 'body').children[0];
  assert.deepEqual(Object.keys(root.attrs).sort(), ['class', 'data-note', 'data-ui', 'id']);
  assert.equal(root.attrs['data-ui'], 'app.main');
  assert.equal(root.attrs['data-note'], 'a&"b');
  const input = root.children.find((c) => c.tag === 'input');
  assert.deepEqual(input.attrs, { id: 'inputbar' });
  assert.ok(isKeptAttr('data-anything') && isKeptAttr('id') && isKeptAttr('class'));
  assert.ok(!isKeptAttr('href') && !isKeptAttr('value') && !isKeptAttr('title'));
});

test('snapshot expression is static-clean: no storage / cookie / text / network access', () => {
  const expr = snapshotExpr();
  assert.ok(expr.includes('document.documentElement'));
  for (const banned of ['cookie', 'localStorage', 'sessionStorage', 'textContent', 'innerText', 'innerHTML', 'outerHTML', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket']) {
    assert.ok(!expr.includes(banned), 'expression must not contain ' + banned);
  }
});

test('captureSnapshotTree runs the expression through an injected session', async () => {
  let seen = '';
  const tree = await captureSnapshotTree({
    evaluate: async (expr) => { seen = expr; return extractSkeleton(fakePage()); },
  });
  assert.equal(tree.tag, 'html');
  assert.ok(seen.includes('document.documentElement'));
  await assert.rejects(() => captureSnapshotTree({ evaluate: async () => null }), /没有返回 DOM 骨架/);
});

test('treeToHtml + parseSnapshotHtml round-trips, and the HTML itself carries no secrets', () => {
  const tree = extractSkeleton(fakePage());
  const html = treeToHtml(tree);
  for (const banned of [SECRET_TITLE, SECRET_VALUE, 'example.invalid', 'title=', 'href=', 'src=', 'value=', 'placeholder=', 'style=']) {
    assert.ok(!html.includes(banned), 'snapshot html must not contain ' + banned);
  }
  assert.deepEqual(parseSnapshotHtml(html), tree);
});

test('parseSnapshotHtml skips comments/doctype, handles void elements and bare attributes', () => {
  const tree = parseSnapshotHtml('<!DOCTYPE html><!-- c --><html><body><img data-a="1"><br><div id="x" hidden></div></body></html>');
  assert.equal(tree.tag, 'html');
  const body = tree.children[0];
  assert.deepEqual(body.children.map((c) => c.tag), ['img', 'br', 'div']);
  assert.equal(body.children[0].attrs['data-a'], '1');
  assert.equal(body.children[2].attrs.hidden, '');
  assert.throws(() => parseSnapshotHtml('plain text, no tags'), /没有任何元素/);
});

test('snapshot file text carries schema meta and parses it back', () => {
  const tree = extractSkeleton(fakePage());
  const text = snapshotFileText(tree, { app: 'cherry', synthetic: true });
  assert.ok(text.startsWith('<!-- dreamskin-dom-snapshot/1 app=cherry synthetic=true -->'));
  assert.deepEqual(parseSnapshotMeta(text), { schema: 'dreamskin-dom-snapshot/1', app: 'cherry', synthetic: true });
  assert.deepEqual(parseSnapshotHtml(text), tree);
  assert.equal(parseSnapshotMeta('<html></html>'), null);
});

test('Q-1 sources obey the 4.8 static rules (no storage / cookie / page-text access)', () => {
  // Access syntax only: the modules' own comments legitimately *name* the things
  // they refuse to touch, so the check targets real access patterns, not words.
  for (const f of ['../src/core/dom-snapshot.mjs', '../src/core/parts-hit.mjs', '../tools/dom-snapshot.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/(?:window\.)?localStorage\s*[.[]|(?:window\.)?sessionStorage\s*[.[]|document\.cookie/.test(src), f);
    assert.ok(!/\.textContent\b|\.innerText\b/.test(src), f);
  }
});

test('CLI fails cleanly without a port and with nothing listening (no app involved)', () => {
  const cwd = new URL('..', import.meta.url);
  const noArgs = spawnSync(process.execPath, ['tools/dom-snapshot.mjs'], { cwd, encoding: 'utf8' });
  assert.equal(noArgs.status, 1);
  assert.match(noArgs.stderr, /--port/);
  const dead = spawnSync(process.execPath, ['tools/dom-snapshot.mjs', '--port', '59999'], { cwd, encoding: 'utf8', timeout: 20000 });
  assert.equal(dead.status, 1);
  assert.match(dead.stderr, /FAILED/);
});
