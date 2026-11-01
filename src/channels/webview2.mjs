// webview2 通道（T2-3，方案 §4.3 / §6 T2-3）：Tauri / WebView2 外壳没有 Electron 的命令行调试开关，
// 做法是启动宿主进程时给它带上环境变量 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=N，
// WebView2 运行时在宿主进程内初始化时读到它，就会开出 CDP 调试口，之后与 exe 通道一样连 /json/list。
// 要点（§4.3 webview2 行）：
// - 环境变量只出现在本次启动的子进程环境里：spawn 时传 env 副本，父进程 process.env 不动，
//   更不写系统 / 用户环境变量（不调 setx、不写注册表）。
// - 若继承环境里本来就有这个变量：保留其它参数，只替换其中已有的 --remote-debugging-port
//   （两个调试端口参数会互相打架，必须以本次的为准），合并逻辑是纯函数 webview2Env，可单测。
// - 进程侧（状态 / 关闭 / 主窗口列表）转调 core/app-process.mjs，不复制第二份进程逻辑；
//   与 exe 通道的唯一区别就是启动方式（环境变量而非命令行参数）。
// S-2 结论：本机未装 Tauri 外壳，「外壳是否用代码覆盖此环境变量」装后才能测，本通道的真机
// 验证（V-CH-webview2，Process Explorer 证据）待装后补，证据里如实标注。
// 全部系统操作可注入（deps），单测用假实现，不真启应用。
import { spawn } from 'node:child_process';
import { listProcesses, debugPortOf, findExe, freePort, portAlive, stopApp, listMainTargets, waitForMainTargets } from '../core/app-process.mjs';
import { fetchCdpJson } from '../core/cdp-core.mjs';

export const WEBVIEW2_ENV_KEY = 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS';

// 合并出子进程环境：base 的其它键原样保留；目标变量里已有参数保留，只把调试端口换成本次的。
export function webview2Env(base, port) {
  const env = { ...(base || {}) };
  const flag = '--remote-debugging-port=' + port;
  const prev = String(env[WEBVIEW2_ENV_KEY] || '').trim();
  const kept = prev ? prev.split(/\s+/).filter((a) => a && !/^--remote-debugging-port(=|$)/.test(a)) : [];
  env[WEBVIEW2_ENV_KEY] = [...kept, flag].join(' ');
  return env;
}

// 默认启动：只给子进程带合并后的环境，不带任何命令行参数（WebView2 宿主不认 Electron 式开关）。
function spawnWithEnv(exe, port, envBase) {
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false, env: webview2Env(envBase, port) });
  child.unref();
  return child.pid;
}

const defaultDeps = {
  listProcesses, debugPortOf, findExe, freePort, portAlive, stopApp, listMainTargets, waitForMainTargets,
  fetchVersion: (port) => fetchCdpJson(port, '/json/version', 1500),
  spawnWithEnv,
  envBase: () => process.env,
};

function assertAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('webview2 通道：adapter 不能为空');
  for (const k of ['exeName', 'candidates', 'isMainTarget']) {
    if (adapter[k] === undefined) throw new Error('webview2 通道：adapter 缺少 ' + k);
  }
}

export function createWebview2Channel(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  return {
    kind: 'webview2',

    async status(adapter) {
      assertAdapter(adapter);
      const running = d.listProcesses(adapter);
      let debugPort = 0;
      for (const p of running) {
        const dp = d.debugPortOf(p);
        if (dp && await d.portAlive(dp)) { debugPort = dp; break; }
      }
      const exe = d.findExe(adapter, running) || '';
      // 与 exe 通道同口径：版本只从正在跑的调试服务的 UA 里取（<uaToken>/<版本>）。
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
          if (dp && await d.portAlive(dp)) return { port: dp }; // 已带调试口在跑：直接复用
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
      if (!p) p = await d.freePort(); // 只绑 127.0.0.1 的空闲端口（freePort 天然避开占用）
      await d.spawnWithEnv(exe, p, d.envBase()); // 环境变量只进这个子进程（§4.3）
      await d.waitForMainTargets(adapter, p); // 轮询 /json/list 等主窗口出现
      return { port: p };
    },

    async stop(adapter, { graceful = true } = {}) {
      assertAdapter(adapter);
      return d.stopApp(adapter, { force: !graceful });
    },

    async targets(adapter, port) {
      assertAdapter(adapter);
      return d.listMainTargets(adapter, port);
    },
  };
}

export const webview2Channel = createWebview2Channel();

// 通道适配器形状与 exe 通道相同（exeName / candidates / isMainTarget ...），直接复用其适配函数。
export { profileToChannelAdapter } from './exe.mjs';
