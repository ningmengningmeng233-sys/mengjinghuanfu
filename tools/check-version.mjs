// T0-3 构建校验：版本号以 src/core/version.mjs 为单一来源。
// 检查：① 主题库 UA 不许再写死版本；② status 输出带 version；③ 规则段用 ${VERSION} 生成；
// ④ 若总控台源码（src/launcher/，由反编译重建）已存在，其 AssemblyVersion / FileVersion 必须与 VERSION 一致，否则构建失败。
// 用法：node tools/check-version.mjs（在源码/ 目录运行）。全部通过退出码 0，否则 1。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION, USER_AGENT } from '../src/core/version.mjs';

let fail = 0;
const ok = (m) => console.log('PASS: ' + m);
const bad = (m) => { fail++; console.log('FAIL: ' + m); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

if (!/^\d+\.\d+\.\d+$/.test(VERSION)) bad('VERSION 不是 x.y.z 形式：' + VERSION); else ok('VERSION = ' + VERSION);
if (!USER_AGENT.includes(VERSION)) bad('USER_AGENT 没带 VERSION'); else ok('USER_AGENT = ' + USER_AGENT);

const gallery = read('src/store/gallery.mjs');
if (/DreamSkin-\d/.test(gallery)) bad('gallery.mjs 里还有写死的 DreamSkin-<版本>'); else ok('gallery.mjs 无写死版本');
if (!gallery.includes('USER_AGENT')) bad('gallery.mjs 没用 USER_AGENT'); else ok('gallery.mjs 使用 USER_AGENT');

const main = read('src/dreamskin.mjs');
if (!main.includes('version: VERSION')) bad('dreamskin.mjs 的 status 输出没带 version'); else ok('status 输出带 version（日志头口径）');

for (const f of ['src/theme/cherry-skin-css.mjs', 'src/theme/zcode-skin-css.mjs']) {
  const t = read(f);
  if (!t.includes('Dream Skin ${VERSION}')) bad(f + ' 规则段没用 ${VERSION}'); else ok(f + ' 规则段版本来自 version.mjs');
}

const launcherDir = new URL('../src/launcher/', import.meta.url);
if (existsSync(launcherDir)) {
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(cs|csproj)$/.test(e.name)) files.push(p); } };
  walk(launcherDir.pathname);
  let found = 0;
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/(?:AssemblyVersion|FileVersion|AssemblyFileVersion)[^0-9]*([0-9]+\.[0-9]+\.[0-9]+)(?:\.[0-9]+)?/g)) {
      found++;
      if (m[1] !== VERSION) bad(f + ' 版本 ' + m[1] + ' 与 VERSION ' + VERSION + ' 不一致');
    }
  }
  if (found) ok('总控台 AssemblyVersion 已校验（' + found + ' 处）');
  else console.log('WARN: src/launcher/ 存在但没找到 AssemblyVersion，总控台版本未校验');
} else {
  console.log('WARN: src/launcher/ 尚不存在（总控台只有 exe、C# 源码未反编译重建），exe 文件版本与总控台标题待 launcher 重建时按本脚本校验，本次跳过');
}
process.exit(fail ? 1 : 0);
