// tools/recheck-after-update.mjs
// 应用更新后一键复检（只读）：逐家对比安装版本与基线，未运行时按产品口径带随机
// 调试端口启动 → 抓脱敏 DOM 快照 → parts-hit 复算体检结论 → 关回未运行。
// 不 apply、不 restore、不写皮肤状态。结论五种：
//   完好 full / 降级可用 compat / 需刷新部件表 / 未安装 / 待复检
// 退出码：0 = 无「需刷新部件表」；1 = 至少一家需刷新；2 = 参数/环境错误。
// DSH 在本机冷启动极慢（实测 562–742 秒才 healthy），其等待窗口强制 ≥15 分钟。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRuntimeById } from "../src/core/app-runtime.mjs";
import { freePort, launchWithPort, listProcesses, stopApp, waitForMainTargets } from "../src/core/app-process.mjs";
import { channelFor } from "../src/channels/index.mjs";
import { profileToChannelAdapter } from "../src/channels/exe.mjs";
import { CdpSession } from "../src/core/cdp-core.mjs";
import { captureSnapshotTree } from "../src/core/dom-snapshot.mjs";
import { hitReport } from "../src/core/parts-hit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = join(HERE, "recheck-baseline.json");
export const DSH_MIN_WAIT_MS = 15 * 60 * 1000;
export const DEFAULT_WAIT_MS = 180000;

// ---------- 纯判定逻辑（单测覆盖） ----------

// 版本比对：current 为探查到的现装版本（取不到为 null）。
export function compareVersion(current, baselineVersion) {
  const installed = typeof current === "string" && current.trim().length > 0;
  return { installed, changed: installed && current.trim() !== String(baselineVersion || "").trim() };
}

// 结论映射（任务书口径）：
// - 未安装 -> 未安装；在运行无法确认空闲 -> 待复检（只做了版本比对）
// - 抓不到主窗口/快照 -> 需刷新部件表
// - mode=full -> 完好 full
// - mode=compat 且版本已变 -> 需刷新部件表（更新把必需部件改坏超 §4.5 线）
// - mode=compat 且版本未变 -> 降级可用 compat（老状态，可继续用）
export function decideConclusion({ installed, needsIdle = false, snapshotOk = false, mode = null, versionChanged = false } = {}) {
  if (!installed) return "未安装";
  if (needsIdle) return "待复检";
  if (!snapshotOk) return "需刷新部件表";
  if (mode === "full") return "完好 full";
  if (mode === "compat") return versionChanged ? "需刷新部件表" : "降级可用 compat";
  return "需刷新部件表";
}

// 启动等待窗口：基线给了就用基线的；DSH 强制不低于 15 分钟（本机冷启动实测）。
export function startWaitFor(entry) {
  const base = Number(entry && entry.startWaitMs) || DEFAULT_WAIT_MS;
  if (entry && entry.id === "dsh") return Math.max(base, DSH_MIN_WAIT_MS);
  return base;
}

// 主窗口出现后还要等界面真正渲染：以 app.root 命中为就绪信号反复抓快照，
// 否则慢应用（DSH 的 Web UI、MiniMax 系）会被抓到空白页误判全缺失。
export function readyWaitFor(entry) {
  if (entry && entry.id === "dsh") return 300000;
  return 120000;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 安装版本探查（注册表 / Appx，只读） ----------

export function probeInstalledVersion(probe) {
  if (!probe || typeof probe !== "object") return null;
  try {
    if (probe.kind === "registry") {
      const pattern = String(probe.displayNamePattern || "").replace(/'/g, "''");
      const script = "$roots = @('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $hit = Get-ItemProperty $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '" + pattern + "' } | Select-Object -First 1; if ($hit) { $hit.DisplayVersion }";
      const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 30000 });
      const v = String(out || "").trim().split(/\r?\n/)[0].trim();
      return v || null;
    }
    if (probe.kind === "appx") {
      const name = String(probe.packageName || "").replace(/'/g, "''");
      const script = "$p = Get-AppxPackage -Name '" + name + "' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { $p.Version.ToString() }";
      const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 30000 });
      const v = String(out || "").trim().split(/\r?\n/)[0].trim();
      return v || null;
    }
  } catch { return null; }
  return null;
}

// ---------- 逐家复检 ----------

async function launchMsix(adapter) {
  // msix 通道没有可直接执行的 exe：与产品入口 ensurePort 同口径，整体委托通道
  // launch（包发现、端口段 9340-9399、AUMID 激活都在 channels/msix.mjs 内）。
  const channel = channelFor("msix");
  const channelAdapter = profileToChannelAdapter(adapter, { skinActive: () => false });
  const r = await channel.launch(channelAdapter, { restart: false });
  return r && r.port ? r.port : null;
}

export async function recheckApp(entry, log = () => {}) {
  const id = entry.id;
  const adapter = appRuntimeById(id);
  const current = probeInstalledVersion(entry.probe);
  const cmp = compareVersion(current, entry.version);
  const base = { id, name: entry.name || id, currentVersion: current, baselineVersion: entry.version, versionChanged: cmp.changed };
  if (!cmp.installed) return { ...base, conclusion: decideConclusion({ installed: false }), detail: "未探查到安装记录" };
  if (!adapter) return { ...base, conclusion: "需刷新部件表", detail: "适配器缺失" };

  const running = listProcesses(adapter).length > 0;
  if (running) {
    // 在运行且无法确认空闲：不打扰，只报版本比对。
    return { ...base, conclusion: decideConclusion({ installed: true, needsIdle: true }), detail: "应用正在运行，本次只做版本比对，未抓快照" };
  }

  const waitMs = startWaitFor(entry);
  let port = null;
  let launched = false;
  try {
    if (adapter.channel === "msix") {
      port = await launchMsix(adapter);
      launched = !!port;
      if (!port) return { ...base, conclusion: decideConclusion({ installed: true, snapshotOk: false, versionChanged: cmp.changed }), detail: "msix 通道启动未报出调试端口" };
    } else {
      // exe 通道：与产品入口 ensurePort 完全同口径（Q-4 修正）——exe 由 exe 通道 status
      // 按运行时 profile 解析（候选 + envExe + 在跑进程口径，与入口共用同一条发现链），
      // 再 freePort + launchWithPort；等主窗口由本工具 startWaitFor 的窗口负责，
      // 不走通道 launch 自带的 60 秒等待（慢应用会被它误杀）。
      const channel = channelFor(adapter.channel);
      const channelAdapter = profileToChannelAdapter(adapter, { skinActive: () => false });
      const exe = (await channel.status(channelAdapter)).exe;
      if (!exe) return { ...base, conclusion: decideConclusion({ installed: true, snapshotOk: false, versionChanged: cmp.changed }), detail: "找不到应用可执行文件（产品 exe 通道口径）" };
      port = await freePort();
      await launchWithPort(exe, port);
      launched = true;
    }
    if (id === "dsh") log("  （DSH 冷启动很慢：本机实测 562–742 秒才就绪，等待窗口 " + Math.round(waitMs / 60000) + " 分钟）");
    if (id === "minimax-design") log("  （MiniMax Design 冷启动不稳：本机实测主窗口出现可晚于 240 秒，等待窗口 " + Math.round(waitMs / 60000) + " 分钟）");
    const targets = await waitForMainTargets(adapter, port, waitMs);
    if (!targets.length) return { ...base, conclusion: decideConclusion({ installed: true, snapshotOk: false, versionChanged: cmp.changed }), detail: "等待窗口内没等到主窗口" };
    const partsMap = adapter.partsMap || adapter.parts;
    // 就绪重试：反复抓快照，直到必需缺失数不再改善（连续 3 轮持平）或就绪窗口
    // 耗尽，取期间最优的一份报告。慢应用首页渲染晚于窗口出现，只抓一张会误判。
    let report = null;
    let bestScore = null;
    let stableRounds = 0;
    const readyDeadline = Date.now() + readyWaitFor(entry);
    for (;;) {
      let tree = null;
      try {
        const session = await new CdpSession(targets[0], port).open();
        try { tree = await captureSnapshotTree(session); } finally { try { session.close(); } catch { /* 忽略 */ } }
      } catch { /* 本轮抓取失败，下一轮重试 */ }
      if (tree) {
        const r = hitReport(partsMap, tree);
        const score = (r.requiredMissing != null ? r.requiredMissing : 99) * 1000 + (r.missing || r.partsMissing || []).length;
        if (bestScore === null || score < bestScore) { bestScore = score; report = r; stableRounds = 0; }
        else stableRounds++;
        if (stableRounds >= 3 && !(report.missing || report.partsMissing || []).includes("app.root")) break;
      }
      if (Date.now() >= readyDeadline) break;
      await sleep(5000);
    }
    if (!report) return { ...base, conclusion: decideConclusion({ installed: true, snapshotOk: false, versionChanged: cmp.changed }), detail: "快照抓取失败" };
    const missing = report.missing || report.partsMissing || [];
    const reqTotal = report.requiredTotal ?? null;
    const reqOk = reqTotal != null && report.requiredMissing != null ? reqTotal - report.requiredMissing : null;
    return {
      ...base,
      conclusion: decideConclusion({ installed: true, snapshotOk: true, mode: report.mode, versionChanged: cmp.changed }),
      detail: "必需命中 " + (reqOk != null ? reqOk + "/" + reqTotal : "?") + (missing.length ? "，缺失：" + missing.join(", ") : "，无缺失"),
      mode: report.mode,
    };
  } catch (e) {
    return { ...base, conclusion: decideConclusion({ installed: true, snapshotOk: false, versionChanged: cmp.changed }), detail: "复检异常：" + (e && e.message ? e.message : String(e)) };
  } finally {
    if (launched) { try { await stopApp(adapter); } catch { /* 关不掉不扩大动作，报告里如实记 */ } }
  }
}

// ---------- 主入口 ----------

export function formatLine(r) {
  const ver = r.currentVersion ? ("当前版本 " + r.currentVersion + "（基线 " + r.baselineVersion + (r.versionChanged ? "，已变化" : "，未变化") + "）") : "未安装（基线 " + r.baselineVersion + "）";
  return "[recheck] " + r.id + " " + ver + " 结论：" + r.conclusion + (r.detail ? " —— " + r.detail : "");
}

export function summarize(results) {
  const counts = { "完好 full": 0, "降级可用 compat": 0, "需刷新部件表": 0, "未安装": 0, "待复检": 0 };
  for (const r of results) counts[r.conclusion] = (counts[r.conclusion] || 0) + 1;
  return counts;
}

async function main(argv) {
  let only = process.env.RECHECK_ONLY || "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only" && argv[i + 1]) only = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("用法：node tools/recheck-after-update.mjs [--only <appId>]");
      console.log("只读复检：对比安装版本与 tools/recheck-baseline.json，未运行的应用会带调试端口启动抓快照后关回。");
      return 0;
    }
  }
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch (e) {
    console.error("[recheck] 基线文件读取失败：" + e.message);
    return 2;
  }
  const apps = (baseline.apps || []).filter((a) => !only || a.id === only);
  if (!apps.length) { console.error("[recheck] 基线里没有匹配的应用（--only=" + only + "）"); return 2; }
  const results = [];
  for (const entry of apps) {
    const r = await recheckApp(entry, (s) => console.log(s));
    results.push(r);
    console.log(formatLine(r));
  }
  const counts = summarize(results);
  console.log("SUMMARY 完好full=" + counts["完好 full"] + " 降级可用compat=" + counts["降级可用 compat"] + " 需刷新部件表=" + counts["需刷新部件表"] + " 未安装=" + counts["未安装"] + " 待复检=" + counts["待复检"] + "（共 " + results.length + " 家）");
  if (process.env.RECHECK_JSON === "1") console.log("RECHECK-JSON " + JSON.stringify(results));
  return counts["需刷新部件表"] > 0 ? 1 : 0;
}

const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]; } catch { return false; }
})();

if (isMain) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => { console.error("[recheck] 未处理异常：" + (e && e.message ? e.message : String(e))); process.exitCode = 2; });
}
