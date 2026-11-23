// Offline zero-dependency bundler for DreamSkin Prism v4 Studio UI.
// Inlines styles.css and app.mjs into a single self-contained src/studio-ui/dist/index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const uiDir = join(root, 'src', 'studio-ui');
const outFile = join(uiDir, 'dist', 'index.html');

const template = readFileSync(join(uiDir, 'template.html'), 'utf8');
const css = readFileSync(join(uiDir, 'styles.css'), 'utf8');
const js = readFileSync(join(uiDir, 'app.mjs'), 'utf8');

const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
const html = template
  .replace('<!-- PRISM_INLINE_STYLE -->', `<style>\n${css}\n</style>`)
  .replace('<!-- PRISM_INLINE_SCRIPT -->', `<script>\n${safeJs}\n</script>`);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
console.log(`Built Studio UI single-file bundle: ${outFile} (${Buffer.byteLength(html, 'utf8')} bytes)`);
