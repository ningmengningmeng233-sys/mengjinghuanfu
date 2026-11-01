// 插件通道桥（U-3 接线）：把 channels/dsh-plugin.mjs 的数据面组装成入口命令与总控台共用的形状。
// 红线都在通道实现里（默认关闭、无 consent 拒装、按清单精确卸载），本桥只做三件事：
// 按 id 找适配器、确认该应用确实声明了 dsh-plugin 外壳（没声明的明确拒绝）、转发调用。
// deps 可注入（channel / adapterOf），单测用临时目录的真通道跑完整流程，不碰用户真实 DSH 数据。
import { createDshPluginChannel } from '../channels/dsh-plugin.mjs';
import { adapterById } from './adapters.mjs';

export function pluginShellOf(adapter) {
  const shells = (adapter && adapter.shells) || [];
  return shells.find((s) => s && s.channel === 'dsh-plugin') || null;
}

export function createPluginBridge(deps = {}) {
  const channel = deps.channel || createDshPluginChannel(deps.channelDeps);
  const getAdapter = deps.adapterOf || ((id) => adapterById(id));
  function need(id) {
    const a = getAdapter(id);
    if (!a) throw new Error('未注册的应用：' + id);
    if (!pluginShellOf(a)) {
      throw new Error((a.name || id) + ' 没有插件通道：只有声明了 dsh-plugin 外壳的应用才有（当前是 DSH 的 web 外壳）。');
    }
    return a;
  }
  return {
    async status(id) {
      const s = await channel.status(need(id));
      return { app: id, channel: 'dsh-plugin', enabled: !!s.enabled, installed: !!s.pluginInstalled, skinActive: !!s.skinActive, version: s.version || '' };
    },
    async setEnabled(id, on) {
      const r = await channel.setEnabled(need(id), !!on);
      return { app: id, enabled: !!r.enabled };
    },
    // consent 原样传给通道：不是 true 通道会拒装且零写入，本桥不代为放行。
    async install(id, consent) {
      return channel.install(need(id), { consent: consent === true });
    },
    async uninstall(id) {
      return channel.uninstall(need(id));
    },
  };
}

export const pluginBridge = createPluginBridge();
