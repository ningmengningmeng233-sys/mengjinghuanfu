/**
 * Wallpaper Prism Core Engine Facade (`src/engine/index.mjs`)
 *
 * Orchestrates:
 * - `store.mjs` (atomic `config.json`, 7 factory + user presets, 512 MiB SHA-256 upload store, dir browser)
 * - `scanner.mjs` (Steam `431960` discovery, `libraryfolders.vdf`, `visibility.json`, `project.json`, SHA-1 cache)
 * - `media-server.mjs` (`127.0.0.1:0` loopback HTTP `206` Range, `mp4-vfs` zero-copy faststart, `scene.pkg` video/audio, fenced web shim)
 * - `playlist.mjs` (`sequence` & `random` Fisher-Yates rotation, `interval` timer, `videoEnd` trigger, WE playlist seeding)
 */

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { PLUGIN_VERSION } from '../shared/schema.mjs';
import { createMediaServer } from './media-server.mjs';
import { evaluateWeCondition } from './pkg-scene.mjs';
import { createPlaylistController } from './playlist.mjs';
import {
  loadWarmInventorySnapshot,
  scanWallpaperLibrary,
  syncDesktopWallpaper,
} from './scanner.mjs';
import { createPrismStore, resolveDefaultPrismDataDir, writeFsyncJsonSync } from './store.mjs';

// Re-export low-level engine primitives for direct module consumers & verification tests
export { createMediaServer, hasRawTraversalAttempt, parseByteRange } from './media-server.mjs';
export {
  boxAt,
  buildVirtualFaststartFromFile,
  createMp4VfsKit,
  createVirtualSegmentStream,
  listBoxes,
  probeMp4Metadata,
  readVirtualSliceSync,
} from './mp4-vfs.mjs';
export {
  evaluateWeCondition,
  extractMp4FromTexBytes,
  extractSceneAudioPayload,
  extractSceneVideoPayload,
  hexToWeColor,
  inspectSceneContainer,
  lz4DecompressBlock,
  parsePkg,
  parsePkgFile,
  parseWeProjectProperties,
  readPkgEntry,
  readPkgFileEntry,
  weColorToHex,
} from './pkg-scene.mjs';
export { createPlaylistController } from './playlist.mjs';
export {
  buildBuiltinAuroraSvg,
  buildFocusGuardScript,
  buildLiveSceneHtml,
  buildWebShimScript,
  injectWebWallpaperHtml,
} from './runtime/web-shim.mjs';
export {
  cleanHostEnv,
  computeInventoryScopeKey,
  discoverSteamWeEnvironment,
  loadWarmInventorySnapshot,
  parseLibraryFoldersVdf,
  probeImageDimensions,
  readWePlaylists,
  resolveFencedPath,
  scanWallpaperLibrary,
  syncDesktopWallpaper,
} from './scanner.mjs';
export {
  createPrismStore,
  MAX_UPLOAD_BYTES,
  migrateLegacyPrismDataIfNeeded,
  resolveDefaultPrismDataDir,
  writeAtomicJsonAsync,
  writeAtomicJsonSync,
  writeFsyncJsonSync,
} from './store.mjs';

export async function createWallpaperPrismEngine(opts = {}) {
  const events = new EventEmitter();
  events.setMaxListeners(50);

  const effectiveDataDir = opts.dataDir || opts.sidecarDataDir || '';
  const store = await createPrismStore({ dataDir: effectiveDataDir, pluginRoot: opts.pluginRoot });

  let rawLibraryItems = [];
  let publicLibraryItems = [];
  let lastScanStats = {
    total: 0,
    byKind: { image: 0, video: 0, slideshow: 0, web: 0, scene: 0 },
    bySource: { workshop: 0, default: 0, upload: 0, local: 0 },
    steamFound: false,
    weInstalled: false,
    weInstallDir: '',
  };
  let lastDiscovery = {
    steamFound: false,
    weInstalled: false,
    weInstallDir: '',
  };
  let steamPrimaryRoot = '';
  let initialized = false;
  let initPromise = null;
  let deferredScanTimer = null;
  let scanInFlight = null;
  let closed = false;

  const mediaServer = await createMediaServer({
    port: opts.mediaPort ?? 0,
    keepAlive: Boolean(opts.keepAlive),
    getCacheDir: () => store.getCacheDir(),
    getRuntimeContext: (entry) => {
      const cfg = store.getEffectiveConfig(entry?.id);
      const itemOverrides = cfg.userProps?.[entry?.id] || {};
      const mergedWire = { ...(entry?.wireProps || {}) };
      for (const [k, v] of Object.entries(itemOverrides)) {
        mergedWire[k] = { value: v };
      }
      return {
        config: cfg,
        wireProps: mergedWire,
      };
    },
  });

  function recomputeItemPropsWithOverrides(item, cfg = store.getConfig()) {
    if (!item) return null;
    const overrides = cfg.userProps?.[item.id] || {};
    const wireProps = { ...(item.wireProps || {}) };
    for (const [k, v] of Object.entries(overrides)) {
      wireProps[k] = { value: v };
    }
    const flatValues = {};
    for (const [k, v] of Object.entries(wireProps)) {
      flatValues[k] = v?.value;
    }

    const properties = Array.isArray(item.properties)
      ? item.properties.map((p) => {
          const hasOv = Object.prototype.hasOwnProperty.call(overrides, p.name);
          const val = hasOv ? overrides[p.name] : p.defaultValue;
          return {
            ...p,
            value: val,
            overridden: hasOv,
            visible: p.condition ? evaluateWeCondition(p.condition, flatValues) : true,
          };
        })
      : [];

    return {
      ...item,
      properties,
      wireProps,
    };
  }

  function syncPublicLibrary() {
    const cfg = store.getConfig();
    const updatedRaw = rawLibraryItems.map((raw) => {
      let nextRaw = recomputeItemPropsWithOverrides(raw, cfg);
      if (nextRaw.kind === 'scene') {
        const failedLive = Array.isArray(cfg.sceneLiveFailures) && cfg.sceneLiveFailures.includes(nextRaw.id);
        const sceneMode = nextRaw._fs?.hasSceneVideo
          ? 'video'
          : (cfg.sceneLive !== false && !failedLive ? 'live' : 'preview');
        nextRaw = { ...nextRaw, sceneMode };
      }
      return nextRaw;
    });
    rawLibraryItems = updatedRaw;
    publicLibraryItems = mediaServer.syncLibrary(rawLibraryItems);
    return publicLibraryItems;
  }

  function getStats() {
    const bySource = lastScanStats.bySource || { workshop: 0, default: 0, upload: 0, local: 0 };
    return {
      ...lastScanStats,
      workshop: bySource.workshop || 0,
      uploads: (bySource.upload || 0) + (bySource.local || 0),
      steamRoot: steamPrimaryRoot || lastDiscovery.weInstallDir || '',
      uploadDir: store.getUploadDir(),
      cacheDir: store.getCacheDir(),
      dataDir: store.dataDir,
      mediaOrigin: mediaServer.getOrigin(),
    };
  }

  function getActiveItem() {
    const cfg = store.getConfig();
    const activeId = cfg.activeWallpaperId || cfg.wallpaperId || '';
    if (!activeId) return null;
    const found = publicLibraryItems.find((it) => it.id === activeId);
    return found ? recomputeItemPropsWithOverrides(found, cfg) : null;
  }

  function getActivePayload() {
    const cfg = store.getConfig();
    const activeItem = getActiveItem();
    const effCfg = store.getEffectiveConfig(activeItem?.id || cfg.activeWallpaperId);
    const slideIntervalMs = effCfg.pictureSlideSeconds > 0
      ? effCfg.pictureSlideSeconds * 1000
      : (activeItem?.slideIntervalMs || 30_000);

    return {
      ok: true,
      version: PLUGIN_VERSION,
      pid: process.pid,
      skinEnabled: Boolean(cfg.skinEnabled),
      config: cfg,
      effectiveConfig: effCfg,
      activeItem,
      mediaOrigin: mediaServer.getOrigin(),
      presets: store.listPresets(),
      stats: getStats(),
      wallpaperId: activeItem?.id || cfg.activeWallpaperId || '',
      kind: activeItem?.kind || (cfg.skinEnabled ? cfg.kind : 'none'),
      mediaUrl: activeItem?.mediaUrl || '',
      thumbUrl: activeItem?.thumbUrl || '',
      audioUrl: activeItem?.audioUrl || '',
      slidesUrl: activeItem?.slidesUrl || '',
      sceneVideoUrl: activeItem?.sceneVideoUrl || '',
      sceneLiveUrl: activeItem?.sceneLiveUrl || '',
      webUrl: activeItem?.webUrl || '',
      sceneMode: activeItem?.sceneMode || null,
      slideIntervalMs,
      properties: activeItem?.properties || [],
      wireProps: activeItem?.wireProps || {},
    };
  }

  function emitStateChange(includeSkin = true) {
    const payload = getActivePayload();
    events.emit('change', payload);
    if (includeSkin) events.emit('skin', payload);
    return payload;
  }

  const playlist = createPlaylistController({
    getConfig: () => store.getConfig(),
    getItems: () => publicLibraryItems,
    randomFn: opts.randomFn || Math.random,
    onSelectWallpaper: async (nextId) => {
      const payload = await applyWallpaper(nextId, {}, { fromPlaylist: true });
      return { activeItem: payload.activeItem, config: payload.config };
    },
  });

  async function performScan(refresh = false) {
    if (closed) return { items: publicLibraryItems, stats: getStats() };
    if (!refresh && scanInFlight) return scanInFlight;

    const run = async () => {
      const cfg = store.getConfig();
      const scanRes = await scanWallpaperLibrary({
        config: cfg,
        uploadDir: store.getUploadDir(),
        cacheDir: store.getCacheDir(),
        uploadMetaItems: store.readUploadMetaList(),
        steamRoot: opts.steamRoot,
        includeDefaultPictures: opts.includeDefaultPictures !== false,
        refresh: Boolean(refresh),
      });
      if (closed) return { items: publicLibraryItems, stats: getStats() };

      rawLibraryItems = scanRes.items;
      lastScanStats = scanRes.stats;
      lastDiscovery = scanRes.discovery;
      steamPrimaryRoot = scanRes.discovery.weInstallDir || '';
      syncPublicLibrary();

      // Auto-seed Wallpaper Engine playlists once on first boot
      if (!cfg.rotationSeeded && scanRes.wePlaylists.length > 0 && (cfg.rotationGroups || []).length === 0) {
        await store.updateConfig({
          rotationSeeded: true,
          rotationGroups: scanRes.wePlaylists,
        });
      } else if (!cfg.rotationSeeded) {
        await store.updateConfig({ rotationSeeded: true });
      }

      // Ensure an initial active wallpaper is selected when library has items and none is set yet
      const freshCfg = store.getConfig();
      if (!freshCfg.activeWallpaperId && publicLibraryItems.length > 0) {
        const firstPreferred = publicLibraryItems.find((it) => it.id !== 'builtin-prism-aurora')
          || publicLibraryItems[0];
        if (firstPreferred) {
          await store.updateConfig({
            activeWallpaperId: firstPreferred.id,
            wallpaperId: firstPreferred.id,
            kind: firstPreferred.kind,
          });
        }
      }

      const result = {
        items: publicLibraryItems,
        stats: getStats(),
      };
      events.emit('library', result);
      return result;
    };

    const p = run().finally(() => {
      if (scanInFlight === p) scanInFlight = null;
    });
    if (!refresh) scanInFlight = p;
    return p;
  }

  function scheduleDeferredRefresh(delayMs = 4000) {
    if (closed || deferredScanTimer || opts.disableDeferredScan) return;
    deferredScanTimer = setTimeout(() => {
      deferredScanTimer = null;
      if (closed) return;
      performScan(false).catch(() => {});
    }, delayMs);
    if (typeof deferredScanTimer.unref === 'function') {
      deferredScanTimer.unref();
    }
  }

  async function init() {
    if (initialized) return getActivePayload();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      await store.init();
      const cfg = store.getConfig();
      const warm = loadWarmInventorySnapshot({
        cacheDir: store.getCacheDir(),
        config: cfg,
        uploadDir: store.getUploadDir(),
        steamRoot: opts.steamRoot,
      });

      if (opts.skipStartupScan) {
        rawLibraryItems = [];
        syncPublicLibrary();
      } else if (warm) {
        rawLibraryItems = warm.items;
        lastScanStats = warm.stats;
        lastDiscovery = warm.discovery;
        steamPrimaryRoot = warm.discovery?.weInstallDir || '';
        syncPublicLibrary();
        scheduleDeferredRefresh(Number(opts.deferredScanDelayMs) || 4000);
      } else if (opts.blockingInitialScan) {
        await performScan(false);
      } else {
        // Non-blocking cold boot: bind HTTP/Sidecar immediately (<100ms) and scan Steam/local in background
        rawLibraryItems = [];
        syncPublicLibrary();
        scheduleDeferredRefresh(4000);
      }

      playlist.syncTimer();
      initialized = true;
      return getActivePayload();
    })();

    try {
      return await initPromise;
    } finally {
      initPromise = null;
    }
  }

  async function listLibrary({ refresh = false } = {}) {
    if (!initialized) await init();
    if (refresh) {
      if (deferredScanTimer) {
        clearTimeout(deferredScanTimer);
        deferredScanTimer = null;
      }
      return performScan(true);
    }
    if (publicLibraryItems.length === 0 && !opts.skipStartupScan && !scanInFlight && !deferredScanTimer) {
      scheduleDeferredRefresh(100);
    }
    return {
      items: publicLibraryItems,
      stats: getStats(),
    };
  }

  async function updateConfig(patch = {}, writeOpts = {}) {
    if (!initialized) await init();
    const prevCfg = store.getConfig();
    const nextCfg = await store.updateConfig(patch, writeOpts);

    if (
      prevCfg.sceneLive !== nextCfg.sceneLive
      || JSON.stringify(prevCfg.sceneLiveFailures) !== JSON.stringify(nextCfg.sceneLiveFailures)
    ) {
      syncPublicLibrary();
    }

    playlist.syncTimer();

    if (nextCfg.desktopSync && lastDiscovery.weInstallDir) {
      if (prevCfg.paused !== nextCfg.paused) {
        syncDesktopWallpaper(lastDiscovery.weInstallDir, nextCfg.paused ? 'pause' : 'play');
      }
      if (prevCfg.muted !== nextCfg.muted) {
        syncDesktopWallpaper(lastDiscovery.weInstallDir, nextCfg.muted ? 'mute' : 'unmute');
      }
    }

    return emitStateChange(true);
  }

  async function restoreSkin() {
    return updateConfig({ skinEnabled: false });
  }

  async function resetConfig(scope = 'all') {
    if (!initialized) await init();
    await store.resetConfig(scope);
    syncPublicLibrary();
    playlist.syncTimer();
    return emitStateChange(true);
  }

  async function applyWallpaper(wallpaperId, extraPatch = {}, internalMeta = {}) {
    if (!initialized) await init();
    const cleanId = String(wallpaperId ?? '').trim();
    const prevCfg = store.getConfig();

    if (!cleanId || cleanId === 'none') {
      await store.updateConfig({
        ...extraPatch,
        activeWallpaperId: '',
        wallpaperId: '',
        kind: 'none',
      });
      playlist.syncTimer();
      return emitStateChange(true);
    }

    let target = publicLibraryItems.find((it) => it.id === cleanId);
    if (!target) {
      await performScan(true);
      target = publicLibraryItems.find((it) => it.id === cleanId);
    }
    if (!target) {
      const err = new Error(`Wallpaper not found: ${cleanId}`);
      err.statusCode = 404;
      throw err;
    }

    await store.updateConfig({
      skinEnabled: true,
      ...extraPatch,
      activeWallpaperId: target.id,
      wallpaperId: target.id,
      kind: target.kind,
    });

    if (!internalMeta.fromPlaylist) {
      playlist.recordManualSelection(prevCfg.activeWallpaperId, target.id);
    } else {
      playlist.syncTimer();
    }

    const nextCfg = store.getConfig();
    if (nextCfg.desktopSync && lastDiscovery.weInstallDir) {
      const rawEntry = rawLibraryItems.find((r) => r.id === target.id);
      if (rawEntry?._fs?.projectDir) {
        syncDesktopWallpaper(
          lastDiscovery.weInstallDir,
          'openWallpaper',
          join(rawEntry._fs.projectDir, 'project.json'),
        );
      }
    }

    return emitStateChange(true);
  }

  async function stepPlaylist(direction = 1, reason = 'manual') {
    if (!initialized) await init();
    const res = await playlist.step(direction, reason);
    return {
      ...getActivePayload(),
      stepped: Boolean(res.stepped),
      stepReason: res.reason || reason,
    };
  }

  async function applyPreset(presetId) {
    if (!initialized) await init();
    const { preset } = await store.applyPreset(presetId);
    syncPublicLibrary();
    playlist.syncTimer();
    const payload = emitStateChange(true);
    return { ...payload, preset };
  }

  function listPresets() {
    return store.listPresets();
  }

  async function savePreset({ name, description = '', patch = null } = {}) {
    if (!initialized) await init();
    const { preset, presets } = await store.savePreset({ name, description, patch });
    const payload = emitStateChange(false);
    return { ...payload, preset, presets };
  }

  async function deletePreset(id) {
    if (!initialized) await init();
    const { presets } = await store.deletePreset(id);
    const payload = emitStateChange(false);
    return { ...payload, deletedId: id, presets };
  }

  async function importPreset(obj) {
    if (!initialized) await init();
    const { preset, presets } = await store.importPreset(obj);
    const payload = emitStateChange(false);
    return { ...payload, preset, presets };
  }

  function exportPreset(id) {
    return store.exportPreset(id);
  }

  async function updateUserProps(wallpaperId, props = {}) {
    if (!initialized) await init();
    const { props: savedProps } = await store.updateUserProps(wallpaperId, props);
    syncPublicLibrary();
    const payload = emitStateChange(true);
    return { ...payload, wallpaperId, props: savedProps };
  }

  async function uploadMedia({ filename, contentType, streamOrBuffer, title } = {}) {
    if (!initialized) await init();
    const { duplicate, meta } = await store.uploadMedia({
      filename,
      contentType,
      streamOrBuffer,
      title,
    });
    const lib = await performScan(true);
    const item = lib.items.find((it) => it.id === meta.id) || null;
    return {
      ok: true,
      duplicate,
      item,
      items: lib.items,
      stats: lib.stats,
    };
  }

  async function removeUpload(wallpaperId) {
    if (!initialized) await init();
    await store.removeUpload(wallpaperId);
    const lib = await performScan(false);
    const payload = emitStateChange(true);
    return {
      ...payload,
      removedId: wallpaperId,
      items: lib.items,
    };
  }

  function browseDirs(targetPath = '') {
    const res = store.browseDirs(targetPath);
    if (lastDiscovery.weInstallDir) {
      const wsCandidate = join(lastDiscovery.weInstallDir, '..', '..', 'workshop', 'content', '431960');
      const hasWs = res.quickRoots.some((r) => r.label === 'Workshop 431960');
      if (!hasWs) {
        try {
          const extra = store.browseDirs(wsCandidate);
          if (extra.current && extra.current.endsWith('431960')) {
            res.quickRoots.push({ label: 'Workshop 431960', path: extra.current });
          }
        } catch { /* ignore */ }
      }
    }
    return res;
  }

  async function setStorageDir(kind, newPath) {
    if (!initialized) await init();
    await store.setStorageDir(kind, newPath);
    const lib = await performScan(true);
    const payload = emitStateChange(false);
    return {
      ...payload,
      items: lib.items,
    };
  }

  async function close() {
    if (closed) return;
    closed = true;
    if (deferredScanTimer) {
      clearTimeout(deferredScanTimer);
      deferredScanTimer = null;
    }
    playlist.close();
    await store.flush();
    await mediaServer.close();
    events.removeAllListeners();
  }

  if (opts.autoInit !== false) {
    await init();
  }

  return {
    events,
    store,
    mediaServer,
    playlist,
    init,
    close,
    get mediaOrigin() { return mediaServer.getOrigin(); },
    getMediaOrigin: () => mediaServer.getOrigin(),
    uploadBuffer: (buf, meta = {}) => uploadMedia({ ...meta, streamOrBuffer: buf }),
    getConfig: () => store.getConfig(),
    getEffectiveConfig: (id) => store.getEffectiveConfig(id),
    getStats,
    getActiveItem,
    getActivePayload,
    updateConfig,
    restoreSkin,
    resetConfig,
    listLibrary,
    applyWallpaper,
    stepPlaylist,
    applyPreset,
    listPresets,
    savePreset,
    deletePreset,
    importPreset,
    exportPreset,
    updateUserProps,
    uploadMedia,
    removeUpload,
    browseDirs,
    setStorageDir,
  };
}
