// T0-5 单测：Windows 包不带 panel.mjs；macOS 包带。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
function build(platform, out) {
  execFileSync(process.execPath, [join(root, 'tools', 'build-payload.mjs'), '--platform', platform, '--out', out, '--skip-runtime'], { encoding: 'utf8' });
  return JSON.parse(readFileSync(join(root, out, 'payload-manifest.json'), 'utf8'));
}

test('Windows 包无 panel.mjs 且无入口引用它', () => {
  const out = 'build/test-win';
  try {
    const m = build('win32', out);
    assert.ok(!existsSync(join(root, out, 'panel.mjs')));
    assert.ok(!m.files.some((f) => f.path === 'panel.mjs'));
    assert.ok(m.files.some((f) => f.path === 'skin-cherry.mjs'));
    assert.ok(m.files.some((f) => f.path === 'dreamskin.mjs'));
    const main = readFileSync(join(root, out, 'skin-cherry.mjs'), 'utf8');
    assert.ok(!main.includes('panel.mjs'));
  } finally { rmSync(join(root, out), { recursive: true, force: true }); }
});

test('macOS 包带 panel.mjs', () => {
  const out = 'build/test-mac';
  try {
    const m = build('darwin', out);
    assert.ok(m.files.some((f) => f.path === 'panel.mjs'));
  } finally { rmSync(join(root, out), { recursive: true, force: true }); }
});
