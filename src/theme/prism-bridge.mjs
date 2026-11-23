// Semantic Parts -> Obsidian Prism Glass Bridge (DreamSkin Prism v4).
// Compiles any DreamSkin adapter's parts-map.json into a scoped CSS layer binding
// to --prism-* optical glass variables, respecting scroll-perf & compat-degrade guardrails.

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
} = {}) {
  const map = partsMap && typeof partsMap === 'object' ? partsMap : {};
  const isCompat = mode === 'compat';
  const blocks = [
    `/* DreamSkin Prism v4 Adapter Bridge (${appId || 'generic'}, mode=${isCompat ? 'compat' : 'full'}) */`,
  ];
  const coveredParts = [];

  // 1. app.root: always included in both full and compat mode (safe transparent canvas over #agy-prism-stage)
  const rootEntry = map['app.root'];
  const rootSels = collectPartSelectors(rootEntry, ['selector', 'scopeBody']);
  if (rootSels.length > 0) {
    coveredParts.push('app.root');
    const scoped = scopeSelectors(rootSels.join(', '));
    blocks.push(
      `/* part: app.root */\n${scoped} {\n  background-color: transparent !important;\n  background-image: none !important;\n}`,
    );
  } else {
    blocks.push(
      `/* part: app.root (fallback) */\nhtml[data-agy-prism-skin] body, html[data-agy-prism-skin] #root {\n  background-color: transparent !important;\n}`,
    );
  }

  if (isCompat) {
    return {
      mode: 'compat',
      coveredParts,
      adapterCss: blocks.join('\n\n') + '\n',
    };
  }

  // 2. app.content: hollowed workspace canvas showing stage wallpaper through
  const contentSels = collectPartSelectors(map['app.content'], ['selector', 'wrap', 'card']);
  if (contentSels.length > 0) {
    coveredParts.push('app.content');
    blocks.push(
      `/* part: app.content */\n${scopeSelectors(contentSels.join(', '))} {\n  background-color: var(--prism-surface-canvas, transparent) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 3. app.sidebar: bounded frosted acrylic island
  const sidebarSels = collectPartSelectors(map['app.sidebar'], ['selector', 'pane']);
  if (sidebarSels.length > 0) {
    coveredParts.push('app.sidebar');
    blocks.push(
      `/* part: app.sidebar */\n${scopeSelectors(sidebarSels.join(', '))} {\n  background: var(--prism-sheen), var(--prism-surface-sidebar) !important;\n  backdrop-filter: blur(var(--prism-blur-md, 16px)) saturate(140%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-md, 16px)) saturate(140%) !important;\n  border-color: var(--prism-border-island) !important;\n  border-radius: var(--prism-r-island, 12px) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top), var(--prism-shadow-island) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 4. app.sidebar.item: subtle interactive highlight
  const itemSels = collectPartSelectors(map['app.sidebar.item'], ['selector', 'active']);
  if (itemSels.length > 0) {
    coveredParts.push('app.sidebar.item');
    blocks.push(
      `/* part: app.sidebar.item */\n${scopeSelectors(itemSels.join(', '))} {\n  border-radius: var(--prism-r-ctl, 7px) !important;\n  transition: background-color 140ms ease, border-color 140ms ease;\n}`,
    );
  }

  // 5. app.topbar: bounded frosted title/tab chrome
  const topbarSels = collectPartSelectors(map['app.topbar'], ['selector']);
  if (topbarSels.length > 0) {
    coveredParts.push('app.topbar');
    blocks.push(
      `/* part: app.topbar */\n${scopeSelectors(topbarSels.join(', '))} {\n  background: var(--prism-surface-sidebar) !important;\n  backdrop-filter: blur(var(--prism-blur-md, 16px)) saturate(140%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-md, 16px)) saturate(140%) !important;\n  border-bottom: 1px solid var(--prism-border-hairline) !important;\n}`,
    );
  }

  // 6. chat.messages: translucent veil WITHOUT backdrop-filter (strict scroll performance guardrail)
  const msgSels = collectPartSelectors(map['chat.messages'], ['selector', 'list', 'shell']);
  if (msgSels.length > 0) {
    coveredParts.push('chat.messages');
    blocks.push(
      `/* part: chat.messages */\n${scopeSelectors(msgSels.join(', '))} {\n  background-color: var(--prism-surface-chat) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 7. chat.bubble.user: elevated card tint
  const bubbleSels = collectPartSelectors(map['chat.bubble.user'], ['selector']);
  if (bubbleSels.length > 0) {
    coveredParts.push('chat.bubble.user');
    blocks.push(
      `/* part: chat.bubble.user */\n${scopeSelectors(bubbleSels.join(', '))} {\n  background: var(--prism-surface-card) !important;\n  border: 1px solid var(--prism-border-card) !important;\n  border-radius: var(--prism-r-card, 10px) !important;\n  color: var(--prism-fg) !important;\n}`,
    );
  }

  // 8. chat.composer: bounded frosted capsule dock
  const compSels = collectPartSelectors(map['chat.composer'], ['selector', 'dock']);
  if (compSels.length > 0) {
    coveredParts.push('chat.composer');
    blocks.push(
      `/* part: chat.composer */\n${scopeSelectors(compSels.join(', '))} {\n  background: var(--prism-sheen), var(--prism-surface-composer) !important;\n  backdrop-filter: blur(var(--prism-blur-lg, 20px)) saturate(145%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-lg, 20px)) saturate(145%) !important;\n  border: 1px solid var(--prism-border-card) !important;\n  border-radius: var(--prism-r-card, 10px) !important;\n  box-shadow: inset 0 1px 0 var(--prism-specular-top) !important;\n}`,
    );
  }

  // 9. code.block: high-legibility code/editor backing (no backdrop-filter on scrolling code)
  const codeSels = collectPartSelectors(map['code.block'], ['selector']);
  if (codeSels.length > 0) {
    coveredParts.push('code.block');
    blocks.push(
      `/* part: code.block */\n${scopeSelectors(codeSels.join(', '))} {\n  background-color: var(--prism-surface-editor) !important;\n  border: 1px solid var(--prism-border-card) !important;\n  border-radius: var(--prism-r-card, 10px) !important;\n}`,
    );
  }

  // 10. overlay.panel: near-opaque high-legibility popover/modal protection
  const overlaySels = collectPartSelectors(map['overlay.panel'], ['selector']);
  if (overlaySels.length > 0) {
    coveredParts.push('overlay.panel');
    blocks.push(
      `/* part: overlay.panel */\n${scopeSelectors(overlaySels.join(', '))} {\n  background: var(--prism-surface-popover) !important;\n  backdrop-filter: blur(var(--prism-blur-xl, 26px)) saturate(155%) !important;\n  -webkit-backdrop-filter: blur(var(--prism-blur-xl, 26px)) saturate(155%) !important;\n  border: 1px solid var(--prism-border-popover) !important;\n  border-radius: var(--prism-r-sheet, 14px) !important;\n  box-shadow: var(--prism-shadow-popover) !important;\n}`,
    );
  }

  if (extraCss && String(extraCss).trim()) {
    blocks.push(`/* adapter extra css */\n${String(extraCss).trim()}`);
  }

  return {
    mode: 'full',
    coveredParts,
    adapterCss: blocks.join('\n\n') + '\n',
  };
}
