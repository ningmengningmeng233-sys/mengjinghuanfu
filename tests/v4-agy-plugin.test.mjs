import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED_PLUGIN_KEYS = new Set([
  'name', 'displayName', 'description', 'version', 'logo',
  'suggestedPrompts', 'author', 'homepage', 'repository', 'disabled',
]);

test('agy-plugin: plugin.json adheres strictly to official 10-key Antigravity contract', () => {
  const mfPath = join(root, 'plugin', 'plugin.json');
  assert.equal(existsSync(mfPath), true, 'plugin/plugin.json must exist');
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
  for (const k of Object.keys(mf)) {
    assert.ok(ALLOWED_PLUGIN_KEYS.has(k), `Unexpected plugin.json key: ${k}`);
  }
  assert.equal(mf.name, 'dreamskin-prism');
  assert.equal(mf.version, '4.0.0');
  assert.ok(Array.isArray(mf.suggestedPrompts) && mf.suggestedPrompts.length === 3);
  assert.equal(existsSync(join(root, 'plugin', mf.logo)), true, 'logo relative path must exist');

  const scPath = join(root, 'plugin', 'sidecars', 'prism_studio', 'sidecar.json');
  const sc = JSON.parse(readFileSync(scPath, 'utf8'));
  assert.equal(sc.has_web_ui, true);
  assert.equal(sc.ui_config.views[0].entrypoint, 'SIDECAR_UI_ENTRYPOINT_AUX_PANE');
});

test('agy-plugin: install-agy-plugin.mjs copies real files (no junctions) and creates valid self-contained plugin', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ds-agy-plug-'));
  const targetDir = join(tmpDir, 'dreamskin-prism');
  try {
    const r = spawnSync(
      process.execPath,
      [join(root, 'tools', 'install-agy-plugin.mjs'), '--target', targetDir],
      { encoding: 'utf8', cwd: root, timeout: 30000 },
    );
    assert.equal(r.status, 0, 'install-agy-plugin failed:\n' + r.stdout + r.stderr);
    assert.equal(lstatSync(targetDir).isSymbolicLink(), false, 'Install dir must be a real directory, never a symlink/junction');
    assert.equal(existsSync(join(targetDir, 'plugin.json')), true);
    assert.equal(existsSync(join(targetDir, '.prism-install-id')), true);
    assert.equal(existsSync(join(targetDir, 'sidecars', 'prism_studio', 'main.mjs')), true);
    assert.equal(existsSync(join(targetDir, 'src', 'studio-daemon.mjs')), true);
    assert.equal(existsSync(join(targetDir, 'src', 'studio-ui', 'dist', 'index.html')), true);
    assert.equal(existsSync(join(targetDir, 'skills', 'dreamskin-prism', 'SKILL.md')), true);

    // Syntax check installed sidecar entrypoint
    const chk = spawnSync(process.execPath, ['--check', join(targetDir, 'sidecars', 'prism_studio', 'main.mjs')], { encoding: 'utf8' });
    assert.equal(chk.status, 0, chk.stderr);

    // Cold-boot responsiveness regression test: installed sidecar must bind and serve /api/state within 4s
    const { spawn } = await import('node:child_process');
    const http = await import('node:http');
    const tmpData = mkdtempSync(join(tmpdir(), 'ds-sc-boot-'));
    const child = spawn(process.execPath, [join(targetDir, 'sidecars', 'prism_studio', 'main.mjs')], {
      env: { ...process.env, DREAMSKIN_DATA_DIR: tmpData, ANTIGRAVITY_SIDECAR_WEB_PORT: '0', ANTIGRAVITY_SIDECAR_UI_TOKEN: 't-cold' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const port = await new Promise((resolvePort, rejectPort) => {
        let buf = '';
        const timer = setTimeout(() => rejectPort(new Error('Cold-boot sidecar timeout: ' + buf)), 4000);
        child.stdout.on('data', (d) => {
          buf += d.toString();
          const m = /127\.0\.0\.1:(\d+)/.exec(buf);
          if (m) { clearTimeout(timer); resolvePort(Number(m[1])); }
        });
        child.stderr.on('data', (d) => { buf += d.toString(); });
        child.once('exit', (code) => { clearTimeout(timer); rejectPort(new Error(`Exited ${code}: ${buf}`)); });
      });
      const st = await new Promise((res, rej) => {
        http.get(
          { host: '127.0.0.1', port, path: '/api/state', agent: false, headers: { Connection: 'close' } },
          (r) => {
            const chunks = [];
            r.on('data', (c) => chunks.push(c));
            r.on('end', () => res(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
          },
        ).on('error', rej);
      });
      assert.equal(st.ok, true);
      assert.equal(st.version, '4.0.0');
      assert.equal(st.apps.length, 9);
    } finally {
      try { child.stdout.destroy(); } catch {}
      try { child.stderr.destroy(); } catch {}
      try { child.unref(); } catch {}
      try {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 3000 });
        } else {
          child.kill('SIGKILL');
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
      try { rmSync(tmpData, { recursive: true, force: true }); } catch {}
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
