// Real-file installer for DreamSkin Prism v4.0.0 Antigravity native plugin.
// Strictly copies real directories and files (NEVER NTFS junctions, which GetAllPlugins ignores).
// Never modifies ~/.gemini/config/config.json or any Antigravity installation files.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const argAt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

const defaultTarget = join(homedir(), '.gemini', 'config', 'plugins', 'dreamskin-prism');
const targetDir = resolve(argAt('--target') || defaultTarget);

// Ensure Studio UI bundle is up to date
execFileSync(process.execPath, [join(root, 'tools', 'build-studio-ui.mjs')], { cwd: root, stdio: 'inherit' });

// In-place overwrite friendly (works even while Antigravity holds the plugin root directory handle)
mkdirSync(targetDir, { recursive: true });

// 1. Copy plugin manifest, assets, sidecars, skills
cpSync(join(root, 'plugin'), targetDir, { recursive: true, dereference: true, force: true });

// 2. Copy Node engine & adapters under targetDir/src (excluding Windows C# launcher & bin/obj)
const srcRoot = join(root, 'src');
const dstSrc = join(targetDir, 'src');
const EXCLUDE_DIRS = new Set(['launcher', 'bin', 'obj']);

function copySrcTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const ent of readdirSync(from, { withFileTypes: true })) {
    if (ent.isDirectory() && EXCLUDE_DIRS.has(ent.name)) continue;
    const s = join(from, ent.name);
    const d = join(to, ent.name);
    if (ent.isDirectory()) copySrcTree(s, d);
    else if (ent.isFile()) cpSync(s, d, { dereference: true });
  }
}
copySrcTree(srcRoot, dstSrc);

// 3. Copy LICENSE, THIRD-PARTY-NOTICES.md, README.md
for (const f of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md']) {
  const s = join(root, f);
  if (existsSync(s)) cpSync(s, join(targetDir, f), { dereference: true });
}

// 4. Write fresh install stamp
const stamp = `dreamskin-prism-4.0.0-${Date.now()}-${randomBytes(4).toString('hex')}`;
writeFileSync(join(targetDir, '.prism-install-id'), stamp + '\n', 'utf8');

console.log(`Installed dreamskin-prism plugin (real files, no junctions) -> ${targetDir}`);
