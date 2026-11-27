#!/usr/bin/env node
// Zero-dependency deterministic bundler for DreamSkin Prism v4.1 Studio UI.
// Combines src/studio-ui/{template.html,styles.css,app.mjs,icon-128.png} and
// BUILTIN_DYNAMIC_THEMES into a single self-contained src/studio-ui/dist/index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_DYNAMIC_THEMES } from '../src/prism/dynamic-themes/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const UI_DIR = join(ROOT, 'src', 'studio-ui');
const DIST_FILE = join(UI_DIR, 'dist', 'index.html');

export function buildStudioUi() {
  const template = readFileSync(join(UI_DIR, 'template.html'), 'utf8');
  const styles = readFileSync(join(UI_DIR, 'styles.css'), 'utf8');
  const appJs = readFileSync(join(UI_DIR, 'app.mjs'), 'utf8');
  const iconBuf = readFileSync(join(UI_DIR, 'icon-128.png'));
  const iconDataUri = `data:image/png;base64,${iconBuf.toString('base64')}`;

  const safeJson = (val) => JSON.stringify(val).replace(/<\/script>/gi, '<\\/script>');
  const inlineScript = [
    '<script>',
    `window.__PRISM_ICON_URI__=${safeJson(iconDataUri)};`,
    `window.__PRISM_DYNAMIC_THEMES__=${safeJson(BUILTIN_DYNAMIC_THEMES)};`,
    appJs,
    '</script>',
  ].join('\n');

  const html = template
    .split('<!-- PRISM_ICON_DATA_URI -->').join(iconDataUri)
    .split('<!-- PRISM_INLINE_STYLE -->').join(`<style>\n${styles}\n</style>`)
    .split('<!-- PRISM_INLINE_SCRIPT -->').join(inlineScript);

  mkdirSync(dirname(DIST_FILE), { recursive: true });
  writeFileSync(DIST_FILE, html, 'utf8');
  return { distFile: DIST_FILE, bytes: Buffer.byteLength(html, 'utf8') };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const res = buildStudioUi();
  console.log(`[build-studio-ui] wrote ${res.distFile} (${res.bytes} bytes)`);
}
