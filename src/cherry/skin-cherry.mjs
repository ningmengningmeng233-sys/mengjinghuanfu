// Cherry Studio / ZCode 换肤（CDP 通道）。做法与 Codex Dream Skin 原型一致：
// 带本机调试端口启动应用 → 往主窗口注入一个 <style>，壁纸任意大小、可还原、不碰官方文件和设置。
// 所有命令都可加 --app cherry|zcode（默认 cherry）；两端共用同一套主题、参数和「我的皮肤」。
//
// 用法：
//   node skin-cherry.mjs apply   [--preset dark-gold|b16-xxx|wp-1-tonal-dark] [--image 壁纸路径]
//                                [--set id=值 ...] [--focus-x 50] [--focus-y 40] [--restart]
//   node skin-cherry.mjs restore
//   node skin-cherry.mjs presets    打印全部配色（JSON：内置 + base16 配色库 + 上次的壁纸取色）
//   node skin-cherry.mjs schema     打印可调参数声明（JSON，Obsidian Style Settings 字段格式）
//   node skin-cherry.mjs live       实时预览会话：从 stdin 逐行读 JSON 指令，直接改正在运行的 Cherry，见 live()
//   node skin-cherry.mjs launch     用上次的皮肤启动 Cherry（桌面快捷方式就调它）
//   node skin-cherry.mjs shortcut   在桌面创建「Cherry Studio (Dream Skin)」快捷方式
//   node skin-cherry.mjs status
//   我的皮肤（两端共用）：
//   node skin-cherry.mjs skin-save   --file state.json   （{name, preset|palette, values, image, overwrite}）
//   node skin-cherry.mjs skin-rename --id my-xxx --name 新名字
//   node skin-cherry.mjs skin-delete --id my-xxx
//   node skin-cherry.mjs skin-export --id my-xxx --out 文件.dsskin
//   node skin-cherry.mjs skin-import --file 文件.dsskin
//   主题库（dreamskin.cc 社区主题，下载到本机自用）：
//   node skin-cherry.mjs gallery-list [--sort popular|favorites|recent] [--offset 0] [--limit 24] [--q 关键词] [--style 二次元|真人|风景|城市|国风|游戏影视|科幻|极简|萌趣|其他]
//   node skin-cherry.mjs gallery-get  --id ver_xxx      下载后可用 --preset ds-ver_xxx 应用 / 预览 / 存为我的皮肤
// 退出码：0 成功 / 1 失败且未改动 / 2 结果不确定 / 3 需要重启 Cherry（加 --restart 重试）
// 内部：node skin-cherry.mjs watch --port N   （常驻守护，Cherry 刷新或重开窗口时自动补上皮肤）
import { existsSync, readFileSync, writeFileSync, rmSync, chmodSync, watch as watchFs } from 'node:fs';
import { homedir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './lib/cherry-env.mjs';
import { SETTINGS, buildVarsCss, defaultValues, imageDataUri, MAX_IMAGE_BYTES_CDP, CHERRY_PRESETS, PRESET_ALIASES } from './lib/cherry-skin-css.mjs';
import { listPalettes, resolvePalette, wallpaperPalettes, bundledImage, GROUPS, WALL_DIR } from './lib/palettes.mjs';
import { saveSkin, renameSkin, deleteSkin, exportSkin, importSkin, getSkin } from './lib/user-skins.mjs';
import { appById } from './lib/apps.mjs';
import { listGallery, fetchTheme, removeTheme } from './lib/gallery.mjs';
import { createInterface } from 'node:readline';
import { slimImage } from './lib/wall-cache.mjs';
import { CdpSession, fetchCdpJson } from './cdp/cdp-core.mjs';
import { listProcesses, debugPortOf, findExe, freePort, portAlive, stopApp, launchWithPort, listMainTargets, waitForMainTargets as waitTargets } from './cdp/app-process.mjs';

const argAt = (name) => { const a = process.argv.indexOf(name); return a > 0 ? process.argv[a + 1] : undefined; };
const APP = appById(argAt('--app') || 'cherry');
const RULES = APP.rules;
const STYLE_ID = APP.styleId;
const LIVE_ID = APP.liveId; // 实时预览写这一块（规则段 + 变量段），排在皮肤后面覆盖它
const READY = APP.readySelector;
const EXIT = { OK: 0, FAILED: 1, UNCERTAIN: 2, NEEDS_RESTART: 3 };
const listCherryProcesses = () => listProcesses(APP);
const findCherryExe = (running) => findExe(APP, running);
const stopCherry = (opts) => stopApp(APP, opts);
const launchCherryWithPort = launchWithPort;
const waitForMainTargets = (port, ms) => waitTargets(APP, port, ms);
const listCherryMainTargets = (port) => listMainTargets(APP, port);

const dir = dataDir(APP.id);
const SKIN_FILE = join(dir, 'active-skin.css');
const STATE_FILE = join(dir, 'cdp-session.json');
const CHOICE_FILE = join(dir, 'last-choice.json');
const CHECKED_FILE = join(dir, 'checked-version.json'); // 上次体检通过时的应用版本
function parseArgs(argv) {
  const o = { cmd: argv[0] || 'status', preset: 'ink-gold', image: '', restart: false, port: 0, focusX: NaN, focusY: NaN, values: {} };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--preset' && v) { o.preset = v; i++; }
    else if (a === '--image' && v) { o.image = v; i++; }
    else if (a === '--no-image') o.noImage = true;
    else if (a === '--focus-x' && v) { o.focusX = Number(v); i++; }
    else if (a === '--focus-y' && v) { o.focusY = Number(v); i++; }
    else if (a === '--port' && v) { o.port = Number(v); i++; }
    else if (a === '--set' && v) { const j = v.indexOf('='); if (j > 0) o.values[v.slice(0, j)] = coerce(v.slice(j + 1)); i++; }
    else if (a === '--restart') o.restart = true;
    else if (a === '--all') o.all = true;
    else if (a === '--app' && v) { o.app = v; i++; }
    else if (a === '--from' && v) { o.from = v; i++; }
    else if (a === '--file' && v) { o.file = v; i++; }
    else if (a === '--id' && v) { o.id = v; i++; }
    else if (a === '--name' && v) { o.name = v; i++; }
    else if (a === '--out' && v) { o.out = v; i++; }
    else if (a === '--sort' && v) { o.sort = v; i++; }
    else if (a === '--dir' && v) { o.dir = v; i++; }
    else if (a === '--offset' && v) { o.offset = Number(v); i++; }
    else if (a === '--limit' && v) { o.limit = Number(v); i++; }
    else if (a === '--q' && v) { o.q = v; i++; }
    else if (a === '--style' && v) { o.style = v; i++; }
    else if (a === '--author' && v) { o.author = v; i++; }
    else if (a === '--license' && v) { o.license = v; i++; }
  }
  return o;
}

function coerce(x) {
  if (x === 'true') return true;
  if (x === 'false') return false;
  return x !== '' && Number.isFinite(Number(x)) ? Number(x) : x;
}

const readState = () => { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; } };
const writeState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8');
const say = (word, msg) => console.log(`${word}: ${msg}`);

// Cherry 自己的 <style id="user-defined-custom-css"> 可能之后才插入；始终把皮肤挪回最后，预览块再排在皮肤之后。
// 观察器带版本号：旧版注入的观察器会被换掉（旧版只认皮肤一块，会把预览块压到下面）。
const KEEP_LAST = `if (window.__dreamSkinObserverV !== 2) {
      if (window.__dreamSkinObserver) window.__dreamSkinObserver.disconnect();
      const order = () => {
        for (const id of [${JSON.stringify(STYLE_ID)}, ${JSON.stringify(LIVE_ID)}]) {
          const el = document.getElementById(id);
          if (el && el.parentNode === head) head.appendChild(el);
        }
      };
      window.__dreamSkinObserver = new MutationObserver(() => {
        const a = document.getElementById(${JSON.stringify(STYLE_ID)}), b = document.getElementById(${JSON.stringify(LIVE_ID)});
        const last = head.lastElementChild;
        if ((b && last !== b) || (!b && a && last !== a)) order();
      });
      window.__dreamSkinObserver.observe(head, { childList: true });
      window.__dreamSkinObserverV = 2;
    }`;

// 注入 / 移除脚本。appendChild 每次都把我们的 <style> 挪到 <head> 最后，压过 Cherry 自己的自定义 CSS。
const injectExpr = (css) => `(() => {
  const put = () => {
    let s = document.getElementById(${JSON.stringify(STYLE_ID)});
    if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(STYLE_ID)}; }
    s.textContent = ${JSON.stringify(css)};
    const head = document.head || document.documentElement;
    head.appendChild(s);
    const lv = document.getElementById(${JSON.stringify(LIVE_ID)}); if (lv) head.appendChild(lv);
    ${KEEP_LAST}
    return s.textContent.length;
  };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', put, { once: true }); return -1; }
  return put();
})()`;
const removeExpr = `(() => { if (window.__dreamSkinObserver) { window.__dreamSkinObserver.disconnect(); window.__dreamSkinObserver = null; window.__dreamSkinObserverV = 0; } for (const id of [${JSON.stringify(STYLE_ID)}, ${JSON.stringify(LIVE_ID)}]) { const s = document.getElementById(id); if (s) s.remove(); } return !document.getElementById(${JSON.stringify(STYLE_ID)}); })()`;
// 实时预览：变量段写进 LIVE_ID，始终排在 <head> 最后。css 为空串 = 撤掉预览。
const liveExpr = (css) => `(() => {
  const css = ${JSON.stringify(css || '')};
  const head = document.head || document.documentElement;
  ${KEEP_LAST}
  let s = document.getElementById(${JSON.stringify(LIVE_ID)});
  if (!css) { if (s) s.remove(); return 0; }
  if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(LIVE_ID)}; }
  s.textContent = css;
  head.appendChild(s);
  return css.length;
})()`;
const verifyExpr = `(() => {
  const s = document.getElementById(${JSON.stringify(STYLE_ID)});
  const bg = getComputedStyle(document.body, '::before').backgroundImage || '';
  const user = ${JSON.stringify(APP.userCssId)} ? document.getElementById(${JSON.stringify(APP.userCssId)}) : null;
  return { len: s ? s.textContent.length : 0, last: !!s && s === document.head.lastElementChild,
           userCss: user ? user.textContent.length : 0,
           sidebar: !!document.querySelector(${JSON.stringify(READY)}), wallpaper: bg.includes('url(') };
})()`;

async function withSession(target, port, fn) {
  const session = await new CdpSession(target, port).open();
  try { return await fn(session); } finally { session.close(); }
}

// 找一个能用的调试端口：已有会话 → 正在跑且带端口的 Cherry → 0。
async function currentPort() {
  const st = readState();
  if (st?.port && await portAlive(st.port)) return st.port;
  const main = listCherryProcesses().find((p) => p.isMain && debugPortOf(p));
  if (main && await portAlive(debugPortOf(main))) return debugPortOf(main);
  return 0;
}

function stopWatcher() {
  const st = readState();
  if (st?.watcherPid) { try { process.kill(st.watcherPid); } catch {} }
}

function startWatcher(port) {
  stopWatcher();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'watch', '--port', String(port), '--app', APP.id],
    { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}

// 确保有一个带调试端口的 Cherry：已有端口直接用；Cherry 开着但没端口 → 需要重启（--restart 才动手）。
async function ensurePort(o) {
  let port = await currentPort();
  if (port) return { port };
  const running = listCherryProcesses();
  const exe = findCherryExe(running);
  if (!exe) { say('FAILED', `找不到 ${APP.name} 安装位置。可设置环境变量 ${APP.envExe} 指向 ${APP.exeName}。`); return { code: EXIT.FAILED }; }
  if (running.length > 0) {
    if (!o.restart) {
      say('NEEDS_RESTART', `${APP.name} 正在运行，需要由梦境换肤重新启动一次才能换肤（${APP.restartNote}）。`);
      return { code: EXIT.NEEDS_RESTART };
    }
    const stop = await stopCherry({ force: true });
    if (!stop.stopped) { say('FAILED', `${APP.name} 没能关闭，请手动退出（托盘图标右键 → 退出）后再试。`); return { code: EXIT.FAILED }; }
  }
  port = await freePort();
  await launchCherryWithPort(exe, port);
  return { port };
}

function choiceValues(o) {
  const v = { ...(o.values || {}) };
  if (Number.isFinite(o.focusX)) v['focus-x'] = o.focusX;
  if (Number.isFinite(o.focusY)) v['focus-y'] = o.focusY;
  return v;
}

async function apply(o) {
  // 我的皮肤：自带参数和壁纸；命令行上另给的 --image / --set 优先。
  let mine = null;
  if (!o.palette && /^my-/.test(String(o.preset || ''))) { mine = getSkin(o.preset); if (!o.image && mine.image) o.image = mine.image; }
  // 主题库主题自带壁纸：没另给 --image（也没写 --no-image）时用它自己的。
  if (!o.palette && !o.image && !o.noImage) o.image = bundledImage(o.preset);
  if (o.noImage) o.image = '';
  if (o.image) o.image = resolve(o.image);
  if (o.image) imageDataUri(o.image, MAX_IMAGE_BYTES_CDP); // 先校验格式和大小，坏图不去动应用
  const palette = o.palette ? resolvePalette(o.palette) : resolvePalette(o.preset);
  const values = { ...(mine ? mine.values : {}), ...choiceValues(o) };

  const ep = await ensurePort(o);
  if (!ep.port) return ep.code;
  const port = ep.port;

  let targets;
  try { targets = await waitForMainTargets(port, 60000); }
  catch (e) { say('FAILED', e.message); return EXIT.FAILED; }

  // 大壁纸先瘦身（在应用自己的渲染进程里缩放转 WebP，带缓存），注入更快、内存更省。
  let slim = o.image;
  if (o.image) { try { slim = await withSession(targets[0], port, (s) => slimImage(o.image, s)); } catch {} }
  const imageUri = slim ? imageDataUri(slim, MAX_IMAGE_BYTES_CDP) : '';
  const css = RULES + '\n' + buildVarsCss(palette, imageUri, values);

  // 先落盘，守护进程和后续刷新都读这一份。
  writeFileSync(SKIN_FILE, css, 'utf8');
  let verified = 0, leftoverUserCss = false;
  for (const t of targets) {
    try {
      const v = await withSession(t, port, async (s) => {
        // 等 React 把主界面画出来（主界面标志元素出现），最多 20 秒。
        for (let i = 0; i < 40; i++) {
          if (await s.evaluate(`!!document.querySelector(${JSON.stringify(READY)})`)) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        await s.evaluate(injectExpr(css));
        await s.evaluate(liveExpr(''));
        return s.evaluate(verifyExpr);
      });
      if (v.len === css.length && v.sidebar && (!imageUri || v.wallpaper)) verified++;
      if (v.userCss > 0) leftoverUserCss = true;
    } catch {}
  }
  const watcherPid = startWatcher(port);
  // launch 传的是完整 palette 对象（不带 key），用 presetKey 把「我的皮肤」等的 key 带回来，否则总控台「使用中」角标认不出。
  const savedKey = palette.key || o.presetKey || '';
  writeState({ port, watcherPid, preset: savedKey || palette.name, image: o.image || '', at: new Date().toISOString() });
  writeFileSync(CHOICE_FILE, JSON.stringify({ preset: savedKey, palette, image: o.image || '', values }, null, 2), 'utf8');

  const hint = leftoverUserCss ? '注意：Cherry 设置 → 外观 → 自定义 CSS 里还有内容（可能是旧版换肤写进去的），建议清空，免得和皮肤打架。' : '';
  if (verified === targets.length) {
    say('SUCCESS', `已应用 [${palette.name}]${o.image ? ' + 自定义壁纸' : ''}，${APP.name} 主窗口校验通过。以后请用梦境换肤启动 ${APP.name}，皮肤会自动带上。${hint}`);
    return EXIT.OK;
  }
  say('UNCERTAIN', `已注入，但 ${targets.length - verified}/${targets.length} 个主窗口没通过校验（可能还在加载，或这一版 ${APP.name} 界面结构变了）。看一眼窗口；不对就点「还原」。`);
  return EXIT.UNCERTAIN;
}

function presets(o) {
  const list = listPalettes({ all: !!o.all }).map((p) => ({ key: p.key, name: p.name, group: p.group, groupName: GROUPS[p.group] || p.group,
    dark: !!p.dark, bg: p.bg, panel: p.panel, bubble: p.bubble, accent: p.accent, glow: p.glow || p.accent, text: p.text, muted: p.muted || p.text,
    desc: p.desc || '', from: p.from || p.author || '', accentText: p.accentText || '',
    tune: p.tune || {},
    ...(p.group === 'mine' ? { values: p.values || {}, image: p.image || '' } : {}),
    ...(p.group === 'anime' ? { image: p.image || '' } : {}),
    ...(p.group === 'gallery' ? galleryFields(p) : {}) }));
  process.stdout.write(JSON.stringify({ count: list.length, palettes: list }) + '\n');
  return EXIT.OK;
}

const galleryFields = (p) => ({ image: p.image || '', author: p.author || '', license: p.license || '', url: p.url || '',
  downloads: p.downloads || 0, favorites: p.favorites || 0, downloaded: !!p.downloaded });
const paletteOut = (p) => ({ key: p.key, name: p.name, group: p.group, groupName: GROUPS[p.group] || p.group, dark: !!p.dark,
  bg: p.bg, panel: p.panel, bubble: p.bubble, accent: p.accent, glow: p.glow, text: p.text, muted: p.muted, accentText: p.accentText,
  desc: p.desc || '', from: p.from || '', tune: p.tune || {}, ...galleryFields(p) });

// 主题库（dreamskin.cc）：列表带缩略图；get 把整套主题下载到本机并返回可直接预览的条目。
async function galleryList(o) {
  try {
    const r = await listGallery({ sort: o.sort, offset: o.offset, limit: o.limit, q: o.q, style: o.style });
    process.stdout.write(JSON.stringify({ ok: true, total: r.total, offset: r.offset, palettes: r.items.map(paletteOut) }) + '\n');
    return EXIT.OK;
  } catch (e) { process.stdout.write(JSON.stringify({ ok: false, msg: '主题库：' + e.message }) + '\n'); return EXIT.FAILED; }
}
async function galleryGet(o) {
  try {
    const p = await fetchTheme(String(o.id || '').replace(/^ds-/, ''), { name: o.name, author: o.author, license: o.license });
    process.stdout.write(JSON.stringify({ ok: true, palette: paletteOut(p) }) + '\n');
    return EXIT.OK;
  } catch (e) { process.stdout.write(JSON.stringify({ ok: false, msg: '下载主题失败：' + e.message }) + '\n'); return EXIT.FAILED; }
}

// 两端同步：把另一个应用（--from）最后保存的皮肤用到当前应用（--app）。
// 当前应用正带皮肤运行 → 立即换；没运行或没带皮肤 → 只记下来，下次「用皮肤启动」就是这套（不会去重启它）。
async function sync(o) {
  const from = o.from || (APP.id === 'cherry' ? 'zcode' : 'cherry');
  let src;
  try { src = JSON.parse(readFileSync(join(dataDir(from), 'last-choice.json'), 'utf8')); }
  catch { say('FAILED', `${appById(from).name} 还没保存过皮肤`); return EXIT.FAILED; }
  const port = await currentPort();
  if (!port) {
    writeFileSync(CHOICE_FILE, JSON.stringify(src, null, 2), 'utf8');
    say('SUCCESS', `已同步到 ${APP.name}：下次用皮肤启动 ${APP.name} 就是这套。`);
    return EXIT.OK;
  }
  return apply({ ...o, preset: src.preset, image: src.image || '', noImage: !src.image, values: src.values || {} });
}

function schema() {
  process.stdout.write(JSON.stringify({ ...SETTINGS, defaults: { dark: defaultValues({ dark: true }), light: defaultValues({ dark: false }) } }) + '\n');
  return EXIT.OK;
}

// 实时预览会话。stdin 每行一个 JSON：
//   {"op":"set","preset":"b16-nord","image":"D:\\wall.jpg","values":{"blur":20}}  → 立即改 Cherry（只写变量段）
//   {"op":"palette","image":"D:\\wall.jpg"}   → 从壁纸取色，回一行 {"op":"palette","palettes":[...]}
//   {"op":"commit"}  → 把当前预览保存为正式皮肤（等同 apply，守护进程接管）
//   {"op":"cancel"}  → 撤掉预览，回到已保存的皮肤
//   {"op":"quit"}
// 每条指令回一行 JSON：{"op":..,"ok":true|false,"msg":".."}。需要 Cherry 已由 Dream Skin 带调试端口启动。
async function live() {
  const port = await currentPort();
  const reply = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  if (!port) { reply({ op: 'hello', ok: false, code: 'NO_PORT', msg: `${APP.name} 还没有用梦境换肤启动，先点一次「用皮肤启动」。` }); return EXIT.NEEDS_RESTART; }
  let targets = [];
  try { targets = await listCherryMainTargets(port); } catch {}
  if (!targets.length) { reply({ op: 'hello', ok: false, code: 'NO_TARGET', msg: `没找到 ${APP.name} 主窗口。` }); return EXIT.FAILED; }
  const sessions = [];
  for (const t of targets) { try { sessions.push(await new CdpSession(t, port).open()); } catch {} }
  if (!sessions.length) { reply({ op: 'hello', ok: false, code: 'NO_SESSION', msg: `连不上 ${APP.name} 主窗口。` }); return EXIT.FAILED; }
  reply({ op: 'hello', ok: true, app: APP.id, port, windows: sessions.length });

  const imageCache = new Map();
  // 预览用瘦身后的图（第一次稍慢，之后读缓存）；取色仍用原图。
  const uriOf = async (path, slim = true) => {
    if (!path) return '';
    const full = resolve(path);
    const k = (slim ? 's|' : 'o|') + full;
    if (!imageCache.has(k)) {
      if (imageCache.size > 4) imageCache.clear();
      const p = slim ? await slimImage(full, sessions.find((x) => !x.closed)) : full;
      imageCache.set(k, imageDataUri(p, MAX_IMAGE_BYTES_CDP));
    }
    return imageCache.get(k);
  };
  let current = null; // { palette, image, values }
  const everywhere = (expr) => Promise.all(sessions.filter((s) => !s.closed).map((s) => s.evaluate(expr).catch(() => null)));

  // 合并连续的 set：只处理最后一条，拖滑块时不堆积。
  let pending = null, busy = false;
  const runSet = async () => {
    if (busy) return; busy = true;
    try {
      while (pending) {
        const m = pending; pending = null;
        try {
          const palette = m.palette ? resolvePalette(m.palette) : resolvePalette(m.preset || 'ink-gold');
          // 没带 image 字段时，主题库主题用自带壁纸；带了（哪怕是空串）就听调用方的。
          const image = m.image !== undefined ? (m.image || '') : (m.palette ? '' : bundledImage(m.preset));
          // 预览块里带上规则段：即使正在用的是旧版皮肤，预览也完整生效（规则段只有几 KB）。
          const vars = buildVarsCss(palette, await uriOf(image), m.values || {});
          await everywhere(liveExpr(RULES + '\n' + vars));
          current = { palette, image, values: m.values || {} };
          reply({ op: 'set', ok: true, id: m.id ?? null });
        } catch (e) { reply({ op: 'set', ok: false, id: m.id ?? null, msg: e.message }); }
      }
    } finally { busy = false; }
  };

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (sessions.every((s) => s.closed)) { reply({ op: m.op, ok: false, code: 'CLOSED', msg: `${APP.name} 窗口已关闭。` }); break; }
    try {
      if (m.op === 'set') { pending = m; runSet(); }
      else if (m.op === 'palette') {
        const list = await wallpaperPalettes(sessions[0], await uriOf(m.image, false), resolve(m.image));
        reply({ op: 'palette', ok: true, palettes: list });
      } else if (m.op === 'commit') {
        while (busy || pending) await new Promise((r) => setTimeout(r, 30));
        if (!current) { reply({ op: 'commit', ok: false, msg: '还没有预览内容。' }); continue; }
        const css = RULES + '\n' + buildVarsCss(current.palette, await uriOf(current.image), current.values);
        writeFileSync(SKIN_FILE, css, 'utf8');
        await everywhere(injectExpr(css));
        await everywhere(liveExpr(''));
        const st = readState() || {};
        if (!st.watcherPid) st.watcherPid = startWatcher(port);
        writeState({ ...st, port, preset: current.palette.key || current.palette.name, image: current.image, at: new Date().toISOString() });
        writeFileSync(CHOICE_FILE, JSON.stringify({ preset: current.palette.key || '', palette: current.palette, image: current.image, values: current.values }, null, 2), 'utf8');
        reply({ op: 'commit', ok: true, msg: `已保存 [${current.palette.name}]${current.image ? ' + 壁纸' : ''}` });
      } else if (m.op === 'cancel') {
        while (busy || pending) await new Promise((r) => setTimeout(r, 30));
        await everywhere(liveExpr(''));
        current = null;
        reply({ op: 'cancel', ok: true });
      } else if (m.op === 'quit') break;
    } catch (e) { reply({ op: m.op, ok: false, msg: e.message }); }
  }
  // 会话结束（总控台关闭）时撤掉未保存的预览，Cherry 回到已保存的皮肤。
  await everywhere(liveExpr(''));
  for (const s of sessions) s.close();
  return EXIT.OK;
}

// 旧版本（带桌宠的 2.1 测试版）留在页面里的桌宠：关皮肤时顺手清掉。
// 兼容保留说明（T0-2）：桌宠功能本身已删除，这里只负责清理旧版残留节点，保留到 3.1 后删除。
const PET_CLEANUP = `(() => { try { window.__dsPet && window.__dsPet.destroy && window.__dsPet.destroy(); } catch {} document.getElementById('dream-skin-pet')?.remove(); delete window.__dsPet; return 1; })()`;

async function restore() {
  rmSync(SKIN_FILE, { force: true });
  stopWatcher();
  const port = await currentPort();
  if (!port) {
    rmSync(STATE_FILE, { force: true });
    say('SUCCESS', `皮肤已关闭。梦境换肤不改 ${APP.name} 的文件和设置，正常打开就是原版。`);
    return EXIT.OK;
  }
  let removed = 0, total = 0;
  try {
    const targets = await listCherryMainTargets(port);
    total = targets.length;
    for (const t of targets) {
      try { if (await withSession(t, port, async (s) => { await s.evaluate(PET_CLEANUP).catch(() => null); return s.evaluate(removeExpr); })) removed++; } catch {}
    }
  } catch {}
  rmSync(STATE_FILE, { force: true });
  if (removed === total) { say('SUCCESS', `已从正在运行的 ${APP.name} 移除皮肤，立即恢复原版外观。`); return EXIT.OK; }
  say('UNCERTAIN', `部分窗口没确认移除。重启一次 ${APP.name} 即可彻底恢复原版。`);
  return EXIT.UNCERTAIN;
}

async function launch(o) {
  let c = null;
  try { c = JSON.parse(readFileSync(CHOICE_FILE, 'utf8')); } catch {}
  if (!c) { say('FAILED', '还没应用过皮肤，请先在梦境换肤里选预设并点「应用」。'); return EXIT.FAILED; }
  if (c.image && !existsSync(c.image)) c.image = '';
  const values = c.values || { 'focus-x': Number(c.focusX), 'focus-y': Number(c.focusY) };
  return apply({ ...o, preset: c.preset || 'ink-gold', presetKey: c.preset || '', palette: c.palette || null, image: c.image, values });
}

function shortcut() {
  const exe = findCherryExe();
  const script = fileURLToPath(import.meta.url);
  if (process.platform === 'darwin') {
    // macOS：桌面放一个双击可运行的 .command（终端会一闪而过）。
    const f = join(homedir(), 'Desktop', APP.shortcutName + '.command');
    const sq = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
    writeFileSync(f, `#!/bin/bash\n${sq(process.execPath)} ${sq(script)} launch --restart --app ${APP.id} >/dev/null 2>&1 &\nsleep 1; osascript -e 'tell application "Terminal" to close front window' >/dev/null 2>&1 &\n`, 'utf8');
    chmodSync(f, 0o755);
    say('SUCCESS', `桌面已创建「${APP.shortcutName}」，以后双击它打开 ${APP.name} 就自动带皮肤。`);
    return EXIT.OK;
  }
  const psq = (v) => "'" + String(v).replace(/'/g, "''") + "'";
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ${psq(APP.shortcutName + '.lnk')}));` +
    `$s.TargetPath=${psq(process.execPath)};$s.Arguments=${psq('"' + script + '" launch --restart --app ' + APP.id)};` +
    `$s.WindowStyle=7;${exe ? `$s.IconLocation=${psq(exe + ',0')};` : ''}$s.Save()`], { windowsHide: true });
  say('SUCCESS', `桌面已创建「${APP.shortcutName}」快捷方式，以后用它打开 ${APP.name} 就自动带皮肤。`);
  return EXIT.OK;
}

async function status() {
  const port = await currentPort();
  const st = readState();
  const running = listCherryProcesses();
  // cherryRunning / cherryExe 字段名保留（总控台旧版本按它解析），新增 app / running / exe。
  console.log(JSON.stringify({ app: APP.id, cherryRunning: running.length > 0, running: running.length > 0, debugPort: port,
    skinActive: existsSync(SKIN_FILE), preset: st?.preset ?? null, cherryExe: findCherryExe(running) || null, exe: findCherryExe(running) || null }, null, 2));
  return EXIT.OK;
}

// 守护（事件驱动）：
//  · 浏览器级 CDP 会话订阅 Target.targetCreated / targetInfoChanged / targetDestroyed → 新开或换页的主窗口立刻补皮肤；
//  · 每个主窗口注册 addScriptToEvaluateOnNewDocument（刷新时文档一建好就带皮肤），
//    并监听 Page.frameNavigated / Runtime.executionContextCreated 再补一次（防 SPA 换页或脚本没赶上）；
//  · fs.watch 盯皮肤文件：被换就立即重注入，被删（已还原）就退出；
//  · 30 秒心跳兜底（事件漏掉、浏览器级会话连不上时退回轮询）；端口连续 3 次不通 = 应用已退出，自己结束。
const WATCH_HEARTBEAT_MS = 30000;
async function watch(o) {
  const port = o.port;
  const sessions = new Map(); // targetId → { session, scriptId, css, timer }
  let browser = null, misses = 0, running = false, again = false, timer = null, stopped = false;
  let finish;
  const done = new Promise((r) => { finish = r; });

  const readCss = () => { try { return readFileSync(SKIN_FILE, 'utf8'); } catch { return null; } };
  const stop = () => { if (stopped) return; stopped = true; finish(); };
  const schedule = (ms = 120) => { if (stopped) return; clearTimeout(timer); timer = setTimeout(reconcile, ms); };

  // 同一窗口短时间内连着来几个事件（导航 + 新上下文）只补一次。
  const reinject = (entry) => {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { if (entry.css && !entry.session.closed) entry.session.evaluate(injectExpr(entry.css)).catch(() => {}); }, 80);
  };

  async function openBrowser() {
    if (browser && !browser.closed) return;
    browser = null;
    try {
      const v = await fetchCdpJson(port, '/json/version', 1500);
      const b = await new CdpSession({ webSocketDebuggerUrl: v.webSocketDebuggerUrl }, port).open({ enable: false });
      for (const ev of ['Target.targetCreated', 'Target.targetInfoChanged', 'Target.targetDestroyed']) b.on(ev, () => schedule());
      b.ws.addEventListener('close', () => { if (!stopped) schedule(1000); });
      await b.send('Target.setDiscoverTargets', { discover: true });
      browser = b;
    } catch { browser = null; }
  }

  async function reconcile() {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const css = readCss();
      if (css === null) return stop(); // 已还原
      let targets;
      try { targets = await listCherryMainTargets(port); misses = 0; }
      catch { if (++misses >= 3) return stop(); schedule(1000); return; }
      await openBrowser();
      const live = new Set(targets.map((t) => t.id));
      for (const [id, entry] of sessions) {
        if (!live.has(id) || entry.session.closed) { clearTimeout(entry.timer); entry.session.close(); sessions.delete(id); }
      }
      for (const t of targets) {
        let entry = sessions.get(t.id);
        try {
          if (!entry) {
            const session = await new CdpSession(t, port).open();
            entry = { session, scriptId: null, css: null, timer: null };
            const e = entry;
            session.on('Page.frameNavigated', (p) => { if (!p.frame?.parentId) reinject(e); });
            session.on('Runtime.executionContextCreated', (p) => { if (p.context?.auxData?.isDefault !== false) reinject(e); });
            session.ws.addEventListener('close', () => { if (!stopped) schedule(500); });
            sessions.set(t.id, entry);
          }
          if (entry.css !== css) {
            if (entry.scriptId) await entry.session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: entry.scriptId });
            const r = await entry.session.send('Page.addScriptToEvaluateOnNewDocument', { source: injectExpr(css) });
            entry.scriptId = r.identifier;
            await entry.session.evaluate(injectExpr(css));
            entry.css = css;
          }
        } catch {
          if (entry) { clearTimeout(entry.timer); entry.session.close(); sessions.delete(t.id); }
        }
      }
      schedule(browser ? WATCH_HEARTBEAT_MS : 3000); // 没有浏览器级事件时退回 3 秒轮询
    } finally {
      running = false;
      if (again && !stopped) { again = false; schedule(0); }
    }
  }

  let fw = null;
  try {
    const name = SKIN_FILE.split(/[\\/]/).pop();
    fw = watchFs(dir, (_ev, f) => { if (!f || f === name) schedule(150); });
  } catch {}
  schedule(0);
  await done;
  clearTimeout(timer);
  try { fw?.close(); } catch {}
  try { browser?.close(); } catch {}
  for (const e of sessions.values()) { clearTimeout(e.timer); e.session.close(); }
  return EXIT.OK;
}

// 我的皮肤：结果一律输出一行 JSON，总控台按它刷新列表。
function skinCmd(fn) {
  return async (o) => {
    try { process.stdout.write(JSON.stringify({ ok: true, ...(await fn(o)) }) + '\n'); return EXIT.OK; }
    catch (e) { process.stdout.write(JSON.stringify({ ok: false, msg: e.message }) + '\n'); return EXIT.FAILED; }
  };
}
const skinSave = skinCmd((o) => {
  const m = JSON.parse(readFileSync(o.file, 'utf8').replace(/^\uFEFF/, ''));
  const palette = m.palette ? resolvePalette(m.palette) : resolvePalette(m.preset || 'ink-gold');
  const based = m.palette ? null : listPalettes().find((p) => p.key === m.preset);
  const skin = saveSkin({ name: m.name, palette, values: m.values || {}, image: m.image === undefined ? undefined : (m.image || ''),
    basedOn: based && based.group !== 'mine' ? based.key : (m.basedOn || ''), basedOnName: based && based.group !== 'mine' ? based.name : (m.basedOnName || ''),
    overwrite: m.overwrite || '' });
  return { skin: { key: skin.key, name: skin.name } };
});
const skinRename = skinCmd((o) => { const s = renameSkin(o.id, o.name); return { skin: { key: s.key, name: s.name } }; });
const skinDelete = skinCmd((o) => deleteSkin(o.id));
const skinExport = skinCmd((o) => exportSkin(o.id, o.out));
const galleryRemove = skinCmd((o) => removeTheme(String(o.id || '').replace(/^ds-/, '')));
const skinImport = skinCmd((o) => { const s = importSkin(o.file); return { skin: { key: s.key, name: s.name } }; });

// 体检：连上正在跑的应用，看皮肤是不是真的生效（样式在、有壁纸时壁纸层不是 none、字和底色对比够）。
// 输出一行 JSON：{ ok, problems: [..], info }。问题用中文写，总控台直接显示。
function contrastOf(a, b) {
  const lum = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function check() {
  const out = (r) => { process.stdout.write(JSON.stringify(r) + '\n'); return r.ok ? EXIT.OK : EXIT.FAILED; };
  const port = await currentPort();
  if (!port) return out({ ok: false, problems: [`${APP.name} 没有用梦境换肤启动，查不了`] });
  let targets = [];
  try { targets = await listCherryMainTargets(port); } catch {}
  if (!targets.length) return out({ ok: false, problems: [`没找到 ${APP.name} 主窗口`] });
  let choice = {};
  try { choice = JSON.parse(readFileSync(CHOICE_FILE, 'utf8')); } catch {}
  const r = await withSession(targets[0], port, (s) => s.evaluate(`(() => {
    const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
    const has = (q) => { try { return !!document.querySelector(q); } catch { return false; } };
    const probes = ${JSON.stringify(APP.probes || [])};
    const missing = probes.filter(([q, , when]) => (!when || has(when)) && !has(q)).map(([q, label]) => label + '（' + q + '）');
    return { skin: !!document.getElementById(${JSON.stringify(STYLE_ID)}), live: (document.getElementById(${JSON.stringify(LIVE_ID)}) || {}).textContent ? true : false,
      wall: getComputedStyle(document.body, '::before').backgroundImage.slice(0, 30), bg: v('--ds-bg'), text: v('--ds-text'), muted: v('--ds-muted'),
      ready: has(${JSON.stringify(READY)}), missing, ua: navigator.userAgent };
  })()`));
  const problems = [];
  // 应用版本：从 UA 里取（CherryStudio/2.1.6、ZCode/3.15.3）；和上次体检通过时的版本比，变了就在 info 里标出来。
  const vm = new RegExp(APP.uaToken + '/([\\d.]+)').exec(r.ua || '');
  const version = vm ? vm[1] : '';
  let lastOk = {};
  try { lastOk = JSON.parse(readFileSync(CHECKED_FILE, 'utf8')); } catch {}
  const versionChanged = !!(version && lastOk.version && lastOk.version !== version);
  if (!r.ready) problems.push(`${APP.name} 主界面没找到标志元素，可能是版本更新改了结构`);
  else if (r.missing.length) problems.push(`${APP.name}${versionChanged ? ' 更新到 ' + version + ' 后' : ''}界面结构变了，找不到：${r.missing.join('、')}，这部分皮肤可能没生效`);
  if (!r.skin && !r.live) problems.push('皮肤样式不在页面里');
  const wantImage = !!(r.live ? null : choice.image);
  if (wantImage && (!r.wall || r.wall === 'none')) problems.push('壁纸层是空的（壁纸没显示出来）');
  const hex = (x) => /^#[0-9a-f]{6}$/i.test(x);
  const c = hex(r.bg) && hex(r.text) ? contrastOf(r.bg, r.text) : 0;
  if (c && c < 4.5) problems.push(`文字和底色对比度只有 ${c.toFixed(1)}（建议 ≥ 4.5），字可能看不清`);
  const ok = problems.length === 0;
  if (ok && version) { try { writeFileSync(CHECKED_FILE, JSON.stringify({ version, at: new Date().toISOString() }), 'utf8'); } catch {} }
  return out({ ok, problems, info: { app: APP.id, version, versionChanged, lastOkVersion: lastOk.version || '', preview: r.live, wallpaper: r.wall !== 'none', contrast: c ? Number(c.toFixed(2)) : null, preset: choice.preset || '' } });
}

const o = parseArgs(process.argv.slice(2));
const run = { apply, sync, check, restore, status, watch, launch, live, presets: async () => presets(o), schema: async () => schema(), shortcut: async () => shortcut(),
  'skin-save': skinSave, 'skin-rename': skinRename, 'skin-delete': skinDelete, 'skin-export': skinExport, 'skin-import': skinImport,
  'gallery-list': galleryList, 'gallery-get': galleryGet, 'gallery-remove': galleryRemove }[o.cmd];
if (!run) { say('FAILED', '未知命令：' + o.cmd + '（可用 apply / launch / restore / shortcut / status / presets / schema / live / skin-*）'); process.exit(EXIT.FAILED); }
run(o).then((code) => process.exit(code), (e) => {
  say('FAILED', e?.message || String(e));
  process.exit(EXIT.FAILED);
});
