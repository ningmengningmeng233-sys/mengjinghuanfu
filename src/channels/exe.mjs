// exe 通道（T2-1，方案 §4.3）：把 core/app-process.mjs 的既有进程 / CDP 逻辑封装成统一 Channel 接口。
// 接口（方案 §4.3）：
//   status(adapter)                    -> { installed, running, debugPort, skinActive, exe, version }
//   launch(adapter, { port, restart }) -> { port }   带调试能力启动；返回前已等到主窗口（轮询 /json/list）
//   stop(adapter, { graceful })        -> { stopped, forced }
//   targets(adapter, port)             -> CdpTarget[]（主窗口列表）
// 通道只依赖「通道适配器」形状，与 core/apps.mjs 的 profile 字段对齐：
//   { id, name, exeName, envExe, uninstallName, candidates(), isMainTarget(item, port),
//     isHelperCmd?(cmd), restartNote?, uaToken?, skinActive?() }
// apps.mjs 的 profile 用 profileToChannelAdapter() 适配；T1-3 把 Cherry/ZCode 迁到 adapters/ 后，
// 由适配器运行时把 adapter.json + 钩子组装成同一形状，通道不用改。
// 要点（§4.3 exe 行）：优雅关闭 -> 空闲端口 -> exe --remote-debugging-port=N -> 轮询 /json/list；
// 端口只绑 127.0.0.1（freePort / fetchCdpJson 都只走回环），主窗口判定沿用 validatedDebuggerUrl（core/cdp-core.mjs）。
// 全部系统操作可注入（deps），单测用假的实现，不真启应用。
import { listProcesses, debugPortOf, findExe, freePort, portAlive, stopApp, launchWithPort, listMainTargets, waitForMainTargets } from '../core/app-process.mjs';
import { fetchCdpJson } from '../core/cdp-core.mjs';

const defaultDeps = {
  listProcesses, debugPortOf, findExe, freePort, portAlive, stopApp, launchWithPort, listMainTargets, waitForMainTargets,
  fetchVersion: (port) => fetchCdpJson(port, '/json/version', 1500),
};

// apps.mjs profile -> 通道适配器。opts.skinActive: () => boolean（入口按数据目录里皮肤文件是否存在判断）。
export function profileToChannelAdapter(profile, opts = {}) {
  if (!profile || typeof profile !== 'object') throw new Error('profileToChannelAdapter: profile 不能为空');
  return {
    id: profile.id, name: profile.name, exeName: profile.exeName, envExe: profile.envExe,
    uninstallName: profile.uninstallName, macBundle: profile.macBundle,
    candidates: profile.candidates, isMainTarget: profile.isMainTarget, isHelperCmd: profile.isHelperCmd,
    restartNote: profile.restartNote, uaToken: profile.uaToken,
    ...(typeof opts.skinActive === 'function' ? { skinActive: opts.skinActive } : {}),
  };
}

function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('exe 通道：adapter 不能为空');
  for (const k of ['exeName', 'candidates', 'isMainTarget']) {
    if (adapter[k] === undefined) throw new Error('exe 通道：adapter 缺少 ' + k);
  }
}

export function createExeChannel(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  return {
    kind: 'exe',

    async status(adapter) {
      assertAdapter(adapter);
      const running = d.listProcesses(adapter);
      let debugPort = 0;
      for (const p of running) {
        const dp = d.debugPortOf(p);
        if (dp && await d.portAlive(dp)) { debugPort = dp; break; }
      }
      const exe = d.findExe(adapter, running) || '';
      // 应用版本只能从正在跑的调试服务问出来（/json/version 的 UA 里带 <uaToken>/<版本>）。
      let version = '';
      if (debugPort && adapter.uaToken) {
        try {
          const v = await d.fetchVersion(debugPort);
          const ua = String((v && (v['User-Agent'] || v.UserAgent)) || '');
          const token = String(adapter.uaToken).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const m = new RegExp(token + '/([\\d.]+)').exec(ua);
          version = m ? m[1] : '';
        } catch {}
      }
      return {
        installed: !!exe,
        running: running.length > 0,
        debugPort,
        skinActive: typeof adapter.skinActive === 'function' ? !!adapter.skinActive() : false,
        exe,
        version,
      };
    },

    async launch(adapter, { port = 0, restart = false } = {}) {
      assertAdapter(adapter);
      const running = d.listProcesses(adapter);
      if (running.length > 0) {
        for (const p of running) {
          const dp = d.debugPortOf(p);
          if (dp && await d.portAlive(dp)) return { port: dp }; // 已带调试端口在跑：直接复用，不重复启动
        }
        if (!restart) {
          throw new Error(adapter.name + ' 正在运行，需要由梦境换肤重新启动一次才能换肤' +
            (adapter.restartNote ? '（' + adapter.restartNote + '）' : '') + '。');
        }
        const st = await d.stopApp(adapter, { force: true });
        if (!st.stopped) throw new Error(adapter.name + ' 没能关闭，请手动退出后再试。');
      }
      const exe = d.findExe(adapter, d.listProcesses(adapter));
      if (!exe) throw new Error('找不到 ' + adapter.name + ' 安装位置。可设置环境变量 ' + adapter.envExe + ' 指向 ' + adapter.exeName + '。');
      let p = port || 0;
      if (p && await d.portAlive(p)) return { port: p }; // 指定端口上已有可用的调试服务
      if (!p) p = await d.freePort(); // freePort 由系统在 127.0.0.1 上分配空闲端口，天然避开占用（V-CH-exe）
      await d.launchWithPort(exe, p);
      await d.waitForMainTargets(adapter, p); // 轮询 /json/list 等主窗口出现（§4.3）
      return { port: p };
    },

    async stop(adapter, { graceful = true } = {}) {
      assertAdapter(adapter);
      // graceful=true：只做正常关闭（等同点窗口上的 ×），关不掉就如实返回 stopped:false，不强制结束；
      // graceful=false：正常关闭失败后允许强制结束（与 2.1 stopApp 的 force 语义一致）。
      return d.stopApp(adapter, { force: !graceful });
    },

    async targets(adapter, port) {
      assertAdapter(adapter);
      return d.listMainTargets(adapter, port);
    },
  };
}

export const exeChannel = createExeChannel();
