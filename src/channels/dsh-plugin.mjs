// dsh-plugin 通道（T2-4，方案 §4.3 / §6 T2-4）：DSH 的可选兜底通道，默认关闭。
// 形态（§4.3 dsh-plugin 行 + S-2 实证）：生成一个 DSH 客户端插件（模板在本目录 dsh-plugin/），
// 插件读 %LOCALAPPDATA%\\DreamSkin\\dsh\\active-skin.css（三层皮肤文件），经官方 UI 插槽
// shell.overlay 把三层 <style> 注入 Web UI——桌面外壳与浏览器模式（dsh web）共用同一套 Web UI，
// 所以这一条通道两种形态都覆盖。本通道没有自己的进程与调试口：status 的 debugPort 恒 0、
// targets 恒空数组，注入发生在页面内（插件侧），入口的 CDP 流程不适用于它。
// 红线（§4.3 / §4.8，逐条落到代码）：
// - 只在用户明确同意时安装：install() 没有 consent === true 直接拒绝，不写任何文件
//   （验收 V-CH-dsh-plugin「未同意时不安装」）；
// - 卸载必须干净：安装时把放下的每个文件与哈希记进数据目录的 plugin-install.json，
//   卸载只删清单里的文件、只删因此变空的目录，来历不明的同名目录拒绝覆盖、绝不误删；
// - 通道默认关闭：开关状态存数据目录 plugin-channel.json（默认无文件 = 关），
//   关开关同时删皮肤文件（总开关关掉即移除全部覆盖）；
// - 插件与本通道都不联网、不读会话 / 对话内容、不碰 Cookie 与本地存储（单测静态断言守住）。
// 依赖可注入（deps）：dataDir / pluginsDir / version / now，单测用临时目录跑完整
// 安装 -> 启用 -> 写皮肤 -> 关闭 -> 卸载流程，不碰用户真实 DSH 数据。
// 真实插件目录布局与注册机制（cordis 配置如何登记）未在真机核对：默认 pluginsDir
// 只认环境变量 DREAMSKIN_DSH_PLUGINS_DIR，未配置时 install 如实报错、不猜路径乱放；
// 总控台开关 UI 在 U-3，本通道先提供 setEnabled / isEnabled 的数据面。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from '../core/env.mjs';
import { VERSION } from '../core/version.mjs';
import { serializeSkinFile } from '../theme/layers.mjs';

export const PLUGIN_NAME = 'dsh-plugin-dreamskin';
export const PLUGIN_TEMPLATE_DIR = fileURLToPath(new URL('./dsh-plugin/', import.meta.url));
export const PLUGIN_FILES = ['package.json', 'lib/main.js', 'lib/overlay.js', 'README.md'];
const SWITCH_FILE = 'plugin-channel.json';
const MANIFEST_FILE = 'plugin-install.json';
const SKIN_FILE = 'active-skin.css';

// 把插件模板按当前版本号生成成 { 相对路径: 内容 }（package.json 的版本占位在生成时替换）。
export function buildPluginFiles(version = VERSION) {
  const out = {};
  for (const rel of PLUGIN_FILES) {
    out[rel] = readFileSync(join(PLUGIN_TEMPLATE_DIR, rel), 'utf8').split('{{version}}').join(version);
  }
  return out;
}

const defaultDeps = {
  dataDir: (id) => dataDir(id),
  pluginsDir: () => process.env.DREAMSKIN_DSH_PLUGINS_DIR || '',
  version: () => VERSION,
  now: () => new Date().toISOString(),
};

function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('dsh-plugin 通道：adapter 不能为空');
  if (!adapter.id || !adapter.name) throw new Error('dsh-plugin 通道：adapter 缺少 id / name');
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function createDshPluginChannel(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const dirOf = (adapter) => d.dataDir(adapter.id);
  const readSwitch = (dir) => readJson(join(dir, SWITCH_FILE));
  const readManifest = (dir) => readJson(join(dir, MANIFEST_FILE));
  const skinPath = (dir) => join(dir, SKIN_FILE);

  function removeSkinFile(dir) {
    const p = skinPath(dir);
    if (!existsSync(p)) return false;
    rmSync(p);
    return true;
  }

  // 卸载的实际动作（install 升级时也复用）：只删清单文件与因此变空的目录。
  function uninstallNow(adapter) {
    const dir = dirOf(adapter);
    const m = readManifest(dir);
    if (!m) return { installed: false, removed: [], leftBehind: [] };
    const target = join(m.hostDir, PLUGIN_NAME);
    const removed = [];
    for (const f of m.files || []) {
      const p = join(target, f.rel);
      if (existsSync(p)) { rmSync(p); removed.push(f.rel); }
    }
    const leftBehind = [];
    // 空目录用 rmdirSync 删：rmSync 对目录在 Windows 上会抛 ERR_FS_EISDIR（实测）。
    for (const sub of ['lib', '']) {
      const p = sub ? join(target, sub) : target;
      try { if (existsSync(p) && readdirSync(p).length === 0) rmdirSync(p); } catch {}
    }
    if (existsSync(target)) leftBehind.push(PLUGIN_NAME + '/（目录内仍有非本通道文件，未删）');
    rmSync(join(dir, MANIFEST_FILE));
    return { installed: false, removed, leftBehind };
  }

  return {
    kind: 'dsh-plugin',

    // §4.3 status 形状在本通道的语义：installed = 插件已安装（本通道的可安装单元就是插件）；
    // running 恒 false（通道没有自己的进程，Web UI 是否开着不靠发请求探测）；exe / debugPort 不适用。
    async status(adapter) {
      assertAdapter(adapter);
      const dir = dirOf(adapter);
      const m = readManifest(dir);
      const sw = readSwitch(dir);
      const enabled = !!(sw && sw.enabled);
      let skinBytes = 0;
      try { skinBytes = readFileSync(skinPath(dir), 'utf8').length; } catch {}
      return {
        installed: !!m,
        running: false,
        debugPort: 0,
        skinActive: !!(enabled && m && skinBytes > 0),
        exe: '',
        version: m ? m.version : '',
        enabled,
        pluginInstalled: !!m,
      };
    },

    // launch = 把皮肤供给插件：开关开着且插件已装时，把三层写进数据目录的 active-skin.css。
    // layers 经 theme/layers.mjs 的 serializeSkinFile 落盘（与 CDP 路线同一种文件）；css 为纯文本时整份当部件层。
    async launch(adapter, { layers, css } = {}) {
      assertAdapter(adapter);
      const dir = dirOf(adapter);
      const sw = readSwitch(dir);
      if (!sw || !sw.enabled) throw new Error('DSH 插件通道默认关闭：先开启插件通道开关后才能写入皮肤（总控台 DSH 页 / setEnabled）。');
      if (!readManifest(dir)) throw new Error('DSH 插件尚未安装：安装需要用户明确同意（install 需带 consent）。');
      if (layers) writeFileSync(skinPath(dir), serializeSkinFile(layers), 'utf8');
      else if (typeof css === 'string') writeFileSync(skinPath(dir), serializeSkinFile({ vars: '', parts: css, extra: '' }), 'utf8');
      return { port: 0 };
    },

    // stop = 撤下皮肤（删皮肤文件，插件随之移除全部样式）；插件本身与开关状态不动（等同 restore）。
    async stop(adapter) {
      assertAdapter(adapter);
      return { stopped: removeSkinFile(dirOf(adapter)) };
    },

    // 注入由插件在页面内完成，没有 CDP 目标。
    async targets() { return []; },

    // 总开关（数据面；总控台 UI 在 U-3）。关开关同时删皮肤文件，保证覆盖被全部移除。
    async setEnabled(adapter, on) {
      assertAdapter(adapter);
      const dir = dirOf(adapter);
      const enabled = !!on;
      writeFileSync(join(dir, SWITCH_FILE), JSON.stringify({ enabled, updatedAt: d.now() }, null, 2), 'utf8');
      if (!enabled) removeSkinFile(dir);
      return { enabled };
    },

    async isEnabled(adapter) {
      assertAdapter(adapter);
      const sw = readSwitch(dirOf(adapter));
      return !!(sw && sw.enabled);
    },

    // 安装（T2-4「安装命令」）：没有 consent === true 直接拒绝且不写任何文件。
    async install(adapter, { consent = false } = {}) {
      assertAdapter(adapter);
      if (consent !== true) throw new Error('DSH 插件通道：未取得用户明确同意，不安装插件（方案 §4.3 / §4.8）。');
      const hostRoot = d.pluginsDir();
      if (!hostRoot) {
        throw new Error('DSH 插件通道：插件目录未配置（真实目录布局待真机核对后经 DREAMSKIN_DSH_PLUGINS_DIR 或总控台接线提供），未做任何改动。');
      }
      const dir = dirOf(adapter);
      const target = join(hostRoot, PLUGIN_NAME);
      const prev = readManifest(dir);
      if (existsSync(target) && !prev) {
        throw new Error('DSH 插件通道：目标位置已存在同名目录但不是梦境换肤安装的，拒绝覆盖，未做任何改动。');
      }
      if (prev) uninstallNow(adapter); // 升级：先按旧清单清干净，再放新版
      const files = buildPluginFiles(d.version());
      const record = [];
      for (const rel of PLUGIN_FILES) {
        const p = join(target, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, files[rel], 'utf8');
        record.push({ rel, sha256: createHash('sha256').update(files[rel]).digest('hex') });
      }
      const manifest = { plugin: PLUGIN_NAME, version: d.version(), hostDir: hostRoot, files: record, installedAt: d.now() };
      writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8');
      return { installed: true, version: manifest.version, files: PLUGIN_FILES.slice() };
    },

    // 卸载（T2-4「卸载命令」）：按安装清单精确移除，未装过时是干净的空操作。
    async uninstall(adapter) {
      assertAdapter(adapter);
      return uninstallNow(adapter);
    },
  };
}

export const dshPluginChannel = createDshPluginChannel();
