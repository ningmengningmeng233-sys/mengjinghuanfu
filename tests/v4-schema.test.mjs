import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRISM_DOM,
  COLOR_SCHEMES,
  COLOR_SCHEME_IDS,
  SCENE_PRESETS,
  SCENE_PRESET_IDS,
  FACTORY_PRESETS,
  DEFAULT_CONFIG,
  DEFAULT_V4_STORE,
  sanitizeConfig,
  sanitizeV4Store,
  resolveAppEffectiveConfig,
  resolveSchemeTokens,
  hexToRgbTriplet,
} from '../src/prism/shared/schema.mjs';
import { resolveLocale, t } from '../src/prism/shared/i18n.mjs';

test('v4 schema: COLOR_SCHEMES has 8 paired dark/light schemes and 4 simple scene presets', () => {
  assert.equal(COLOR_SCHEME_IDS.length, 8);
  for (const id of COLOR_SCHEME_IDS) {
    assert.ok(COLOR_SCHEMES[id].dark.baseRgb);
    assert.ok(COLOR_SCHEMES[id].light.baseRgb);
  }
  assert.deepEqual(SCENE_PRESET_IDS, ['crystal', 'islands', 'focus', 'eco']);
  assert.ok(SCENE_PRESETS.islands.patch.glassOpacity >= 0.6 && SCENE_PRESETS.islands.patch.glassOpacity <= 0.9);
  assert.ok(Array.isArray(FACTORY_PRESETS) && FACTORY_PRESETS.length >= 4);
  assert.equal(PRISM_DOM.adapterStyleId, 'agy-prism-adapter-css');
});

test('v4 schema: sanitizeV4Store produces version 4 with global defaults and per-app overrides', () => {
  const clean = sanitizeV4Store(null);
  assert.equal(clean.version, 4);
  assert.equal(clean.global.focusFreezeEnabled, true);
  assert.equal(clean.global.pauseOnBattery, true);
  assert.equal(typeof clean.apps, 'object');
  assert.equal(clean.global.glassOpacity, DEFAULT_CONFIG.glassOpacity);
  assert.equal(DEFAULT_V4_STORE.version, 4);
});

test('v4 schema: resolveAppEffectiveConfig merges global + app overrides + per-wallpaper without mutating siblings', () => {
  const store = sanitizeV4Store({
    version: 4,
    global: {
      colorScheme: 'prism-default',
      glassOpacity: 0.76,
      scrimOpacity: 0.26,
      activeWallpaperId: 'wp-global',
      perWallpaper: {
        'wp-custom': { scrimOpacity: 0.44 },
      },
    },
    apps: {
      cherry: {
        skinEnabled: true,
        inheritGlobal: false,
        overrides: {
          colorScheme: 'rose-pine',
          activeWallpaperId: 'wp-custom',
          glassOpacity: 0.68,
        },
      },
      antigravity: {
        skinEnabled: true,
        inheritGlobal: true,
        overrides: {},
      },
    },
  });

  const cherryCfg = resolveAppEffectiveConfig(store, 'cherry');
  const agyCfg = resolveAppEffectiveConfig(store, 'antigravity');

  assert.equal(cherryCfg.colorScheme, 'rose-pine');
  assert.equal(cherryCfg.activeWallpaperId, 'wp-custom');
  assert.equal(cherryCfg.glassOpacity, 0.68);
  assert.equal(cherryCfg.scrimOpacity, 0.44);

  assert.equal(agyCfg.colorScheme, 'prism-default');
  assert.equal(agyCfg.activeWallpaperId, 'wp-global');
  assert.equal(agyCfg.glassOpacity, 0.76);
  assert.equal(agyCfg.scrimOpacity, 0.26);
});

test('v4 schema: resolveSchemeTokens and hexToRgbTriplet compute dark/light tokens cleanly', () => {
  assert.equal(hexToRgbTriplet('#669DF6'), '102, 157, 246');
  assert.equal(hexToRgbTriplet('not-hex'), null);
  const darkTok = resolveSchemeTokens(sanitizeConfig({ colorScheme: 'nord', accentMode: 'cobalt' }), 'dark');
  const lightTok = resolveSchemeTokens(sanitizeConfig({ colorScheme: 'nord', accentMode: 'cobalt' }), 'light');
  assert.equal(darkTok.baseRgb, COLOR_SCHEMES.nord.dark.baseRgb);
  assert.equal(lightTok.baseRgb, COLOR_SCHEMES.nord.light.baseRgb);
  assert.equal(darkTok.accent, '#669DF6');
});

test('v4 i18n: resolves locale and provides plain Chinese user-facing copy', () => {
  assert.equal(resolveLocale('zh-CN'), 'zh');
  assert.equal(resolveLocale('en-US'), 'en');
  assert.ok(t('zh', 'appTitle').includes('梦境换肤'));
  assert.ok(t('zh', 'preset_islands_label').length > 0);
  assert.ok(t('zh', 'advancedDrawerTitle').length > 0);
  assert.ok(t('en', 'appTitle').includes('DreamSkin'));
});
