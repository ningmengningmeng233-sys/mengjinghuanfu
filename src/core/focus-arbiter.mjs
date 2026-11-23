// Multi-Window Focus Freeze & Power-Saving Arbiter (DreamSkin Prism v4).
// Ensures at most one dynamic (video/web/scene) app window renders live at a time.

export function createFocusArbiter({ enabled = true, pauseOnBattery = true } = {}) {
  let opts = {
    enabled: Boolean(enabled),
    pauseOnBattery: Boolean(pauseOnBattery),
  };
  let onBattery = false;
  let seq = 0;
  const windows = new Map(); // appId -> { dynamic, focused, visible, lastFocusedSeq }

  function registerWindow(appId, meta = {}) {
    const id = String(appId || '').trim();
    if (!id) return;
    const prev = windows.get(id);
    windows.set(id, {
      dynamic: Boolean(meta.dynamic),
      focused: prev ? prev.focused : Boolean(meta.focused),
      visible: prev ? prev.visible : meta.visible !== false,
      lastFocusedSeq: prev ? prev.lastFocusedSeq : 0,
    });
  }

  function unregisterWindow(appId) {
    windows.delete(String(appId || '').trim());
  }

  function reportFocus(appId, state = {}) {
    const id = String(appId || '').trim();
    if (!id) return;
    const cur = windows.get(id) || { dynamic: true, focused: false, visible: true, lastFocusedSeq: 0 };
    const nextFocused = state.focused !== undefined ? Boolean(state.focused) : cur.focused;
    const nextVisible = state.visible !== undefined ? Boolean(state.visible) : cur.visible;
    if (nextFocused) {
      seq += 1;
      // Only one desktop window has OS focus at a time when focus updates arrive
      for (const [otherId, info] of windows.entries()) {
        if (otherId !== id && info.focused) info.focused = false;
      }
    }
    windows.set(id, {
      dynamic: state.dynamic !== undefined ? Boolean(state.dynamic) : cur.dynamic,
      focused: nextFocused,
      visible: nextVisible,
      lastFocusedSeq: nextFocused ? seq : cur.lastFocusedSeq,
    });
  }

  function setBatteryMode(flag) {
    onBattery = Boolean(flag);
  }

  function setOptions(next = {}) {
    if (next.enabled !== undefined) opts.enabled = Boolean(next.enabled);
    if (next.pauseOnBattery !== undefined) opts.pauseOnBattery = Boolean(next.pauseOnBattery);
  }

  function getActiveAppId() {
    if (opts.pauseOnBattery && onBattery) return null;
    let bestId = null;
    let bestSeq = -1;
    for (const [id, info] of windows.entries()) {
      if (!info.dynamic || !info.visible) continue;
      if (info.focused && info.lastFocusedSeq >= bestSeq) {
        bestId = id;
        bestSeq = info.lastFocusedSeq;
      }
    }
    return bestId;
  }

  function computePauseDirectives() {
    const directives = {};
    const activeId = getActiveAppId();
    for (const [id, info] of windows.entries()) {
      if (!info.dynamic) {
        directives[id] = { paused: false, reason: 'static' };
        continue;
      }
      if (opts.pauseOnBattery && onBattery) {
        directives[id] = { paused: true, reason: 'battery-saver' };
        continue;
      }
      if (!info.visible) {
        directives[id] = { paused: true, reason: 'hidden' };
        continue;
      }
      if (!opts.enabled) {
        directives[id] = { paused: false, reason: 'active' };
        continue;
      }
      if (id === activeId) {
        directives[id] = { paused: false, reason: 'focused' };
      } else {
        directives[id] = { paused: true, reason: 'background-freeze' };
      }
    }
    return directives;
  }

  function snapshot() {
    return {
      enabled: opts.enabled,
      pauseOnBattery: opts.pauseOnBattery,
      onBattery,
      activeAppId: getActiveAppId(),
      windows: Object.fromEntries(windows.entries()),
      directives: computePauseDirectives(),
    };
  }

  return {
    registerWindow,
    unregisterWindow,
    reportFocus,
    setBatteryMode,
    setOptions,
    getActiveAppId,
    computePauseDirectives,
    snapshot,
  };
}
