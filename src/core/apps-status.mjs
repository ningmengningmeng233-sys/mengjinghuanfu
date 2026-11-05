// 全应用状态聚合（U-1，方案 §4.6）：总控台应用列表与状态点的数据来源。
// 一次把全部已注册适配器的状态收齐（装没装 / 在没在跑 / 皮肤生效没 / 是否兼容模式），
// 单应用口径与 status 命令一致（各通道 status 内部已处理会话文件等口径）。
// 状态点五态（§4.6）：not-installed 未安装 / not-running 未运行 / running 运行中 /
// skin-active 皮肤生效 / compat 兼容模式。判定是纯函数 appStateOf；
// 总控台 C# 侧 AppStatusLogic 是同一张判定表的镜像，两边各自有自检/单测守住。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRuntimeProfiles } from './app-runtime.mjs';
import { adapterErrors } from './adapters.mjs';
import { channelFor } from '../channels/index.mjs';
import { profileToChannelAdapter } from '../channels/exe.mjs';
import { dataDir, rootDir } from './env.mjs';
import { readCompat } from '../store/compat.mjs';

// 五态判定，优先级从上到下：未装 > 兼容模式（须皮肤生效或运行中，体检记录才作数）
// > 皮肤生效 > 运行中 > 未运行。
export function appStateOf({ installed = false, running = false, skinActive = false, compatMode = false } = {}) {
  if (!installed) return 'not-installed';
  if (compatMode && (skinActive || running)) return 'compat';
  if (skinActive) return 'skin-active';
  if (running) return 'running';
  return 'not-running';
}

// 皮肤生效的有效口径：应用正在运行、但没有调试端口时（exe / msix 通道），
// 界面里并没有被注入皮肤（换肤靠调试端口注入），此时把「皮肤文件已存」算作
// 「生效中」会与逐应用状态行（要求有调试端口才认生效）自相矛盾。
// 应用没在运行时不套用这条：那时 skinActive 表示「已存皮肤，下次启动带上」。
export function effectiveSkinActive({ running = false, debugPort = 0, channel = '', skinActive = false } = {}) {
  if (!skinActive) return false;
  if (running && !debugPort && (channel === 'exe' || channel === 'msix')) return false;
  return true;
}

// 列表排序（V-U1：已安装优先）：已装的在前、未装的在后，各自保持注册表顺序。
export function sortAppsForList(apps) {
  return [...apps.filter((a) => a.installed), ...apps.filter((a) => !a.installed)];
}

async function defaultStatusOf(profile) {
  const channel = channelFor(profile);
  const adapter = profileToChannelAdapter(profile, {
    skinActive: () => existsSync(join(dataDir(profile.id), 'active-skin.css')),
  });
  return channel.status(adapter);
}

function defaultCheckedVersion(id) {
  try { return JSON.parse(readFileSync(join(dataDir(id), 'checked-version.json'), 'utf8')).version || ''; } catch { return ''; }
}

// 收齐全部适配器状态。deps 可注入（单测用假实现）：profiles / statusOf / compatOf /
// checkedVersionOf / skinFileExists / errors。单个应用查状态失败不拖垮整表：
// 该行带 error 字段与 state='error'，其余应用照常。
export async function collectAppsStatus(deps = {}) {
  const d = {
    profiles: deps.profiles || listRuntimeProfiles(),
    statusOf: deps.statusOf || defaultStatusOf,
    compatOf: deps.compatOf || ((id) => readCompat(rootDir())[id] || null),
    checkedVersionOf: deps.checkedVersionOf || defaultCheckedVersion,
    skinFileExists: deps.skinFileExists || ((id) => existsSync(join(dataDir(id), 'active-skin.css'))),
    errors: deps.errors || (() => adapterErrors()),
  };
  const rows = [];
  for (const p of d.profiles) {
    const base = { id: p.id, name: p.name, channel: p.channel, testedVersions: p.testedVersions || [] };
    try {
      const s = await d.statusOf(p);
      const compat = d.compatOf(p.id);
      const installed = !!s.installed;
      const running = !!s.running;
      const skinActive = effectiveSkinActive({ running, debugPort: s.debugPort || 0, channel: p.channel, skinActive: typeof s.skinActive === 'boolean' ? s.skinActive : d.skinFileExists(p.id) });
      rows.push({
        ...base, installed, running, debugPort: s.debugPort || 0, exe: s.exe || '', skinActive,
        mode: compat ? compat.mode || 'full' : 'full',
        appVersion: s.version || (compat && compat.appVersion) || d.checkedVersionOf(p.id) || '',
        state: appStateOf({ installed, running, skinActive, compatMode: !!(compat && compat.mode === 'compat') }),
      });
    } catch (e) {
      rows.push({
        ...base, installed: false, running: false, debugPort: 0, exe: '', skinActive: false,
        mode: 'full', appVersion: '', state: 'error', error: String((e && e.message) || e),
      });
    }
  }
  return { apps: sortAppsForList(rows), errors: d.errors() };
}
