// Cherry Studio / ZCode 换肤（CDP 通道）。做法与 Codex Dream Skin 原型一致：
// 带本机调试端口启动应用 → 往主窗口注入一个 <style>，壁纸任意大小、可还原、不碰官方文件和设置。
// 所有命令都可加 --app <适配器 id>（默认 cherry，已注册的见 adapters/）；各应用共用同一套主题、参数和「我的皮肤」。
//
// 用法：
//   node dreamskin.mjs apply   [--preset dark-gold|b16-xxx|wp-1-tonal-dark] [--image 壁纸路径]
//                                [--set id=值 ...] [--focus-x 50] [--focus-y 40] [--restart]
//   node dreamskin.mjs restore
//   node dreamskin.mjs presets    打印全部配色（JSON：内置 + base16 配色库 + 上次的壁纸取色）
//   node dreamskin.mjs schema     打印可调参数声明（JSON，Obsidian Style Settings 字段格式）
//   node dreamskin.mjs live       实时预览会话：从 stdin 逐行读 JSON 指令，直接改正在运行的 Cherry，见 live()
//   node dreamskin.mjs launch     用上次的皮肤启动 Cherry（桌面快捷方式就调它）
//   node dreamskin.mjs shortcut   在桌面创建「Cherry Studio (Dream Skin)」快捷方式
//   node dreamskin.mjs status
//   node dreamskin.mjs apps-status   全部已注册应用的状态（JSON，总控台应用列表与状态点用，U-1）
//   我的皮肤（两端共用）：
//   node dreamskin.mjs skin-save   --file state.json   （{name, preset|palette, values, image, overwrite}）
//   node dreamskin.mjs skin-rename --id my-xxx --name 新名字
//   node dreamskin.mjs skin-delete --id my-xxx
//   node dreamskin.mjs skin-export --id my-xxx --out 文件.dsskin
//   node dreamskin.mjs skin-import --file 文件.dsskin
//   主题库（dreamskin.cc 社区主题，下载到本机自用）：
//   node dreamskin.mjs gallery-list [--sort popular|favorites|recent] [--offset 0] [--limit 24] [--q 关键词] [--style 二次元|真人|风景|城市|国风|游戏影视|科幻|极简|萌趣|其他]
//   node dreamskin.mjs gallery-get  --id ver_xxx      下载后可用 --preset ds-ver_xxx 应用 / 预览 / 存为我的皮肤
// 退出码：0 成功 / 1 失败且未改动 / 2 结果不确定 / 3 需要重启 Cherry（加 --restart 重试）
// 内部：node dreamskin.mjs watch --port N   （常驻守护，Cherry 刷新或重开窗口时自动补上皮肤）
import { existsSync, readFileSync, writeFileSync, rmSync, chmodSync, watch as watchFs } from 'node:fs';
import { homedir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './core/env.mjs';
import { SETTINGS, buildVarsCss, defaultValues, imageDataUri, MAX_IMAGE_BYTES_CDP, CHERRY_PRESETS, PRESET_ALIASES } from './theme/cherry-skin-css.mjs';
import { listPalettes, resolvePalette, wallpaperPalettes, bundledImage, GROUPS } from './theme/palettes.mjs';
import { saveSkin, renameSkin, deleteSkin, exportSkin, importSkin, getSkin } from './store/user-skins.mjs';
import { appRuntimeById } from './core/app-runtime.mjs';
import { channelFor } from './channels/index.mjs';
import { profileToChannelAdapter } from './channels/exe.mjs';
import { VERSION } from './core/version.mjs';
import { listGallery, fetchTheme, removeTheme } from './store/gallery.mjs';
import { createInterface } from 'node:readline';
import { slimImage } from './theme/wall-cache.mjs';
import { CdpSession, fetchCdpJson } from './core/cdp-core.mjs';
import { makeInjectors } from './core/inject.mjs';
import { buildSkinLayers, layersLength, serializeSkinFile, parseSkinFile } from './theme/layers.mjs';
import { listProcesses, debugPortOf, findExe, freePort, portAlive, launchWithPort, waitForMainTargets as waitTargets } from './core/app-process.mjs';
import { partChecksOf, partsProbeExpr, evaluateHealth, degradeLayers, wallpaperPartsCss, bumpScrim } from './core/health.mjs';
import { writeCompatRecord, compatRecordOf } from './store/compat.mjs';
import { conflictToolsOf, pageStyleIdsExpr, detectForeignStyles, foreignStyleMessage } from './core/conflicts.mjs';
import { collectAppsStatus } from './core/apps-status.mjs';
import { syncFanout, parseTargets } from './core/sync.mjs';
import { listAdapters } from './core/adapters.mjs';
import { selectChannelKind } from './core/channel-select.mjs';
import { pluginBridge } from './core/plugin-bridge.mjs';
import { dshPluginChannel } from './channels/index.mjs';

const argAt = (name) => { const a = process.argv.indexOf(name); return a > 0 ? process.argv[a + 1] : undefined; };
const APP = appRuntimeById(argAt('--app') || 'cherry');
const RULES = APP.rules;
const LIVE_ID = APP.liveId; // 实时预览层（core/inject.mjs 的 IDS.live 同一个 id）
const READY = APP.readySelector;
const EXIT = { OK: 0, FAILED: 1, UNCERTAIN: 2, NEEDS_RESTART: 3 };
const listCherryProcesses = () => listProcesses(APP);
const findCherryExe = (running) => findExe(APP, running);
const launchCherryWithPort = launchWithPort;
const waitForMainTargets = (port, ms) => waitTargets(APP, port, ms);
const listCherryMainTargets = (port) => CHANNEL.targets(CHANNEL_ADAPTER, port);

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
    else if (a === '--to' && v) { o.to = v; i++; }
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

// 注入 / 移除 / 预览 / 校验脚本在 core/inject.mjs（T3-2 分层：部件层 / 变量层 / 额外层三个 <style> + live 预览层）。
const { IDS, injectLayersExpr, removeExpr, liveExpr, verifyExpr } = makeInjectors(APP);

// §4.5 体检清单：由本应用 parts-map 生成（哪些部件必需、各自的选择器），apply 与 check 共用。
const PART_CHECKS = partChecksOf(APP.partsMap);

// 已知冲突工具（A-1）：由 adapter.json 的 conflicts 字段经 core/conflicts.mjs 注册表解析。
// 没声明冲突的适配器（cherry / zcode）为空清单，apply / check 的页面级冲突检测整体跳过，行为不变。
const CONFLICT_TOOLS = conflictToolsOf(APP);
const OWN_STYLE_IDS = [IDS.parts, IDS.vars, IDS.extra, IDS.live, APP.userCssId].filter(Boolean);

// 启动 / 注入通道（T1-3 起入口改走适配器 + 通道）：发现、关闭、主窗口列表走 CHANNEL；
// CHANNEL_ADAPTER 由运行时 profile 适配成通道形状（channels/exe.mjs 的 profileToChannelAdapter）。
// U-3 接线：--shell <id> 时按适配器 shells 声明换通道（如 DSH 的 web 外壳 -> dsh-plugin）；
// 不带 --shell 时就是默认通道，行为与接线前一致。外壳不存在直接报错退出，不静默降级。
let SHELL_SEL;
try { SHELL_SEL = selectChannelKind(APP, argAt('--shell')); } catch (e) { console.log('FAILED: ' + e.message); process.exit(EXIT.FAILED); }
const CHANNEL = channelFor(SHELL_SEL.kind);
const CHANNEL_ADAPTER = profileToChannelAdapter(APP, { skinActive: () => existsSync(SKIN_FILE) });

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

// 确保有一个带调试端口的应用：已有端口（会话口径 currentPort）直接用；应用开着但没端口 → 需要重启（--restart 才动手）。
// T1-3 起发现与关闭走通道：CHANNEL.status 给 running / exe，CHANNEL.stop({ graceful: false }) 等同 2.1 的
// stopApp({ force: true })；启动仍用 freePort + launchWithPort（与通道 launch 内部同一套 app-process 原语），
// 等主窗口由 apply 负责。提示文案与退出码与 2.1 逐字一致。
async function ensurePort(o) {
  let port = await currentPort();
  if (port) return { port };
  if (CHANNEL.kind === 'msix') {
    // msix 通道（方案 4.3）：包在 WindowsApps 下、没有可直接执行的 exe，status.exe 恒为空
    // 是设计而非未装——旧逻辑在这里误报找不到安装位置，Codex 冷启动全链断在此处（收尾修复批）。
    // 发现（包/AUMID）、端口段、段外端口冲突与 AUMID 激活都在通道 launch 内（channels/msix.mjs），
    // 这里只为退出码口径做一次预检（在跑但无端口且未要求重启 -> NEEDS_RESTART），其余整体委托 launch。
    const mcs = await CHANNEL.status(CHANNEL_ADAPTER);
    if (mcs.running && !mcs.debugPort && !o.restart) {
      say('NEEDS_RESTART', `${APP.name} 正在运行，需要由梦境换肤重新启动一次才能换肤（${APP.restartNote}）。`);
      return { code: EXIT.NEEDS_RESTART };
    }
    try {
      const r = await CHANNEL.launch(CHANNEL_ADAPTER, { restart: !!o.restart });
      return { port: r.port };
    } catch (e) { say('FAILED', e.message); return { code: EXIT.FAILED }; }
  }
  const cs = await CHANNEL.status(CHANNEL_ADAPTER);
  const exe = cs.exe;
  if (!exe) { say('FAILED', `找不到 ${APP.name} 安装位置。可设置环境变量 ${APP.envExe} 指向 ${APP.exeName}。`); return { code: EXIT.FAILED }; }
  if (cs.running) {
    if (!o.restart) {
      say('NEEDS_RESTART', `${APP.name} 正在运行，需要由梦境换肤重新启动一次才能换肤（${APP.restartNote}）。`);
      return { code: EXIT.NEEDS_RESTART };
    }
    const stop = await CHANNEL.stop(CHANNEL_ADAPTER, { graceful: false });
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
  let values = { ...(mine ? mine.values : {}), ...choiceValues(o) };

  if (CHANNEL.kind === 'dsh-plugin') {
    // U-3 接线（插件通道早分支）：插件通道没有调试端口与 CDP 目标，ensurePort / 页面冲突清点 /
    // 体检探针都不适用——在这里直接组装图层（壁纸不经渲染进程瘦身，用原图数据）、先落盘
    // （皮肤文件 + 选择，与普通流程同一份口径），再调通道 launch 做双前置校验
    // （开关已开 + 插件已装）：不满足时如实 FAILED（文件已保存，补齐开关 / 安装后插件就会读到），
    // 满足时插件经 shell.overlay 在 DSH Web UI 里读这份皮肤注入。页面级体检与冲突检测走 check 流程。
    const pluginImageUri = o.image ? imageDataUri(o.image, MAX_IMAGE_BYTES_CDP) : '';
    const pluginLayers = buildSkinLayers(APP, palette, pluginImageUri, values);
    writeFileSync(SKIN_FILE, serializeSkinFile(pluginLayers), 'utf8');
    writeFileSync(CHOICE_FILE, JSON.stringify({ preset: palette.key || o.preset || '', palette, image: o.image || '', values }), 'utf8');
    try {
      await CHANNEL.launch(CHANNEL_ADAPTER, { layers: pluginLayers });
    } catch (e) {
      say('FAILED', e.message);
      return EXIT.FAILED;
    }
    say('SUCCESS', `已把皮肤交给 DSH 插件通道（${palette.name}）：插件会在 DSH 的 Web UI 里读这份皮肤并注入。`);
    return EXIT.OK;
  }

  const ep = await ensurePort(o);
  if (!ep.port) return ep.code;
  const port = ep.port;

  let targets;
  try { targets = await waitForMainTargets(port, 60000); }
  catch (e) { say('FAILED', e.message); return EXIT.FAILED; }

  // 页面级冲突检测（A-1，§3 共存 / V-A10）：声明了已知冲突工具的适配器，注入前先清点
  // 主窗口里带 id 的 <style>，认出对方已在注入就停手提示二选一——不抢、不双重注入，
  // 且停手发生在写皮肤文件之前，本次不落任何状态。与 msix 通道的端口层检测并存。
  if (CONFLICT_TOOLS.length) {
    let hit = null;
    try {
      hit = await withSession(targets[0], port, async (s) => detectForeignStyles(await s.evaluate(pageStyleIdsExpr()) || [], { ownIds: OWN_STYLE_IDS, tools: CONFLICT_TOOLS }));
    } catch {}
    if (hit) { say('FAILED', foreignStyleMessage(APP.name, hit)); return EXIT.FAILED; }
  }

  // 大壁纸先瘦身（在应用自己的渲染进程里缩放转 WebP，带缓存），注入更快、内存更省。
  let slim = o.image;
  if (o.image) { try { slim = await withSession(targets[0], port, (s) => slimImage(o.image, s)); } catch {} }
  const imageUri = slim ? imageDataUri(slim, MAX_IMAGE_BYTES_CDP) : '';
  let layers = buildSkinLayers(APP, palette, imageUri, values);

  // §4.5 体检门禁（T3-3）：注入前先探必需部件在不在；缺失超过三成，自动降级为兼容模式
  // （部件层只保留壁纸挂载点 app.root、额外层撤掉，变量层即配色与壁纸原样保留），不硬套错位的样式。
  let health = null;
  try {
    health = await withSession(targets[0], port, async (s) => {
      for (let i = 0; i < 40; i++) {
        if (await s.evaluate(`!!document.querySelector(${JSON.stringify(READY)})`)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const states = await s.evaluate(partsProbeExpr(PART_CHECKS));
      return evaluateHealth({ partStates: states || {}, checks: PART_CHECKS, contrast: null });
    });
  } catch {}
  let compatDegraded = false;
  if (health && health.mode === 'compat') { layers = degradeLayers(layers, APP.partsMap); compatDegraded = true; }

  // 先落盘（三层 JSON），守护进程和后续刷新都读这一份。
  writeFileSync(SKIN_FILE, serializeSkinFile(layers), 'utf8');
  let verified = 0, leftoverUserCss = false;
  for (const t of targets) {
    try {
      const v = await withSession(t, port, async (s) => {
        // 等 React 把主界面画出来（主界面标志元素出现），最多 20 秒。
        for (let i = 0; i < 40; i++) {
          if (await s.evaluate(`!!document.querySelector(${JSON.stringify(READY)})`)) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        await s.evaluate(injectLayersExpr(layers));
        await s.evaluate(liveExpr(''));
        return s.evaluate(verifyExpr);
      });
      if (v.len === layersLength(layers) && v.sidebar && (!imageUri || v.wallpaper)) verified++;
      if (v.userCss > 0) leftoverUserCss = true;
    } catch {}
  }
  // §4.5 对比度（T3-3）：注入后量一次正文对比度（计算口径与 check 同一份 contrastOf）；
  // 不达标就自动把整体遮罩浓度提高一档、重写皮肤文件并重注入（只做一次；再不达标由 check 提示用户）。
  let scrimNote = '';
  if (verified > 0) {
    try {
      const cols = await withSession(targets[0], port, (s) => s.evaluate(`(() => { const cs = getComputedStyle(document.documentElement); return { bg: cs.getPropertyValue('--ds-bg').trim(), text: cs.getPropertyValue('--ds-text').trim() }; })()`));
      const hexOk = (x) => /^#[0-9a-f]{6}$/i.test(x || '');
      const cc = hexOk(cols.bg) && hexOk(cols.text) ? contrastOf(cols.bg, cols.text) : 0;
      if (cc && cc < 4.5) {
        const bumped = bumpScrim(values, SETTINGS);
        if (bumped) {
          const before = Number.isFinite(Number(values.scrim)) ? Number(values.scrim)
            : (palette.tune && Number.isFinite(Number(palette.tune.scrim)) ? Number(palette.tune.scrim) : 100);
          values = bumped;
          layers = buildSkinLayers(APP, palette, imageUri, values);
          if (compatDegraded) layers = degradeLayers(layers, APP.partsMap);
          writeFileSync(SKIN_FILE, serializeSkinFile(layers), 'utf8');
          for (const t of targets) {
            try { await withSession(t, port, async (s) => { await s.evaluate(injectLayersExpr(layers)); await s.evaluate(liveExpr('')); }); } catch {}
          }
          if (health) health = { ...health, contrast: Number(cc.toFixed(2)), contrastOk: false, needsScrimRaise: true };
          scrimNote = `文字对比度偏低（${cc.toFixed(1)}），已自动把整体遮罩浓度提高一档（${before} → ${bumped.scrim}）。`;
        }
      } else if (cc && health) {
        health = { ...health, contrast: Number(cc.toFixed(2)), contrastOk: cc >= 4.5, needsScrimRaise: false };
      }
    } catch {}
  }
  // 体检结果记入兼容矩阵缓存（store/compat.json）；版本在 check 时补齐，这里先记部件与对比度。
  if (health) { try { writeCompatRecord(compatRecordOf(health, { adapterId: APP.id, appVersion: '' })); } catch {} }

  const watcherPid = startWatcher(port);
  // launch 传的是完整 palette 对象（不带 key），用 presetKey 把「我的皮肤」等的 key 带回来，否则总控台「使用中」角标认不出。
  const savedKey = palette.key || o.presetKey || '';
  writeState({ port, watcherPid, preset: savedKey || palette.name, image: o.image || '', at: new Date().toISOString() });
  writeFileSync(CHOICE_FILE, JSON.stringify({ preset: savedKey, palette, image: o.image || '', values }, null, 2), 'utf8');

  const hint = leftoverUserCss ? '注意：Cherry 设置 → 外观 → 自定义 CSS 里还有内容（可能是旧版换肤写进去的），建议清空，免得和皮肤打架。' : '';
  const compatNote = compatDegraded ? `注意：这一版 ${APP.name} 缺了不少必需部件，已自动切到兼容模式（只保留配色和壁纸），等适配更新后再恢复完整皮肤。` : '';
  if (verified === targets.length) {
    say('SUCCESS', `已应用 [${palette.name}]${o.image ? ' + 自定义壁纸' : ''}，${APP.name} 主窗口校验通过。以后请用梦境换肤启动 ${APP.name}，皮肤会自动带上。${hint}${compatNote}${scrimNote}`);
    return EXIT.OK;
  }
  say('UNCERTAIN', `已注入，但 ${targets.length - verified}/${targets.length} 个主窗口没通过校验（可能还在加载，或这一版 ${APP.name} 界面结构变了）。看一眼窗口；不对就点「还原」。${compatNote}${scrimNote}`);
  return EXIT.UNCERTAIN;
}

function presets(o) {
  const list = listPalettes({ all: !!o.all }).map((p) => ({ key: p.key, name: p.name, group: p.group, groupName: GROUPS[p.group] || p.group,
    dark: !!p.dark, bg: p.bg, panel: p.panel, bubble: p.bubble, accent: p.accent, glow: p.glow || p.accent, text: p.text, muted: p.muted || p.text,
    desc: p.desc || '', from: p.from || p.author || '', accentText: p.accentText || '',
    tune: p.tune || {},
    ...(p.group === 'mine' ? { values: p.values || {}, image: p.image || '' } : {}),
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

// 多端同步（U-2）：sync --from <来源> --to a,b,c —— 把来源最后保存的皮肤一次同步到多个目标。
// 每个目标拉起一个子进程跑单目标 sync（老路径，行为与 2.1 逐字一致），逐个独立、互不影响；
// 结果逐行打印并在最后一行给 JSON 汇总 { syncMulti: true, ok, from, results }（总控台按它汇报每个目标）。
// 全部成功退出码 0，任一失败退出码 1（其余目标照常完成）。
async function syncMulti(o, targets) {
  const from = o.from || APP.id;
  const self = fileURLToPath(import.meta.url);
  const runOne = (id) => {
    try {
      const out = execFileSync(process.execPath, [self, 'sync', '--from', from, '--app', id],
        { encoding: 'utf8', timeout: 180000, env: process.env, windowsHide: true });
      const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
      return { ok: true, msg: lines.length ? lines[lines.length - 1] : '' };
    } catch (e) {
      const out = String((e && e.stdout) || '').trim().split(/\r?\n/).filter(Boolean);
      return { ok: false, msg: out.length ? out[out.length - 1] : String((e && e.message) || e) };
    }
  };
  const r = await syncFanout({ from, targets, runOne, knownIds: listAdapters().map((a) => a.id) });
  for (const x of r.results) {
    if (x.skipped) say('SUCCESS', `同步到 ${x.app}：${x.msg}。`);
    else say(x.ok ? 'SUCCESS' : 'FAILED', `同步到 ${x.app}：${x.msg || (x.ok ? '完成' : '没成功')}`);
  }
  process.stdout.write(JSON.stringify({ syncMulti: true, ...r }) + '\n');
  return r.ok ? EXIT.OK : EXIT.FAILED;
}

// 两端同步：把另一个应用（--from）最后保存的皮肤用到当前应用（--app）。
// 当前应用正带皮肤运行 → 立即换；没运行或没带皮肤 → 只记下来，下次「用皮肤启动」就是这套（不会去重启它）。
async function sync(o) {
  const targets = parseTargets(o.to);
  if (targets.length) return syncMulti(o, targets);
  const from = o.from || (APP.id === 'cherry' ? 'zcode' : 'cherry');
  let src;
  try { src = JSON.parse(readFileSync(join(dataDir(from), 'last-choice.json'), 'utf8')); }
  catch { say('FAILED', `${appRuntimeById(from).name} 还没保存过皮肤`); return EXIT.FAILED; }
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
//   {"op":"set","preset":"b16-nord","image":"<壁纸路径>","values":{"blur":20}}  → 立即改 Cherry（只写变量段）
//   {"op":"palette","image":"<壁纸路径>"}   → 从壁纸取色，回一行 {"op":"palette","palettes":[...]}
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
        const layers = buildSkinLayers(APP, current.palette, await uriOf(current.image), current.values);
        writeFileSync(SKIN_FILE, serializeSkinFile(layers), 'utf8');
        await everywhere(injectLayersExpr(layers));
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
  const cs = await CHANNEL.status(CHANNEL_ADAPTER);
  if (Array.isArray(APP.shells) && APP.shells.length) {
    // U-3：声明了多外壳的应用（如 DSH）在状态里带上外壳清单、当前通道与插件通道开关 / 安装状态
    // （只读文件检查，不启动任何东西）；旧字段口径不变。
    const port2 = (await currentPort()) || cs.debugPort;
    const st2 = readState();
    const out = { app: APP.id, version: VERSION, cherryRunning: cs.running, running: cs.running, debugPort: port2,
      skinActive: existsSync(SKIN_FILE), preset: st2?.preset ?? null, cherryExe: cs.exe || null, exe: cs.exe || null,
      shells: APP.shells.map((s) => ({ id: s.id, channel: s.channel })), channel: CHANNEL.kind };
    try { const ps = await dshPluginChannel.status(CHANNEL_ADAPTER); out.pluginChannel = { enabled: !!ps.enabled, installed: !!ps.pluginInstalled }; } catch {}
    console.log(JSON.stringify(out, null, 2));
    return EXIT.OK;
  }
  // debugPort 口径合并（T1-3）：以会话文件口径 currentPort() 为准——那是梦境换肤自己启动 / 守护的端口，
  // live / check / watch 都靠它定位；通道口径（进程命令行扫描）作兜底。梦境换肤启动的场景下两者恒等。
  const port = (await currentPort()) || cs.debugPort;
  const st = readState();
  // cherryRunning / cherryExe 字段名保留（总控台旧版本按它解析），新增 app / running / exe。
  console.log(JSON.stringify({ app: APP.id, version: VERSION, cherryRunning: cs.running, running: cs.running, debugPort: port,
    skinActive: existsSync(SKIN_FILE), preset: st?.preset ?? null, cherryExe: cs.exe || null, exe: cs.exe || null }, null, 2));
  return EXIT.OK;
}

// U-1：一次输出全部已注册应用的状态（总控台应用列表的数据来源，core/apps-status.mjs）。
// 只读聚合：不启动、不关闭任何应用；单个应用查询失败只影响它自己那一行。
// U-3：DSH 插件通道的开关 / 安装 / 卸载命令（数据面在 core/plugin-bridge.mjs，红线在通道实现里）。
// plugin-install 必须显式带 --consent 才会把同意传给通道（总控台点「安装」时先弹确认框再带上）；
// 缺了 --consent 通道会拒装并原样报错。本批不真装：这些命令只在用户 / 总控台明确调用时才动。
async function pluginStatus() {
  try { process.stdout.write(JSON.stringify(await pluginBridge.status(APP.id), null, 2) + '\n'); return EXIT.OK; }
  catch (e) { say('FAILED', e.message); return EXIT.FAILED; }
}
async function pluginSetEnabled(on) {
  try {
    const r = await pluginBridge.setEnabled(APP.id, on);
    say('SUCCESS', on ? '插件通道开关已打开（只是允许使用；插件还没装时 apply 会如实报错）。' : '插件通道开关已关闭，插件侧的皮肤覆盖已移除。');
    process.stdout.write(JSON.stringify(r) + '\n');
    return EXIT.OK;
  } catch (e) { say('FAILED', e.message); return EXIT.FAILED; }
}
async function pluginInstall() {
  try {
    const r = await pluginBridge.install(APP.id, process.argv.includes('--consent'));
    say('SUCCESS', `DSH 插件已安装（版本 ${r.version}），文件：${(r.files || []).join('、')}。`);
    return EXIT.OK;
  } catch (e) { say('FAILED', e.message); return EXIT.FAILED; }
}
async function pluginUninstall() {
  try {
    const r = await pluginBridge.uninstall(APP.id);
    say('SUCCESS', r.removed && r.removed.length ? `DSH 插件已卸载，移除 ${r.removed.length} 个文件。` : 'DSH 插件本来就没装着，无需卸载。');
    return EXIT.OK;
  } catch (e) { say('FAILED', e.message); return EXIT.FAILED; }
}

async function appsStatus() {
  const r = await collectAppsStatus();
  process.stdout.write(JSON.stringify({ apps: r.apps, errors: r.errors }, null, 2) + '\n');
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
  const sessions = new Map(); // targetId → { session, scriptId, key, layers, timer }
  let browser = null, misses = 0, running = false, again = false, timer = null, stopped = false;
  let finish;
  const done = new Promise((r) => { finish = r; });

  const readLayers = () => { try { return parseSkinFile(readFileSync(SKIN_FILE, 'utf8')); } catch { return null; } };
  const stop = () => { if (stopped) return; stopped = true; finish(); };
  const schedule = (ms = 120) => { if (stopped) return; clearTimeout(timer); timer = setTimeout(reconcile, ms); };

  // 同一窗口短时间内连着来几个事件（导航 + 新上下文）只补一次。
  const reinject = (entry) => {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { if (entry.layers && !entry.session.closed) entry.session.evaluate(injectLayersExpr(entry.layers)).catch(() => {}); }, 80);
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
      const layers = readLayers();
      if (layers === null) return stop(); // 已还原
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
            entry = { session, scriptId: null, key: null, layers: null, timer: null };
            const e = entry;
            session.on('Page.frameNavigated', (p) => { if (!p.frame?.parentId) reinject(e); });
            session.on('Runtime.executionContextCreated', (p) => { if (p.context?.auxData?.isDefault !== false) reinject(e); });
            session.ws.addEventListener('close', () => { if (!stopped) schedule(500); });
            sessions.set(t.id, entry);
          }
          const key = serializeSkinFile(layers);
          if (entry.key !== key) {
            if (entry.scriptId) await entry.session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: entry.scriptId });
            const r = await entry.session.send('Page.addScriptToEvaluateOnNewDocument', { source: injectLayersExpr(layers) });
            entry.scriptId = r.identifier;
            await entry.session.evaluate(injectLayersExpr(layers));
            entry.key = key;
            entry.layers = layers;
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
// 输出一行 JSON：{ ok, problems: [..], partsOk, partsMissing, mode, info }（§4.5 / T3-3：
// partsOk / partsMissing 是 parts-map 部件的命中 / 缺失清单，mode 是 full | compat；
// 必需部件缺失超过三成时会自动把页面与皮肤文件降级为兼容模式，并把结果记入 store/compat.json）。
// 既有字段与退出码口径与 2.1 不变，新字段是增补。问题用中文写，总控台直接显示。
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
    return { skin: ${JSON.stringify([IDS.parts, IDS.vars, IDS.extra])}.some((id) => !!document.getElementById(id)), live: (document.getElementById(${JSON.stringify(LIVE_ID)}) || {}).textContent ? true : false,
      styleIds: [...document.querySelectorAll('style[id]')].map((el) => el.id),
      partState: ${partsProbeExpr(PART_CHECKS)},
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
  // §4.5 部件体检（T3-3）：用 parts-map 的必需部件清单裁决，要与上面的 probes 口径并存（probes 是 2.1 的逐项提示）。
  const health = evaluateHealth({ partStates: r.partState || {}, checks: PART_CHECKS, contrast: c || null });
  if (health.mode === 'compat') problems.push(`必需部件缺失 ${health.requiredMissing}/${health.requiredTotal}（超过三成），已自动降级为兼容模式：只保留配色和壁纸，这一版 ${APP.name} 还没适配好`);
  // 页面级冲突（A-1 / V-A10）：对方换肤工具的样式还在页面里 = 双重注入，如实报出来让用户二选一。
  const conflict = CONFLICT_TOOLS.length ? detectForeignStyles(r.styleIds || [], { ownIds: OWN_STYLE_IDS, tools: CONFLICT_TOOLS }) : null;
  if (conflict) problems.push(`页面里有 ${conflict.name} 注入的样式（${conflict.hits.join('、')}），它和梦境换肤在同时给 ${APP.name} 换肤，请二选一：先在 ${conflict.name} 里还原或退出，再用梦境换肤`);
  const ok = problems.length === 0;
  if (ok && version) { try { writeFileSync(CHECKED_FILE, JSON.stringify({ version, at: new Date().toISOString() }), 'utf8'); } catch {} }
  // 自动降级落地：页面与皮肤文件还带着完整部件层 / 额外层时换成兼容模式三层（守护进程随后跟随皮肤文件）。
  if (health.mode === 'compat') {
    try {
      const cur = parseSkinFile(readFileSync(SKIN_FILE, 'utf8'));
      if (cur && (cur.extra || cur.parts !== wallpaperPartsCss(APP.partsMap))) {
        const degraded = degradeLayers(cur, APP.partsMap);
        writeFileSync(SKIN_FILE, serializeSkinFile(degraded), 'utf8');
        await withSession(targets[0], port, (s) => s.evaluate(injectLayersExpr(degraded)));
      }
    } catch {}
  }
  try { writeCompatRecord(compatRecordOf(health, { adapterId: APP.id, appVersion: version })); } catch {}
  return out({ ok, problems, ...(CONFLICT_TOOLS.length ? { conflict } : {}), partsOk: health.partsOk, partsMissing: health.partsMissing, mode: health.mode, info: { app: APP.id, version, versionChanged, lastOkVersion: lastOk.version || '', preview: r.live, wallpaper: r.wall !== 'none', contrast: c ? Number(c.toFixed(2)) : null, preset: choice.preset || '' } });
}

const o = parseArgs(process.argv.slice(2));
const run = { apply, sync, check, restore, status, 'apps-status': appsStatus, 'plugin-status': pluginStatus, 'plugin-enable': async () => pluginSetEnabled(true), 'plugin-disable': async () => pluginSetEnabled(false), 'plugin-install': pluginInstall, 'plugin-uninstall': pluginUninstall, watch, launch, live, presets: async () => presets(o), schema: async () => schema(), shortcut: async () => shortcut(),
  'skin-save': skinSave, 'skin-rename': skinRename, 'skin-delete': skinDelete, 'skin-export': skinExport, 'skin-import': skinImport,
  'gallery-list': galleryList, 'gallery-get': galleryGet, 'gallery-remove': galleryRemove }[o.cmd];
if (!run) { say('FAILED', '未知命令：' + o.cmd + '（可用 apply / launch / restore / shortcut / status / presets / schema / live / skin-*）'); process.exit(EXIT.FAILED); }
run(o).then((code) => process.exit(code), (e) => {
  say('FAILED', e?.message || String(e));
  process.exit(EXIT.FAILED);
});
