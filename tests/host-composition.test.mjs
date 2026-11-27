import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { compileAdapterPrismCss } from '../src/theme/prism-bridge.mjs';
import { buildClientSkinPayload, buildStaticCssSheet, getHostSkinScript } from '../src/prism/host/index.mjs';
import { applySkinModePreset, DEFAULT_CONFIG, resolveSkinComposition } from '../src/prism/shared/schema.mjs';

const SAMPLE_PARTS_MAP = {
  'app.root': { selector: '#root', scopeBody: 'body' },
  'app.sidebar': { selector: '[data-slot="sidebar"]' },
  'app.topbar': { selector: '[data-slot="conversation.header"]' },
  'app.content': { selector: '[data-slot="main"]' },
  'chat.messages': { selector: '[data-conversation-scroll]' },
  'chat.bubble.user': { selector: '[data-chat-flow-kind="user"]' },
  'chat.composer': { selector: '[data-composer-card]' },
  'code.block': { selector: '.md-code-block' },
};

test('compileAdapterPrismCss emits solid optical facets without backdrop-filter in optical mode', () => {
  const cfg = applySkinModePreset(DEFAULT_CONFIG, 'optical');
  const composition = resolveSkinComposition(cfg, { appId: 'dsh' });
  const res = compileAdapterPrismCss({
    appId: 'dsh',
    partsMap: SAMPLE_PARTS_MAP,
    extraCss: '/* extra */',
    mode: 'full',
    composition,
  });
  assert.equal(res.skinMode, 'optical');
  assert.match(res.adapterCss, /data-prism-skin-mode="optical"/);
  assert.doesNotMatch(res.adapterCss, /backdrop-filter:\s*blur\(/, 'optical mode must not emit glass backdrop-filter blur');
  assert.match(res.adapterCss, /--prism-surface-sidebar/);
  assert.match(res.adapterCss, /data-prism-optical-facet="on"/);
  assert.match(res.adapterCss, /data-prism-motion="on"/);
});

test('compileAdapterPrismCss preserves liquid glass blur in wallpaper and hybrid modes', () => {
  const cfg = applySkinModePreset(DEFAULT_CONFIG, 'hybrid');
  const composition = resolveSkinComposition(cfg, { appId: 'dsh', hasWallpaper: true });
  const res = compileAdapterPrismCss({
    appId: 'dsh',
    partsMap: SAMPLE_PARTS_MAP,
    mode: 'full',
    composition,
  });
  assert.equal(res.skinMode, 'hybrid');
  assert.match(res.adapterCss, /backdrop-filter:\s*blur\(/);
  assert.match(res.adapterCss, /data-prism-optical-facet="on"/);
  assert.match(res.adapterCss, /data-prism-motion="on"/);
});

test('buildClientSkinPayload attaches resolved composition and version 4.1.0', () => {
  const cfg = applySkinModePreset(DEFAULT_CONFIG, 'optical');
  const payload = buildClientSkinPayload(cfg, null, 'http://127.0.0.1:40000', {
    adapterProfile: { appId: 'dsh', mode: 'full', adapterCss: '' },
  });
  assert.equal(payload.version, '4.1.0');
  assert.equal(payload.composition.skinMode, 'optical');
  assert.equal(payload.composition.effectiveModules.wallpaperLayer, false);
  assert.equal(payload.composition.effectiveModules.pixelCompanion, true);
});

test('buildStaticCssSheet omits wallpaper ::before and keeps solid surfaces in optical mode', () => {
  const cfg = applySkinModePreset(DEFAULT_CONFIG, 'optical');
  const payload = buildClientSkinPayload(cfg, { id: 'w1', kind: 'image', mediaUrl: 'http://127.0.0.1:40000/img.png' }, 'http://127.0.0.1:40000');
  const css = buildStaticCssSheet(payload);
  assert.match(css, /mode=optical/);
  assert.doesNotMatch(css, /url\("http:\/\/127\.0\.0\.1:40000\/img\.png"\)/);
  assert.match(css, /--prism-surface-sidebar/);
});

test('wallpaper-inject.js + optical-bundle.js parse cleanly, expose 4.1.0, and ship real Obsidian Prism optical & mascot rig', () => {
  const src = getHostSkinScript({ reload: true });
  assert.doesNotThrow(() => new vm.Script(src, { filename: 'wallpaper-inject-with-optical.js' }));
  assert.match(src, /var VERSION = '4\.1\.0'/);
  assert.match(src, /__dreamSkinOptical/);
  assert.match(src, /__agDualMascotRig/);
  assert.match(src, /__agPrismRimCanvas/);
  assert.match(src, /__agMotionEngine/);
  assert.match(src, /__agAnimatedIcons/);
  assert.match(src, /__agCsRippleCore/);
  assert.match(src, /__agPrismSmoothCaret/);
  assert.match(src, /targetHost\.appendChild\(stage\)/, 'mascot stage must be appended last so feet are never clipped behind composer border');
  assert.match(src, /return \{ mascot: 'crab', camp: 'gemini', miniPileEnabled: false \}/, 'default crab duo must match Obsidian Prism Clawd-left / Neko-right order');
  assert.match(src, /prism: horizonPrism/, 'WebGL2 Brand Horizon Glow must enable prism caustics for vibrant colors');
  assert.match(src, /surge: breathSurge/, 'WebGL2 Brand Horizon Glow must breathe vivid prism surge crest');
  assert.match(src, /_ComposerLayoutRoot_/, 'optical-suite must cover Codex composer selector');
  assert.match(src, /data-composer-surface-variant/, 'optical-suite must cover Codex 26.1117+ composer selector');
  assert.match(src, /data-ui="chat\.composer-floating-capsule"/, 'optical-suite must cover Cherry 2.1.6/2.2.3 floating capsule composer');
  assert.match(src, /data-message-input-root/, 'optical-suite must cover MiniMax Code/Design 3.x composer selector');
  assert.match(src, /conversation-input-area/, 'optical-suite must cover WorkBuddy 5.5.6 composer selector');
  assert.match(src, /data-chat-composer-surface="true"/, 'optical-suite must cover T3 Code composer selector');
  assert.match(src, /session-followup-dock/, 'optical-suite must cover OpenCode composer selector');
  assert.match(src, /data-ui="chat\.composer"/, 'optical-suite must cover Cherry Studio composer selector');
  assert.match(src, /v4-composer/, 'optical-suite must cover ZCode composer selector');
  assert.match(src, /interactive-input-part/, 'optical-suite must cover VS Code/Qoder/Kiro/Windsurf chat composer selector');
  assert.match(src, /new G\.MutationObserver/, 'optical-suite must re-attach mascots & horizon after SPA route/session switches');
  assert.match(src, /mascotRig\.notify\(eventName/, 'optical-suite must invoke real dual-mascot-rig notify(event, payload) API');
  assert.match(src, /mascotRig\.syncPowerState/, 'optical-suite must sync mascot power state on wake/activity');
  assert.match(src, /keepAliveWhileVisible:\s*true/, 'optical-suite must keep mascots alive while visible in side-pane/multi-monitor windows');
  assert.match(src, /!options\.keepAliveWhileVisible && wb/, 'dual-mascot-rig bundle must honor keepAliveWhileVisible option');
  assert.match(src, /Number\(options\.firstTheaterDelayMs\) \|\| 3800/, 'dual-mascot-rig bundle must honor firstTheaterDelayMs option');
  assert.equal(DEFAULT_CONFIG.mascotSpec, 'crab', 'default mascot spec must be clean dual Clawd+Neko without unsolicited mini-crabs');
  assert.equal(DEFAULT_CONFIG.vividness, 'balanced', 'default background chroma vividness must be refined balanced');
  assert.match(src, /data-prism-skin-mode/);
  assert.match(src, /data-prism-optical-facet/);
  assert.match(src, /data-prism-motion/);
  const raw = readFileSync(new URL('../src/prism/host/wallpaper-inject.js', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /octopath-stage-webgl|tavern-atlas-data/);
});

test('DSH flagship preview HTML parses with zero JS syntax errors, zero missing element IDs, authentic DSH icon, and 4-source quota dock', async () => {
  const { renderPreviewHtml } = await import('../scripts/dsh-live-preview-server.mjs');
  const html = renderPreviewHtml();
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scriptMatches.length >= 1, 'inline preview script must exist');
  const inlineJs = scriptMatches[scriptMatches.length - 1][1];
  assert.doesNotThrow(() => new vm.Script(inlineJs, { filename: 'dsh-preview-inline.js' }));

  const referencedIds = [...inlineJs.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.ok(referencedIds.length >= 15);
  for (const id of new Set(referencedIds)) {
    assert.ok(
      html.includes(`id="${id}"`) || inlineJs.includes(`id="${id}"`),
      `missing DOM element id="${id}" referenced by getElementById`,
    );
  }
  assert.match(html, /\/app-icon\/dsh\.png/, 'DSH brand must use authentic DSH icon');
  assert.doesNotMatch(inlineJs, /renderGoogleSparkOrbitSvg/, 'DSH preview must not use Gemini sparkle for DSH branding');
  assert.match(inlineJs, /DeepSeek 官网/);
  assert.match(inlineJs, /Claude Pool/);
  assert.match(inlineJs, /Gemini Pro/);
  assert.match(inlineJs, /OpenAI \/ Codex/);
  assert.match(html, /id="studio-home-panel"/);
  assert.match(html, /id="btn-telemetry-pill"/, 'composer bar must embed sleek inline telemetry progress capsule');
  assert.match(html, /id="ds-telemetry-pop"/, 'floating smoked-glass telemetry vial & multi-source quota popover must exist');
  assert.match(html, /id="ds-cmd-backdrop"/, 'global Ctrl+K command palette must exist');
  assert.match(html, /id="conv-turn-rail"/, 'conversation turn minimap rail must exist');
  assert.match(html, /id="dr-ui-font-seg"/, 'user-selectable UI font style switcher must exist');
  assert.match(html, /id="dr-text-style-seg"/, 'user-selectable stylized text color switcher must exist');
  assert.match(html, /id="dr-mascot-theater"/, 'mascot live theater trigger controls must exist');
  assert.match(html, /id="dr-hab-seg"/, 'corner pixel habitat prop selector must exist');
  assert.match(html, /id="btn-pomo-pill"/, '25m focus Pomodoro micro-pill must exist');
  assert.match(html, /id="btn-client-switch"/, 'multi-client live switcher button must exist');
  assert.match(html, /id="btn-sync-all"/, 'one-click sync-all-clients button must exist');
  assert.match(html, /id="sb-active-pill"/, 'silky GPU-composited sliding active sidebar pill must exist');
  assert.match(html, /id="sb-hover-pill"/, 'silky GPU-composited sliding hover sidebar pill must exist');
  assert.match(html, /--st-heading-grad/, 'unified palette CSS token engine must drive harmonized stylized colors');
});
