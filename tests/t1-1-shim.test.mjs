// T1-1 tests: new entry exists, old entry shims forward args and exit code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (rel, args) => execFileSync(process.execPath, [join(root, rel), ...args], { encoding: 'utf8' });

test('new entry src/dreamskin.mjs exists and presets runs', () => {
  assert.ok(existsSync(join(root, 'src', 'dreamskin.mjs')));
  const out = run(join('src', 'dreamskin.mjs'), ['presets']);
  const parsed = JSON.parse(out);
  assert.ok(Array.isArray(parsed.palettes) && parsed.palettes.length > 0);
});

test('payload-root shim src/skin-cherry.mjs forwards presets identically', () => {
  const a = run(join('src', 'dreamskin.mjs'), ['presets']);
  const b = run(join('src', 'skin-cherry.mjs'), ['presets']);
  assert.equal(b, a);
});

test('legacy repo-path shim src/cherry/skin-cherry.mjs forwards schema identically', () => {
  const a = run(join('src', 'dreamskin.mjs'), ['schema']);
  const b = run(join('src', 'cherry', 'skin-cherry.mjs'), ['schema']);
  assert.equal(b, a);
});
