#!/usr/bin/env node
// Deterministic local deployment script for DreamSkin Prism v4.1.0.
// 1) Rebuilds Studio UI dist/index.html
// 2) Syncs runtime plugin files to Antigravity plugin dir (never copies .git/tests/docs/.lemon)
// 3) Installs & enables dual-half native plugin dsh-plugin-dreamskin into DSH NEXT plugin-packages
// 4) Updates v4-store.json safely (Antigravity peaceful coexistence with obsidian-prism; DSH hybrid 3-mode active)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStudioUi } from './build-studio-ui.mjs';
import { buildOpticalBundle } from './build-optical-bundle.mjs';
import { VERSION } from '../src/core/version.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';
import { dshPluginChannel, resolveDefaultDshPluginsDir } from '../src/channels/dsh-plugin.mjs';
import { compileAdapterPrismCss } from '../src/theme/prism-bridge.mjs';
import { buildClientSkinPayload, buildStaticCssSheet } from '../src/prism/host/index.mjs';
import {
  DEFAULT_V4_STORE,
  resolveAppEffectiveConfig,
  resolveSkinComposition,
  sanitizeV4Store,
} from '../src/prism/shared/schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_ROOT = resolve(__dirname, '..');
const AGY_PLUGIN_DIR = process.env.DREAMSKIN_DEPLOY_PLUGIN_DIR || join(homedir(), '.gemini', 'config', 'plugins', 'dreamskin-prism');
const V4_DATA_DIR = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'DreamSkin', 'v4');
const V4_STORE_FILE = join(V4_DATA_DIR, 'v4-store.json');

const RUNTIME_ENTRIES = [
  'plugin.json',
  'LICENSE',
  'README.md',
  'THIRD-PARTY-NOTICES.md',
  'assets',
  'sidecars',
  'skills',
  'src',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // 1. Rebuild Obsidian Optical Suite bundle & Studio UI dist
  const opticalBuild = buildOpticalBundle({ syncUpstream: false });
  const uiBuild = buildStudioUi();

  // 2. Sync runtime files to Antigravity plugin dir
  if (!dryRun) {
    mkdirSync(AGY_PLUGIN_DIR, { recursive: true });
    for (const entry of RUNTIME_ENTRIES) {
      const srcPath = join(DEV_ROOT, entry);
      const dstPath = join(AGY_PLUGIN_DIR, entry);
      if (!existsSync(srcPath)) continue;
      if (existsSync(dstPath) && entry === 'src') {
        rmSync(dstPath, { recursive: true, force: true });
      }
      cpSync(srcPath, dstPath, { recursive: true, force: true });
    }
  }

  // 3. Safely update v4-store.json (preserve user wallpapers/overrides, set Antigravity peaceful coexistence, enable DSH 3-mode)
  let store = sanitizeV4Store(DEFAULT_V4_STORE);
  if (existsSync(V4_STORE_FILE)) {
    try {
      store = sanitizeV4Store(JSON.parse(readFileSync(V4_STORE_FILE, 'utf8').replace(/^\uFEFF/, '')));
    } catch {}
  }

  // Peaceful coexistence on Antigravity (obsidian-prism active)
  const agyPrev = store.apps.antigravity || { skinEnabled: false, inheritGlobal: false, overrides: {} };
  store.apps.antigravity = {
    ...agyPrev,
    skinEnabled: false,
  };

  // DSH NEXT enabled with 3-mode hybrid (preserves user's existing activeWallpaperId)
  const dshPrev = store.apps.dsh || { skinEnabled: true, inheritGlobal: false, overrides: {} };
  store.apps.dsh = {
    skinEnabled: true,
    inheritGlobal: false,
    overrides: {
      ...(dshPrev.overrides || {}),
      skinEnabled: true,
      skinMode: dshPrev.overrides?.skinMode || 'hybrid',
      modules: dshPrev.overrides?.modules || {
        wallpaperLayer: true,
        glassLayer: true,
        opticalPalette: true,
        opticalFacet: true,
        microMotion: true,
        pixelCompanion: true,
      },
      companionStyle: dshPrev.overrides?.companionStyle || 'clawd',
      companionPosition: dshPrev.overrides?.companionPosition || 'bottom-right',
    },
  };
  store = sanitizeV4Store(store);

  if (!dryRun) {
    mkdirSync(V4_DATA_DIR, { recursive: true });
    writeFileSync(V4_STORE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
  }

  // 4. Install & enable dual-half native plugin into DSH NEXT plugin-packages and write initial compiled 3-mode skin
  const dshProfile = appRuntimeById('dsh');
  const dshPluginsDir = resolveDefaultDshPluginsDir();
  let dshResult = { skipped: true, reason: 'dshPluginsDir not found' };
  if (dshPluginsDir && !dryRun) {
    const ins = await dshPluginChannel.install(dshProfile, { consent: true });
    await dshPluginChannel.setEnabled(dshProfile, true);
    const effCfg = resolveAppEffectiveConfig(store, 'dsh');
    const comp = resolveSkinComposition(effCfg, { appId: 'dsh', adapterMode: 'full', hasWallpaper: Boolean(effCfg.activeWallpaperId) });
    const compiled = compileAdapterPrismCss({
      appId: 'dsh',
      partsMap: dshProfile.partsMap,
      extraCss: dshProfile.extraCss,
      mode: 'full',
      composition: comp,
    });
    const payload = buildClientSkinPayload(effCfg, null, '', {
      skinEnabled: true,
      composition: comp,
      adapterProfile: { appId: 'dsh', mode: compiled.mode, adapterCss: compiled.adapterCss, browserHoleSupport: false },
    });
    const varsCss = buildStaticCssSheet(payload);
    await dshPluginChannel.launch(dshProfile, {
      layers: { vars: varsCss, parts: compiled.adapterCss, extra: dshProfile.extraCss || '' },
      payload,
    });
    const st = await dshPluginChannel.status(dshProfile);
    dshResult = { ...ins, ...st, skinMode: comp.skinMode };
  }

  console.log(JSON.stringify({
    ok: true,
    version: VERSION,
    dryRun,
    studioUiBytes: uiBuild.bytes,
    agyPluginDir: AGY_PLUGIN_DIR,
    v4StoreFile: V4_STORE_FILE,
    dshPluginsDir,
    dshPlugin: dshResult,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
