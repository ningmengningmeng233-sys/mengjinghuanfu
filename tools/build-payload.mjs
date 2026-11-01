// 构建 payload：把 src/cherry 打成某个平台的分发目录，并生成 payload-manifest.json（文件清单 + 哈希）。
// T0-5：按平台筛选文件——panel.mjs 是 macOS 浏览器版控制台，只进 darwin 包，Windows 包不带、也没有任何入口引用它。
// T0-6：Windows 包可把便携 Node 运行时打进 runtime/node.exe（见 fetch-node-runtime.ps1 下载到本地缓存）；
//        --skip-runtime 只供开发/测试，正式构建不要用。
// 用法：node tools/build-payload.mjs --platform win32|darwin --out build/payload-win [--node-exe <node.exe 路径>] [--skip-runtime]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/cherry/lib/version.mjs';

const args = process.argv.slice(2);
const argAt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const platform = argAt('--platform') || 'win32';
if (!['win32', 'darwin'].includes(platform)) { console.error('未知平台: ' + platform); process.exit(1); }
const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src', 'cherry');
const outDir = join(root, argAt('--out') || ('build/payload-' + (platform === 'win32' ? 'win' : 'mac')));
const skipRuntime = args.includes('--skip-runtime');

// 平台筛选规则（相对 src/cherry 的路径，正斜杠）。
const EXCLUDE = {
  win32: new Set(['panel.mjs']),
  darwin: new Set([]),
}[platform];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(srcDir, p).split('\\').join('/');
    if (e.isDirectory()) { walk(p); continue; }
    if (EXCLUDE.has(rel)) { console.log('排除（平台筛选）: ' + rel); continue; }
    const dest = join(outDir, rel);
    mkdirSync(join(dest, '..'), { recursive: true });
    cpSync(p, dest);
    const buf = readFileSync(dest);
    files.push({ path: rel, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
  }
};
walk(srcDir);
// LICENSE 与第三方 notices 在仓库根，也进 payload。
for (const f of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) {
  const p = join(root, f);
  if (existsSync(p)) { cpSync(p, join(outDir, f)); const buf = readFileSync(p); files.push({ path: f, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }); }
}

let runtime = null;
if (platform === 'win32') {
  const candidates = [argAt('--node-exe'), join(root, 'build', 'cache', 'node-win-x64', 'node.exe'), process.env.DREAMSKIN_NODE_EXE].filter(Boolean);
  const nodeExe = candidates.find((p) => existsSync(p));
  if (nodeExe) {
    const dest = join(outDir, 'runtime', 'node.exe');
    mkdirSync(join(outDir, 'runtime'), { recursive: true });
    cpSync(nodeExe, dest);
    let v = '';
    try { v = execFileSync(dest, ['--version'], { encoding: 'utf8' }).trim(); } catch {}
    runtime = { file: 'runtime/node.exe', version: v, size: statSync(dest).size };
    files.push({ path: 'runtime/node.exe', size: runtime.size, sha256: createHash('sha256').update(readFileSync(dest)).digest('hex') });
    console.log('内置 Node 运行时: ' + v + ' <- ' + nodeExe);
  } else if (!skipRuntime) {
    console.log('WARN: 没找到便携 node.exe（先运行 tools/fetch-node-runtime.ps1 下载到 build/cache/，或用 --node-exe 指定）；本次产物不带运行时');
  } else {
    console.log('跳过运行时（--skip-runtime，开发/测试用）');
  }
}

files.sort((a, b) => a.path.localeCompare(b.path));
const manifest = { name: 'DreamSkin payload', version: VERSION, platform, at: new Date().toISOString(), runtime, files };
writeFileSync(join(outDir, 'payload-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('构建完成: ' + outDir + '（' + files.length + ' 个文件，版本 ' + VERSION + '，平台 ' + platform + '）');
