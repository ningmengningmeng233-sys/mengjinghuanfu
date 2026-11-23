import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { VERSION } from '../src/core/version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('v4 version: VERSION is 4.0.0 and tools/check-version.mjs passes cleanly', () => {
  assert.equal(VERSION, '4.0.0');
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-version.mjs')], { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, 'check-version.mjs failed:\n' + r.stdout + r.stderr);
});

test('v4 CLI & payload: build-payload includes studio-ui dist, prism engine and antigravity adapter', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ds-pay-'));
  try {
    const r = spawnSync(
      process.execPath,
      [join(root, 'tools', 'build-payload.mjs'), '--platform', 'win32', '--out', outDir, '--skip-runtime'],
      { encoding: 'utf8', cwd: root },
    );
    assert.equal(r.status, 0, 'build-payload failed:\n' + r.stdout + r.stderr);
    const manifest = JSON.parse(readFileSync(join(outDir, 'payload-manifest.json'), 'utf8'));
    assert.equal(manifest.version, '4.0.0');
    const paths = new Set(manifest.files.map((f) => f.path));
    assert.ok(paths.has('studio-daemon.mjs'), 'payload must include studio-daemon.mjs');
    assert.ok(paths.has('studio-ui/dist/index.html'), 'payload must include bundled Studio UI');
    assert.ok(paths.has('adapters/antigravity/adapter.json'), 'payload must include antigravity adapter');
    assert.ok(paths.has('prism/host/wallpaper-inject.js'), 'payload must include Prism host kernel');
    assert.ok(existsSync(join(root, 'src', 'launcher', '梦境换肤-4.0.0-Windows.csproj')));
    assert.ok(existsSync(join(root, 'src', 'launcher', 'DreamSkin', 'StudioTrayApp.cs')));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('v4 CLI: dreamskin.mjs supports shortcuts-status for antigravity without touching real files', () => {
  const tmpData = mkdtempSync(join(tmpdir(), 'ds-cli-'));
  try {
    const r = spawnSync(
      process.execPath,
      [join(root, 'src', 'dreamskin.mjs'), 'shortcuts-status', '--app', 'antigravity'],
      { encoding: 'utf8', env: { ...process.env, DREAMSKIN_DATA_DIR: tmpData }, timeout: 15000 },
    );
    assert.equal(r.status, 0, 'shortcuts-status failed:\n' + r.stdout + r.stderr);
    const parsed = JSON.parse(r.stdout.trim());
    assert.equal(parsed.appId, 'antigravity');
    assert.equal(parsed.port, 9339);
  } finally {
    rmSync(tmpData, { recursive: true, force: true });
  }
});
