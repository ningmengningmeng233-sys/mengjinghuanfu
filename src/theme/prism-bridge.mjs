// Semantic Parts -> Three-Mode Optical & Liquid Glass Bridge (DreamSkin Prism v4.1).
// Compiles any DreamSkin adapter's parts-map.json into a scoped CSS layer supporting:
// - optical: solid optical palettes + faceted bevel borders + micro-motion (zero backdrop-filter blur)
// - wallpaper: transparent hollow canvas + liquid glass islands over #agy-prism-stage
// - hybrid: user-picked combination respecting deterministic conflict resolution

import { resolveSkinComposition } from '../prism/shared/skin-modes.mjs';

function splitSelectors(sel) {
  return String(sel || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function scopeSelectors(sel, attrPrefix = 'html[data-agy-prism-skin]') {
  const parts = splitSelectors(sel);
  if (parts.length === 0) return '';
  return parts
    .map((s) => {
      if (s.startsWith('html')) return s.replace(/^html\b/, attrPrefix);
      return `${attrPrefix} ${s}`;
    })
    .join(',\n');
}

function collectPartSelectors(entry, keys = ['selector']) {
  if (!entry || typeof entry !== 'object') return [];
  const out = [];
  for (const k of keys) {
    if (typeof entry[k] === 'string' && entry[k].trim()) {
      out.push(...splitSelectors(entry[k]));
    }
  }
  return [...new Set(out)];
}

export function compileAdapterPrismCss({
  appId = '',
  partsMap = {},
  extraCss = '',
  mode = 'full',
  composition = null,
} = {}) {
  const map = partsMap && typeof partsMap === 'object' ? partsMap : {};
  const isCompat = mode === 'compat';
  const comp =
    composition && typeof composition === 'object' && composition.effectiveModules
      ? composition
      : resolveSkinComposition({ skinMode: 'wallpaper' }, { appId, adapterMode: mode, hasWallpaper: true });
  const skinMode = comp.skinMode || 'wallpaper';
  const eff = comp.effectiveModules || {};
  const useWallpaper = Boolean(eff.wallpaperLayer);
  const useGlass = Boolean(eff.glassLayer) && useWallpaper && !isCompat;
  const useOpticalFacet = Boolean(eff.opticalFacet);
  const useMicroMotion = Boolean(eff.microMotion);

  const rootPrefix = `html[data-agy-prism-skin][data-prism-skin-mode="${skinMode}"]`;
  const blocks = [
    `/* DreamSkin Prism v4.1 Adapter Bridge (${appId || 'generic'}, mode=${isCompat ? 'compat' : 'full'}, skinMode=${skinMode}) */`,
  ];
  const coveredParts = [];

  // 1. app.root
  const rootEntry = map['app.root'];
  const rootSels = collectPartSelectors(rootEntry, ['selector', 'scopeBody']);
  if (rootSels.length > 0) {
    coveredParts.push('app.root');
    const scoped = scopeSelectors(rootSels.join(', '), rootPrefix);
    blocks.push(
      useWallpaper
        ? `/* part: app.root (wallpaper canvas) */\n${scoped} {\n  background-color: transparent !important;\n  background-image: none !important;\n}`
        : `/* part: app.root (solid optical surface) */\n${scoped} {\n  background-color: var(--prism-native-floor, var(--prism-surface-chat)) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  } else {
    blocks.push(
      useWallpaper
        ? `/* part: app.root (fallback) */\n${rootPrefix} body, ${rootPrefix} #root {\n  background-color: transparent !important;\n}`
        : `/* part: app.root (optical fallback) */\n${rootPrefix} body, ${rootPrefix} #root {\n  background-color: var(--prism-native-floor, #0e0e11) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  if (isCompat && useWallpaper) {
    if (extraCss && String(extraCss).trim()) {
      blocks.push(`/* adapter extra css */\n${String(extraCss).trim()}`);
    }
    return {
      mode: 'compat',
      skinMode,
      coveredParts,
      adapterCss: blocks.join('\n\n') + '\n',
    };
  }

  const glassBlurMd = useGlass
    ? '  backdrop-filter: blur(var(--prism-blur-md, 16px)) saturate(140%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-md, 16px)) saturate(140%) !important;\n'
    : '  backdrop-filter: none !important;\n  -webkit-backdrop-filter: none !important;\n';
  const glassBlurLg = useGlass
    ? '  backdrop-filter: blur(var(--prism-blur-lg, 20px)) saturate(145%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-lg, 20px)) saturate(145%) !important;\n'
    : '  backdrop-filter: none !important;\n  -webkit-backdrop-filter: none !important;\n';
  const glassBlurXl = useGlass
    ? '  backdrop-filter: blur(var(--prism-blur-xl, 26px)) saturate(155%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-xl, 26px)) saturate(155%) !important;\n'
    : '  backdrop-filter: none !important;\n  -webkit-backdrop-filter: none !important;\n';

  // 2. app.content
  const contentSels = collectPartSelectors(map['app.content'], ['selector', 'wrap', 'card']);
  if (contentSels.length > 0) {
    coveredParts.push('app.content');
    blocks.push(
      `/* part: app.content */\n${scopeSelectors(contentSels.join(', '), rootPrefix)} {\n  background-color: ${useWallpaper ? 'var(--prism-surface-canvas, transparent)' : 'var(--prism-surface-chat)'} !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 3. app.sidebar
  const sidebarSels = collectPartSelectors(map['app.sidebar'], ['selector', 'pane']);
  if (sidebarSels.length > 0) {
    coveredParts.push('app.sidebar');
    const sbExtra = useWallpaper
      ? `  border-radius: var(--prism-r-island, 12px) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top), var(--prism-shadow-island) !important;\n`
      : `  border-right: 1px solid var(--prism-border-hairline) !important;\n  box-shadow: none !important;\n`;
    blocks.push(
      `/* part: app.sidebar */\n${scopeSelectors(sidebarSels.join(', '), rootPrefix)} {\n  background: ${useWallpaper ? 'var(--prism-sheen, none), ' : ''}var(--prism-surface-sidebar) !important;\n${glassBlurMd}  border-color: var(--prism-border-island) !important;\n${sbExtra}  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 4. app.sidebar.item
  const itemSels = collectPartSelectors(map['app.sidebar.item'], ['selector', 'active']);
  if (itemSels.length > 0) {
    coveredParts.push('app.sidebar.item');
    blocks.push(
      `/* part: app.sidebar.item */\n${scopeSelectors(itemSels.join(', '), rootPrefix)} {\n  border-radius: var(--prism-r-ctl, 8px) !important;\n  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;\n}`,
    );
  }

  // 5. app.topbar
  const topbarSels = collectPartSelectors(map['app.topbar'], ['selector']);
  if (topbarSels.length > 0) {
    coveredParts.push('app.topbar');
    blocks.push(
      `/* part: app.topbar */\n${scopeSelectors(topbarSels.join(', '), rootPrefix)} {\n  background: ${useWallpaper ? 'var(--prism-surface-sidebar)' : 'transparent'} !important;\n${glassBlurMd}  border-bottom: 1px solid var(--prism-border-hairline) !important;\n}`,
    );
  }

  // 6. chat.messages (transparent over main canvas so Horizon Glow & Ripple Field or Wallpaper shine cleanly)
  const msgSels = collectPartSelectors(map['chat.messages'], ['selector', 'list', 'shell']);
  if (msgSels.length > 0) {
    coveredParts.push('chat.messages');
    blocks.push(
      `/* part: chat.messages */\n${scopeSelectors(msgSels.join(', '), rootPrefix)} {\n  background-color: transparent !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 7. chat.bubble.user
  const bubbleSels = collectPartSelectors(map['chat.bubble.user'], ['selector']);
  if (bubbleSels.length > 0) {
    coveredParts.push('chat.bubble.user');
    blocks.push(
      `/* part: chat.bubble.user */\n${scopeSelectors(bubbleSels.join(', '), rootPrefix)} {\n  background-color: var(--prism-surface-card) !important;\n  background-image: linear-gradient(rgba(255, 255, 255, 0.024) 0%, transparent 56%) !important;\n  border: 1px solid var(--prism-border-card) !important;\n  border-radius: 16px !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top), 0 6px 20px -10px rgba(0, 0, 0, 0.36) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 8. chat.composer (Smoked Obsidian floating card; overflow: visible preserves mascot stage on top edge!)
  const compSels = collectPartSelectors(map['chat.composer'], ['selector', 'dock']);
  const compCardSels = collectPartSelectors(map['chat.composer'], ['selector']);
  if (compCardSels.length > 0) {
    coveredParts.push('chat.composer');
    blocks.push(
      `/* part: chat.composer */\n${scopeSelectors(compCardSels.join(', '), rootPrefix)} {\n  position: relative !important;\n  overflow: visible !important;\n  background: ${useWallpaper ? 'var(--prism-sheen, none), ' : ''}var(--prism-surface-composer) !important;\n${glassBlurLg}  border: 1px solid var(--prism-border-card) !important;\n  border-radius: var(--prism-r-card, 14px) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top), var(--prism-shadow-island) !important;\n}`,
    );
  } else if (compSels.length > 0) {
    coveredParts.push('chat.composer');
    blocks.push(
      `/* part: chat.composer */\n${scopeSelectors(compSels.join(', '), rootPrefix)} {\n  background: var(--prism-sheen, none), var(--prism-surface-composer) !important;\n${glassBlurLg}  border: 1px solid var(--prism-border-card) !important;\n  border-radius: var(--prism-r-card, 14px) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top) !important;\n}`,
    );
  }

  // 9. code.block
  const codeSels = collectPartSelectors(map['code.block'], ['selector']);
  if (codeSels.length > 0) {
    coveredParts.push('code.block');
    blocks.push(
      `/* part: code.block */\n${scopeSelectors(codeSels.join(', '), rootPrefix)} {\n  background-color: var(--prism-surface-editor) !important;\n  border: 1px solid var(--prism-border-hairline) !important;\n  border-radius: var(--prism-r-card, 12px) !important;\n}`,
    );
  }

  // 10. overlay.panel
  const overlaySels = collectPartSelectors(map['overlay.panel'], ['selector']);
  if (overlaySels.length > 0) {
    coveredParts.push('overlay.panel');
    blocks.push(
      `/* part: overlay.panel */\n${scopeSelectors(overlaySels.join(', '), rootPrefix)} {\n  background: var(--prism-surface-popover) !important;\n${glassBlurXl}  border: 1px solid var(--prism-border-popover) !important;\n  border-radius: var(--prism-r-sheet, 14px) !important;\n  box-shadow: var(--prism-shadow-popover) !important;\n}`,
    );
  }

  // 11. Smoked Obsidian Optical Facet & Specular Hairlines (subtle, refined — real rainbow rim drawn by 300Hz GPU Canvas!)
  if (useOpticalFacet) {
    const facetPrefix = 'html[data-agy-prism-skin][data-prism-optical-facet="on"]';
    const facetTargets = [...compCardSels, ...bubbleSels, ...codeSels];
    if (facetTargets.length > 0) {
      blocks.push(
        `/* module: opticalFacet (Smoked Obsidian hairline + top specular bevel) */\n${scopeSelectors(facetTargets.join(', '), facetPrefix)} {\n  border: 1px solid var(--prism-border-card) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top, rgba(255, 255, 255, 0.085)), 0 10px 28px -12px rgba(0, 0, 0, 0.44) !important;\n}`,
      );
    }
  }

  // 12. Micro-motion spring hover & composer focus halo (respects prefers-reduced-motion)
  if (useMicroMotion) {
    const motionPrefix = 'html[data-agy-prism-skin][data-prism-motion="on"]';
    const motionLines = [];
    if (itemSels.length > 0) {
      motionLines.push(
        `${scopeSelectors(itemSels.join(', '), motionPrefix)}:hover {\n  background-color: var(--prism-muted-bg) !important;\n}`,
      );
    }
    if (compCardSels.length > 0) {
      motionLines.push(
        `${scopeSelectors(compCardSels.join(', '), motionPrefix)}:focus-within {\n  border-color: rgba(var(--prism-accent-rgb, 102, 157, 246), 0.34) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top, rgba(255, 255, 255, 0.1)), 0 0 0 1px rgba(var(--prism-accent-rgb, 102, 157, 246), 0.14), 0 14px 36px -12px rgba(0, 0, 0, 0.52) !important;\n}`,
      );
    }
    if (motionLines.length > 0) {
      blocks.push(
        `/* module: microMotion */\n${motionLines.join('\n')}\n@media (prefers-reduced-motion: reduce) {\n  ${motionPrefix} * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }\n}`,
      );
    }
  }

  if (extraCss && String(extraCss).trim()) {
    blocks.push(`/* adapter extra css */\n${String(extraCss).trim()}`);
  }

  return {
    mode: isCompat ? 'compat' : 'full',
    skinMode,
    coveredParts,
    adapterCss: blocks.join('\n\n') + '\n',
  };
}
