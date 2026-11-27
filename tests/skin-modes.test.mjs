import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SKIN_MODES,
  COMPANION_STYLES,
  COMPANION_POSITIONS,
  DEFAULT_SKIN_MODULES,
  EXCLUDED_HOST_FEATURES,
  sanitizeSkinModules,
  resolveSkinComposition,
  applySkinModePreset,
} from '../src/prism/shared/skin-modes.mjs';
import {
  DEFAULT_CONFIG,
  PLUGIN_VERSION,
  sanitizeConfig,
  sanitizeV4Store,
  resolveAppEffectiveConfig,
} from '../src/prism/shared/schema.mjs';
import { VERSION } from '../src/core/version.mjs';

test('version single source of truth is 4.1.0 across version.mjs, schema.mjs, and plugin.json', () => {
  const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, '4.1.0');
  assert.equal(PLUGIN_VERSION, '4.1.0');
  assert.equal(manifest.version, '4.1.0');
});

test('skin mode constants and excluded single-host features are well defined', () => {
  assert.deepEqual(SKIN_MODES, ['optical', 'wallpaper', 'hybrid']);
  assert.deepEqual(COMPANION_STYLES, ['clawd', 'neko', 'crabs', 'orb']);
  assert.deepEqual(COMPANION_POSITIONS, ['bottom-right', 'bottom-left', 'top-right']);
  assert.equal(typeof DEFAULT_SKIN_MODULES.wallpaperLayer, 'boolean');
  assert.ok(Array.isArray(EXCLUDED_HOST_FEATURES) && EXCLUDED_HOST_FEATURES.length >= 3);
  assert.ok(EXCLUDED_HOST_FEATURES.some((f) => f.id === 'context-vial'));
  assert.ok(EXCLUDED_HOST_FEATURES.some((f) => f.id === 'effort-slider'));
});

test('optical mode enables optical layers & companion and disables conflicting wallpaper/glass layers', () => {
  const cfg = applySkinModePreset(DEFAULT_CONFIG, 'optical');
  const comp = resolveSkinComposition(cfg, { appId: 'dsh', hasWallpaper: true });
  assert.equal(comp.skinMode, 'optical');
  assert.equal(comp.yielded, false);
  assert.equal(comp.effectiveModules.opticalPalette, true);
  assert.equal(comp.effectiveModules.opticalFacet, true);
  assert.equal(comp.effectiveModules.microMotion, true);
  assert.equal(comp.effectiveModules.pixelCompanion, true);
  assert.equal(comp.effectiveModules.wallpaperLayer, false);
  assert.equal(comp.effectiveModules.glassLayer, false);
  assert.ok(comp.disabledModules.some((d) => d.module === 'wallpaperLayer'));
  assert.ok(comp.disabledModules.some((d) => d.module === 'glassLayer'));
});

test('optical mode allows user to turn off pixelCompanion or microMotion independently', () => {
  const cfg = sanitizeConfig({
    skinMode: 'optical',
    modules: { pixelCompanion: false, microMotion: false },
  });
  const comp = resolveSkinComposition(cfg, { appId: 'dsh' });
  assert.equal(comp.effectiveModules.pixelCompanion, false);
  assert.equal(comp.effectiveModules.microMotion, false);
  assert.equal(comp.effectiveModules.opticalPalette, true);
  assert.equal(comp.effectiveModules.opticalFacet, true);
});

test('wallpaper mode keeps wallpaper + glass and disables optical facet/motion/companion conflicts', () => {
  const cfg = sanitizeConfig({
    skinMode: 'wallpaper',
    modules: {
      wallpaperLayer: true,
      glassLayer: true,
      opticalFacet: true,
      microMotion: true,
      pixelCompanion: true,
    },
  });
  const comp = resolveSkinComposition(cfg, { appId: 'cherry', hasWallpaper: true });
  assert.equal(comp.skinMode, 'wallpaper');
  assert.equal(comp.effectiveModules.wallpaperLayer, true);
  assert.equal(comp.effectiveModules.glassLayer, true);
  assert.equal(comp.effectiveModules.opticalFacet, false);
  assert.equal(comp.effectiveModules.microMotion, false);
  assert.equal(comp.effectiveModules.pixelCompanion, false);
  assert.ok(comp.conflicts.length >= 1);
});

test('hybrid mode allows free combination and automatically disables glassLayer when wallpaperLayer is off (Review Focus #2)', () => {
  const freeMix = sanitizeConfig({
    skinMode: 'hybrid',
    modules: {
      wallpaperLayer: true,
      glassLayer: true,
      opticalPalette: true,
      opticalFacet: true,
      microMotion: true,
      pixelCompanion: true,
    },
  });
  const compFull = resolveSkinComposition(freeMix, { appId: 'dsh', hasWallpaper: true });
  assert.equal(compFull.skinMode, 'hybrid');
  assert.equal(compFull.effectiveModules.wallpaperLayer, true);
  assert.equal(compFull.effectiveModules.glassLayer, true);
  assert.equal(compFull.effectiveModules.opticalFacet, true);
  assert.equal(compFull.effectiveModules.microMotion, true);
  assert.equal(compFull.effectiveModules.pixelCompanion, true);
  assert.equal(compFull.conflicts.length, 0);

  const noWall = sanitizeConfig({
    skinMode: 'hybrid',
    modules: {
      wallpaperLayer: false,
      glassLayer: true,
      opticalPalette: true,
      opticalFacet: true,
      microMotion: true,
      pixelCompanion: true,
    },
  });
  const compNoWall = resolveSkinComposition(noWall, { appId: 'dsh', hasWallpaper: true });
  assert.equal(compNoWall.effectiveModules.wallpaperLayer, false);
  assert.equal(compNoWall.effectiveModules.glassLayer, false);
  assert.ok(compNoWall.conflicts.some((c) => c.code === 'glass-without-wallpaper'));
});

test('compat adapter mode degrades glassLayer safely with warning', () => {
  const cfg = sanitizeConfig({ skinMode: 'hybrid', modules: { wallpaperLayer: true, glassLayer: true, opticalPalette: true } });
  const comp = resolveSkinComposition(cfg, { appId: 'codex', adapterMode: 'compat', hasWallpaper: true });
  assert.equal(comp.effectiveModules.glassLayer, false);
  assert.ok(comp.warnings.some((w) => w.code === 'compat-glass-degraded'));
});

test('external plugin conflict yields peacefully unless forceTakeover is true', () => {
  const cfg = sanitizeConfig({ skinMode: 'hybrid' });
  const yielded = resolveSkinComposition(cfg, { appId: 'antigravity', hasPluginConflict: true, conflictName: 'Obsidian Prism' });
  assert.equal(yielded.yielded, true);
  assert.equal(yielded.effectiveModules.wallpaperLayer, false);
  assert.equal(yielded.effectiveModules.opticalFacet, false);
  assert.ok(yielded.conflicts.some((c) => c.code === 'external-plugin-conflict'));

  const forced = resolveSkinComposition(cfg, { appId: 'antigravity', hasPluginConflict: true, forceTakeover: true });
  assert.equal(forced.yielded, false);
  assert.equal(forced.effectiveModules.wallpaperLayer, true);
});

test('legacy v4.0.0 store without skinMode/modules migrates losslessly to wallpaper mode (Review Focus #1)', () => {
  const legacyStore = {
    version: 4,
    global: {
      skinEnabled: true,
      activeWallpaperId: 'up-dir-62188827ed',
      glassOpacity: 0.76,
      glassBlur: 16,
      colorScheme: 'prism-default',
    },
    apps: {
      dsh: {
        skinEnabled: true,
        inheritGlobal: false,
        overrides: {
          activeWallpaperId: 'up-dir-a2d674ae98',
          skinEnabled: true,
        },
      },
    },
  };
  const clean = sanitizeV4Store(legacyStore);
  assert.equal(clean.global.skinMode, 'wallpaper');
  assert.equal(clean.global.activeWallpaperId, 'up-dir-62188827ed');
  assert.equal(clean.global.glassOpacity, 0.76);

  const dshEff = resolveAppEffectiveConfig(clean, 'dsh');
  assert.equal(dshEff.activeWallpaperId, 'up-dir-a2d674ae98');
  assert.equal(dshEff.skinMode, 'wallpaper');
  assert.equal(dshEff.companionStyle, 'clawd');
  assert.equal(sanitizeSkinModules({ pixelCompanion: 'true' }).pixelCompanion, true);
});
