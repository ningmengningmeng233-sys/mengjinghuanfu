// dsh-plugin 通道（DreamSkin Prism v4.1）：DSH NEXT 原生双半体插件通道。
// 形态：安装 dsh-plugin-dreamskin 到 DSH NEXT 的 plugin-packages 目录，
// 后端半体（lib/main.js）首屏注入 CSS 并提供只读本地状态路由，
// 前端半体（lib/client.js）通过 window.__ModuleLoader__ 热同步三模式样式、底图与像素伙伴，
// 免 CDP、免重启、免改 app.asar。
// 红线：仅在 consent === true 时安装；仅读写 %LOCALAPPDATA%\DreamSkin\dsh\ 本地皮肤文件；
// 卸载按清单精确清理，绝不误删其他插件。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from '../core/env.mjs';
import { VERSION } from '../core/version.mjs';
import { serializeSkinFile } from '../theme/layers.mjs';

export const PLUGIN_NAME = 'dsh-plugin-dreamskin';
export const PLUGIN_TEMPLATE_DIR = fileURLToPath(new URL('./dsh-plugin/', import.meta.url));
export const PLUGIN_FILES = [
  'package.json',
  'cordis.patch.yml',
  'lib/main.js',
  'lib/overlay.js',
  'lib/client.js',
  'lib/optical-bundle.js',
  'README.md',
];
const SWITCH_FILE = 'plugin-channel.json';
const MANIFEST_FILE = 'plugin-install.json';
const SKIN_FILE = 'active-skin.css';
const PAYLOAD_FILE = 'active-payload.json';

// 自动探测 DSH NEXT 插件包目录：
// 1) DREAMSKIN_DSH_PLUGINS_DIR 环境变量覆盖
// 2) DSH_HOME 环境变量下的 plugin-packages
// 3) %APPDATA%\DSH NEXT\home\desktop-next-last-home.json 记录的 home/plugin-packages
// 4) 回退 %USERPROFILE%\.dsh\plugin-packages（当 ~/.dsh 存在时）
export function resolveDefaultDshPluginsDir({ env = process.env, home = homedir() } = {}) {
  const e = env || {};
  if (e.DREAMSKIN_DSH_PLUGINS_DIR && String(e.DREAMSKIN_DSH_PLUGINS_DIR).trim()) {
    return String(e.DREAMSKIN_DSH_PLUGINS_DIR).trim();
  }
  if (e.DSH_HOME && String(e.DSH_HOME).trim()) {
    return join(String(e.DSH_HOME).trim(), 'plugin-packages');
  }
  if (e.APPDATA) {
    const lastHomeFile = join(e.APPDATA, 'DSH NEXT', 'home', 'desktop-next-last-home.json');
    try {
      if (existsSync(lastHomeFile)) {
        const parsed = JSON.parse(readFileSync(lastHomeFile, 'utf8'));
        if (parsed && typeof parsed.home === 'string' && parsed.home.trim()) {
          return join(parsed.home.trim(), 'plugin-packages');
        }
      }
    } catch {}
  }
  if (home) {
    const dshRoot = join(home, '.dsh');
    if (existsSync(dshRoot)) return join(dshRoot, 'plugin-packages');
  }
  return '';
}

export function buildPluginFiles(version = VERSION) {
  const out = {};
  for (const rel of PLUGIN_FILES) {
    out[rel] = readFileSync(join(PLUGIN_TEMPLATE_DIR, rel), 'utf8').split('{{version}}').join(version);
  }
  return out;
}

const defaultDeps = {
  dataDir: (id) => dataDir(id),
  pluginsDir: () => resolveDefaultDshPluginsDir(),
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
  const payloadPath = (dir) => join(dir, PAYLOAD_FILE);

  function removeSkinFiles(dir) {
    let removed = false;
    for (const p of [skinPath(dir), payloadPath(dir)]) {
      if (existsSync(p)) {
        rmSync(p);
        removed = true;
      }
    }
    return removed;
  }

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
    for (const sub of ['lib', '']) {
      const p = sub ? join(target, sub) : target;
      try { if (existsSync(p) && readdirSync(p).length === 0) rmdirSync(p); } catch {}
    }
    if (existsSync(target)) leftBehind.push(PLUGIN_NAME + '/（目录内仍有非本通道文件，未删）');
    if (existsSync(join(dir, MANIFEST_FILE))) rmSync(join(dir, MANIFEST_FILE));
    return { installed: false, removed, leftBehind };
  }

  return {
    kind: 'dsh-plugin',

    async status(adapter) {
      assertAdapter(adapter);
      const dir = dirOf(adapter);
      const m = readManifest(dir);
      const sw = readSwitch(dir);
      const enabled = !!(sw && sw.enabled);
      const hostDir = m ? m.hostDir : d.pluginsDir();
      const targetExists = Boolean(hostDir && existsSync(join(hostDir, PLUGIN_NAME, 'package.json')));
      let skinBytes = 0;
      try { skinBytes = readFileSync(skinPath(dir), 'utf8').length; } catch {}
      const installed = Boolean(m && targetExists);
      return {
        installed,
        running: false,
        debugPort: 0,
        skinActive: Boolean(enabled && installed && skinBytes > 0),
        exe: '',
        version: m ? m.version : '',
        enabled,
        pluginInstalled: installed,
        pluginsDir: hostDir || '',
      };
    },

    async launch(adapter, { layers, css, payload } = {}) {
      assertAdapter(adapter);
      const dir = dirOf(adapter);
      const sw = readSwitch(dir);
      if (!sw || !sw.enabled) {
        throw new Error('DSH 插件通道默认关闭：先开启插件通道开关后才能写入皮肤（总控台 DSH 页 / setEnabled）。');
      }
      if (!readManifest(dir)) {
        throw new Error('DSH 插件尚未安装：安装需要用户明确同意（install 需带 consent）。');
      }
      mkdirSync(dir, { recursive: true });
      if (layers) {
        writeFileSync(skinPath(dir), serializeSkinFile(layers), 'utf8');
      } else if (typeof css === 'string') {
        writeFileSync(skinPath(dir), serializeSkinFile({ vars: '', parts: css, extra: '' }), 'utf8');
      }
      if (payload && typeof payload === 'object') {
        writeFileSync(payloadPath(dir), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      }
      return { port: 0, via: 'dsh-plugin' };
    },

    async stop(adapter) {
      assertAdapter(adapter);
      return { stopped: removeSkinFiles(dirOf(adapter)) };
    },

    async targets() { return []; },

    async setEnabled(adapter, on) {
      assertAdapter(adapter);
      const dir = dirOf(adapter);
      mkdirSync(dir, { recursive: true });
      const enabled = !!on;
      writeFileSync(join(dir, SWITCH_FILE), JSON.stringify({ enabled, updatedAt: d.now() }, null, 2), 'utf8');
      if (!enabled) removeSkinFiles(dir);
      return { enabled };
    },

    async isEnabled(adapter) {
      assertAdapter(adapter);
      const sw = readSwitch(dirOf(adapter));
      return !!(sw && sw.enabled);
    },

    async install(adapter, { consent = false } = {}) {
      assertAdapter(adapter);
      if (consent !== true) {
        throw new Error('DSH 插件通道：未取得用户明确同意，不安装插件。');
      }
      const hostRoot = d.pluginsDir();
      if (!hostRoot) {
        throw new Error('DSH 插件通道：未能自动定位 DSH 插件目录（可设置 DREAMSKIN_DSH_PLUGINS_DIR 指向 ~/.dsh/plugin-packages），未做任何改动。');
      }
      mkdirSync(hostRoot, { recursive: true });
      const dir = dirOf(adapter);
      mkdirSync(dir, { recursive: true });
      const target = join(hostRoot, PLUGIN_NAME);
      const prev = readManifest(dir);
      if (existsSync(target) && !prev) {
        throw new Error('DSH 插件通道：目标位置已存在同名目录但不是梦境换肤安装的，拒绝覆盖，未做任何改动。');
      }
      if (prev) uninstallNow(adapter);
      const files = buildPluginFiles(d.version());
      const record = [];
      for (const rel of PLUGIN_FILES) {
        const p = join(target, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, files[rel], 'utf8');
        record.push({ rel, sha256: createHash('sha256').update(files[rel]).digest('hex') });
      }
      const manifest = {
        plugin: PLUGIN_NAME,
        version: d.version(),
        hostDir: hostRoot,
        files: record,
        installedAt: d.now(),
      };
      writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8');
      return { installed: true, version: manifest.version, hostDir: hostRoot, files: PLUGIN_FILES.slice() };
    },

    async uninstall(adapter) {
      assertAdapter(adapter);
      removeSkinFiles(dirOf(adapter));
      return uninstallNow(adapter);
    },
  };
}

export const dshPluginChannel = createDshPluginChannel();
