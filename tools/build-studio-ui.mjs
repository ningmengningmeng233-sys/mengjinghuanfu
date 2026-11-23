// Offline zero-dependency bundler for DreamSkin Prism v4 Studio UI.
// Inlines styles.css, app.mjs, high-DPI Prism icon, and built-in interactive dynamic themes
// into a single self-contained src/studio-ui/dist/index.html.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_DYNAMIC_THEMES } from '../src/prism/dynamic-themes/index.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const uiDir = join(root, 'src', 'studio-ui');
const outFile = join(uiDir, 'dist', 'index.html');

const template = readFileSync(join(uiDir, 'template.html'), 'utf8');
const css = readFileSync(join(uiDir, 'styles.css'), 'utf8');
const js = readFileSync(join(uiDir, 'app.mjs'), 'utf8');

const iconPngPath = join(uiDir, 'icon-128.png');
const iconDataUri = existsSync(iconPngPath)
  ? `data:image/png;base64,${readFileSync(iconPngPath).toString('base64')}`
  : '';

const dynamicThemesPayload = BUILTIN_DYNAMIC_THEMES.map((t) => ({
  id: t.id,
  title: t.title,
  subtitle: t.subtitle,
  category: t.category,
  recommendedScheme: t.recommendedScheme,
  thumbUrl: t.thumbUrl,
  html: t.html,
}));

const safeBootScript = `window.__PRISM_ICON_URI__=${JSON.stringify(iconDataUri)};window.__PRISM_DYNAMIC_THEMES__=${JSON.stringify(dynamicThemesPayload).replace(/<\/script>/gi, '<\\/script>')};`;
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
const html = template
  .replace(/<!-- PRISM_ICON_DATA_URI -->/g, iconDataUri)
  .replace('<!-- PRISM_INLINE_STYLE -->', `<style>\n${css}\n</style>`)
  .replace(
    '<!-- PRISM_INLINE_SCRIPT -->',
    `<script>\n${safeBootScript}\n</script>\n<script>\n${safeJs}\n</script>`,
  );

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
console.log(`Built Studio UI single-file bundle: ${outFile} (${Buffer.byteLength(html, 'utf8')} bytes)`);
