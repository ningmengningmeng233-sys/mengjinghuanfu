/**
 * Wallpaper Playlist & Rotation Controller (`playlist.mjs`)
 *
 * Supports:
 * - Named playlist groups (`rotationGroups`), Favorites pool (`__favorites__`), or full library pool
 * - `sequence` (deterministic wrap-around) and `random` (non-repeating Fisher-Yates shuffle deck + back-history)
 * - `interval` background timer (`timer.unref()`) and `videoEnd` completion trigger
 * - First-run auto-seeding from Wallpaper Engine's `config.json` playlists (`rotationSeeded`)
 */

export function createPlaylistController({
  getConfig,
  getItems,
  onSelectWallpaper,
  randomFn = Math.random,
} = {}) {
  let timer = null;
  let timerIntervalMs = 0;
  const history = []; // stack of previously active wallpaperIds
  let shuffleDeck = [];
  let shufflePoolSig = '';

  function findActiveGroup(cfg) {
    if (!cfg.rotationGroupId || !Array.isArray(cfg.rotationGroups)) return null;
    return cfg.rotationGroups.find((g) => g && g.id === cfg.rotationGroupId) || null;
  }

  function resolveEffectiveSettings(cfg = getConfig()) {
    const group = findActiveGroup(cfg);
    return {
      enabled: Boolean(cfg.rotationEnabled && cfg.skinEnabled !== false),
      groupId: cfg.rotationGroupId || '',
      group,
      order: group?.order || cfg.rotationOrder || 'random',
      trigger: group?.trigger || cfg.rotationTrigger || 'interval',
      intervalMinutes: Math.max(1, Number(group?.interval || cfg.rotationInterval || 15)),
    };
  }

  function resolvePool(cfg = getConfig(), allItems = getItems()) {
    const items = Array.isArray(allItems) ? allItems : [];
    if (items.length === 0) return [];

    const hidden = new Set(cfg.hiddenIds || []);
    const byId = new Map(items.map((it) => [it.id, it]));
    const { groupId, group } = resolveEffectiveSettings(cfg);

    // 1. Explicit user playlist group preserves group's defined item order
    if (group && Array.isArray(group.wallpaperIds) && group.wallpaperIds.length > 0) {
      const groupItems = [];
      for (const id of group.wallpaperIds) {
        const it = byId.get(id);
        if (it && !hidden.has(it.id)) groupItems.push(it);
      }
      if (groupItems.length > 0) return groupItems;
    }

    // 2. Favorites virtual playlist
    if (groupId === '__favorites__' && Array.isArray(cfg.favorites) && cfg.favorites.length > 0) {
      const favSet = new Set(cfg.favorites);
      const favItems = items.filter((it) => favSet.has(it.id) && !hidden.has(it.id));
      if (favItems.length > 0) return favItems;
    }

    // 3. Filtered general library pool (excludes builtin fallback when real wallpapers exist)
    const allowedKinds = new Set(cfg.typeFilter || ['image', 'video', 'slideshow', 'web', 'scene']);
    const allowedRatings = new Set(cfg.contentRatingFilter || ['everyone', 'pg13', 'unrated']);

    let eligible = items.filter((it) => {
      if (hidden.has(it.id)) return false;
      if (!allowedKinds.has(it.kind)) return false;
      if (it.contentRating && !allowedRatings.has(it.contentRating)) return false;
      return true;
    });

    if (eligible.length > 1) {
      const nonBuiltin = eligible.filter((it) => it.id !== 'builtin-prism-aurora');
      if (nonBuiltin.length > 0) eligible = nonBuiltin;
    }

    if (eligible.length === 0) {
      eligible = items.filter((it) => !hidden.has(it.id));
    }
    return eligible;
  }

  function refillShuffleDeck(poolIds, currentId) {
    const deck = [...poolIds];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(randomFn() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    // Avoid immediate back-to-back repeat across deck boundaries
    if (deck.length > 1 && deck[0] === currentId) {
      const swapIdx = 1 + Math.floor(randomFn() * (deck.length - 1));
      const tmp = deck[0];
      deck[0] = deck[swapIdx];
      deck[swapIdx] = tmp;
    }
    shuffleDeck = deck;
    shufflePoolSig = [...poolIds].sort().join('|');
  }

  function pickNextId(direction = 1, cfg = getConfig(), allItems = getItems()) {
    const pool = resolvePool(cfg, allItems);
    if (pool.length === 0) return '';
    if (pool.length === 1) return pool[0].id;

    const currentId = cfg.activeWallpaperId || cfg.wallpaperId || '';
    const { order } = resolveEffectiveSettings(cfg);
    const dir = Number(direction) < 0 ? -1 : 1;

    if (order === 'sequence') {
      const curIdx = pool.findIndex((it) => it.id === currentId);
      const nextIdx = curIdx < 0
        ? (dir >= 0 ? 0 : pool.length - 1)
        : (curIdx + dir + pool.length) % pool.length;
      if (currentId && pool[nextIdx].id !== currentId && dir > 0) {
        history.push(currentId);
        if (history.length > 64) history.shift();
      }
      return pool[nextIdx].id;
    }

    // Random (shuffle) order
    const poolIds = pool.map((it) => it.id);
    const poolSet = new Set(poolIds);

    if (dir < 0) {
      while (history.length > 0) {
        const prevId = history.pop();
        if (prevId && prevId !== currentId && poolSet.has(prevId)) {
          return prevId;
        }
      }
    }

    const sig = [...poolIds].sort().join('|');
    if (shufflePoolSig !== sig || shuffleDeck.length === 0) {
      refillShuffleDeck(poolIds, currentId);
    }

    let candidate = shuffleDeck.shift();
    if (candidate === currentId && poolIds.length > 1) {
      if (shuffleDeck.length === 0) refillShuffleDeck(poolIds, currentId);
      candidate = shuffleDeck.shift();
    }

    if (currentId && candidate && candidate !== currentId) {
      history.push(currentId);
      if (history.length > 64) history.shift();
    }
    return candidate || poolIds[0];
  }

  async function step(direction = 1, reason = 'manual') {
    const cfg = getConfig();
    const settings = resolveEffectiveSettings(cfg);

    if (reason === 'timer') {
      if (!settings.enabled || settings.trigger !== 'interval' || cfg.paused) {
        return { stepped: false, reason: 'inactive' };
      }
    } else if (reason === 'videoEnd') {
      if (settings.trigger !== 'videoEnd') {
        return { stepped: false, reason: 'trigger-mismatch' };
      }
    }

    const nextId = pickNextId(direction, cfg, getItems());
    if (!nextId) {
      return { stepped: false, reason: 'empty-pool' };
    }

    const result = await onSelectWallpaper(nextId, { reason, direction });
    return { stepped: true, wallpaperId: nextId, reason, ...result };
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      timerIntervalMs = 0;
    }
  }

  function syncTimer() {
    const cfg = getConfig();
    const settings = resolveEffectiveSettings(cfg);
    if (!settings.enabled || settings.trigger !== 'interval') {
      clearTimer();
      return;
    }

    const desiredMs = Math.max(60_000, settings.intervalMinutes * 60_000);
    if (timer && timerIntervalMs === desiredMs) return;

    clearTimer();
    timerIntervalMs = desiredMs;
    timer = setInterval(() => {
      step(1, 'timer').catch(() => {});
    }, desiredMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function recordManualSelection(prevId, nextId) {
    if (prevId && nextId && prevId !== nextId) {
      if (history[history.length - 1] !== prevId) {
        history.push(prevId);
        if (history.length > 64) history.shift();
      }
    }
    syncTimer();
  }

  function close() {
    clearTimer();
    history.length = 0;
    shuffleDeck = [];
  }

  return {
    step,
    pickNextId,
    resolvePool,
    resolveEffectiveSettings,
    recordManualSelection,
    syncTimer,
    close,
  };
}
