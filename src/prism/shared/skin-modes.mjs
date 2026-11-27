// Three-Mode Skin Composition & Deterministic Conflict Resolver (DreamSkin Prism v4.1).
// Single source of truth shared across schema, host microkernel, DSH native plugin, daemon, and Studio UI.

export const SKIN_MODES = Object.freeze(['optical', 'wallpaper', 'hybrid']);

export const SKIN_MODE_DEFS = Object.freeze({
  optical: Object.freeze({
    id: 'optical',
    nameZh: '纯黑曜光学',
    nameEn: 'Pure Obsidian Optical',
    badge: '◆',
    summaryZh: '深浅光学配色、切面高光边框、弹簧微交互与桌面像素伙伴；不叠加壁纸与液态玻璃，零性能负担。',
    summaryEn: 'Optical palettes, faceted bevel borders, micro-motion & pixel companion without wallpaper/glass overhead.',
  }),
  wallpaper: Object.freeze({
    id: 'wallpaper',
    nameZh: '纯梦境壁纸',
    nameEn: 'Pure DreamSkin Wallpaper',
    badge: '✦',
    summaryZh: '动静态壁纸、液态玻璃、浮岛画境与护眼暗幕；屏蔽光学重边框与像素伙伴，保持纯粹画面。',
    summaryEn: 'Dynamic/static wallpaper, liquid glass & floating islands without optical facet or companion overlays.',
  }),
  hybrid: Object.freeze({
    id: 'hybrid',
    nameZh: '自由混搭',
    nameEn: 'Hybrid Custom Mix',
    badge: '❖',
    summaryZh: '按模块自由开关拼装（壁纸 / 玻璃 / 光学配色 / 切面 / 动效 / 像素伙伴），冲突项自动安全禁配。',
    summaryEn: 'Pick and combine modules freely; conflicting combinations are automatically guarded off.',
  }),
});

export const COMPANION_STYLES = Object.freeze(['clawd', 'neko', 'crabs', 'orb']);
export const COMPANION_POSITIONS = Object.freeze(['bottom-right', 'bottom-left', 'top-right']);
export const MASCOT_PRESETS = Object.freeze(['crab', 'dual', 'minis', 'quad', 'quad-minis', 'whale', 'clawd', 'dragon', 'neko', 'crabs', 'off']);
export const RIM_TONES = Object.freeze(['follow', 'cobalt', 'iris', 'amber', 'mono']);
export const MOTION_TIERS = Object.freeze(['off', 'subtle', 'standard', 'ultra']);
export const CODE_FONTS = Object.freeze(['default', 'jetbrains', 'cascadia', 'sfmono']);

export const MODULE_KEYS = Object.freeze([
  'wallpaperLayer',
  'glassLayer',
  'opticalPalette',
  'opticalFacet',
  'rippleField',
  'microMotion',
  'pixelCompanion',
]);

export const DEFAULT_SKIN_MODULES = Object.freeze({
  wallpaperLayer: true,
  glassLayer: true,
  opticalPalette: true,
  opticalFacet: false,
  rippleField: false,
  microMotion: false,
  pixelCompanion: false,
});

export const MODE_PRESET_MODULES = Object.freeze({
  optical: Object.freeze({
    wallpaperLayer: false,
    glassLayer: false,
    opticalPalette: true,
    opticalFacet: true,
    rippleField: true,
    microMotion: true,
    pixelCompanion: true,
  }),
  wallpaper: Object.freeze({
    wallpaperLayer: true,
    glassLayer: true,
    opticalPalette: true,
    opticalFacet: false,
    rippleField: false,
    microMotion: false,
    pixelCompanion: false,
  }),
  hybrid: Object.freeze({
    wallpaperLayer: true,
    glassLayer: true,
    opticalPalette: true,
    opticalFacet: true,
    rippleField: false,
    microMotion: true,
    pixelCompanion: true,
  }),
});

/** Single-host tightly-coupled features explicitly excluded from cross-platform injection to avoid conflicts/fragility. */
export const EXCLUDED_HOST_FEATURES = Object.freeze([
  Object.freeze({
    id: 'context-vial',
    host: 'antigravity',
    nameZh: '512K 上下文试管',
    reasonZh: '强耦合 Antigravity 私有 LS RPC 与会话内部状态，跨端不做；反重力端可与 Obsidian Prism 和平共存。',
  }),
  Object.freeze({
    id: 'effort-slider',
    host: 'antigravity',
    nameZh: '推理等级滑块',
    reasonZh: '依赖 Antigravity 专属模型菜单拦截与内部协议，跨端不做以免破坏其他客户端菜单。',
  }),
  Object.freeze({
    id: 'thought-translator',
    host: 'antigravity',
    nameZh: '思考过程代理转译',
    reasonZh: '涉及外部代理/翻译链路与宿主消息结构重写，跨端不做以严守零外网与低耦合边界。',
  }),
  Object.freeze({
    id: 'dsh-quota-panel',
    host: 'dsh',
    nameZh: 'DSH 额度仪表盘',
    reasonZh: 'DSH NEXT 已有原生独立的 dsh-quota-panel 插件负责，梦境换肤只做视觉变量协同（--dsw-alias-*），绝不抢占。',
  }),
]);

function toBool(v, fallback) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'on' || v === 1) return true;
  if (v === 'false' || v === 'off' || v === 0) return false;
  return fallback;
}

export function normalizeSkinMode(raw, fallback = 'wallpaper') {
  const s = String(raw || '').trim().toLowerCase();
  if (SKIN_MODES.includes(s)) return s;
  return SKIN_MODES.includes(fallback) ? fallback : 'wallpaper';
}

export function sanitizeSkinModules(raw = {}, fallback = DEFAULT_SKIN_MODULES) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_SKIN_MODULES;
  const out = {};
  for (const key of MODULE_KEYS) {
    const baseVal = toBool(base[key], DEFAULT_SKIN_MODULES[key]);
    out[key] = key in src ? toBool(src[key], baseVal) : baseVal;
  }
  return out;
}

export function applySkinModePreset(currentConfig = {}, skinMode = 'wallpaper') {
  const mode = normalizeSkinMode(skinMode, 'wallpaper');
  const presetMods = MODE_PRESET_MODULES[mode];
  const base = currentConfig && typeof currentConfig === 'object' ? currentConfig : {};
  const next = {
    ...base,
    skinMode: mode,
    modules: { ...presetMods },
  };
  if (mode === 'optical') {
    next.glassSurfaces = false;
  } else if (mode === 'wallpaper' || mode === 'hybrid') {
    next.glassSurfaces = presetMods.glassLayer;
  }
  return next;
}

/**
 * Deterministic Conflict Resolver.
 * Evaluates requested mode + modules + runtime host context and returns effective modules,
 * disabled reasons, conflicts, and non-fatal degradation warnings.
 */
export function resolveSkinComposition(config = {}, context = {}) {
  const cfg = config && typeof config === 'object' ? config : {};
  const ctx = context && typeof context === 'object' ? context : {};

  const skinMode = normalizeSkinMode(cfg.skinMode, 'wallpaper');
  const modeDefaults = MODE_PRESET_MODULES[skinMode];
  const rawModules = {
    ...(cfg.modules && typeof cfg.modules === 'object' ? cfg.modules : {}),
  };

  // Support optional legacy/flat overrides if caller passed top-level flags without nested `modules`
  for (const key of MODULE_KEYS) {
    if (!(key in rawModules) && key in cfg && typeof cfg[key] === 'boolean') {
      rawModules[key] = cfg[key];
    }
  }
  if (!('glassLayer' in rawModules) && typeof cfg.glassSurfaces === 'boolean' && skinMode !== 'optical') {
    rawModules.glassLayer = cfg.glassSurfaces;
  }

  const requestedModules = sanitizeSkinModules(rawModules, modeDefaults);
  const effectiveModules = { ...requestedModules };
  const disabledModules = [];
  const conflicts = [];
  const warnings = [];

  const disable = (mod, code, reasonZh) => {
    effectiveModules[mod] = false;
    if (!disabledModules.some((d) => d.module === mod)) {
      disabledModules.push({ module: mod, code, reasonZh });
    }
  };

  // Rule 4: External skin plugin conflict -> peaceful yield unless forced
  const hasPluginConflict = Boolean(ctx.hasPluginConflict);
  const forceTakeover = Boolean(ctx.forceTakeover);
  if (hasPluginConflict && !forceTakeover) {
    const conflictName = String(ctx.conflictName || '其他换肤插件');
    for (const key of MODULE_KEYS) {
      disable(key, 'external-plugin-conflict', `检测到「${conflictName}」正在接管当前软件，冲突部分不做以保持和平共存`);
    }
    conflicts.push({
      code: 'external-plugin-conflict',
      severity: 'yield',
      reasonZh: `检测到「${conflictName}」已开启，梦境换肤已自动和平退让，避免样式双注入冲突。`,
    });
    return {
      skinMode,
      yielded: true,
      requestedModules,
      effectiveModules,
      disabledModules,
      conflicts,
      warnings,
      excludedHostFeatures: EXCLUDED_HOST_FEATURES,
    };
  }

  // Rule 1: Mode-enforced mutual exclusions
  if (skinMode === 'optical') {
    disable('wallpaperLayer', 'mode-optical-no-wallpaper', '纯黑曜光学模式不叠加背景壁纸，保持原生锐利底色与零 GPU 占用');
    disable('glassLayer', 'mode-optical-no-glass', '纯黑曜光学模式关闭液态玻璃透光层，避免与实底光学切面打架');
    if (requestedModules.wallpaperLayer || requestedModules.glassLayer) {
      conflicts.push({
        code: 'mode-optical-lock',
        severity: 'locked',
        reasonZh: '纯黑曜光学模式已自动锁定关闭壁纸与液态玻璃；如需混搭请切换到「自由混搭」模式。',
      });
    }
  } else if (skinMode === 'wallpaper') {
    disable('opticalFacet', 'mode-wallpaper-no-facet', '纯梦境壁纸模式不叠加黑曜棱镜光带，保持纯粹通透玻璃感');
    disable('rippleField', 'mode-wallpaper-no-ripple', '纯梦境壁纸模式不叠加字符波纹地平线光场，避免与壁纸背景冲突');
    disable('microMotion', 'mode-wallpaper-no-motion', '纯梦境壁纸模式默认关闭微交互动效叠层，避免干扰动态壁纸帧率');
    disable('pixelCompanion', 'mode-wallpaper-no-companion', '纯梦境壁纸模式不挂载桌面像素伙伴，保持纯净壁纸画面');
    if (requestedModules.opticalFacet || requestedModules.rippleField || requestedModules.microMotion || requestedModules.pixelCompanion) {
      conflicts.push({
        code: 'mode-wallpaper-lock',
        severity: 'locked',
        reasonZh: '纯梦境壁纸模式已自动屏蔽光学棱镜、波纹光场、动效与像素伙伴；如需叠加请切换到「自由混搭」模式。',
      });
    }
  }

  // Rule 2: Hybrid guard — glassLayer requires wallpaperLayer (otherwise translucent glass over opaque host flickers)
  if (effectiveModules.glassLayer && !effectiveModules.wallpaperLayer) {
    disable('glassLayer', 'glass-without-wallpaper', '未开启背景壁纸时液态玻璃没有可透出的底图，已自动关闭以防界面闪烁');
    conflicts.push({
      code: 'glass-without-wallpaper',
      severity: 'auto-disabled',
      reasonZh: '关闭背景壁纸后液态玻璃已自动关闭（无底图可透）。',
    });
  }

  // Rule 3: Adapter compat mode degrades glassLayer safely (missing verified DOM anchors)
  if (ctx.adapterMode === 'compat' && effectiveModules.glassLayer) {
    disable('glassLayer', 'compat-glass-degraded', '当前客户端处于兼容保护模式（缺少部分布局锚点），已自动降级关闭液态玻璃以保可读性');
    warnings.push({
      code: 'compat-glass-degraded',
      reasonZh: '当前软件处于兼容模式，已自动关闭毛玻璃挖空，仅保留安全壁纸与配色变量层。',
    });
  }

  // Soft warning when wallpaperLayer is active but no media item is selected (still uses fallback gradient stage)
  if (effectiveModules.wallpaperLayer && ctx.hasWallpaper === false) {
    warnings.push({
      code: 'no-active-wallpaper',
      reasonZh: '尚未选定本地壁纸，将使用默认光学极光渐变画布作为底图。',
    });
  }

  return {
    skinMode,
    yielded: false,
    requestedModules,
    effectiveModules,
    disabledModules,
    conflicts,
    warnings,
    excludedHostFeatures: EXCLUDED_HOST_FEATURES,
  };
}
