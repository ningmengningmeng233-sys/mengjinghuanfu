// 脱敏 DOM 快照工具（Q-1，方案 §6 Q-1）：连上一个已经带调试端口运行的目标应用，
// 把主窗口 DOM 抓成脱敏 HTML 快照（只有结构、没有内容），保存为部件命中率夹具。
//
// 用法：
//   node tools/dom-snapshot.mjs --port <调试端口> [--app <适配器 id>] [--url <URL 子串>] [--out <文件>]
//   --app 给出时按该适配器的主窗口判定挑目标；否则取第一个页面目标（或 --url 命中的）。
//   不给 --out 就打到标准输出。
//
// 边界：只连 127.0.0.1 的 CDP 端口（core/cdp-core.mjs 的回环校验），不启动、
// 不关闭任何应用；抓取表达式只读结构（见 core/dom-snapshot.mjs 的脱敏口径）。
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fetchCdpJson, CdpSession } from '../src/core/cdp-core.mjs';
import { captureSnapshotTree, snapshotFileText } from '../src/core/dom-snapshot.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';

export function parseArgs(argv) {
  const o = { port: 0, app: '', url: '', out: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--port' && v) { o.port = Number(v); i++; }
    else if (a === '--app' && v) { o.app = v; i++; }
    else if (a === '--url' && v) { o.url = v; i++; }
    else if (a === '--out' && v) { o.out = v; i++; }
    else throw new Error('不认识的参数：' + a);
  }
  if (!Number.isInteger(o.port) || o.port <= 0 || o.port > 65535) {
    throw new Error('必须给出 --port <调试端口>（应用需已由梦境换肤带调试端口启动）');
  }
  return o;
}

export async function pickTarget(port, { app = '', url = '' } = {}) {
  const targets = await fetchCdpJson(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('CDP 目标列表不是数组');
  let pages = targets.filter((t) => t && t.type === 'page' && t.webSocketDebuggerUrl);
  if (app) {
    const profile = appRuntimeById(app);
    pages = pages.filter((t) => profile.isMainTarget(t, port));
  } else if (url) {
    pages = pages.filter((t) => String(t.url || '').includes(url));
  }
  if (!pages.length) throw new Error('没找到符合条件的页面目标（应用是否已带调试端口启动？）');
  return pages[0];
}

export async function run(argv) {
  const o = parseArgs(argv);
  const target = await pickTarget(o.port, o);
  const session = await new CdpSession(target, o.port).open();
  let tree;
  try {
    tree = await captureSnapshotTree(session);
  } finally {
    session.close();
  }
  const text = snapshotFileText(tree, { app: o.app, synthetic: false });
  if (o.out) {
    writeFileSync(o.out, text, 'utf8');
    console.error('快照已写入 ' + o.out);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => { console.error('FAILED: ' + (e && e.message ? e.message : String(e))); process.exit(1); },
  );
}
