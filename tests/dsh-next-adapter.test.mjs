import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adapterById, validateAdapter } from '../src/core/adapters.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { findExe, processesForApp } from '../src/core/app-process.mjs';
import {
  PLUGIN_FILES,
  PLUGIN_NAME,
  PLUGIN_TEMPLATE_DIR,
  buildPluginFiles,
  createDshPluginChannel,
  resolveDefaultDshPluginsDir,
} from '../src/channels/dsh-plugin.mjs';
import { apply as applyDshPlugin, readSkinState } from '../src/channels/dsh-plugin/lib/main.js';

test('DSH adapter validates cleanly with zero absolute paths, supports DSH NEXT & DSH Desktop, and removes hashed class selectors', () => {
  const raw = adapterById('dsh');
  const errs = validateAdapter(raw, { dirName: 'dsh' });
  assert.deepEqual(errs, []);
  assert.ok(raw.discover.exeNames.includes('DSH NEXT.exe'));
  assert.ok(raw.discover.exeNames.includes('DSH Desktop.exe'));
  assert.ok(Array.isArray(raw.discover.uninstallDisplayNames));
  assert.ok(raw.discover.uninstallDisplayNames.includes('DSH NEXT'));
  assert.ok(raw.testedVersions.includes('2.0.24-next'));

  const profile = appRuntimeById('dsh');
  const pmText = JSON.stringify(profile.partsMap);
  assert.doesNotMatch(pmText, /qZBEgG_selected|fDq-QG_bubble/, 'hashed CSS module class names must be removed');
  assert.match(profile.extraCss, /--dsw-alias-bg-layer-1/);
  assert.match(profile.extraCss, /--dsw-alias-brand-primary/);
  assert.match(profile.extraCss, /--dsw-specific-sidebar-fill/, 'DSH extra.css must bridge real DSH NEXT sidebar token for full plugin parity');
  assert.match(profile.extraCss, /--dsw-alias-settings-card-fill/, 'DSH extra.css must bridge official settings/plugin card tokens');
  assert.match(profile.extraCss, /contain:\s*layout style/, 'DSH extra.css must isolate conversation scroll layout recalcs to prevent streaming lag');
  assert.doesNotMatch(pmText, /pre:has\(/, 'DSH parts-map must avoid expensive pre:has() during long markdown streaming');
});

test('multi-exe and multi-uninstall discovery picks live DSH NEXT.exe over stale DSH Desktop 2.0.18 (Review Focus #3)', () => {
  const profile = appRuntimeById('dsh');
  const fakeEntries = [
    {
      displayName: 'DSH Desktop 2.0.18',
      installLocation: '',
      displayIcon: 'E:\\OldDSH\\uninstallerIcon.ico',
      uninstallString: '"E:\\OldDSH\\Uninstall DSH Desktop.exe"',
    },
    {
      displayName: 'DSH NEXT 2.0.24-next',
      installLocation: '',
      displayIcon: 'F:\\AI\\DSHDesktop\\uninstallerIcon.ico',
      uninstallString: '"F:\\AI\\DSHDesktop\\Uninstall DSH NEXT.exe" /currentuser',
    },
  ];
  const found = findExe(profile, [], {
    exists: (p) => String(p).toLowerCase() === 'f:\\ai\\dshdesktop\\dsh next.exe',
    queryUninstallEntries: () => fakeEntries,
  });
  assert.equal(found.toLowerCase(), 'f:\\ai\\dshdesktop\\dsh next.exe');

  const procs = processesForApp(
    [
      { name: 'DSH NEXT.exe', pid: 101, path: 'F:\\AI\\DSHDesktop\\DSH NEXT.exe', cmd: '"F:\\AI\\DSHDesktop\\DSH NEXT.exe"' },
      { name: 'DSH NEXT.exe', pid: 102, path: 'F:\\AI\\DSHDesktop\\DSH NEXT.exe', cmd: '"F:\\AI\\DSHDesktop\\DSH NEXT.exe" --type=renderer' },
    ],
    profile,
  );
  assert.equal(procs.length, 2);
  assert.equal(procs[0].isMain, true);
  assert.equal(procs[1].isMain, false);
});

test('resolveDefaultDshPluginsDir discovers DSH NEXT plugin-packages from desktop-next-last-home.json or ~/.dsh', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ds-dsh-home-'));
  try {
    const fakeAppData = join(tmp, 'Roaming');
    const homeDir = join(tmp, 'dsh-home');
    mkdirSync(join(fakeAppData, 'DSH NEXT', 'home'), { recursive: true });
    writeFileSync(
      join(fakeAppData, 'DSH NEXT', 'home', 'desktop-next-last-home.json'),
      JSON.stringify({ home: homeDir }),
      'utf8',
    );
    const resolved = resolveDefaultDshPluginsDir({ env: { APPDATA: fakeAppData }, home: tmp });
    assert.equal(resolved, join(homeDir, 'plugin-packages'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('dsh-plugin channel enforces consent, installs dual-half package with client.js, writes skin+payload, and uninstalls cleanly', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ds-dsh-ch-'));
  try {
    const dataRoot = join(tmp, 'data');
    const pluginsRoot = join(tmp, 'plugin-packages');
    mkdirSync(dataRoot, { recursive: true });
    mkdirSync(pluginsRoot, { recursive: true });
    // Sibling plugin must never be touched
    const siblingDir = join(pluginsRoot, 'dsh-quota-panel');
    mkdirSync(siblingDir, { recursive: true });
    writeFileSync(join(siblingDir, 'package.json'), '{"name":"dsh-quota-panel"}', 'utf8');

    const ch = createDshPluginChannel({
      dataDir: (id) => {
        const d = join(dataRoot, id);
        mkdirSync(d, { recursive: true });
        return d;
      },
      pluginsDir: () => pluginsRoot,
      version: () => '4.1.0',
    });
    const adapter = { id: 'dsh', name: 'DeepSeek Harness' };

    await assert.rejects(() => ch.install(adapter, { consent: false }), /明确同意/);
    assert.equal(existsSync(join(pluginsRoot, PLUGIN_NAME)), false);

    const ins = await ch.install(adapter, { consent: true });
    assert.equal(ins.installed, true);
    assert.ok(PLUGIN_FILES.includes('lib/client.js'));
    assert.equal(existsSync(join(pluginsRoot, PLUGIN_NAME, 'lib', 'client.js')), true);

    const pkg = JSON.parse(readFileSync(join(pluginsRoot, PLUGIN_NAME, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '4.1.0');
    assert.equal(pkg.dsh?.id, PLUGIN_NAME);
    assert.equal(pkg.dsh?.client?.platform, 'web');
    assert.equal(pkg.dsh?.client?.immediately, true);

    await ch.setEnabled(adapter, true);
    await ch.launch(adapter, {
      layers: { vars: ':root{--prism-fg:#fff;}', parts: '[data-slot="sidebar"]{color:#fff;}', extra: '' },
      payload: { skinMode: 'optical', composition: { skinMode: 'optical', effectiveModules: { pixelCompanion: true } } },
    });

    const st = await ch.status(adapter);
    assert.equal(st.installed, true);
    assert.equal(st.enabled, true);
    assert.equal(st.skinActive, true);

    // Verify backend main.js serves index-inject and local state route
    const fakeEnv = { LOCALAPPDATA: join(tmp, 'local') };
    const fakeDshData = join(fakeEnv.LOCALAPPDATA, 'DreamSkin', 'dsh');
    mkdirSync(fakeDshData, { recursive: true });
    writeFileSync(join(fakeDshData, 'active-skin.css'), readFileSync(join(dataRoot, 'dsh', 'active-skin.css'), 'utf8'));
    writeFileSync(join(fakeDshData, 'active-payload.json'), readFileSync(join(dataRoot, 'dsh', 'active-payload.json'), 'utf8'));

    const loaded = readSkinState(fakeEnv);
    assert.equal(loaded.active, true);
    assert.equal(loaded.payload.skinMode, 'optical');

    const injectedRows = [];
    const routes = new Map();
    const fakeCtx = {
      on(ev, cb) {
        if (ev === 'webserver/index-inject') cb(injectedRows);
        return () => {};
      },
      inject(_deps, cb) {
        cb({
          webserver: {
            addRoute(path, handler) {
              routes.set(path, handler);
              return () => {};
            },
          },
        });
      },
    };
    const dispose = applyDshPlugin(fakeCtx, { env: fakeEnv });
    assert.ok(injectedRows.length >= 2);
    assert.ok(routes.has('/dsh-plugin-dreamskin/state'));
    assert.ok(routes.has('/dsh-plugin-dreamskin/optical.js'));
    dispose();

    // Disable removes skin + payload files
    await ch.setEnabled(adapter, false);
    assert.equal(existsSync(join(dataRoot, 'dsh', 'active-skin.css')), false);
    assert.equal(existsSync(join(dataRoot, 'dsh', 'active-payload.json')), false);

    // Uninstall removes only our files and preserves sibling plugin
    const un = await ch.uninstall(adapter);
    assert.equal(un.installed, false);
    assert.equal(existsSync(join(pluginsRoot, PLUGIN_NAME)), false);
    assert.equal(existsSync(join(siblingDir, 'package.json')), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('dsh-plugin template enforces hard privacy/security boundaries and valid client.js syntax (Review Focus #4)', () => {
  const files = buildPluginFiles('4.1.0');
  assert.ok(files['lib/client.js']);
  assert.doesNotThrow(() => new vm.Script(files['lib/client.js'], { filename: 'dsh-plugin/lib/client.js' }));
  assert.match(files['lib/client.js'], /__ModuleLoader__/);

  for (const [rel, content] of Object.entries(files)) {
    assert.doesNotMatch(content, /https?:\/\/(?!127\.0\.0\.1|localhost)/i, `${rel} must not contain external URLs`);
    assert.doesNotMatch(content, /document\.cookie|localStorage|sessionStorage|\.credentials\.yaml/i, `${rel} must not access cookies/storage/credentials`);
  }
  assert.ok(existsSync(join(PLUGIN_TEMPLATE_DIR, 'lib', 'client.js')));
});
