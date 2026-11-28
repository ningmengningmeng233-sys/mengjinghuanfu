import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildOpticalBundle } from '../scripts/build-optical-bundle.mjs';

const VIAL_SOURCE = readFileSync(new URL('../src/prism/optical/context-vial.js', import.meta.url), 'utf8');
const ROOT_ID = 'dreamskin-context-vial';
const STYLE_ID = 'dreamskin-context-vial-css';

function createMockElement(tag) {
  const el = {
    tagName: String(tag),
    id: '',
    className: '',
    style: {},
    attributes: Object.create(null),
    childNodes: [],
    parentNode: null,
    _text: '',
    _listeners: Object.create(null),
    get firstChild() {
      return this.childNodes[0] || null;
    },
    get textContent() {
      return this._text;
    },
    set textContent(v) {
      this._text = String(v);
    },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'id') this.id = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    },
    removeAttribute(k) {
      delete this.attributes[k];
    },
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    },
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i >= 0) this.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = this._listeners[type];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    contains(node) {
      let p = node;
      while (p) {
        if (p === this) return true;
        p = p.parentNode;
      }
      return false;
    },
    querySelector(sel) {
      return matchIn(this, sel);
    },
  };
  return el;
}

function matches(el, sel) {
  const s = String(sel).trim();
  if (s.startsWith('#')) return el.id === s.slice(1);
  if (s.startsWith('[')) {
    const m = s.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
    if (!m) return false;
    const attr = el.getAttribute(m[1]);
    return m[2] === undefined ? attr !== null : attr === m[2];
  }
  return el.tagName.toLowerCase() === s.toLowerCase();
}

function matchIn(root, sel) {
  const stack = [...root.childNodes];
  while (stack.length) {
    const node = stack.shift();
    if (matches(node, sel)) return node;
    if (node.childNodes.length) stack.unshift(...node.childNodes);
  }
  return null;
}

function createMockDocument() {
  const doc = {
    documentElement: createMockElement('html'),
    head: createMockElement('head'),
    body: createMockElement('body'),
  };
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.createElement = (tag) => createMockElement(tag);
  doc.getElementById = (id) => matchIn(doc.documentElement, `#${id}`);
  doc.querySelector = (sel) => matchIn(doc.documentElement, sel);
  return doc;
}

function createMockObserver() {
  return class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  };
}

function loadVial(document) {
  const sandbox = {
    document,
    MutationObserver: createMockObserver(),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(VIAL_SOURCE, ctx, { filename: 'context-vial.js' });
  return ctx.__dreamSkinContextVial;
}

test('buildOpticalBundle parses, passes privacy audit, and ships __dreamSkinContextVial before optical-suite', () => {
  const res = buildOpticalBundle();
  const bundle = readFileSync(res.outOptical, 'utf8');
  const dshBundle = readFileSync(res.outDsh, 'utf8');

  assert.doesNotThrow(() => new vm.Script(bundle, { filename: 'optical-bundle.js' }));
  assert.equal(bundle, dshBundle, 'optical and DSH plugin bundles must stay identical');
  assert.match(bundle, /__dreamSkinContextVial/);
  assert.match(bundle, /__dreamSkinOptical/);
  assert.ok(
    bundle.indexOf('module: context-vial.js') < bundle.indexOf('module: optical-suite.js'),
    'context-vial.js must be bundled before optical-suite.js',
  );
  assert.doesNotMatch(bundle, /https?:\/\/(?!127\.0\.0\.1|localhost)/i, 'bundle must not reference external URLs');
  assert.doesNotMatch(bundle, /document\.cookie|localStorage|sessionStorage/i, 'bundle must not touch host storage or cookies');
});

test('context-vial start() mounts, isRunning() reports true, and stop() cleans up style + DOM', () => {
  const doc = createMockDocument();
  const api = loadVial(doc);

  assert.equal(api.isRunning(), false);
  assert.equal(api.start(), true);
  assert.equal(api.isRunning(), true);
  assert.ok(doc.getElementById(ROOT_ID), 'vial root must be injected into the body');
  assert.ok(doc.getElementById(STYLE_ID), 'vial style must be injected into head');
  assert.ok(doc.getElementById(ROOT_ID).getAttribute('data-ds-vial-collapsed') === '0');

  api.stop();
  assert.equal(api.isRunning(), false);
  assert.equal(doc.getElementById(ROOT_ID), null, 'stop() must remove the vial DOM node');
  assert.equal(doc.getElementById(STYLE_ID), null, 'stop() must remove the injected style');
});

test('context-vial yields when a host-native vial already exists', () => {
  const doc = createMockDocument();
  const hostVial = doc.createElement('div');
  hostVial.id = 'op-vial';
  doc.body.appendChild(hostVial);

  const api = loadVial(doc);
  assert.equal(api.start(), false, 'start() must yield to an existing host vial');
  assert.equal(api.isRunning(), false);
  assert.equal(doc.getElementById(ROOT_ID), null, 'yielded vial must not inject its own DOM');

  api.stop();
  assert.equal(doc.getElementById(STYLE_ID), null);
});

test('context-vial stays yielded for data-obsidian-vial and #ds-telemetry-pop hosts', () => {
  for (const [attr, id] of [['data-obsidian-vial', null], [null, 'ds-telemetry-pop']]) {
    const doc = createMockDocument();
    const host = doc.createElement('div');
    if (attr) host.setAttribute(attr, '1');
    if (id) host.id = id;
    doc.body.appendChild(host);

    const api = loadVial(doc);
    assert.equal(api.start(), false);
    assert.equal(doc.getElementById(ROOT_ID), null);
    api.stop();
  }
});

test('context-vial update() re-mounts after a yielding host disappears', () => {
  const doc = createMockDocument();
  const hostVial = doc.createElement('div');
  hostVial.id = 'op-vial';
  doc.body.appendChild(hostVial);

  const api = loadVial(doc);
  assert.equal(api.start(), false);
  assert.equal(api.isRunning(), false);

  doc.body.removeChild(hostVial);
  assert.equal(api.update(), true);
  assert.equal(api.isRunning(), true);
  assert.ok(doc.getElementById(ROOT_ID));

  api.stop();
  assert.equal(doc.getElementById(ROOT_ID), null);
});
