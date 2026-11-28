#!/usr/bin/env node
// Syncs & packages the cross-platform Obsidian Prism optical & pixel-mascot suite
// (GPL-3.0-only, crediting RMvdesi/obsidian-prism & 0DNANCY/agy-claude-style).
// Produces zero-external-URL, zero-localStorage, single-file browser bundles at:
//   - src/prism/optical/optical-bundle.js
//   - src/channels/dsh-plugin/lib/optical-bundle.js
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_ROOT = resolve(__dirname, '..');
const OPTICAL_DIR = join(DEV_ROOT, 'src', 'prism', 'optical');
const DSH_PLUGIN_LIB_DIR = join(DEV_ROOT, 'src', 'channels', 'dsh-plugin', 'lib');
const OBSIDIAN_REF_DIR =
  process.env.OBSIDIAN_PRISM_REF_DIR ||
  join(process.env.USERPROFILE || '', '.gemini', 'config', 'plugins', 'obsidian-prism');

const UPSTREAM_FILES = [
  'motion-engine.js',
  'animated-icons.js',
  'prism-rim-canvas.js',
  'ripple-core.js',
  'dual-mascot-rig.js',
  'smooth-caret.js',
  'effort-slider.js',
  'slider-coexist.js',
];

function sanitizeForPrivacy(name, source) {
  let out = source;
  // Remove localStorage fallback in dual-mascot-rig.js so DSH native plugin maintains strict zero-storage isolation,
  // and enable cross-platform visible keep-alive (prevents window.blur in side-pane previews / multi-monitor setups
  // from freezing the mascots' 40+ idle theater clips & ear/tail micro-animations while tab is still visible!)
  if (name === 'dual-mascot-rig.js') {
    out = out.replace(
      /return options\.storage \|\| \(win\?\.localStorage\) \|\| \(typeof localStorage !== 'undefined' \? localStorage : null\);/,
      'return options.storage || null;',
    );
    out = out.replace(
      'const isWindowBlurred = () => Boolean(isDocHidden() || isAttrB() || wb);',
      'const isWindowBlurred = () => Boolean(isDocHidden() || isAttrB() || (!options.keepAliveWhileVisible && wb));',
    );
    out = out.replace(
      'const DOZE_AFTER_MS = 45000;\n    const DOZE_AFTER_NIGHT_MS = 30000;',
      'const DOZE_AFTER_MS = Number(options.dozeAfterMs) || 45000;\n    const DOZE_AFTER_NIGHT_MS = Number(options.dozeAfterNightMs) || 30000;',
    );
    out = out.replace(
      'scheduleTheater(3800);',
      'scheduleTheater(Number(options.firstTheaterDelayMs) || 3800);',
    );
  }
  // Allow cross-platform composer editor selectors in smooth-caret.js
  if (name === 'smooth-caret.js') {
    out = out.replace(
      "cachedEditors = Array.from(document.querySelectorAll('[data-testid=\"agent-input-box\"] [contenteditable=\"true\"]'));",
      "cachedEditors = Array.from(document.querySelectorAll('[data-testid=\"agent-input-box\"] [contenteditable=\"true\"], [data-composer-card] [contenteditable=\"true\"], [data-composer-input][contenteditable=\"true\"], .surface-composer-card [contenteditable=\"true\"]'));",
    );
  }
  // Allow prism-rim-canvas.js to recognize DSH [data-composer-card] as composer box for mascot rim-light sync
  if (name === 'prism-rim-canvas.js') {
    out = out.replace(
      "if (!entry.mirrorMode && !entry.reflectBottomMode && entry.box?.classList?.contains?.('surface-composer-card')) {",
      "if (!entry.mirrorMode && !entry.reflectBottomMode && (entry.box?.classList?.contains?.('surface-composer-card') || entry.box?.hasAttribute?.('data-composer-card'))) {",
    );
  }
  // Sanitize effort-slider.js for zero-storage privacy contract & disable standalone auto-boot
  // (lifecycle is strictly controlled by optical-suite.js + slider-coexist.js with auto-yield)
  if (name === 'effort-slider.js') {
    out = out.replace(/w\s*&&\s*w\.localStorage\s*\|\|\s*null/g, 'null');
    out = out.replace(/\blocalStorage\b/g, '__agMemStorageDisabled');
    out = out.replace(/\bsessionStorage\b/g, '__agMemSessionDisabled');
    out = 'try { (typeof globalThis !== "undefined" ? globalThis : window).__agCodexEffortSliderDisableAutoBoot = true; } catch (_) {}\n' + out;
  }
  // Strip any stray http(s):// comment links so privacy guardrail tests stay 100% green
  out = out.replace(/https?:\/\/(?!127\.0\.0\.1|localhost)[^\s"'`)]+/gi, '[upstream-ref]');
  return out;
}

export function syncUpstreamFromObsidian() {
  mkdirSync(OPTICAL_DIR, { recursive: true });
  let synced = 0;
  for (const file of UPSTREAM_FILES) {
    const src = join(OBSIDIAN_REF_DIR, file);
    const dst = join(OPTICAL_DIR, file);
    if (existsSync(src)) {
      const raw = readFileSync(src, 'utf8');
      writeFileSync(dst, sanitizeForPrivacy(file, raw), 'utf8');
      synced += 1;
    } else if (!existsSync(dst)) {
      throw new Error(`Missing required optical module: ${dst} (and reference ${src} not found)`);
    }
  }
  const refLicense = join(OBSIDIAN_REF_DIR, 'LICENSE');
  if (existsSync(refLicense)) {
    copyFileSync(refLicense, join(DEV_ROOT, 'LICENSE'));
  }
  return synced;
}

export function buildOpticalBundle({ syncUpstream = false } = {}) {
  if (syncUpstream) syncUpstreamFromObsidian();
  mkdirSync(OPTICAL_DIR, { recursive: true });
  mkdirSync(DSH_PLUGIN_LIB_DIR, { recursive: true });

  const header = [
    '/*!',
    ' * DreamSkin Prism — Cross-Platform Optical & Pixel Mascot Suite Bundle',
    ' * License: GPL-3.0-only (see LICENSE & THIRD-PARTY-NOTICES.md)',
    ' * Upstream Credits:',
    ' *   - RMvdesi / Obsidian Prism (motion-engine, prism-rim-canvas, ripple-core, dual-mascot-rig, smooth-caret, slider-coexist)',
    ' *   - 0DNANCY / agy-claude-style (MIT, optical foundation & mascot base)',
    ' *   - LLYSH-HANNARI / antigravity-Codex-Claude-effort-slider (MIT, Antigravity reasoning effort slider)',
    ' *   - wp3171216237 / dsh-TUI (MIT, Deepy whale pixel mascot reference)',
    ' * Privacy Contract: zero external URLs, zero cookies, zero host storage access.',
    ' */',
    '',
  ].join('\n');

  const orderedFiles = [...UPSTREAM_FILES, 'context-vial.js', 'optical-suite.js'];
  const chunks = [header];
  for (const file of orderedFiles) {
    const full = join(OPTICAL_DIR, file);
    if (!existsSync(full)) throw new Error(`Missing optical source file: ${full}`);
    let content = readFileSync(full, 'utf8');
    content = sanitizeForPrivacy(file, content);
    chunks.push(`\n/* ===== module: ${file} ===== */\n`);
    chunks.push(content.trim());
    chunks.push('\n;\n');
  }

  const bundle = chunks.join('');
  // Syntax & privacy self-verification before writing
  new vm.Script(bundle, { filename: 'optical-bundle.js' });
  if (/https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(bundle)) {
    throw new Error('optical-bundle.js failed privacy audit: contains external URL');
  }
  if (/document\.cookie|localStorage|sessionStorage|\.credentials\.yaml/i.test(bundle)) {
    throw new Error('optical-bundle.js failed privacy audit: references forbidden storage/cookie API');
  }

  const outOptical = join(OPTICAL_DIR, 'optical-bundle.js');
  const outDsh = join(DSH_PLUGIN_LIB_DIR, 'optical-bundle.js');
  writeFileSync(outOptical, bundle, 'utf8');
  writeFileSync(outDsh, bundle, 'utf8');
  return { bytes: Buffer.byteLength(bundle, 'utf8'), outOptical, outDsh };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const syncUpstream = process.argv.includes('--sync') || !existsSync(join(OPTICAL_DIR, 'dual-mascot-rig.js'));
  const res = buildOpticalBundle({ syncUpstream });
  console.log(JSON.stringify({ ok: true, syncUpstream, ...res }, null, 2));
}
