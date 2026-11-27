// DreamSkin Prism — Cross-Platform Obsidian Optical & Pixel Companion Runtime Orchestrator
// Runs the authentic Obsidian Prism engines (motion-engine, animated-icons, prism-rim-canvas,
// ripple-core, dual-mascot-rig, smooth-caret) across all 14 desktop clients (DSH NEXT, Antigravity,
// Cherry, Codex, ZCode, Kiro, Windsurf, Qoder, OpenCode, WorkBuddy, T3Code, VS Code, etc.).
// License: GPL-3.0-only (preserves full attribution to RMvdesi/obsidian-prism & 0DNANCY/agy-claude-style).
(function (root) {
  'use strict';
  var G = root || (typeof globalThis !== 'undefined' ? globalThis : window);
  if (!G || !G.document) return;
  var D = G.document;

  var OPTICAL_STYLE_ID = 'dreamskin-optical-suite-css';
  var MASCOT_STAGE_ATTR = 'data-dreamskin-mascot-stage';
  var RIPPLE_HOST_ATTR = 'data-dreamskin-ripple-host';
  var FALLBACK_ANCHOR_ID = 'dreamskin-mascot-fallback-anchor';

  // Full 14-client binary-verified selector coverage (DSH NEXT 2.0.24, ZCode 4.0, Codex 26.1117,
  // Cherry Studio 2.1.6/2.2.3, MiniMax Code 3.1/Design 3.0, WorkBuddy 5.5.6, OpenCode 1.18/2.x,
  // T3 Code 0.1.11, Antigravity, VS Code, Qoder, Kiro, Windsurf)
  var COMPOSER_SELECTORS = [
    '[data-composer-card]',
    '.surface-composer-card',
    '[data-testid="agent-input-box"]',
    '[data-ui="chat.composer"]',
    '[data-ui="chat.composer-floating-capsule"]',
    '#inputbar',
    '.inputbar-container',
    '[data-composer-surface-variant]',
    '[data-composer-layout]',
    '[class*="_ComposerLayoutRoot_"]',
    '[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute)',
    '[data-v4-composer-dock]',
    '[data-message-input-root]',
    '[data-testid="conversation-input-area"]',
    '[data-chat-composer-surface="true"]',
    '[data-composer-prompt-surface="true"]',
    '[data-component="session-followup-dock"]',
    '.interactive-input-part',
    '.chat-input-container',
    '[class*="composer"]:has(textarea, [contenteditable="true"])',
    '[class*="prompt"]:has(textarea, [contenteditable="true"])',
    '.composer-card',
    'form:has(textarea)',
    'form:has([contenteditable="true"])',
  ];

  var MAIN_STAGE_SELECTORS = [
    '[data-slot="main"]',
    '.agy-home',
    '[data-main-content-body]',
    '[data-ui="chat.view"]',
    '[data-ui="agents.agent-chat-main"]',
    '[data-app-shell-focus-area="main"]',
    'main[class*="_MainContentSurface_"]',
    '[data-workspace-conversation-frame]',
    '[data-testid="chat-view"]',
    '[data-testid="conversation-shell"]',
    '[data-workspace-pane="chat"]',
    '[data-slot="sidebar-inset"]',
    '[data-panel]',
    '.part.editor',
    '#content-container',
    'main',
    '[class*="workspace"]',
  ];

  var MIRROR_CARD_SELECTORS = [
    '.dsh-quota-card',
    '[data-prism-mirror-card]',
    '[data-testid="step-plan"]',
  ];

  function resolvePaletteAttr(scheme) {
    if (scheme === 'warm-carbon' || scheme === 'gruvbox') return 'warm';
    if (scheme === 'host-native') return 'host';
    return 'obsidian';
  }

  function resolveAccentAttr(cfg) {
    var rim = cfg && (cfg.rimTone || cfg.accentMode);
    if (rim === 'cobalt' || rim === 'iris' || rim === 'amber' || rim === 'mono') return rim;
    var scheme = cfg && cfg.colorScheme;
    if (scheme === 'rose-pine' || scheme === 'catppuccin') return 'iris';
    if (scheme === 'tokyo-night' || scheme === 'nord') return 'cobalt';
    return 'follow';
  }

  // Authentic Obsidian Prism default: 'crab' = clean Clawd (left) + Purple Neko (right) matching ui-runtime.js:616 (camp: 'gemini')
  function resolveMascotConfig(cfg, appId) {
    var raw = cfg && (cfg.mascotSpec !== undefined && cfg.mascotSpec !== '' ? cfg.mascotSpec : cfg.companionStyle);
    var style = String(raw || 'crab').trim().toLowerCase();
    var defaultCamp = appId === 'codex' ? 'gpt' : 'gemini';
    if (style === 'off' || style === 'none') {
      return { mascot: 'off', camp: defaultCamp, miniPileEnabled: false };
    }
    if (style.indexOf('r:') === 0) {
      return { mascot: style, camp: defaultCamp, miniPileEnabled: style.indexOf('+m') >= 0 };
    }
    switch (style) {
      case 'crab':
      case 'dual':
      case 'clawd':
        return { mascot: 'crab', camp: 'gemini', miniPileEnabled: false };
      case 'minis':
        return { mascot: 'minis', camp: 'gemini', miniPileEnabled: true };
      case 'quad':
        return { mascot: 'quad', camp: 'gemini', miniPileEnabled: false };
      case 'quad-minis':
      case 'all':
        return { mascot: 'quad-minis', camp: 'gemini', miniPileEnabled: true };
      case 'whale':
      case 'deepy':
        return { mascot: 'r:w1,k1', camp: 'deepseek', miniPileEnabled: false };
      case 'dragon':
        return { mascot: 'r:d1,c1', camp: 'gpt', miniPileEnabled: false };
      case 'neko':
        return { mascot: 'r:k1', camp: 'gemini', miniPileEnabled: false };
      case 'crabs':
        return { mascot: 'r:c1+m', camp: 'claude', miniPileEnabled: true };
      case 'orb':
        return { mascot: 'r:k1,w1', camp: 'deepseek', miniPileEnabled: false };
      default:
        return { mascot: 'crab', camp: 'gemini', miniPileEnabled: false };
    }
  }

  function buildOpticalCss() {
    return [
      '/* DreamSkin Prism — Authentic Obsidian Prism Optical & Mascot CSS (GPL-3.0-only) */',
      'html[data-ag-cs-style="1"] {',
      '  --ag-ease-out: cubic-bezier(.16,1,.3,1);',
      '  --ag-ease-standard: cubic-bezier(.2,0,0,1);',
      '  --ag-ease-spring: cubic-bezier(.34,1.4,.64,1);',
      '  --ag-cs-r-sm: 4px; --ag-cs-r-md: 6px; --ag-cs-r-lg: 12px; --ag-cs-r-pill: 999px;',
      '  --ag-prism-cobalt: #4285F4; --ag-prism-iris: #9B72CB; --ag-prism-coral: #EA4335; --ag-prism-amber: #FBBC04;',
      '  --ag-ambient-mul: 1; --ag-accent-prism-mul: 1;',
      '  --ag-prism-strength: calc(var(--ag-ambient-mul, 1) * var(--ag-accent-prism-mul, 1));',
      '  --_lm: 1;',
      '  --ag-cs-specular: rgba(255,255,255,.105);',
      '  --ag-cs-accent: #669DF6;',
      '  --ag-cs-ripple-ink: #A4B2CC;',
      '  --ag-cs-ripple-wave: #62CAFF;',
      '  --ag-cs-sb-bar: linear-gradient(#5CC6FC 0%, #3186FF 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(92,198,252,.42);',
      '  --ag-cs-composer-sheen: linear-gradient(172deg, rgba(255,255,255,.046) 0%, rgba(160,185,245,.014) 36%, rgba(10,11,16,.2) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 2px rgba(0,0,0,.44), 0 8px 20px -6px rgba(0,0,0,.48), 0 20px 44px -14px rgba(0,0,0,.62);',
      '  --ag-cs-mono-stack: "Google Sans Code","JetBrains Mono","Cascadia Code",Consolas,ui-monospace,monospace;',
      '  --ag-cs-fvl: none; --ag-cs-ffs: "calt" 0, "liga" 0;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-palette="obsidian"][data-ag-cs-theme="light"] {',
      '  --ag-cs-specular: rgba(255,255,255,.94);',
      '  --ag-cs-accent: #2563EB;',
      '  --ag-cs-ripple-ink: #556682;',
      '  --ag-cs-ripple-wave: #2563EB;',
      '  --ag-cs-sb-bar: linear-gradient(#2563EB 0%, #4F46E5 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(37,99,235,.36);',
      '  --ag-cs-composer-sheen: linear-gradient(176deg, rgba(255,255,255,.96) 0%, rgba(241,246,255,.55) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 3px rgba(15,23,42,.06), 0 10px 28px -6px rgba(30,58,138,.10), 0 0 0 1px rgba(15,23,42,.08);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-palette="warm"][data-ag-cs-theme="dark"] {',
      '  --ag-cs-accent: #D97757;',
      '  --ag-cs-ripple-ink: #B4AEA2;',
      '  --ag-cs-ripple-wave: #D97757;',
      '  --ag-cs-sb-bar: linear-gradient(#F0A37E 0%, #D97757 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(217,119,87,.42);',
      '  --ag-cs-composer-sheen: linear-gradient(172deg, rgba(255,248,236,.042) 0%, rgba(217,119,87,.014) 38%, rgba(16,15,13,.2) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 2px rgba(0,0,0,.44), 0 10px 28px -6px rgba(0,0,0,.50);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-palette="warm"][data-ag-cs-theme="light"] {',
      '  --ag-cs-specular: rgba(255,255,255,.94);',
      '  --ag-cs-accent: #C25934;',
      '  --ag-cs-ripple-ink: #665C4E;',
      '  --ag-cs-ripple-wave: #C25934;',
      '  --ag-cs-sb-bar: linear-gradient(#D97757 0%, #B54D28 100%);',
      '  --ag-cs-sb-glow: 0 0 6px rgba(194,89,52,.32);',
      '  --ag-cs-composer-sheen: linear-gradient(176deg, rgba(255,255,255,.97) 0%, rgba(250,246,238,.58) 100%);',
      '  --ag-cs-composer-shadow: 0 1px 3px rgba(42,32,20,.06), 0 10px 26px -6px rgba(68,52,32,.10), 0 0 0 1px rgba(42,32,20,.075);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="cobalt"] { --ag-cs-accent: #669DF6; --ag-cs-ripple-wave: #669DF6; }',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="iris"] { --ag-cs-accent: #A58AF8; --ag-cs-ripple-wave: #A58AF8; }',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="amber"] { --ag-cs-accent: #F2B84B; --ag-cs-ripple-wave: #F2B84B; }',
      'html[data-ag-cs-style="1"][data-ag-cs-accent="mono"] { --ag-accent-prism-mul: .36; --ag-cs-accent: #D4D7E0; --ag-cs-ripple-wave: #CBD5E1; }',
      'html[data-ag-cs-style="1"][data-ag-cs-corners="sharp"] { --ag-cs-r-sm: 2px; --ag-cs-r-md: 4px; --ag-cs-r-lg: 8px; }',
      'html[data-ag-cs-style="1"][data-ag-cs-corners="balanced"] { --ag-cs-r-sm: 4px; --ag-cs-r-md: 6px; --ag-cs-r-lg: 12px; }',
      'html[data-ag-cs-style="1"][data-ag-cs-corners="soft"] { --ag-cs-r-sm: 6px; --ag-cs-r-md: 10px; --ag-cs-r-lg: 18px; }',
      'html[data-ag-cs-style="1"][data-ag-cs-code-font="jetbrains"] { --ag-cs-mono-stack: "JetBrains Mono","Cascadia Code",Consolas,ui-monospace,monospace; }',
      'html[data-ag-cs-style="1"][data-ag-cs-code-font="cascadia"] { --ag-cs-mono-stack: "Cascadia Code","Cascadia Mono",Consolas,ui-monospace,monospace; }',
      'html[data-ag-cs-style="1"][data-ag-cs-code-font="sfmono"] { --ag-cs-mono-stack: "SF Mono",SFMono-Regular,Menlo,Monaco,Consolas,ui-monospace,monospace; }',
      'html[data-ag-cs-style="1"][data-ag-cs-font-style="editorial"] body { font-family: "Newsreader","Songti SC","Noto Serif SC",Georgia,serif; }',
      'html[data-ag-cs-style="1"][data-ag-cs-font-style="mono"] body { font-family: var(--ag-cs-mono-stack); }',
      'html[data-ag-cs-style="1"][data-ag-cs-ligatures="1"] { --ag-cs-fvl: contextual common-ligatures; --ag-cs-ffs: "calt" 1, "liga" 1; }',
      'html[data-ag-cs-style="1"] :is(pre, code, .md-code-block) { font-family: var(--ag-cs-mono-stack) !important; font-variant-ligatures: var(--ag-cs-fvl); font-feature-settings: var(--ag-cs-ffs); }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0"] { --ag-ambient-mul: 0; --ag-prism-strength: 0; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas, .ag-cs-prism-rim-cv) { opacity: 0 !important; visibility: hidden !important; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.35"] { --ag-ambient-mul: .45; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.35"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas) { opacity: .42; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.7"] { --ag-ambient-mul: .78; }',
      'html[data-ag-cs-style="1"][data-ag-cs-ambient="0.7"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas) { opacity: .75; }',
      '',
      '/* Full-Viewport WebGL2 Brand Horizon Glow + Interactive ASCII Character Matrix Field (Refined Obsidian Atmosphere) */',
      '.ag-cs-ripple-host {',
      '  position: absolute !important; inset: 0 !important; z-index: 0 !important;',
      '  overflow: hidden !important; pointer-events: none !important; contain: layout style paint;',
      '  border-radius: inherit;',
      '  transition: opacity 260ms ease;',
      '}',
      '.ag-cs-brand-glow {',
      '  position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;',
      '  display: block !important; pointer-events: none !important; z-index: 0 !important;',
      '  transition: filter 220ms ease, opacity 220ms ease;',
      '}',
      '.ag-cs-ripple-canvas {',
      '  position: relative !important; display: block !important; pointer-events: none !important; z-index: 1 !important;',
      '  transition: filter 220ms ease, opacity 220ms ease;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="soft"] :is(.ag-cs-brand-glow, .ag-cs-ripple-canvas) {',
      '  opacity: 0.72; filter: saturate(0.92);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="balanced"] .ag-cs-brand-glow {',
      '  filter: saturate(1.06);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="vivid"] .ag-cs-brand-glow {',
      '  filter: saturate(1.30) contrast(1.04) brightness(1.08);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-vividness="vivid"] .ag-cs-ripple-canvas {',
      '  filter: saturate(1.22) brightness(1.06);',
      '}',
      '[data-dreamskin-ripple-parent="1"] {',
      '  position: relative !important; isolation: isolate !important;',
      '}',
      '[data-dreamskin-ripple-parent="1"] > :not(.ag-cs-ripple-host):not([role="dialog"]):not([role="menu"]):not([data-radix-popper-content-wrapper]):not(.agy-overlay):not([data-dreamskin-control-panel]):not([data-sidebar-right-panel]):not([data-sidebar-drawer]):not([data-conversation-composer-overlay]):not([data-plugin-detail]):not([data-slot="shell.overlay"]) {',
      '  position: relative; z-index: 1;',
      '}',
      '',
      '/* 300Hz GPU Canvas Prism Rim Light Layer */',
      '[data-ag-cs-prism-box="1"] { position: relative !important; }',
      '.surface-composer-card[data-ag-cs-prism-box="1"], [data-composer-card][data-ag-cs-prism-box="1"] {',
      '  position: relative !important; overflow: visible !important;',
      '  border-radius: var(--ag-cs-r-lg, 12px) !important;',
      '  box-shadow: inset 0 1px 0 var(--ag-cs-specular), var(--ag-cs-composer-shadow) !important;',
      '}',
      '.surface-composer-card > .ag-cs-prism-rim-cv, [data-composer-card] > .ag-cs-prism-rim-cv, [data-ag-cs-prism-box="1"] > .ag-cs-prism-rim-cv {',
      '  position: absolute !important; inset: -1px !important;',
      '  width: calc(100% + 2px) !important; height: calc(100% + 2px) !important;',
      '  box-sizing: border-box !important; border-radius: inherit !important;',
      '  pointer-events: none !important; z-index: 7 !important;',
      '  opacity: calc(var(--ag-prism-strength, 1) * var(--_lm, 1));',
      '  transition: opacity 220ms ease;',
      '}',
      '[data-ag-cs-prism-mirror="1"] > .ag-cs-prism-rim-cv {',
      '  inset: 0 !important; width: 100% !important; height: 100% !important; z-index: 4 !important;',
      '}',
      '',
      '/* Authentic Obsidian Prism Dual/Quad + Mini-Crab Mascot Stage (APPENDED LAST, z-index 30 above composer border!) */',
      '.ag-cs-crab.ag-cs-dual-stage, .ag-cs-dual-stage {',
      '  position: absolute !important; left: 0 !important; right: 0 !important; width: auto !important;',
      '  bottom: calc(100% - 9px) !important; height: 84px !important; z-index: 30 !important; contain: layout style;',
      '  visibility: visible !important; pointer-events: none !important; user-select: none !important; overflow: visible !important;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor {',
      '  position: absolute; left: 0; bottom: 0; width: 96px; height: 84px;',
      '  pointer-events: auto; cursor: grab; touch-action: none;',
      '  transition: transform 220ms cubic-bezier(.22,1,.36,1); outline: none;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor::after {',
      '  content: ""; position: absolute; left: 50%; bottom: 5px; width: 44px; height: 8px;',
      '  transform: translateX(-50%); border-radius: 999px;',
      '  background: radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,.42) 0%, rgba(0,0,0,.16) 58%, transparent);',
      '  pointer-events: none; z-index: 0;',
      '}',
      'html[data-ag-cs-theme="light"] .ag-cs-dual-stage .ag-v2-mascot-actor::after {',
      '  background: radial-gradient(50% 50% at 50% 50%, rgba(15,23,42,.20) 0%, rgba(15,23,42,.07) 58%, transparent);',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor:active, .ag-cs-dual-stage .ag-v2-mascot-actor[data-direct="1"] {',
      '  transition: none !important; will-change: transform;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-actor:active, .ag-cs-dual-stage .ag-v2-mascot-actor[data-dragging="1"] {',
      '  cursor: grabbing !important;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mascot-canvas {',
      '  position: relative; z-index: 1; width: 96px; height: 84px; display: block;',
      '  image-rendering: pixelated; pointer-events: none;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-pile {',
      '  position: absolute; left: 12px; bottom: 3px; height: 32px;',
      '  display: none; align-items: flex-end; pointer-events: none; z-index: 25;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-crab-canvas {',
      '  position: absolute; left: 0; bottom: 0; width: 40px; height: 32px;',
      '  image-rendering: pixelated; pointer-events: auto; cursor: grab;',
      '  transition: transform 160ms steps(2,end);',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-crab-canvas:active, .ag-cs-dual-stage .ag-v2-mini-crab-canvas[data-direct="1"] {',
      '  transition: none !important; will-change: transform;',
      '}',
      '.ag-cs-dual-stage .ag-v2-mini-crab-canvas:active, .ag-cs-dual-stage .ag-v2-mini-crab-canvas[data-dragging="1"] {',
      '  cursor: grabbing !important;',
      '}',
      '#' + FALLBACK_ANCHOR_ID + ' {',
      '  position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%);',
      '  width: min(560px, 72vw); height: 2px; z-index: 2147483000; pointer-events: none; overflow: visible;',
      '}',
      '',
      '/* Smooth Fluid Typing Caret */',
      '.ag-cs-smooth-caret {',
      '  position: absolute; top: 0; left: 0; width: 2px; height: 20px; border-radius: 1px;',
      '  background: var(--ag-cs-accent, #669DF6);',
      '  box-shadow: 0 0 8px color-mix(in srgb, var(--ag-cs-accent, #669DF6) 60%, transparent);',
      '  pointer-events: none; z-index: 12; opacity: 0; visibility: hidden;',
      '  transition: transform 55ms cubic-bezier(.22,1,.36,1), opacity 70ms ease;',
      '}',
      '.ag-cs-smooth-caret[data-ag-cs-caret-visible="1"] {',
      '  opacity: 1; visibility: visible; will-change: transform;',
      '  animation: ag-cs-caret-blink 1.05s step-end infinite;',
      '}',
      '.ag-cs-smooth-caret[data-ag-cs-caret-visible="1"][data-ag-cs-caret-typing="1"] { animation: none; opacity: 1; }',
      '[contenteditable="true"][data-ag-cs-smooth-caret="1"] { caret-color: transparent !important; }',
      '@keyframes ag-cs-caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }',
      '',
      '/* Task Running / AI Streaming State (1:1 Obsidian Prism Sidebar Orbit, Rainbow Bar, Cancel Ring, Thought Comet & Sonar) */',
      '@keyframes ag-stream-shimmer { 0% { background-position: 0% 50%; opacity: 0.72; } 50% { background-position: 100% 50%; opacity: 1; } 100% { background-position: 0% 50%; opacity: 0.72; } }',
      '@keyframes ag-cs-orbit-spin { to { transform: rotate(360deg); } }',
      '@keyframes ag-st-p { 0%, 100% { transform: scale(.82); opacity: .78; } 50% { transform: scale(1.16); opacity: 1; } }',
      '@keyframes ag-cs-comet-tip { 0%, 100% { opacity: .76; transform: scaleY(.92); } 50% { opacity: 1; transform: scaleY(1.14); } }',
      '@keyframes ag-cs-stream-chunk { from { opacity: 0; transform: translate3d(0, 3px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }',
      '@keyframes ag-cs-sonar-pulse { 0% { box-shadow: 0 0 0 0 rgba(92,198,252,0); background-color: rgba(92,198,252,0); } 24% { box-shadow: 0 0 0 1.2px rgba(92,198,252,.52), 0 0 22px -4px rgba(92,198,252,.28); background-color: rgba(92,198,252,.07); } 100% { box-shadow: 0 0 0 1.2px rgba(92,198,252,0); background-color: rgba(92,198,252,0); } }',
      '@keyframes ag-cs-liftoff-ring { 0% { opacity: 0; transform: translate3d(0,4px,0) scale(.28); } 22% { opacity: .9; } 100% { opacity: 0; transform: translate3d(0,-14px,0) scale(2.2); } }',
      'html[data-ag-cs-style="1"] {',
      '  --ag-cs-run-core: #0F131D; --ag-cs-run-star: #DCEEFF; --ag-cs-run-rs: 0 0 5px rgba(92,198,252,.78);',
      '  --ag-cs-run-wash: linear-gradient(90deg, rgba(49,134,255,.13) 0%, rgba(92,198,252,.045) 55%, transparent);',
      '  --ag-cs-run-rb: linear-gradient(#FBBC04 0%, #EA4335 16%, #9B72CB 34%, #5CC6FC 58%, #3186FF 100%);',
      '  --ag-cs-run-rr: conic-gradient(#1B49B2 0deg, #3186FF 150deg, #5CC6FC 232deg, #9B72CB 276deg, #EA4335 308deg, #FBBC04 334deg, #EAF4FF 350deg, #1B49B2 360deg);',
      '  --ag-cs-run-ro: 0 0 7px rgba(49,134,255,.32);',
      '  --ag-cs-cancel-bg: #121319; --ag-cs-cancel-core: radial-gradient(120% 120% at 50% 0%, #1C1E28 0%, #101117 100%);',
      '  --ag-cs-cancel-sq: #F4F5F8; --ag-cs-cancel-ring: conic-gradient(#4285F4 0deg, #9B72CB 95deg, #EA4335 185deg, #FBBC04 275deg, #34A853 325deg, #4285F4 360deg);',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] {',
      '  --ag-cs-run-core: #FFFFFF; --ag-cs-run-star: #2563EB; --ag-cs-run-rs: 0 0 6px rgba(37,99,235,.65);',
      '  --ag-cs-run-wash: linear-gradient(90deg, rgba(37,99,235,.10) 0%, rgba(124,58,237,.045) 55%, transparent);',
      '  --ag-cs-run-rb: linear-gradient(#D97706 0%, #EA4335 28%, #7C3AED 62%, #2563EB 100%);',
      '  --ag-cs-run-rr: conic-gradient(#2563EB 0deg, #7C3AED 108deg, #EA4335 212deg, #D97706 304deg, #2563EB 360deg);',
      '  --ag-cs-run-ro: 0 1px 3px rgba(15,23,42,.10), 0 0 8px rgba(37,99,235,.24);',
      '  --ag-cs-cancel-bg: #FFFFFF; --ag-cs-cancel-core: radial-gradient(120% 120% at 50% 0%, #FFFFFF 0%, #EEF3FA 100%);',
      '  --ag-cs-cancel-sq: #0F172A;',
      '}',
      '/* Original 16x16 Orbital Prism Spinner (sidebar & task rows) */',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner) {',
      '  contain: strict; width: 16px !important; height: 16px !important; min-width: 16px !important;',
      '  border-radius: 999px !important; position: relative !important;',
      '  display: inline-flex !important; align-items: center !important; justify-content: center !important;',
      '  overflow: hidden !important; background: var(--ag-cs-run-core) !important;',
      '  box-shadow: var(--ag-cs-run-ro) !important; flex-shrink: 0 !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"] > .ag-cs-orbit-spinner {',
      '  position: absolute !important; right: 10px !important; top: 50% !important; margin-top: -8px !important;',
      '  z-index: 4 !important; pointer-events: none !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner)::before {',
      '  content: ""; position: absolute; inset: -38%; background: var(--ag-cs-run-rr);',
      '  will-change: transform; animation: ag-cs-orbit-spin 2.4s steps(36) infinite; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner)::after {',
      '  content: ""; position: absolute; inset: 1.75px; border-radius: 999px;',
      '  background: var(--ag-cs-run-core); z-index: 1; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="status-loading-spinner"], .ag-cs-orbit-spinner) [data-agent-state-dot]:first-child {',
      '  display: block !important; position: relative !important; z-index: 2 !important;',
      '  width: 4px !important; height: 4px !important; border-radius: 999px !important;',
      '  background: var(--ag-cs-run-star) !important; box-shadow: var(--ag-cs-run-rs) !important;',
      '  will-change: transform, opacity; animation: ag-st-p 2.2s steps(22) infinite !important;',
      '}',
      '/* Original Sidebar Running Row: Rainbow Vertical Bar + Soft Blue Wash */',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"] {',
      '  position: relative !important; border-radius: var(--ag-cs-r-md, 7px) !important;',
      '  background-image: var(--ag-cs-run-wash) !important;',
      '  padding-right: 34px !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"]::before {',
      '  content: "" !important; display: block !important; position: absolute !important;',
      '  left: 3px !important; top: 7px !important; bottom: 7px !important; width: 2.5px !important;',
      '  border-radius: 999px !important; background: var(--ag-cs-run-rb) !important;',
      '  box-shadow: 0 0 8px rgba(49,134,255,.45) !important; pointer-events: none !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-row-running="1"]::after { display: none !important; }',
      'html[data-ag-cs-style="1"] [data-ag-cs-sonar="1"] { animation: ag-cs-sonar-pulse 720ms ease-out forwards !important; }',
      '/* Original Rotating Prism Cancel / Stop Orb Button */',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"]) {',
      '  position: relative !important; overflow: hidden !important;',
      '  background-color: var(--ag-cs-cancel-bg) !important; background-image: none !important;',
      '  box-shadow: 0 0 12px -2px rgba(66,133,244,.44), 0 2px 6px rgba(0,0,0,.4) !important;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"])::before {',
      '  content: ""; position: absolute; inset: -38%; background: var(--ag-cs-cancel-ring);',
      '  will-change: transform; animation: ag-cs-orbit-spin 1.9s steps(38) infinite; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"])::after {',
      '  content: ""; position: absolute; inset: 2px; border-radius: 999px;',
      '  background: var(--ag-cs-cancel-core); z-index: 1; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"] :is([data-testid="input-cancel-button"], .comp-send[data-streaming="1"]) > :is(div, span) {',
      '  position: relative !important; z-index: 2 !important; display: block !important;',
      '  width: 8.5px !important; height: 8.5px !important; border-radius: 2.2px !important;',
      '  background-color: var(--ag-cs-cancel-sq) !important;',
      '  box-shadow: 0 0 6px rgba(255,255,255,.32) !important;',
      '}',
      '/* Streaming Composer Top Prism Shimmer + Thought Comet Tip + Stream Chunk */',
      'html[data-ag-cs-style="1"][data-ag-cs-streaming="1"] :is([data-composer-card], .surface-composer-card, [data-testid="agent-input-box"]) {',
      '  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ag-cs-accent, #669DF6) 46%, transparent), 0 10px 34px -8px color-mix(in srgb, var(--ag-cs-accent, #669DF6) 32%, transparent) !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-streaming="1"][data-ag-cs-motion!="off"] :is([data-composer-card], .surface-composer-card, [data-testid="agent-input-box"])::before {',
      '  content: ""; position: absolute; left: 14px; right: 14px; top: 0; height: 2px; border-radius: 999px; pointer-events: none; z-index: 26;',
      '  background: linear-gradient(90deg, transparent 0%, #64D2FF 22%, #6EA8FF 48%, #A78BFA 74%, transparent 100%);',
      '  background-size: 220% 100%; animation: ag-stream-shimmer 2.1s linear infinite;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-thought-streaming="1"] {',
      '  position: relative !important; padding-left: 12px !important;',
      '  border-left: 1.5px solid rgba(92,198,252,.28) !important;',
      '}',
      'html[data-ag-cs-style="1"] [data-ag-cs-thought-streaming="1"]::after {',
      '  content: "" !important; position: absolute !important; left: -2.25px !important; bottom: 2px !important;',
      '  width: 3.5px !important; height: 11px !important; border-radius: 999px !important;',
      '  background: #7CE2FF !important; box-shadow: 0 0 8px rgba(92,198,252,.85) !important;',
      '  animation: ag-cs-comet-tip 1.1s steps(18) infinite; pointer-events: none;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] [data-ag-cs-thought-streaming="1"] {',
      '  border-left-color: rgba(37,99,235,.32) !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-theme="light"] [data-ag-cs-thought-streaming="1"]::after {',
      '  background: #2563EB !important; box-shadow: 0 0 8px rgba(37,99,235,.55) !important;',
      '}',
      '.ag-cs-stream-chunk { animation: ag-cs-stream-chunk 280ms cubic-bezier(.22,1,.36,1) both; }',
      '.ag-cs-liftoff-ring {',
      '  position: fixed; width: 240px; height: 240px; margin: -120px 0 0 -120px; border-radius: 50%; pointer-events: none; z-index: 90;',
      '  background: conic-gradient(from 180deg, rgba(66,133,244,.65), rgba(155,114,203,.58), rgba(234,67,53,.50), rgba(251,188,4,.56), rgba(92,198,252,.66), rgba(66,133,244,.65));',
      '  -webkit-mask-image: radial-gradient(closest-side, transparent 62%, rgba(0,0,0,.95) 78%, transparent 94%);',
      '  mask-image: radial-gradient(closest-side, transparent 62%, rgba(0,0,0,.95) 78%, transparent 94%);',
      '  animation: ag-cs-liftoff-ring 520ms cubic-bezier(.16,1,.3,1) forwards;',
      '}',
      '',
      '/* Smoked Obsidian Silky Sidebar Rows & Active Bar (All 14 Clients — binary-verified 2026 selectors) */',
      'html[data-ag-cs-style="1"] :is([data-row-key^="session:"], [data-app-action-sidebar-thread-row], [data-testid="agent-session-row"], [data-purpose-section-list], [data-thread-item], [data-sidebar-row], .monaco-list-row) {',
      '  transition: background-color 180ms cubic-bezier(.22,1,.36,1), color 150ms ease, transform 160ms cubic-bezier(.22,1,.36,1), box-shadow 180ms ease;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-motion!="off"] :is([data-row-key^="session:"], [data-app-action-sidebar-thread-row], [data-testid="agent-session-row"], [data-thread-item]):active {',
      '  transform: scale(0.985);',
      '}',
      '@keyframes ag-sb-bar-in { from { transform: scaleY(0.25); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }',
      'html[data-ag-cs-style="1"][data-prism-optical-facet="on"] :is([data-row-key^="session:"][aria-selected="true"], [data-row-key^="session:"][data-selected="true"], [data-app-action-sidebar-thread-row][aria-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"], .monaco-list-row.selected, #app-sidebar [aria-selected="true"], [data-testid="agent-session-row"][aria-selected="true"], .topic-list-item.active, [data-purpose-section-list][data-active="true"], [data-thread-item][data-active="true"], [data-testid="sidebar-base-card"] [aria-selected="true"], aside a[aria-current="page"]) {',
      '  position: relative !important;',
      '}',
      'html[data-ag-cs-style="1"][data-prism-optical-facet="on"] :is([data-row-key^="session:"][aria-selected="true"], [data-row-key^="session:"][data-selected="true"], [data-app-action-sidebar-thread-row][aria-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"], [data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"], .monaco-list-row.selected, #app-sidebar [aria-selected="true"], [data-testid="agent-session-row"][aria-selected="true"], .topic-list-item.active, [data-purpose-section-list][data-active="true"], [data-thread-item][data-active="true"], [data-testid="sidebar-base-card"] [aria-selected="true"], aside a[aria-current="page"])::after {',
      '  content: ""; position: absolute; left: 4px; top: 7px; bottom: 7px; width: 2px; border-radius: 999px;',
      '  background: var(--ag-cs-sb-bar); box-shadow: var(--ag-cs-sb-glow); pointer-events: none;',
      '  transform-origin: center; animation: ag-sb-bar-in 210ms cubic-bezier(.22,1.25,.36,1) both;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-sidebar-compact="on"] [data-row-key^="session:"] {',
      '  padding-top: 5px !important; padding-bottom: 5px !important;',
      '}',
      'html[data-ag-cs-style="1"][data-ag-cs-motion="off"] * {',
      '  transition-duration: 0.01ms !important; animation-duration: 0.01ms !important;',
      '}',
    ].join('\n');
  }

  // In-memory storage adapter for dual-mascot-rig (satisfies zero-host-storage privacy contract)
  var memoryStoreMap = Object.create(null);
  var memoryStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memoryStoreMap, k) ? memoryStoreMap[k] : null; },
    setItem: function (k, v) { memoryStoreMap[k] = String(v); },
    removeItem: function (k) { delete memoryStoreMap[k]; },
  };

  function setAttrIfChanged(el, k, v) {
    if (!el || !el.setAttribute) return;
    if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v));
  }

  function queryFirst(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var found = D.querySelector(selectors[i]);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  function createOpticalSuiteController() {
    var destroyed = false;
    var active = false;
    var lastPayload = null;
    var isDark = true;
    var motionTier = 'ultra';
    var ambientScale = 1;
    var vividness = 'balanced';
    var accentTone = 'follow';
    var paletteKey = 'obsidian';
    var lastMascotActAt = 0;
    var spaMo = null;
    var spaRescanTimer = 0;
    var lastBusyAt = 0;
    var glassOverlayActive = false;
    var scrollThrottleBound = false;
    var isStreaming = false;
    var manualStreamingOverride = null;
    var streamPollTimer = 0;
    var onScrollBusy = function () { lastBusyAt = Date.now(); };
    function isPerfBusy() { return isStreaming || (Date.now() - lastBusyAt) < 420; }

    var STREAM_DETECT_SEL = [
      'button[data-streaming="1"]',
      'button[data-testid*="stop" i]',
      'button[aria-label*="停止"]',
      'button[aria-label*="中止"]',
      'button[aria-label*="Stop generating" i]',
      'button[aria-label*="Stop response" i]',
      'button[aria-label*="Cancel generation" i]',
      '[data-chat-streaming="1"]',
      '[data-streaming="true"]',
    ].join(', ');

    function detectHostStreaming() {
      if (manualStreamingOverride !== null) return manualStreamingOverride;
      if (D.documentElement && D.documentElement.getAttribute('data-dreamskin-streaming') === '1') return true;
      try {
        var el = D.querySelector(STREAM_DETECT_SEL);
        if (el && el.offsetParent !== null && !el.disabled) return true;
      } catch (_) {}
      return false;
    }

    var ACTIVE_SIDEBAR_ROW_SEL = [
      '[data-row-key^="session:"][aria-selected="true"]',
      '[data-row-key^="session:"][data-selected="true"]',
      '[data-testid="conversation-row-sidebar"][data-selected="true"]',
      '[data-app-action-sidebar-thread-row][aria-selected="true"]',
      '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]',
      '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"]',
      '[data-testid="agent-session-row"][aria-selected="true"]',
      '.topic-list-item.active',
      '[data-purpose-section-list][data-active="true"]',
      '[data-thread-item][data-active="true"]',
      '.monaco-list-row.selected',
      '#app-sidebar [aria-selected="true"]',
    ].join(', ');

    function syncSidebarRunningRow(running, completed) {
      if (running) {
        var activeRow = null;
        try { activeRow = D.querySelector(ACTIVE_SIDEBAR_ROW_SEL); } catch (_) {}
        if (!activeRow) return;
        activeRow.setAttribute('data-ag-cs-row-running', '1');
        activeRow.removeAttribute('data-ag-cs-sonar');
        if (!activeRow.querySelector('.ag-cs-orbit-spinner, [data-testid="status-loading-spinner"]')) {
          var sp = D.createElement('span');
          sp.className = 'ag-cs-orbit-spinner';
          sp.setAttribute('data-testid', 'status-loading-spinner');
          sp.setAttribute('data-dreamskin-injected', '1');
          sp.setAttribute('aria-hidden', 'true');
          var dot = D.createElement('span');
          dot.setAttribute('data-agent-state-dot', '1');
          sp.appendChild(dot);
          activeRow.appendChild(sp);
        }
      } else {
        var rows = D.querySelectorAll('[data-ag-cs-row-running="1"]');
        for (var i = 0; i < rows.length; i += 1) {
          rows[i].removeAttribute('data-ag-cs-row-running');
          var oldSp = rows[i].querySelector('.ag-cs-orbit-spinner[data-dreamskin-injected="1"]');
          if (oldSp && oldSp.parentNode) oldSp.parentNode.removeChild(oldSp);
          if (completed) {
            rows[i].setAttribute('data-ag-cs-sonar', '1');
            (function (rEl) {
              setTimeout(function () { try { rEl.removeAttribute('data-ag-cs-sonar'); } catch (_) {} }, 760);
            })(rows[i]);
          }
        }
      }
    }

    function setStreamingState(nextRunning, opts) {
      var o = opts && typeof opts === 'object' ? opts : {};
      if (o.manual === true) manualStreamingOverride = Boolean(nextRunning);
      else if (o.manual === false) manualStreamingOverride = null;
      var next = Boolean(nextRunning);
      var prev = isStreaming;
      isStreaming = next;
      if (D.documentElement) {
        if (next) setAttrIfChanged(D.documentElement, 'data-ag-cs-streaming', '1');
        else if (D.documentElement.hasAttribute('data-ag-cs-streaming')) D.documentElement.removeAttribute('data-ag-cs-streaming');
      }
      syncSidebarRunningRow(next, prev && !next && !o.hasError && !o.silent);
      if (next) {
        lastBusyAt = Date.now();
        if (!prev) {
          notifyMascotSafe('activity', {});
          notifyMascotSafe('send', {});
        }
      }
      if (mascotRig && typeof mascotRig.setState === 'function') {
        try {
          mascotRig.setState({
            streaming: next,
            streamTier: Number(o.tier || 2),
            hasError: Boolean(o.hasError),
          });
        } catch (_) {}
      }
      if (prev && !next && !o.hasError && !o.silent) {
        notifyMascotSafe('complete', {});
      }
      return isStreaming;
    }

    function pollStreamingState() {
      if (destroyed || !active || D.hidden) return;
      var detected = detectHostStreaming();
      if (detected !== isStreaming) {
        setStreamingState(detected, {});
      }
    }

    function notifyMascotSafe(eventName, payload) {
      if (!mascotRig || typeof mascotRig.notify !== 'function') return;
      try {
        mascotRig.notify(eventName, payload || {});
        if (eventName === 'activity' && typeof mascotRig.syncPowerState === 'function') {
          mascotRig.syncPowerState();
        }
      } catch (_) {}
    }

    var rimCtl = null;
    var rimPointerBound = false;
    var userMovedPointer = false;
    var idleRimTimer = 0;

    var mascotRig = null;
    var mascotStageEl = null;
    var mascotHostEl = null;
    var mascotSig = '';
    var inputCleanup = null;

    var motionBinding = null;
    var caretCtl = null;
    var caretBoundCleanups = [];

    var rippleHostEl = null;
    var rippleParentEl = null;
    var rippleGlow = null;
    var rippleField = null;
    var rippleWaves = null;
    var rippleCanvas = null;
    var rippleGlowCanvas = null;
    var rippleRaf = 0;
    var rippleRo = null;
    var rippleCleanups = [];
    var rippleState = {
      width: 0,
      height: 0,
      dpr: 1,
      aura: { x: 0, y: 0, active: false },
      lastMoveAt: 0,
      prevMs: 0,
      lx: null,
      ly: null,
      carry: 0,
      opacity: 1,
    };

    var domRescanTimer = 0;

    function ensureOpticalStyle() {
      var head = D.head || D.documentElement;
      if (!head) return;
      var el = D.getElementById(OPTICAL_STYLE_ID);
      if (!el) {
        el = D.createElement('style');
        el.id = OPTICAL_STYLE_ID;
        head.appendChild(el);
      }
      var css = buildOpticalCss();
      if (el.textContent !== css) el.textContent = css;
    }

    function removeOpticalStyle() {
      var el = D.getElementById(OPTICAL_STYLE_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // ── 1. Prism Rim 300Hz GPU Canvas Controller ────────────────────────────
    var onGlobalPointerMove = function (ev) {
      if (!rimCtl) return;
      userMovedPointer = true;
      rimCtl.onPointerMove(ev);
    };

    function tagPrismBoxes(enable) {
      var composer = queryFirst(COMPOSER_SELECTORS);
      var mirrors = [];
      for (var i = 0; i < MIRROR_CARD_SELECTORS.length; i += 1) {
        try {
          var found = D.querySelectorAll(MIRROR_CARD_SELECTORS[i]);
          for (var j = 0; j < found.length; j += 1) mirrors.push(found[j]);
        } catch (_) {}
      }

      if (!enable) {
        var tagged = D.querySelectorAll('[data-dreamskin-prism-tagged="1"]');
        for (var k = 0; k < tagged.length; k += 1) {
          tagged[k].removeAttribute('data-ag-cs-prism-box');
          tagged[k].removeAttribute('data-ag-cs-prism-mirror');
          tagged[k].removeAttribute('data-dreamskin-prism-tagged');
        }
        return null;
      }

      if (composer) {
        setAttrIfChanged(composer, 'data-ag-cs-prism-box', '1');
        setAttrIfChanged(composer, 'data-dreamskin-prism-tagged', '1');
        if (composer.classList && !composer.classList.contains('surface-composer-card')) {
          composer.classList.add('surface-composer-card');
          setAttrIfChanged(composer, 'data-dreamskin-added-composer-cls', '1');
        }
      }
      for (var m = 0; m < mirrors.length; m += 1) {
        setAttrIfChanged(mirrors[m], 'data-ag-cs-prism-box', '1');
        setAttrIfChanged(mirrors[m], 'data-ag-cs-prism-mirror', '1');
        setAttrIfChanged(mirrors[m], 'data-dreamskin-prism-tagged', '1');
      }
      return composer;
    }

    function seedAmbientComposerRim(composer) {
      if (!rimCtl || !composer || userMovedPointer) return;
      try {
        var r = composer.getBoundingClientRect();
        if (r && r.width > 40 && r.height > 20) {
          rimCtl.onPointerMove({ clientX: r.left + r.width * 0.28, clientY: r.top + 2 });
        }
      } catch (_) {}
    }

    function teardownRim() {
      if (idleRimTimer) { clearTimeout(idleRimTimer); idleRimTimer = 0; }
      if (rimPointerBound) {
        G.removeEventListener('pointermove', onGlobalPointerMove);
        rimPointerBound = false;
      }
      if (rimCtl) {
        try { rimCtl.teardown(); } catch (_) {}
        rimCtl = null;
      }
      tagPrismBoxes(false);
    }

    function syncRim(enable) {
      var mod = G.__agPrismRimCanvas;
      if (!enable || !mod || typeof mod.createPrismRimCanvasController !== 'function') {
        teardownRim();
        return;
      }
      var composer = tagPrismBoxes(true);
      if (!rimCtl) {
        rimCtl = mod.createPrismRimCanvasController({
          isDestroyed: function () { return destroyed || !active; },
          isDarkTheme: function () { return isDark; },
          motionReduced: function () { return motionTier === 'off'; },
          getMinFrameGapMs: function () { return isPerfBusy() ? 80 : 16; },
          getAmbientIntensity: function () { return ambientScale; },
          getAccentTone: function () { return accentTone; },
          canMountRealCanvas: function (el) { return Boolean(el && el.isConnected !== false); },
          setAttrIfChanged: setAttrIfChanged,
          runGuardedMut: function (fn) { try { fn(); } catch (_) {} },
          getActiveCrystalTrack: function () { return null; },
          setCrystalPointerClient: null,
          onPointerActivity: function () {
            var now = Date.now();
            if (now - lastMascotActAt >= 2400) {
              lastMascotActAt = now;
              notifyMascotSafe('activity', {});
            }
          },
          onComposerRimUpdate: function (info) {
            try { if (mascotRig && mascotRig.setRimLight) mascotRig.setRimLight(info); } catch (_) {}
          },
        });
      }
      if (!rimPointerBound) {
        G.addEventListener('pointermove', onGlobalPointerMove, { passive: true });
        rimPointerBound = true;
      }
      rimCtl.markDirty();
      rimCtl.invalidateMetrics();
      if (!userMovedPointer && composer) {
        if (idleRimTimer) clearTimeout(idleRimTimer);
        idleRimTimer = setTimeout(function () {
          idleRimTimer = 0;
          seedAmbientComposerRim(composer);
        }, 120);
      }
    }

    // ── 2. Real Obsidian Prism Pixel Mascot Stage (dual-mascot-rig.js) ──────
    function unbindComposerInput() {
      if (inputCleanup) {
        try { inputCleanup(); } catch (_) {}
        inputCleanup = null;
      }
    }

    function bindComposerInput(host) {
      unbindComposerInput();
      if (!host) return;
      var input = host.querySelector('textarea, [data-composer-input], [contenteditable="true"], input[type="text"]');
      if (!input) return;
      var onInput = function () {
        if (!mascotRig || !mascotRig.onUserType) return;
        var val = typeof input.value === 'string' ? input.value : (input.textContent || '');
        try { mascotRig.onUserType(val); } catch (_) {}
      };
      var onGlobalAct = function () {
        var now = Date.now();
        if (now - lastMascotActAt >= 2400) {
          lastMascotActAt = now;
          notifyMascotSafe('activity', {});
        }
      };
      input.addEventListener('input', onInput, { passive: true });
      D.addEventListener('pointerdown', onGlobalAct, { passive: true });
      D.addEventListener('keydown', onGlobalAct, { passive: true });
      inputCleanup = function () {
        try { input.removeEventListener('input', onInput); } catch (_) {}
        try { D.removeEventListener('pointerdown', onGlobalAct); } catch (_) {}
        try { D.removeEventListener('keydown', onGlobalAct); } catch (_) {}
      };
    }

    function teardownMascot() {
      unbindComposerInput();
      if (mascotRig) {
        try { mascotRig.dispose(); } catch (_) {}
        mascotRig = null;
      }
      if (mascotStageEl && mascotStageEl.parentNode) {
        mascotStageEl.parentNode.removeChild(mascotStageEl);
      }
      var fallback = D.getElementById(FALLBACK_ANCHOR_ID);
      if (fallback && fallback.parentNode) fallback.parentNode.removeChild(fallback);
      mascotStageEl = null;
      mascotHostEl = null;
      mascotSig = '';
      if (D.documentElement) D.documentElement.removeAttribute('data-ag-cs-has-crab');
    }

    function resolveMascotAnchor() {
      var composer = queryFirst(COMPOSER_SELECTORS);
      if (composer) return { host: composer, isFallback: false };
      if (!D.body) return null;
      var fb = D.getElementById(FALLBACK_ANCHOR_ID);
      if (!fb) {
        fb = D.createElement('div');
        fb.id = FALLBACK_ANCHOR_ID;
        D.body.appendChild(fb);
      }
      return { host: fb, isFallback: true };
    }

    function syncMascot(enable, cfg, appId) {
      var rigMod = G.__agDualMascotRig;
      var mCfg = resolveMascotConfig(cfg, appId);
      if (!enable || mCfg.mascot === 'off' || !rigMod || typeof rigMod.mountDualMascotStage !== 'function') {
        teardownMascot();
        return;
      }
      var anchor = resolveMascotAnchor();
      if (!anchor || !anchor.host) return;
      var targetHost = anchor.host;
      var chromaOn = Boolean(cfg && cfg.prismaticCoat);
      var nextSig = mCfg.mascot + '|' + mCfg.camp + '|' + (mCfg.miniPileEnabled ? '1' : '0') + '|ch:' + (chromaOn ? '1' : '0');

      // Sync rainbow chroma coat easter-egg state via in-memory storage before mount
      if (chromaOn) memoryStorage.setItem('__op_chroma_v1', '1');
      else memoryStorage.removeItem('__op_chroma_v1');

      if (mascotRig && mascotHostEl === targetHost && mascotStageEl && mascotStageEl.isConnected) {
        if (mascotSig !== nextSig) {
          teardownMascot();
        } else {
          if (cfg && cfg.habitatMode && typeof mascotRig.setHabitatPreview === 'function') {
            try { mascotRig.setHabitatPreview(cfg.habitatMode); } catch (_) {}
          }
          setAttrIfChanged(D.documentElement, 'data-ag-cs-has-crab', '1');
          return;
        }
      } else if (mascotRig) {
        teardownMascot();
      }

      if (!anchor.isFallback && targetHost.style) {
        var cs = typeof G.getComputedStyle === 'function' ? G.getComputedStyle(targetHost) : null;
        if (cs && cs.position === 'static') targetHost.style.position = 'relative';
        targetHost.style.overflow = 'visible';
      }

      // CRITICAL: appendChild (EXACT match to Obsidian Prism ui-runtime.js line 605) so mascots' feet
      // sit crisply IN FRONT of the composer top border — NEVER clipped behind composer background!
      var stage = D.createElement('div');
      stage.className = 'ag-cs-crab ag-cs-dual-stage';
      stage.setAttribute(MASCOT_STAGE_ATTR, '1');
      stage.setAttribute('data-mascot-stage', 'true');
      targetHost.appendChild(stage);

      mascotHostEl = targetHost;
      mascotStageEl = stage;
      mascotSig = nextSig;
      setAttrIfChanged(D.documentElement, 'data-ag-cs-has-crab', '1');

      try {
        mascotRig = rigMod.mountDualMascotStage(stage, {
          mascot: mCfg.mascot,
          camp: mCfg.camp,
          streaming: isStreaming,
          streamTier: 2,
          hasError: false,
          yieldMode: 'none',
          leapOffsetY: 0,
          popoverRightWidth: 0,
          miniPileEnabled: mCfg.miniPileEnabled,
          orchestrator: false,
          storage: memoryStorage,
          reducedMotion: motionTier === 'off',
          keepAliveWhileVisible: true,
          dozeAfterMs: 180000,
          dozeAfterNightMs: 120000,
          firstTheaterDelayMs: 2200,
        });
        bindComposerInput(targetHost);
        if (cfg && cfg.habitatMode && typeof mascotRig.setHabitatPreview === 'function') {
          try { mascotRig.setHabitatPreview(cfg.habitatMode); } catch (_) {}
        }
        // Kick off authentic idle theater & wake out of night-time doze immediately upon mount
        setTimeout(function () {
          if (!destroyed && active && mascotRig) {
            notifyMascotSafe('activity', {});
            if (rimCtl && !userMovedPointer && !anchor.isFallback) {
              seedAmbientComposerRim(targetHost);
            }
          }
        }, 140);
      } catch (_) {
        teardownMascot();
      }
    }

    // ── 3. Authentic WebGL2 Brand Horizon Glow + Interactive ASCII Character Matrix (ripple-core.js) ──
    function teardownRipple() {
      if (rippleRaf && typeof G.cancelAnimationFrame === 'function') {
        G.cancelAnimationFrame(rippleRaf);
        rippleRaf = 0;
      }
      if (rippleRo) {
        try { rippleRo.disconnect(); } catch (_) {}
        rippleRo = null;
      }
      for (var i = 0; i < rippleCleanups.length; i += 1) {
        try { rippleCleanups[i](); } catch (_) {}
      }
      rippleCleanups = [];
      try { if (rippleField && rippleField.dispose) rippleField.dispose(true); } catch (_) {}
      try { if (rippleGlow && rippleGlow.dispose) rippleGlow.dispose(true); } catch (_) {}
      if (rippleHostEl && rippleHostEl.parentNode) {
        rippleHostEl.parentNode.removeChild(rippleHostEl);
      }
      if (rippleParentEl) {
        rippleParentEl.removeAttribute('data-dreamskin-ripple-parent');
      }
      rippleHostEl = null;
      rippleParentEl = null;
      rippleGlow = null;
      rippleField = null;
      rippleWaves = null;
      rippleCanvas = null;
      rippleGlowCanvas = null;
      rippleState.width = 0;
      rippleState.height = 0;
    }

    function resolveSpectrumName() {
      if (accentTone === 'cobalt' || accentTone === 'iris' || accentTone === 'amber' || accentTone === 'mono') return accentTone;
      return paletteKey === 'warm' ? 'warm' : 'default';
    }

    function syncRipple(enable, opacity) {
      // CRITICAL FIX: ripple-core.js registers on G.__agCsRippleCore!
      var rc = G.__agCsRippleCore || G.__agPrismRipple;
      if (!enable || !rc || ambientScale <= 0.01) {
        teardownRipple();
        return;
      }
      var parent = queryFirst(MAIN_STAGE_SELECTORS) || D.body;
      if (!parent) return;

      rippleState.opacity = Math.max(0.15, Math.min(1, Number(opacity || 1)));

      if (rippleHostEl && rippleParentEl === parent && rippleHostEl.isConnected) {
        rippleHostEl.style.opacity = String(rippleState.opacity);
        if (rippleField && rippleField.invalidate) rippleField.invalidate();
        if (rippleGlow && rippleGlow.invalidate) rippleGlow.invalidate();
        return;
      }

      teardownRipple();
      rippleParentEl = parent;
      setAttrIfChanged(parent, 'data-dreamskin-ripple-parent', '1');

      var host = D.createElement('div');
      host.className = 'ag-cs-ripple-host';
      host.setAttribute(RIPPLE_HOST_ATTR, '1');
      host.setAttribute('aria-hidden', 'true');
      host.style.opacity = String(rippleState.opacity);

      var glowCv = D.createElement('canvas');
      glowCv.className = 'ag-cs-brand-glow';
      glowCv.setAttribute('aria-hidden', 'true');

      var fieldCv = D.createElement('canvas');
      fieldCv.className = 'ag-cs-ripple-canvas';
      fieldCv.setAttribute('aria-hidden', 'true');

      host.appendChild(glowCv);
      host.appendChild(fieldCv);
      parent.insertBefore(host, parent.firstChild);

      rippleHostEl = host;
      rippleGlowCanvas = glowCv;
      rippleCanvas = fieldCv;

      function layoutRipple() {
        if (!rippleParentEl || !rippleCanvas || !rippleGlowCanvas) return;
        var w = Math.max(120, rippleParentEl.clientWidth || G.innerWidth || 960);
        var h = Math.max(120, rippleParentEl.clientHeight || G.innerHeight || 680);
        // Cap DPR at 1.25 (1.0 when liquid glass blur is layered above) to cut HiDPI GPU fill-rate by 60-75%
        var maxDpr = glassOverlayActive ? 1.0 : 1.25;
        var dpr = Math.min(G.devicePixelRatio || 1, maxDpr);
        if (w === rippleState.width && h === rippleState.height && dpr === rippleState.dpr && rippleField) return;
        rippleState.width = w;
        rippleState.height = h;
        rippleState.dpr = dpr;

        var cw = rc.RIPPLE.cellWidth;
        var ch = rc.RIPPLE.cellHeight;
        var cols = Math.ceil(w / cw);
        var rows = Math.ceil(h / ch);

        rippleCanvas.width = Math.round(cols * cw * dpr);
        rippleCanvas.height = Math.round(rows * ch * dpr);
        rippleCanvas.style.width = (cols * cw) + 'px';
        rippleCanvas.style.height = (rows * ch) + 'px';

        try { if (rippleField && rippleField.dispose) rippleField.dispose(true); } catch (_) {}
        rippleWaves = rc.createWaveField(cols, rows);
        rippleField = rc.createGlyphField(rippleCanvas, cols, rows, rippleWaves, {});
        if (!rippleField || rippleField.mode === 'none') {
          rippleField = rc.createGlyphField(rippleCanvas, cols, rows, rippleWaves, { prefer2D: true });
        }

        if (!rippleGlow && typeof rc.mountBrandHorizonGlow === 'function') {
          rippleGlow = rc.mountBrandHorizonGlow(rippleGlowCanvas, {});
          if (!rippleGlow || rippleGlow.mode === 'none') {
            rippleGlow = rc.mountBrandHorizonGlow(rippleGlowCanvas, { prefer2D: true });
          }
        }
        if (rippleGlow && rippleGlow.resize) {
          rippleGlow.resize(w, h, 0.65);
        }
      }

      function readPaletteTokens() {
        var cs = typeof G.getComputedStyle === 'function' ? G.getComputedStyle(rippleCanvas) : null;
        var sp = resolveSpectrumName();
        var defWave = isDark
          ? (sp === 'warm' ? [217, 119, 87] : [214, 218, 228])
          : (sp === 'warm' ? [194, 89, 52] : [37, 99, 235]);
        var defInk = isDark ? [146, 148, 156] : [104, 114, 134];
        var ink = (cs && rc.parseCssColorToRgb(cs.getPropertyValue('--ag-cs-ripple-ink'))) || defInk;
        var wave = (cs && rc.parseCssColorToRgb(cs.getPropertyValue('--ag-cs-ripple-wave'))) || defWave;
        return { ink: ink, wave: wave, spectrum: sp };
      }

      var lastDrawAt = 0;
      function tick(now) {
        rippleRaf = 0;
        if (destroyed || !active || !rippleHostEl || !rippleHostEl.isConnected) return;
        if (D.hidden) return;
        // Streaming / scroll / glass adaptive frame pacing: silky 30fps on pointer interaction,
        // 12fps calm breathing when idle, and immediate yield during rapid scroll or AI token streaming bursts!
        var pointerActive = (now - rippleState.lastMoveAt) < 1600;
        var minGap = isPerfBusy()
          ? 240
          : glassOverlayActive
            ? (pointerActive ? 55 : 140)
            : (pointerActive ? 32 : 84);
        if (now - lastDrawAt >= minGap) {
          lastDrawAt = now;
          var dt = rippleState.prevMs ? Math.min(0.05, Math.max(0, (now - rippleState.prevMs) / 1000)) : 0.016;
          rippleState.prevMs = now;
          var still = motionTier === 'off';
          if (rippleWaves) rippleWaves.advance(still ? 0 : dt);
          var tok = readPaletteTokens();
          var auraOn = rippleState.aura.active && !still && (now - rippleState.lastMoveAt < 1800);
          if (rippleGlow && rippleGlow.draw) {
            var isMono = tok.spectrum === 'mono';
            var vPrism = vividness === 'soft' ? 0.22 : vividness === 'vivid' ? 0.78 : 0.44;
            var vReach = vividness === 'soft' ? 0.44 : vividness === 'vivid' ? 0.58 : 0.48;
            var vSpeed = vividness === 'soft' ? 0.9 : vividness === 'vivid' ? 1.25 : 1.05;
            var breathSurge = still || isMono || vividness !== 'vivid'
              ? 0
              : 0.08 + 0.08 * Math.sin(now * 0.0005);
            var horizonPrism = isMono ? 0.18 : vPrism;
            rippleGlow.draw(now, {
              dark: isDark,
              still: still,
              strength: 1,
              reach: vReach,
              prism: horizonPrism,
              surge: breathSurge,
              speed: vSpeed,
              ambientIntensity: ambientScale,
              spectrum: tok.spectrum,
            });
          }
          if (rippleField && rippleField.draw) {
            var pGain = vividness === 'soft' ? 0.78 : vividness === 'vivid' ? 1.2 : 1.0;
            rippleField.draw(now, {
              ink: tok.ink,
              wave: tok.wave,
              dark: isDark,
              fontFamily: 'ui-monospace, Consolas, monospace',
              conv: false,
              alphaScale: vividness === 'soft' ? 0.85 : 1.0,
              nebulaLiftScale: vividness === 'vivid' ? 1.16 : 1.0,
              auraLiftScale: vividness === 'vivid' ? 1.14 : 1.0,
              prismStrength: Math.min(1.25, ambientScale * (tok.spectrum === 'mono' ? 0.45 : pGain)),
              ambientIntensity: ambientScale,
              spectrum: tok.spectrum,
              aura: auraOn
                ? { x: rippleState.aura.x, y: rippleState.aura.y, radius: 230, strength: ambientScale, active: true }
                : { x: 0, y: 0, radius: 230, strength: 0, active: false },
              auraPhase: now * 0.0006,
            }, still);
          }
        }
        if (typeof G.requestAnimationFrame === 'function') {
          rippleRaf = G.requestAnimationFrame(tick);
        }
      }

      var onMove = function (ev) {
        if (!rippleCanvas || motionTier === 'off') return;
        var r = rippleCanvas.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var y = ev.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) return;
        var now = performance.now();
        if (rippleState.lx !== null && rippleState.ly !== null && rippleWaves) {
          var dist = Math.hypot(x - rippleState.lx, y - rippleState.ly);
          var spd = dist / Math.max(0.006, (now - rippleState.lastMoveAt) / 1000);
          if (spd >= 220) {
            rippleState.carry += dist;
            if (rippleState.carry >= 42) {
              rippleState.carry = 0;
              rippleWaves.skimmer(
                Math.floor(x / rc.RIPPLE.cellWidth),
                Math.floor(y / rc.RIPPLE.cellHeight),
                Math.min(1, Math.max(0.08, (spd - 220) / 1800))
              );
            }
          }
        }
        rippleState.lx = x;
        rippleState.ly = y;
        rippleState.aura.x = x;
        rippleState.aura.y = y;
        rippleState.aura.active = true;
        rippleState.lastMoveAt = now;
        if (rippleField && rippleField.invalidate) rippleField.invalidate();
      };

      var onPress = function (ev) {
        if (ev.button !== 0 || !rippleCanvas || !rippleWaves || motionTier === 'off') return;
        var tgt = ev.target;
        if (tgt && tgt.closest && tgt.closest('button, input, textarea, select, [data-dreamskin-control-panel]')) return;
        var r = rippleCanvas.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var y = ev.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) return;
        rippleWaves.disturb(Math.floor(x / rc.RIPPLE.cellWidth), Math.floor(y / rc.RIPPLE.cellHeight));
        if (rippleField && rippleField.invalidate) rippleField.invalidate();
        if (mascotRig && mascotHostEl) {
          try {
            var mr = mascotHostEl.getBoundingClientRect();
            notifyMascotSafe('ripple', { x: ev.clientX - mr.left });
          } catch (_) {}
        }
      };

      parent.addEventListener('pointermove', onMove, { passive: true });
      parent.addEventListener('pointerdown', onPress, { passive: true });
      rippleCleanups.push(function () {
        parent.removeEventListener('pointermove', onMove);
        parent.removeEventListener('pointerdown', onPress);
      });

      if (typeof G.ResizeObserver === 'function') {
        rippleRo = new G.ResizeObserver(function () {
          layoutRipple();
        });
        rippleRo.observe(parent);
      }

      layoutRipple();
      if (rippleField && typeof rippleField.triggerTideSwell === 'function' && motionTier !== 'off') {
        try { rippleField.triggerTideSwell(); } catch (_) {}
      }
      if (rippleWaves && motionTier !== 'off') {
        try {
          rippleWaves.disturb(
            Math.floor((rippleState.width * 0.48) / rc.RIPPLE.cellWidth),
            Math.floor((rippleState.height * 0.72) / rc.RIPPLE.cellHeight),
            { amplitudeScale: 0.9, radiusScale: 1.15 }
          );
        } catch (_) {}
      }
      if (typeof G.requestAnimationFrame === 'function') {
        rippleRaf = G.requestAnimationFrame(tick);
      }
    }

    // ── 4. 4-Tier Spring Motion Engine & Smooth Caret ───────────────────────
    function teardownMotionAndCaret() {
      if (motionBinding && motionBinding.unbind) {
        try { motionBinding.unbind(); } catch (_) {}
      }
      motionBinding = null;
      for (var i = 0; i < caretBoundCleanups.length; i += 1) {
        try { caretBoundCleanups[i](); } catch (_) {}
      }
      caretBoundCleanups = [];
      if (caretCtl && caretCtl.teardown) {
        try { caretCtl.teardown(); } catch (_) {}
      }
      caretCtl = null;
    }

    function syncMotionAndCaret(enable) {
      if (!enable || motionTier === 'off') {
        teardownMotionAndCaret();
        return;
      }
      var me = G.__agMotionEngine;
      if (me && typeof me.bindMicroInteractions === 'function' && !motionBinding) {
        motionBinding = me.bindMicroInteractions(D, { motionTier: motionTier });
      }
      var sc = G.__agPrismSmoothCaret;
      if (sc && typeof sc.createSmoothCaretController === 'function' && !caretCtl) {
        caretCtl = sc.createSmoothCaretController({
          isDestroyed: function () { return destroyed || !active; },
          isEnabled: function () { return active && motionTier !== 'off'; },
          setAttrIfChanged: setAttrIfChanged,
          runGuardedMut: function (fn) { try { fn(); } catch (_) {} },
        });
        var onSel = function () { if (caretCtl) caretCtl.queue(false, false, false, false); };
        var onType = function () { if (caretCtl) caretCtl.queue(true, false, false, false); };
        D.addEventListener('selectionchange', onSel, { passive: true });
        D.addEventListener('input', onType, { passive: true });
        D.addEventListener('focusin', onSel, { passive: true });
        D.addEventListener('focusout', onSel, { passive: true });
        caretBoundCleanups.push(function () {
          D.removeEventListener('selectionchange', onSel);
          D.removeEventListener('input', onType);
          D.removeEventListener('focusin', onSel);
          D.removeEventListener('focusout', onSel);
        });
      }
    }

    function clearRootAttrs() {
      var html = D.documentElement;
      if (!html) return;
      var keys = [
        'data-ag-cs-style',
        'data-ag-cs-theme',
        'data-ag-cs-palette',
        'data-ag-cs-accent',
        'data-ag-cs-motion',
        'data-ag-cs-ambient',
        'data-ag-cs-vividness',
        'data-ag-cs-font-style',
        'data-ag-cs-text-style',
        'data-ag-cs-corners',
        'data-ag-cs-code-font',
        'data-ag-cs-ligatures',
        'data-ag-cs-sidebar-compact',
        'data-ag-cs-has-crab',
      ];
      for (var i = 0; i < keys.length; i += 1) html.removeAttribute(keys[i]);
    }

    function detectTheme(cfg) {
      var tm = cfg && cfg.themeMode;
      if (tm === 'light') return 'light';
      if (tm === 'dark') return 'dark';
      var html = D.documentElement;
      if (html && (html.classList.contains('light') || html.getAttribute('data-theme') === 'light')) return 'light';
      return 'dark';
    }

    function apply(payload) {
      if (destroyed) return;
      lastPayload = payload || {};
      var p = lastPayload;
      if (p.skinEnabled === false) {
        teardownAll();
        return;
      }

      var cfg = (p.config && typeof p.config === 'object') ? p.config : {};
      var comp = (p.composition && typeof p.composition === 'object') ? p.composition : {};
      var eff = (comp.effectiveModules && typeof comp.effectiveModules === 'object') ? comp.effectiveModules : {};
      var skinMode = comp.skinMode || cfg.skinMode || 'wallpaper';
      var appId = (p.adapterProfile && p.adapterProfile.appId) || cfg.appId || '';

      var needOpticalCss = Boolean(eff.opticalPalette || eff.opticalFacet || eff.microMotion || eff.pixelCompanion || eff.rippleField);
      if (!needOpticalCss) {
        teardownAll();
        return;
      }

      active = true;
      var theme = detectTheme(cfg);
      isDark = theme !== 'light';
      paletteKey = resolvePaletteAttr(cfg.colorScheme || 'prism-default');
      accentTone = resolveAccentAttr(cfg);
      motionTier = eff.microMotion ? String(cfg.motionTier || 'ultra') : 'off';
      ambientScale = Number.isFinite(Number(cfg.ambientIntensity)) ? Math.max(0, Math.min(1, Number(cfg.ambientIntensity))) : 1;
      vividness = ['soft', 'balanced', 'vivid'].indexOf(String(cfg.vividness || '')) >= 0 ? String(cfg.vividness) : 'balanced';

      var html = D.documentElement;
      setAttrIfChanged(html, 'data-ag-cs-style', '1');
      setAttrIfChanged(html, 'data-ag-cs-theme', theme);
      setAttrIfChanged(html, 'data-ag-cs-palette', paletteKey);
      setAttrIfChanged(html, 'data-ag-cs-accent', accentTone);
      setAttrIfChanged(html, 'data-ag-cs-motion', motionTier);
      setAttrIfChanged(html, 'data-ag-cs-ambient', String(ambientScale));
      setAttrIfChanged(html, 'data-ag-cs-vividness', vividness);
      setAttrIfChanged(html, 'data-ag-cs-font-style', cfg.fontStyle || 'modern');
      setAttrIfChanged(html, 'data-ag-cs-text-style', cfg.textStyle || 'stylized');
      setAttrIfChanged(html, 'data-ag-cs-corners', cfg.cornerStyle || 'balanced');
      setAttrIfChanged(html, 'data-ag-cs-code-font', cfg.codeFont || 'default');
      setAttrIfChanged(html, 'data-ag-cs-ligatures', cfg.codeLigatures ? '1' : '0');
      setAttrIfChanged(html, 'data-ag-cs-sidebar-compact', cfg.sidebarCompact ? 'on' : 'off');

      ensureOpticalStyle();

      // 1. 300Hz GPU Canvas Prism Rim
      syncRim(Boolean(eff.opticalFacet));

      // 2. Real Pixel Mascot Stage on Composer top edge (appended last so legs are NEVER clipped!)
      syncMascot(Boolean(eff.pixelCompanion), cfg, appId);

      // 3. WebGL2 Brand Horizon Glow + Interactive ASCII Character Matrix Ripple Field
      glassOverlayActive = Boolean(eff.glassLayer && eff.wallpaperLayer);
      if (!scrollThrottleBound) {
        G.addEventListener('wheel', onScrollBusy, { passive: true, capture: true });
        D.addEventListener('scroll', onScrollBusy, { passive: true, capture: true });
        scrollThrottleBound = true;
      }
      var wantRipple = Boolean(eff.rippleField !== undefined ? eff.rippleField : (skinMode === 'optical' && eff.opticalFacet));
      var rippleOpacity = eff.wallpaperLayer ? 0.45 : 1.0;
      syncRipple(wantRipple, rippleOpacity);

      // 4. 4-Tier Spring Motion Engine + Smooth Caret
      syncMotionAndCaret(Boolean(eff.microMotion));

      // 5. Streaming-safe SPA remount observer (zero layout thrash during AI token streaming!)
      if (typeof G.MutationObserver === 'function' && D.body && !spaMo) {
        spaMo = new G.MutationObserver(function () {
          if (!active || destroyed) return;
          lastBusyAt = Date.now();
          if (spaRescanTimer) return;
          var needMascotRe = Boolean(eff.pixelCompanion) && (!mascotHostEl || !mascotHostEl.isConnected || !mascotStageEl || !mascotStageEl.isConnected || mascotHostEl.id === FALLBACK_ANCHOR_ID);
          var needRippleRe = wantRipple && (!rippleParentEl || !rippleParentEl.isConnected || !rippleHostEl || !rippleHostEl.isConnected);
          if (!needMascotRe && !needRippleRe) return;
          spaRescanTimer = setTimeout(function () {
            spaRescanTimer = 0;
            if (!active || destroyed || !lastPayload) return;
            var lp = lastPayload;
            var lc = (lp.config && typeof lp.config === 'object') ? lp.config : {};
            var le = (lp.composition && lp.composition.effectiveModules) || {};
            var la = (lp.adapterProfile && lp.adapterProfile.appId) || lc.appId || '';
            if (le.pixelCompanion && (!mascotHostEl || !mascotHostEl.isConnected || !mascotStageEl || !mascotStageEl.isConnected || mascotHostEl.id === FALLBACK_ANCHOR_ID)) {
              syncMascot(true, lc, la);
              if (le.opticalFacet) syncRim(true);
            }
            if ((le.rippleField !== undefined ? le.rippleField : false) && (!rippleParentEl || !rippleParentEl.isConnected || !rippleHostEl || !rippleHostEl.isConnected)) {
              syncRipple(true, le.wallpaperLayer ? 0.45 : 1.0);
            }
          }, 650);
        });
        try { spaMo.observe(D.body, { childList: true, subtree: true }); } catch (_) {}
      }

      if (!streamPollTimer) {
        streamPollTimer = setInterval(pollStreamingState, 600);
      }
      pollStreamingState();
      if (domRescanTimer) clearTimeout(domRescanTimer);
      domRescanTimer = setTimeout(function () {
        domRescanTimer = 0;
        if (!active || destroyed) return;
        if (eff.opticalFacet) syncRim(true);
        if (eff.pixelCompanion && (!mascotHostEl || mascotHostEl.id === FALLBACK_ANCHOR_ID)) {
          syncMascot(true, cfg, appId);
        }
      }, 650);
    }

    function teardownAll() {
      active = false;
      if (domRescanTimer) { clearTimeout(domRescanTimer); domRescanTimer = 0; }
      if (spaRescanTimer) { clearTimeout(spaRescanTimer); spaRescanTimer = 0; }
      if (streamPollTimer) { clearInterval(streamPollTimer); streamPollTimer = 0; }
      isStreaming = false;
      manualStreamingOverride = null;
      syncSidebarRunningRow(false, false);
      if (D.documentElement && D.documentElement.hasAttribute('data-ag-cs-streaming')) {
        D.documentElement.removeAttribute('data-ag-cs-streaming');
      }
      if (spaMo) { try { spaMo.disconnect(); } catch (_) {} spaMo = null; }
      if (scrollThrottleBound) {
        try { G.removeEventListener('wheel', onScrollBusy, true); } catch (_) {}
        try { D.removeEventListener('scroll', onScrollBusy, true); } catch (_) {}
        scrollThrottleBound = false;
      }
      teardownRim();
      teardownMascot();
      teardownRipple();
      teardownMotionAndCaret();
      removeOpticalStyle();
      clearRootAttrs();
    }

    function destroy() {
      destroyed = true;
      teardownAll();
    }

    function status() {
      return {
        active: active,
        palette: paletteKey,
        theme: isDark ? 'dark' : 'light',
        accentTone: accentTone,
        motionTier: motionTier,
        rimMounted: Boolean(rimCtl),
        mascotMounted: Boolean(mascotRig),
        mascotSpec: mascotSig,
        streaming: isStreaming,
        rippleMounted: Boolean(rippleField),
        rippleMode: rippleField ? rippleField.mode : 'none',
        glowMode: rippleGlow ? rippleGlow.mode : 'none',
        motionMounted: Boolean(motionBinding),
      };
    }

    function playMascotDemo(kind) {
      if (!mascotRig) return false;
      notifyMascotSafe('activity', {});
      try {
        if (typeof mascotRig.playDemo === 'function') {
          mascotRig.playDemo(kind);
          return true;
        }
      } catch (_) {}
      return false;
    }

    function feedMascot(id, item) {
      if (!mascotRig) return false;
      notifyMascotSafe('activity', {});
      try {
        if (typeof mascotRig.feed === 'function') return Boolean(mascotRig.feed(id || 'cat', item || 'donut'));
      } catch (_) {}
      return false;
    }

    function pokeMascot(id) {
      if (!mascotRig) return false;
      notifyMascotSafe('activity', {});
      try {
        if (typeof mascotRig.poke === 'function') { mascotRig.poke(id || 'cat'); return true; }
      } catch (_) {}
      return false;
    }

    function setHabitatMode(mode) {
      if (!mascotRig || typeof mascotRig.setHabitatPreview !== 'function') return 'auto';
      try {
        return mascotRig.setHabitatPreview(mode || 'auto');
      } catch (_) { return 'auto'; }
    }

    function getMascotSnapshot() {
      if (!mascotRig || typeof mascotRig.getLayoutSnapshot !== 'function') return null;
      try { return mascotRig.getLayoutSnapshot(); } catch (_) { return null; }
    }

    return {
      apply: apply,
      teardown: teardownAll,
      destroy: destroy,
      status: status,
      notifyMascot: notifyMascotSafe,
      playMascotDemo: playMascotDemo,
      feedMascot: feedMascot,
      pokeMascot: pokeMascot,
      setHabitatMode: setHabitatMode,
      setStreaming: setStreamingState,
      getMascotSnapshot: getMascotSnapshot,
    };
  }

  var existing = G.__dreamSkinOptical;
  if (existing && typeof existing.destroy === 'function') {
    try { existing.destroy(); } catch (_) {}
  }
  G.__dreamSkinOptical = createOpticalSuiteController();
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
