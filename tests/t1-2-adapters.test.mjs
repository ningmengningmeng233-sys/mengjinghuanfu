// T1-2 tests: adapter loader + validation (plan 4.2, V-C3/V-C4 loader parts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdapters, listAdapters, adapterById, adapterErrors, validateAdapter } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sep = '\\';
const absPath = ['Q:', 'Apps', 'X', 'X.exe'].join(sep); // built, so no literal drive path in source

test('bundled adapters load with no errors', () => {
  const { adapters, errors } = loadAdapters();
  assert.deepEqual(errors, []);
  assert.deepEqual(adapters.map((a) => a.id).sort(), ['cherry', 'zcode']);
});

test('formal adapter.json drives the runtime profile (T1-3: single source of facts)', () => {
  for (const id of ['cherry', 'zcode']) {
    const a = adapterById(id);
    const p = appRuntimeById(id);
    assert.equal(a.channel, 'exe');
    assert.equal(a.partsMap, 'parts-map.json');
    assert.equal(a.extraCss, 'extra.css');
    assert.equal(p.readySelector, a.readySelector);
    assert.equal(p.uaToken, a.target.uaToken);
    assert.equal(p.envExe, a.discover.envExe);
    if (process.platform === 'win32') assert.equal(p.exeName, a.discover.exeNames[0]);
    assert.deepEqual(p.probes, a.probes);
    assert.deepEqual(p.testedVersions, a.testedVersions);
  }
});

test('unknown id throws a clear error listing registered ids', () => {
  assert.throws(() => adapterById('no-such-app'), /Unknown adapter: no-such-app/);
  assert.throws(() => adapterById('no-such-app'), /cherry/);
});

test('validateAdapter accepts a minimal valid exe adapter', () => {
  const ok = { id: 'x', name: 'X', schema: 'dreamskin-adapter/1', channel: 'exe', discover: { exeNames: ['X.exe'] } };
  assert.deepEqual(validateAdapter(ok, { dirName: 'x', exists: () => true }), []);
});

test('validateAdapter rejects absolute paths and missing declared files', () => {
  const base = { id: 'x', name: 'X', schema: 'dreamskin-adapter/1', channel: 'exe', discover: { exeNames: ['X.exe'], candidates: [absPath] } };
  const errs = validateAdapter(base, { dirName: 'x', exists: () => true });
  assert.ok(errs.some((e) => /absolute path/.test(e)), errs.join(';'));
  const withParts = { ...base, discover: { exeNames: ['X.exe'] }, partsMap: 'parts-map.json' };
  const errs2 = validateAdapter(withParts, { dirName: 'x', dir: 'anywhere', exists: () => false });
  assert.ok(errs2.some((e) => /partsMap/.test(e)), errs2.join(';'));
});

function makeFixtureRoot() {
  const dir = mkdtempSync(join(root, 'build', 't12-adapters-'));
  const put = (name, content, extraFiles = {}) => {
    const sub = join(dir, name);
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'adapter.json'), typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
    for (const [f, body] of Object.entries(extraFiles)) writeFileSync(join(sub, f), body, 'utf8');
  };
  // Data-only fake adapter (no .mjs at all): the V-C4 loader-level case.
  put('fake-good', {
    id: 'fake-good', name: 'Fake Good', schema: 'dreamskin-adapter/1', channel: 'exe',
    discover: { exeNames: ['Fake.exe'], envExe: 'DREAMSKIN_FAKE_EXE' },
    partsMap: 'parts-map.json',
  }, { 'parts-map.json': '{}' });
  put('bad-channel', { id: 'bad-channel', name: 'Bad', schema: 'dreamskin-adapter/1', channel: 'wat' });
  put('bad-noname', { id: 'bad-noname', schema: 'dreamskin-adapter/1', channel: 'exe', discover: { exeNames: ['B.exe'] } });
  put('bad-schema', { id: 'bad-schema', name: 'Bad', schema: 'other/9', channel: 'exe', discover: { exeNames: ['B.exe'] } });
  put('bad-msix', { id: 'bad-msix', name: 'Bad', schema: 'dreamskin-adapter/1', channel: 'msix', discover: {} });
  put('bad-abs', { id: 'bad-abs', name: 'Bad', schema: 'dreamskin-adapter/1', channel: 'exe', discover: { exeNames: ['B.exe'], candidates: [absPath] } });
  put('bad-partsmap', { id: 'bad-partsmap', name: 'Bad', schema: 'dreamskin-adapter/1', channel: 'exe', discover: { exeNames: ['B.exe'] }, partsMap: 'missing.json' });
  put('bad-json', '{broken json');
  put('bad-idmismatch', { id: 'someone-else', name: 'Bad', schema: 'dreamskin-adapter/1', channel: 'exe', discover: { exeNames: ['B.exe'] } });
  return dir;
}

test('bad adapters are skipped with collected errors, good one still loads (V-C3 loader part)', () => {
  const dir = makeFixtureRoot();
  try {
    const { adapters, errors } = loadAdapters(dir);
    assert.deepEqual(adapters.map((a) => a.id), ['fake-good']);
    assert.equal(errors.length, 8, JSON.stringify(errors));
    for (const e of errors) assert.ok(Array.isArray(e.errors) && e.errors.length > 0, e.dir);
    assert.equal(adapterErrors(dir).length, 8);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('data-only fake adapter is listed and resolvable by --app style id (V-C4 loader part)', () => {
  const dir = makeFixtureRoot();
  try {
    assert.ok(listAdapters(dir).some((a) => a.id === 'fake-good'));
    assert.equal(adapterById('fake-good', dir).name, 'Fake Good');
    assert.throws(() => adapterById('bad-channel', dir), /Unknown adapter: bad-channel/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
