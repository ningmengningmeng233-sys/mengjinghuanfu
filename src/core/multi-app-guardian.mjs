// Multi-App Silent Guardian & Gentle CDP Orchestrator (DreamSkin Prism v4).
// Handles cached fast app-status, background slow-app polling, conflict gating,
// semantic parts health check + compat degrade, gentle CDP injection/restore, and focus-freeze push.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRuntimeProfiles, appRuntimeById } from './app-runtime.mjs';
import { collectAppsStatus } from './apps-status.mjs';
import { conflictToolsOf, detectForeignStyles, detectInstalledPluginConflicts, pageStyleIdsExpr } from './conflicts.mjs';
import { evaluateHealth, partChecksOf, partsProbeExpr } from './health.mjs';
import { writeCompatRecord } from '../store/compat.mjs';
import { compileAdapterPrismCss } from '../theme/prism-bridge.mjs';
import { buildClientSkinPayload, getHostPanelScript, getHostSkinScript } from '../prism/host/index.mjs';
import {
  defaultPortForApp,
  evaluateTargetEphemeral,
  listCdpTargets,
  probeCdpPort,
  readDevToolsActivePort,
  selectHubTargets,
} from '../prism/cdp/gentle-cdp.mjs';
import { createMultiAppCanary } from '../prism/cdp/canary.mjs';
import { resolveAppEffectiveConfig } from '../prism/shared/schema.mjs';

export function createMultiAppGuardian({
  dataDir,
  legacyRootDir = '',
  getV4Store,
  getActiveItemForApp,
  getMediaOrigin,
  focusArbiter,
  skipInitialScan = false,
} = {}) {
  const cacheFile = join(dataDir, 'apps-status-cache.json');
  const canary = createMultiAppCanary({ dataDir });
  const profiles = listRuntimeProfiles();
  const attachedTargets = new Map(); // appId -> { port, wsUrl, sessionId, lastAppliedSig, dynamic }
  let appsCache = loadInitialCache();
  let refreshing = null;
  let pollTimer = null;
  let stopped = false;

  function loadInitialCache() {
    try {
      if (existsSync(cacheFile)) {
        const parsed = JSON.parse(readFileSync(cacheFile, 'utf8'));
        if (Array.isArray(parsed?.apps) && parsed.apps.length > 0) {
          return mergeProfilesWithCached(parsed.apps);
        }
      }
    } catch {}
    return mergeProfilesWithCached([]);
  }

  function mergeProfilesWithCached(cachedRows) {
    const byId = new Map((cachedRows || []).map((r) => [r.id, r]));
    return profiles.map((p) => {
      const prev = byId.get(p.id) || {};
      const pluginConflicts = detectInstalledPluginConflicts({ app: p });
      return {
        id: p.id,
        name: p.name,
        channel: p.channel,
        testedVersions: p.testedVersions || [],
        defaultPort: p.prism?.defaultDebugPort || defaultPortForApp(p.id),
        browserHoleSupport: Boolean(p.prism?.browserHoleSupport),
        installed: Boolean(prev.installed),
        running: Boolean(prev.running),
        debugPort: Number(prev.debugPort) || 0,
        exe: String(prev.exe || ''),
        skinActive: Boolean(prev.skinActive),
        mode: prev.mode || 'full',
        appVersion: String(prev.appVersion || ''),
        state: prev.state || 'not-running',
        pluginConflicts,
        canary: canary.status(p.id),
        attached: attachedTargets.has(p.id),
      };
    });
  }

  function listAppsFast() {
    const store = getV4Store();
    return appsCache.map((row) => {
      const appCfg = store.apps?.[row.id];
      const eff = resolveAppEffectiveConfig(store, row.id);
      return {
        ...row,
        skinEnabled: appCfg ? appCfg.skinEnabled !== false : true,
        inheritGlobal: appCfg ? appCfg.inheritGlobal !== false : true,
        activeWallpaperId: eff.activeWallpaperId || '',
        colorScheme: eff.colorScheme,
        preset: eff.preset,
        canary: canary.status(row.id),
        attached: attachedTargets.has(row.id),
      };
    });
  }

  async function refreshAppsStatus() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const res = await collectAppsStatus();
        appsCache = mergeProfilesWithCached(res.apps || []);
        try {
          mkdirSync(dataDir, { recursive: true });
          writeFileSync(cacheFile, JSON.stringify({ updatedAt: new Date().toISOString(), apps: appsCache }, null, 2) + '\n', 'utf8');
        } catch {}
      } catch {
        // non-fatal, keep existing cache
      }
      return listAppsFast();
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function resolveDebugPortForApp(profile) {
    const cached = appsCache.find((r) => r.id === profile.id);
    if (cached && cached.debugPort > 0) {
      const p = await probeCdpPort(cached.debugPort, '', 600);
      if (p.ok) return p;
    }
    if (profile.id === 'antigravity') {
      const dt = readDevToolsActivePort();
      if (dt?.port) {
        const p = await probeCdpPort(dt.port, '', 700);
        if (p.ok) return p;
      }
    }
    const defPort = profile.prism?.defaultDebugPort || defaultPortForApp(profile.id);
    const p = await probeCdpPort(defPort, '', 700);
    if (p.ok) return p;
    return null;
  }

  async function findMainTargets(profile, port, host) {
    const all = await listCdpTargets(port, host);
    if (profile.id === 'antigravity') {
      const hub = selectHubTargets(all);
      if (hub.length > 0) return hub;
    }
    return all.filter((t) => profile.isMainTarget(t, port));
  }

  async function applyApp(appId, { force = false } = {}) {
    let profile;
    try {
      profile = appRuntimeById(appId);
    } catch (err) {
      return { ok: false, appId, reason: 'unknown-app', message: err.message };
    }

    const store = getV4Store();
    const entry = store.apps?.[appId];
    const skinEnabled = entry ? entry.skinEnabled !== false : true;
    if (!skinEnabled && !force) {
      return { ok: true, appId, skipped: true, reason: 'disabled-by-user' };
    }

    const pluginConflicts = detectInstalledPluginConflicts({ app: profile });
    if (pluginConflicts.length > 0 && !force) {
      return { ok: false, appId, reason: 'plugin-conflict', conflicts: pluginConflicts, message: pluginConflicts[0].message };
    }

    const probe = await resolveDebugPortForApp(profile);
    if (!probe) {
      attachedTargets.delete(appId);
      return { ok: false, appId, reason: 'not-debuggable', message: '未检测到可连接窗口，请开启原图标自动生效后重新打开该软件' };
    }

    const targets = await findMainTargets(profile, probe.port, probe.host);
    if (!targets.length) {
      return { ok: false, appId, reason: 'waiting-window', message: '软件正在启动中，将在主界面就绪后自动上肤' };
    }

    const target = targets[0];
    const wsUrl = target.webSocketDebuggerUrl;
    const sessionId = `${probe.port}:${target.id}`;

    // Boot Canary gate
    const gate = canary.evaluateBoot(appId, sessionId);
    if (!gate.allowInject && !force) {
      return { ok: false, appId, reason: 'canary-tripped', canary: gate.entry, message: gate.reason };
    }

    // Page-level conflict check
    const conflictTools = conflictToolsOf(profile);
    if (conflictTools.length > 0 && !force) {
      try {
        const styleIds = await evaluateTargetEphemeral(wsUrl, pageStyleIdsExpr(), { timeoutMs: 2500 });
        const hit = detectForeignStyles(styleIds, {
          ownIds: ['agy-prism-css', 'agy-prism-adapter-css', 'agy-prism-static-css', 'agy-prism-popover-css', profile.styleId],
          tools: conflictTools,
        });
        if (hit) {
          return { ok: false, appId, reason: 'page-conflict', hit, message: `页面已有 ${hit.name} 样式，已暂停注入以防打架` };
        }
      } catch {
        // non-fatal during probe
      }
    }

    // Semantic parts health check -> full or compat degrade
    let mode = 'full';
    try {
      const checks = partChecksOf(profile.partsMap);
      if (checks.length > 0) {
        const hits = await evaluateTargetEphemeral(wsUrl, partsProbeExpr(checks), { timeoutMs: 2500 });
        const verdict = evaluateHealth(checks, hits || {});
        mode = verdict.mode === 'compat' ? 'compat' : 'full';
        if (legacyRootDir) {
          try {
            writeCompatRecord(legacyRootDir, appId, {
              mode,
              partsOk: verdict.partsOk,
              partsMissing: verdict.partsMissing,
              checkedAt: new Date().toISOString(),
            });
          } catch {}
        }
      }
    } catch {
      mode = 'full';
    }

    const effCfg = resolveAppEffectiveConfig(store, appId);
    const activeItem = getActiveItemForApp(appId, effCfg);
    const mediaOrigin = getMediaOrigin();
    const compiled = compileAdapterPrismCss({
      appId,
      partsMap: profile.partsMap,
      extraCss: profile.extraCss,
      mode,
    });
    const payload = buildClientSkinPayload(effCfg, activeItem, mediaOrigin, {
      skinEnabled: true,
      adapterProfile: {
        appId,
        mode: compiled.mode,
        adapterCss: profile.id === 'antigravity' ? profile.extraCss : compiled.adapterCss,
        browserHoleSupport: Boolean(profile.prism?.browserHoleSupport),
      },
    });

    canary.arm(appId, sessionId);
    try {
      // 1. Ensure microkernel mounted
      const hasKernel = await evaluateTargetEphemeral(wsUrl, `Boolean(window.__agyPrism && window.__agyPrism.alive && window.__agyPrism.alive())`, { timeoutMs: 2500 });
      if (!hasKernel) {
        await evaluateTargetEphemeral(wsUrl, getHostSkinScript(), { timeoutMs: 6000 });
      }
      // 2. Apply payload
      const status = await evaluateTargetEphemeral(
        wsUrl,
        `window.__agyPrism ? window.__agyPrism.applyPayload(${JSON.stringify(payload)}) : null`,
        { timeoutMs: 4500 },
      );
      // 3. Lazy-mount Quick Popover (Ctrl+Alt+W)
      const hasPanel = await evaluateTargetEphemeral(wsUrl, `Boolean(window.__agyPrismPanel && window.__agyPrismPanel.alive && window.__agyPrismPanel.alive())`, { timeoutMs: 2000 });
      if (!hasPanel) {
        await evaluateTargetEphemeral(wsUrl, getHostPanelScript(), { timeoutMs: 5000 }).catch(() => {});
      }
      canary.markHealthy(appId, sessionId);

      const isDynamic = ['video', 'web', 'scene', 'slideshow'].includes(String(activeItem?.kind || ''));
      attachedTargets.set(appId, { port: probe.port, host: probe.host, wsUrl, sessionId, dynamic: isDynamic });
      focusArbiter?.registerWindow(appId, { dynamic: isDynamic, visible: true });

      return { ok: true, appId, mode, port: probe.port, status };
    } catch (err) {
      return { ok: false, appId, reason: 'inject-error', message: err?.message || String(err) };
    }
  }

  async function restoreApp(appId) {
    attachedTargets.delete(appId);
    focusArbiter?.unregisterWindow(appId);
    let profile;
    try {
      profile = appRuntimeById(appId);
    } catch {
      return { ok: true, appId, detached: false };
    }
    const probe = await resolveDebugPortForApp(profile);
    if (!probe) return { ok: true, appId, detached: false };
    const targets = await findMainTargets(profile, probe.port, probe.host);
    for (const t of targets) {
      try {
        await evaluateTargetEphemeral(
          t.webSocketDebuggerUrl,
          `(() => { try { window.__agyPrismPanel && window.__agyPrismPanel.destroy(); } catch {} try { window.__agyPrism && window.__agyPrism.destroy(); } catch {} return true; })()`,
          { timeoutMs: 2500 },
        );
      } catch {}
    }
    return { ok: true, appId, detached: targets.length > 0 };
  }

  async function pushFocusDirectives() {
    if (!focusArbiter) return {};
    const directives = focusArbiter.computePauseDirectives();
    for (const [appId, dir] of Object.entries(directives)) {
      const att = attachedTargets.get(appId);
      if (!att || !att.wsUrl) continue;
      try {
        await evaluateTargetEphemeral(
          att.wsUrl,
          `window.__agyPrism && window.__agyPrism.setPaused(${Boolean(dir.paused)})`,
          { timeoutMs: 1800 },
        );
      } catch {
        // target may have closed
      }
    }
    return directives;
  }

  async function pollOnce() {
    if (stopped) return;
    const store = getV4Store();
    for (const p of profiles) {
      if (stopped) return;
      const entry = store.apps?.[p.id];
      const enabled = entry ? entry.skinEnabled !== false : false;
      if (!enabled) continue;
      // Only silently attach if port is already reachable (never force-restart user's app)
      const probe = await resolveDebugPortForApp(p);
      if (!probe) {
        attachedTargets.delete(p.id);
        continue;
      }
      if (!attachedTargets.has(p.id)) {
        await applyApp(p.id).catch(() => {});
      }
    }
  }

  function startPolling(intervalMs = 4500) {
    if (pollTimer || stopped) return;
    pollTimer = setInterval(() => {
      pollOnce().catch(() => {});
    }, intervalMs);
    if (typeof pollTimer.unref === 'function') pollTimer.unref();
  }

  function stopPolling() {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  if (!skipInitialScan) {
    setTimeout(() => {
      if (!stopped) refreshAppsStatus().catch(() => {});
    }, 5000).unref?.();
  }

  return {
    canary,
    listAppsFast,
    refreshAppsStatus,
    applyApp,
    restoreApp,
    pushFocusDirectives,
    pollOnce,
    startPolling,
    stopPolling,
    resetCanary: (appId) => canary.reset(appId),
  };
}
