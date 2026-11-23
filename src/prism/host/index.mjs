// Host injection script loader & client skin payload builder for agy-wallpaper-prism.
// Consumed by `sidecars/prism_studio/main.mjs`, `cdp-bridge.mjs`, and `test/verify-all.mjs`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CONFIG,
  PRISM_DOM,
  resolveEffectiveConfig,
  resolveSchemeTokens,
  sanitizeConfig,
} from '../shared/schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKIN_SCRIPT_PATH = join(__dirname, 'wallpaper-inject.js');
const PANEL_SCRIPT_PATH = join(__dirname, 'panel-inject.js');

let cachedSkinScript = null;
let cachedPanelScript = null;

/** Return the raw ES2020 IIFE source of `wallpaper-inject.js` (`window.__agyPrism`). */
export function getHostSkinScript({ reload = false } = {}) {
  if (!cachedSkinScript || reload) {
    cachedSkinScript = readFileSync(SKIN_SCRIPT_PATH, 'utf8');
  }
  return cachedSkinScript;
}

/** Return the raw ES2020 IIFE source of `panel-inject.js` (`window.__agyPrismPanel`). */
export function getHostPanelScript({ reload = false } = {}) {
  if (!cachedPanelScript || reload) {
    cachedPanelScript = readFileSync(PANEL_SCRIPT_PATH, 'utf8');
  }
  return cachedPanelScript;
}

function resolveMediaUrl(rawUrl, mediaOrigin) {
  const u = String(rawUrl || '').trim();
  if (!u) return '';
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  const origin = String(mediaOrigin || '').replace(/\/+$/, '');
  if (!origin) return u;
  return u.startsWith('/') ? `${origin}${u}` : `${origin}/${u}`;
}

/**
 * Assemble the canonical JSON-serializable payload consumed by `window.__agyPrism.applyPayload(payload)`.
 */
export function buildClientSkinPayload(config = DEFAULT_CONFIG, activeItem = null, mediaOrigin = '', extra = {}) {
  const baseClean = sanitizeConfig(config || {});
  const wid = String(activeItem?.id || baseClean.activeWallpaperId || baseClean.wallpaperId || '');
  const effective = resolveEffectiveConfig(baseClean, wid);

  // Hydrate cached wallpaper accent for this wallpaperId if available so host skips re-extraction
  const cachedAccent =
    (wid && baseClean.accentCache && baseClean.accentCache[wid]) ||
    (effective.extractedAccent && effective.extractedAccent.wallpaperId === wid ? effective.extractedAccent : null);
  effective.extractedAccent = cachedAccent || null;

  let normalizedItem = null;
  if (activeItem && typeof activeItem === 'object') {
    const kind = String(activeItem.kind || effective.kind || 'image');
    const sceneMode = String(activeItem.sceneMode || '');
    const thumbUrl = resolveMediaUrl(activeItem.thumbUrl, mediaOrigin);
    const sceneVideoUrl = resolveMediaUrl(activeItem.sceneVideoUrl, mediaOrigin);
    const sceneLiveUrl = resolveMediaUrl(activeItem.sceneLiveUrl, mediaOrigin);
    const webUrl = resolveMediaUrl(activeItem.webUrl, mediaOrigin);
    let mediaUrl = resolveMediaUrl(activeItem.mediaUrl, mediaOrigin);
    if (kind === 'scene' && (sceneMode === 'video' || sceneMode === 'scene-video') && sceneVideoUrl) {
      mediaUrl = sceneVideoUrl;
    }

    normalizedItem = {
      id: String(activeItem.id || wid),
      title: String(activeItem.title || activeItem.id || ''),
      kind,
      source: String(activeItem.source || 'local'),
      sceneMode,
      schemeColor: String(activeItem.schemeColor || ''),
      thumbUrl,
      mediaUrl,
      sceneVideoUrl,
      sceneLiveUrl,
      webUrl,
      audioUrl: resolveMediaUrl(activeItem.audioUrl, mediaOrigin),
      slidesUrl: resolveMediaUrl(activeItem.slidesUrl, mediaOrigin),
      properties: activeItem.properties || null,
    };
  }

  const slides = Array.isArray(extra?.slides)
    ? extra.slides.map((s) => resolveMediaUrl(s, mediaOrigin))
    : Array.isArray(activeItem?.slides)
      ? activeItem.slides.map((s) => resolveMediaUrl(s, mediaOrigin))
      : undefined;

  const skinEnabled = extra?.skinEnabled !== undefined ? Boolean(extra.skinEnabled) : baseClean.skinEnabled !== false;
  const adapterProfile = extra?.adapterProfile && typeof extra.adapterProfile === 'object'
    ? {
        appId: String(extra.adapterProfile.appId || ''),
        mode: extra.adapterProfile.mode === 'compat' ? 'compat' : 'full',
        adapterCss: String(extra.adapterProfile.adapterCss || ''),
        browserHoleSupport: Boolean(extra.adapterProfile.browserHoleSupport),
      }
    : undefined;

  return {
    version: PRISM_DOM.skinVersion,
    skinEnabled,
    config: effective,
    activeItem: normalizedItem,
    mediaOrigin: String(mediaOrigin || ''),
    ...(slides ? { slides } : {}),
    ...(adapterProfile ? { adapterProfile } : {}),
    tokensPreview: {
      dark: resolveSchemeTokens(effective, 'dark'),
      light: resolveSchemeTokens(effective, 'light'),
    },
  };
}

function escapeCssUrl(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s || /[\r\n<>]/.test(s)) return '';
  return s.replace(/["\\]/g, '\\$&');
}

function buildPolarityTokenVarsCss(cfg, tok, isLight) {
  const glassOp = Math.min(0.98, Math.max(0.3, Number(cfg.glassOpacity ?? 0.72)));
  const fidelity = Math.min(1, Math.max(0, Number(cfg.glassFidelity ?? 78) / 100));
  const chatFid = Math.min(1, Math.max(0, Number(cfg.chatGlassFidelity ?? 68) / 100));
  const blurPx = cfg.glassSurfaces === false ? 0 : Math.round(Number(cfg.glassBlur ?? 16) * (0.45 + 0.55 * fidelity));
  const sbAlpha = cfg.glassSurfaces === false ? 0.96 : Math.min(0.96, Math.max(0.32, glassOp + (isLight ? 0.06 : 0.02)));
  const chatAlpha = cfg.glassSurfaces === false ? 0.96 : Math.min(0.96, Math.max(0.28, glassOp * (0.55 + 0.45 * chatFid)));
  const cardAlpha = cfg.glassSurfaces === false ? 0.96 : Math.min(0.97, Math.max(0.42, glassOp + 0.08));
  const compAlpha = cfg.glassSurfaces === false ? 0.97 : Math.min(0.97, Math.max(0.56, glassOp + 0.14));
  const minEd = cfg.contrastFloor !== false ? (isLight ? 0.78 : 0.72) : 0.34;
  const edAlpha =
    cfg.codeReadabilityMode === 'solid'
      ? isLight
        ? 0.97
        : 0.95
      : cfg.codeReadabilityMode === 'frosted'
        ? Math.max(minEd, Math.min(0.95, glassOp + 0.14))
        : Math.max(minEd, Math.min(0.94, glassOp + 0.06));
  const popAlpha = cfg.floaterSolidBase !== false ? (isLight ? 0.97 : 0.96) : 0.94;
  const bScale = cfg.borders === 'off' ? 0 : cfg.borders === 'subtle' ? 0.55 : 1;
  const islandBorderA = ((isLight ? 0.14 : 0.12) * bScale).toFixed(3);
  const cardBorderA = ((isLight ? 0.13 : 0.11) * bScale).toFixed(3);
  const hairBorderA = ((isLight ? 0.1 : 0.08) * Math.max(0.35, bScale)).toFixed(3);

  return [
    `  --prism-native-floor: ${isLight ? '#f8fafc' : '#070708'};`,
    `  --prism-fg: ${tok.fg};`,
    `  --prism-fg-2: ${tok.fg2};`,
    `  --prism-fg-muted: ${tok.fgMuted};`,
    `  --prism-fg-faint: ${tok.fgFaint};`,
    `  --prism-accent: ${tok.accent};`,
    `  --prism-accent-rgb: ${tok.accentRgb};`,
    `  --prism-accent-fg: ${tok.accentFg};`,
    `  --prism-link: ${tok.link};`,
    `  --prism-surface-sidebar: rgba(${tok.shadeRgb}, ${sbAlpha.toFixed(3)});`,
    `  --prism-surface-chat: rgba(${tok.baseRgb}, ${chatAlpha.toFixed(3)});`,
    `  --prism-surface-card: rgba(${tok.tint1Rgb}, ${cardAlpha.toFixed(3)});`,
    `  --prism-surface-composer: rgba(${tok.tint1Rgb}, ${compAlpha.toFixed(3)});`,
    `  --prism-surface-editor: rgba(${tok.shadeRgb}, ${edAlpha.toFixed(3)});`,
    `  --prism-surface-code-block: rgba(${tok.shadeRgb}, ${Math.max(minEd, Math.min(0.95, edAlpha + 0.04)).toFixed(3)});`,
    `  --prism-surface-popover: rgba(${tok.popoverRgb}, ${popAlpha.toFixed(3)});`,
    `  --prism-secondary-bg: rgba(${tok.tint2Rgb}, ${Math.min(0.92, cardAlpha * 0.82).toFixed(3)});`,
    `  --prism-muted-bg: rgba(${tok.ptRgb}, ${isLight ? '0.065' : '0.060'});`,
    `  --prism-border-island: ${bScale === 0 ? 'transparent' : `rgba(${tok.ptRgb}, ${islandBorderA})`};`,
    `  --prism-border-card: ${bScale === 0 ? 'transparent' : `rgba(${tok.ptRgb}, ${cardBorderA})`};`,
    `  --prism-border-hairline: rgba(${tok.ptRgb}, ${hairBorderA});`,
    `  --prism-border-popover: rgba(${tok.ptRgb}, ${isLight ? '0.160' : '0.150'});`,
    `  --prism-sidebar-backdrop: ${blurPx > 0 ? `blur(${blurPx}px) saturate(${isLight ? 145 : 140}%)` : 'none'};`,
    `  --prism-composer-backdrop: ${blurPx > 0 ? `blur(${Math.round(blurPx * 1.1)}px) saturate(150%)` : 'none'};`,
    `  --prism-shadow-island: ${cfg.shadows === false ? 'none' : isLight ? '0 10px 28px -8px rgba(15, 23, 42, 0.12)' : '0 14px 34px -8px rgba(0, 0, 0, 0.46)'};`,
    `  --prism-shadow-popover: ${isLight ? '0 18px 44px -8px rgba(15, 23, 42, 0.22)' : '0 22px 52px -8px rgba(0, 0, 0, 0.68)'};`,
  ].join('\n');
}

/**
 * Build a pure zero-JS stylesheet (`static-css` startup mode) consumed by `GET /host/<capToken>/static.css`.
 * Keeps 100% native clickability (`pointer-events: none` `body::before` at `z-index: -1`) and yields
 * `alpha = 0` whenever Antigravity 2.34.0 opens a `[data-has-browser-hole="true"]` WCV surface.
 */
export function buildStaticCssSheet(payload = {}) {
  if (payload && payload.skinEnabled === false) {
    return '/* agy-wallpaper-prism v2.0.0 static-css: skin disabled */\n';
  }
  const rawCfg = payload?.config && typeof payload.config === 'object' ? payload.config : payload || DEFAULT_CONFIG;
  const activeItem = payload?.activeItem && typeof payload.activeItem === 'object' ? payload.activeItem : null;
  const wid = String(activeItem?.id || rawCfg.activeWallpaperId || rawCfg.wallpaperId || '');
  const cfg = resolveEffectiveConfig(sanitizeConfig(rawCfg), wid);
  const darkTok = payload?.tokensPreview?.dark || resolveSchemeTokens(cfg, 'dark');
  const lightTok = payload?.tokensPreview?.light || resolveSchemeTokens(cfg, 'light');

  const rawImg =
    (activeItem &&
      (activeItem.kind === 'image' || activeItem.kind === 'slideshow'
        ? activeItem.mediaUrl || activeItem.thumbUrl
        : activeItem.thumbUrl || (activeItem.kind !== 'video' && activeItem.kind !== 'web' ? activeItem.mediaUrl : ''))) ||
    (Array.isArray(payload?.slides) && payload.slides[0]) ||
    '';
  const safeImg = escapeCssUrl(rawImg);
  const scrimOp = Math.min(0.92, Math.max(0, Number(cfg.scrimOpacity ?? 0.22)));
  const fitCss =
    cfg.fit === 'contain' ? 'contain' : cfg.fit === 'center' ? 'auto' : cfg.fit === 'fill' ? '100% 100%' : 'cover';
  const radiusIsland = cfg.layoutMode === 'islands' ? (cfg.cornerStyle === 'sharp' ? 6 : cfg.cornerStyle === 'soft' ? 16 : 12) : 0;
  const radiusCard = cfg.cornerStyle === 'sharp' ? 6 : cfg.cornerStyle === 'soft' ? 14 : 10;

  const wallBgDark = safeImg
    ? `linear-gradient(180deg, rgba(${darkTok.shadeRgb}, ${(scrimOp * 0.85).toFixed(3)}), rgba(${darkTok.shadeRgb}, ${(scrimOp * 1.1).toFixed(3)})), url("${safeImg}")`
    : `radial-gradient(ellipse 80% 70% at 22% 24%, rgba(${darkTok.accentRgb}, 0.26) 0%, transparent 65%), radial-gradient(ellipse 75% 75% at 80% 78%, rgba(${darkTok.accentRgb}, 0.18) 0%, #09090b 100%)`;
  const wallBgLight = safeImg
    ? `linear-gradient(180deg, rgba(${lightTok.baseRgb}, ${(scrimOp * 0.75).toFixed(3)}), rgba(${lightTok.baseRgb}, ${scrimOp.toFixed(3)})), url("${safeImg}")`
    : `radial-gradient(ellipse 80% 70% at 22% 24%, rgba(${lightTok.accentRgb}, 0.18) 0%, transparent 65%), radial-gradient(ellipse 75% 75% at 80% 78%, rgba(${lightTok.accentRgb}, 0.12) 0%, #f4f7fb 100%)`;

  const sibEx =
    ':not(#gemini-neko-pet-root):not(#ag-context-meter):not(#ag-usage-monitor-capsule):not(#ag-usage-monitor-portal):not(#deck-metrics-strip):not(#agy-prism-popover):not(.settings-modal-backdrop):not(.settings-modal-container):not(.agy-dialog):not([role="dialog"]):not([role="alertdialog"]):not([role="menu"]):not([role="listbox"]):not([role="tooltip"])';
  const dlgDescEx =
    ':not(.settings-modal-backdrop *):not(.settings-modal-container *):not(.agy-dialog *):not([role="dialog"] *):not([role="alertdialog"] *):not([role="menu"] *):not([role="listbox"] *):not([data-radix-popper-content-wrapper] *):not(.agy-popover *):not(.quick-input-widget *)';
  const notHole = ':not([data-has-browser-hole="true"]):not([data-browser-hole])';

  return `/* agy-wallpaper-prism v2.0.0 zero-JS static-css sheet */
:root, body.dark, html.dark body {
${buildPolarityTokenVarsCss(cfg, darkTok, false)}
  --prism-static-wall: ${wallBgDark};
}
body.light, html.light body {
${buildPolarityTokenVarsCss(cfg, lightTok, true)}
  --prism-static-wall: ${wallBgLight};
}

html:not([data-has-browser-hole="true"]):not(:has(> body[data-has-browser-hole="true"])) {
  background-color: var(--prism-native-floor, #070708) !important;
}
body {
  isolation: isolate;
  background-color: transparent !important;
}
body:not([data-has-browser-hole="true"])::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none !important;
  background-image: var(--prism-static-wall);
  background-size: ${fitCss};
  background-position: ${Number(cfg.layerPosX ?? 50)}% ${Number(cfg.layerPosY ?? 50)}%;
  background-repeat: no-repeat;
  opacity: ${Number(cfg.mediaOpacity ?? 1)};
}
html[data-has-browser-hole="true"],
html[data-has-browser-hole="true"] body,
body[data-has-browser-hole="true"] {
  background: transparent !important;
}
html[data-has-browser-hole="true"] body::before,
body[data-has-browser-hole="true"]::before {
  display: none !important;
}

body,
:where(#root, #root > div, #root .dark, #root .light, #root .theme-dark, #root .theme-light, .agy-shell, .agy-inset-shell, .agy-sheet:not([data-browser-occluder]))${sibEx}${dlgDescEx} {
  --background: transparent !important;
  --color-background: transparent !important;
  --body-background: transparent !important;
  --shell: transparent !important;
  --shell-canvas: transparent !important;
  --content: var(--prism-surface-chat) !important;
  --sidebar: var(--prism-surface-sidebar) !important;
  --color-sidebar: var(--prism-surface-sidebar) !important;
  --card: var(--prism-surface-card) !important;
  --color-card: var(--prism-surface-card) !important;
  --card-border: var(--prism-border-card) !important;
  --border: var(--prism-border-hairline) !important;
  --color-border: var(--prism-border-hairline) !important;
  --popover: var(--prism-surface-popover) !important;
  --secondary: var(--prism-secondary-bg) !important;
  --muted: var(--prism-muted-bg) !important;
  --primary: var(--prism-accent) !important;
  --color-primary: var(--prism-accent) !important;
  --primary-foreground: var(--prism-accent-fg) !important;
  --link: var(--prism-link) !important;
}

#root, .monaco-workbench { position: relative; z-index: 1; }
:where(#root, #root > div${sibEx}, #root > div > div${sibEx}, #root > div > div > div${sibEx}, .agy-shell, .agy-inset-shell, .agy-sheet:not([data-browser-occluder]), .browser-hole-ancestor, .browser-hole-opaque${sibEx}${dlgDescEx}, .agy-sheet[data-sheet-inset] [data-main-content-body], [data-has-browser-hole="true"]${sibEx}, [data-browser-hole]:not([data-browser-hole="false"]), .monaco-workbench) {
  background-color: transparent !important;
  background-image: none !important;
}

:is([data-testid="sidebar-split"] > div:first-child, .agy-sidebar, .monaco-workbench .part.activitybar, .monaco-workbench .part.sidebar, .monaco-workbench .part.auxiliarybar)${notHole} {
  position: relative !important;
  isolation: isolate;
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
:is([data-testid="sidebar-split"] > div:first-child, .agy-sidebar, .monaco-workbench .part.activitybar, .monaco-workbench .part.sidebar, .monaco-workbench .part.auxiliarybar)${notHole}::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-color: var(--prism-surface-sidebar);
  backdrop-filter: var(--prism-sidebar-backdrop);
  -webkit-backdrop-filter: var(--prism-sidebar-backdrop);
}

:is([data-testid="agent-input-box"], #antigravity\\.agentSidePanelInputBox > .surface-composer-card, .surface-composer-card, .agy-composer) {
  position: relative !important;
  isolation: isolate;
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid var(--prism-border-card) !important;
  border-radius: ${radiusCard}px !important;
  box-shadow: var(--prism-shadow-island) !important;
}
:is([data-testid="agent-input-box"], #antigravity\\.agentSidePanelInputBox > .surface-composer-card, .surface-composer-card, .agy-composer)::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background-color: var(--prism-surface-composer);
  backdrop-filter: var(--prism-composer-backdrop);
  -webkit-backdrop-filter: var(--prism-composer-backdrop);
}

[data-testid="conversation-view"] { background-color: var(--prism-surface-chat) !important; backdrop-filter: none !important; }
[data-testid="browser-error-overlay"], .monaco-workbench .part.editor > .content, .monaco-workbench .editor-group-container, .monaco-workbench .part.panel, [data-testid="background-task-command"] {
  background-color: var(--prism-surface-editor) !important;
  backdrop-filter: none !important;
}
${
  cfg.layoutMode === 'islands'
    ? `.agy-shell { padding: ${Number(cfg.workspacePad ?? 8)}px !important; gap: ${Number(cfg.islandGap ?? 8)}px !important; box-sizing: border-box !important; }
:is([data-testid="sidebar-split"] > div:first-child, .agy-sidebar, [data-testid="aux-pane-split"] > div:first-child, .agy-shell > main, [data-testid="aux-pane-split"] > div:last-child:not([hidden]):not([aria-hidden="true"]))${notHole} {
  border-radius: ${radiusIsland}px !important;
  border: 1px solid var(--prism-border-island) !important;
  box-shadow: var(--prism-shadow-island) !important;
}
:is([data-testid="sidebar-split"], [data-testid="aux-pane-split"]) > div:nth-child(2) { width: ${Number(cfg.islandGap ?? 8)}px !important; background: transparent !important; border: none !important; }`
    : `:is([data-testid="sidebar-split"], [data-testid="aux-pane-split"]) > div:nth-child(2) { width: 1px !important; background-color: var(--prism-border-hairline) !important; }`
}

.settings-modal-backdrop {
  background-color: rgba(0, 0, 0, 0.45) !important;
  backdrop-filter: blur(12px) saturate(120%) !important;
  -webkit-backdrop-filter: blur(12px) saturate(120%) !important;
}
:is([role="menu"], [role="listbox"], [role="dialog"]:not(#gemini-neko-observer-modal), [role="alertdialog"], .settings-modal-container, .agy-dialog, .agy-popover, .agy-menu, [data-radix-popper-content-wrapper] > *) {
  --background: var(--prism-surface-popover) !important;
  --color-background: var(--prism-surface-popover) !important;
  --content: var(--prism-surface-popover) !important;
  background-color: var(--prism-surface-popover) !important;
  border: 1px solid var(--prism-border-popover) !important;
  box-shadow: var(--prism-shadow-popover) !important;
}
:is(.agy-dialog, .settings-modal-container, [role="dialog"]:not(#gemini-neko-observer-modal), [role="alertdialog"]) :where(.dark, .light, .theme-dark, .theme-light) {
  --background: var(--prism-surface-popover) !important;
  --color-background: var(--prism-surface-popover) !important;
  --content: var(--prism-surface-popover) !important;
}
`;
}

export { PRISM_DOM };
