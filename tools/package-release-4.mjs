// Build dual-platform v4.0.0 release packages into ../发布包/
// - 梦境换肤-Windows-4.0.0.zip (exe + release notes + SHA256SUMS)
// - 梦境换肤-macOS-4.0.0.zip (darwin payload + dual-arch Node v22.23.4 + pure-LF 启动控制台.command + README-macOS.md)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/core/version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const releaseOutDir = resolve(root, '..', '发布包');
const stageRoot = join(root, 'build', 'release-4.0.0');

function sha256File(fp) {
  return createHash('sha256').update(readFileSync(fp)).digest('hex').toUpperCase();
}

function zipDirWindows(srcDir, destZip) {
  rmSync(destZip, { force: true });
  const ps = `
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory('${srcDir.replace(/'/g, "''")}', '${destZip.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)
  `;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'inherit' });
}

mkdirSync(releaseOutDir, { recursive: true });
rmSync(stageRoot, { recursive: true, force: true });

// 1. Rebuild Studio UI bundle
execFileSync(process.execPath, [join(root, 'tools', 'build-studio-ui.mjs')], { cwd: root, stdio: 'inherit' });

// 2. Verify Windows 4.0.0 exe exists
const winExeSrc = join(root, 'src', 'launcher', 'bin', 'Release', 'net48', `梦境换肤-${VERSION}-Windows.exe`);
if (!existsSync(winExeSrc)) {
  throw new Error(`Missing built Windows exe: ${winExeSrc}. Run tools/build-launcher.ps1 first.`);
}

// 3. Stage Windows release zip
const winStage = join(stageRoot, 'win');
mkdirSync(winStage, { recursive: true });
const winExeDst = join(winStage, `梦境换肤-${VERSION}-Windows.exe`);
cpSync(winExeSrc, winExeDst);
const exeHash = sha256File(winExeDst);

const winNotes = `# 梦境换肤 ${VERSION}（DreamSkin Prism）Windows 发布说明

## 核心升级亮点
- **全新 Obsidian Prism 液态玻璃皮肤与动态壁纸引擎**：支持图片、视频（MP4/WebM/MOV）、多图幻灯片、交互式 HTML 网页、Steam Wallpaper Engine (431960) 创意工坊与 \`scene.pkg\`、以及 \`dreamskin.cc\` 在线主题库。
- **一等公民适配 Google Antigravity（反重力）**：支持 Hub + IDE 双壳、\`2.34.0\` 内置浏览器精准避让挖洞、原图标一键开启与原生 Sidecar 侧边栏插件（\`dreamskin-prism\`）。
- **普通用户友好体验升级**：
  1. 双层极简界面（4 张风格大卡 + 2 个常用滑块，高级设置默认折叠）；
  2. 原图标一键自动生效（无损备份，随时恢复）；
  3. 多窗口前台播放、后台/电池自动冻结省电；
  4. 各软件独立壁纸配置 + 一键同步全部；
  5. 独立桌面端与反重力侧边栏共用同一管家，绝不打架；
  6. 四重兜底保护：代码区清晰底板、反重力内置浏览器挖洞、冲突检测提醒（含 \`obsidian-prism\`）、\`4× Esc\` / \`Ctrl+Alt+Shift+R\` 随时秒撤。

## 使用说明与 SmartScreen 提示
- 本程序未购买商业代码签名证书，首次双击可能弹出 Windows SmartScreen 提示，点「更多信息 → 仍要运行」即可，可通过同目录 \`SHA256SUMS-${VERSION}.txt\` 核对完整性。
- 首次启动会自动只读迁移你 3.0 的本地壁纸和皮肤存档，绝不删除原 3.0 数据。
`;
writeFileSync(join(winStage, `发布说明-${VERSION}.md`), winNotes, 'utf8');
writeFileSync(
  join(winStage, `SHA256SUMS-${VERSION}.txt`),
  `${exeHash}  梦境换肤-${VERSION}-Windows.exe\r\n`,
  'utf8',
);

const winZipPath = join(releaseOutDir, `梦境换肤-Windows-${VERSION}.zip`);
zipDirWindows(winStage, winZipPath);

// 4. Stage macOS release zip (darwin payload + dual-arch Node v22.23.4 if cached)
const macStage = join(stageRoot, 'mac');
const macPayload = join(macStage, 'payload');
mkdirSync(macStage, { recursive: true });
execFileSync(process.execPath, [join(root, 'tools', 'build-payload.mjs'), '--platform', 'darwin', '--out', macPayload], { cwd: root, stdio: 'inherit' });

const cacheDir = join(root, 'build', 'cache');
const macArmTar = join(cacheDir, 'node-v22.23.4-darwin-arm64.tar.gz');
const macX64Tar = join(cacheDir, 'node-v22.23.4-darwin-x64.tar.gz');
let hasBundledMacNode = false;

if (existsSync(macArmTar) && existsSync(macX64Tar)) {
  const rtArm = join(macStage, 'runtime', 'node-darwin-arm64');
  const rtX64 = join(macStage, 'runtime', 'node-darwin-x64');
  mkdirSync(join(rtArm, 'bin'), { recursive: true });
  mkdirSync(join(rtX64, 'bin'), { recursive: true });
  execFileSync('tar', ['-xzf', macArmTar, '--strip-components=1', '-C', rtArm, 'node-v22.23.4-darwin-arm64/bin/node', 'node-v22.23.4-darwin-arm64/LICENSE'], { stdio: 'inherit' });
  execFileSync('tar', ['-xzf', macX64Tar, '--strip-components=1', '-C', rtX64, 'node-v22.23.4-darwin-x64/bin/node', 'node-v22.23.4-darwin-x64/LICENSE'], { stdio: 'inherit' });
  hasBundledMacNode = true;
}

const commandSh = [
  '#!/usr/bin/env bash',
  'set -e',
  'DIR="$(cd "$(dirname "$0")" && pwd)"',
  'ARCH="$(uname -m)"',
  'NODE_BIN=""',
  'if [ "$ARCH" = "arm64" ] && [ -x "$DIR/runtime/node-darwin-arm64/bin/node" ]; then',
  '  NODE_BIN="$DIR/runtime/node-darwin-arm64/bin/node"',
  'elif [ -x "$DIR/runtime/node-darwin-x64/bin/node" ]; then',
  '  NODE_BIN="$DIR/runtime/node-darwin-x64/bin/node"',
  'elif command -v node >/dev/null 2>&1; then',
  '  NODE_BIN="$(command -v node)"',
  'else',
  '  echo "未找到内置或系统 Node 运行时，请先执行 chmod +x runtime/node-darwin-*/bin/node 启动控制台.command"',
  '  exit 1',
  'fi',
  'INFO="$("$NODE_BIN" "$DIR/payload/studio-daemon.mjs" &)"',
  'echo "梦境换肤 Prism 4.0 正在后台启动，请在浏览器打开控制台..."',
  'wait',
  '',
].join('\n');
writeFileSync(join(macStage, '启动控制台.command'), commandSh, 'utf8');

const macReadme = `# 梦境换肤 ${VERSION}（DreamSkin Prism）macOS 版

> **重要提示：本 macOS 版本已完成代码层适配与双架构 Node 运行时打包，但尚未在真实 Mac 设备上实机验证，请优先在非重要环境试用。**

## 启动方式
- ${hasBundledMacNode ? '已内置官方 Node v22.23.4（Apple Silicon arm64 + Intel x64 双架构），无需另装 Node。' : '请先安装 Node 22+。'}
- 首次使用请在终端进入解压目录执行：
  \`\`\`bash
  chmod +x 启动控制台.command runtime/node-darwin-*/bin/node
  ./启动控制台.command
  \`\`\`
- 或直接运行单后台控制台：
  \`\`\`bash
  ./runtime/node-darwin-arm64/bin/node payload/studio-daemon.mjs
  \`\`\`
- 第三方许可证（含 Node.js 官方 LICENSE）已随附在 \`runtime/\` 与 \`payload/THIRD-PARTY-NOTICES.md\`。
`;
writeFileSync(join(macStage, 'README-macOS.md'), macReadme, 'utf8');

const macZipPath = join(releaseOutDir, `梦境换肤-macOS-${VERSION}.zip`);
zipDirWindows(macStage, macZipPath);

const report = {
  version: VERSION,
  windows: {
    path: winZipPath,
    size: statSync(winZipPath).size,
    sha256: sha256File(winZipPath),
    exeSha256: exeHash,
  },
  macos: {
    path: macZipPath,
    size: statSync(macZipPath).size,
    sha256: sha256File(macZipPath),
    bundledNode: hasBundledMacNode,
  },
};
console.log(JSON.stringify(report, null, 2));
rmSync(stageRoot, { recursive: true, force: true });
