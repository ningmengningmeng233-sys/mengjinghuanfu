// Canonical shared schema, presets, color schemes, and sanitizers for agy-wallpaper-prism.
// Shared across src/engine, src/host, src/studio-ui, sidecars/prism_studio, and test/verify-all.

import {
  CODE_FONTS,
  COMPANION_POSITIONS,
  COMPANION_STYLES,
  DEFAULT_SKIN_MODULES,
  EXCLUDED_HOST_FEATURES,
  MASCOT_PRESETS,
  MODE_PRESET_MODULES,
  MODULE_KEYS,
  MOTION_TIERS,
  RIM_TONES,
  SKIN_MODES,
  SKIN_MODE_DEFS,
  applySkinModePreset,
  normalizeSkinMode,
  resolveSkinComposition,
  sanitizeSkinModules,
} from './skin-modes.mjs';

export {
  CODE_FONTS,
  COMPANION_POSITIONS,
  COMPANION_STYLES,
  DEFAULT_SKIN_MODULES,
  EXCLUDED_HOST_FEATURES,
  MASCOT_PRESETS,
  MODE_PRESET_MODULES,
  MODULE_KEYS,
  MOTION_TIERS,
  RIM_TONES,
  SKIN_MODES,
  SKIN_MODE_DEFS,
  applySkinModePreset,
  normalizeSkinMode,
  resolveSkinComposition,
  sanitizeSkinModules,
};

export const PLUGIN_ID = 'dreamskin-prism';
export const PLUGIN_DISPLAY_NAME = '梦境换肤 Prism';
export const PLUGIN_VERSION = '4.1.0';
export const SIDECAR_ID = 'prism_studio';
export const SIDECAR_URI = 'sidecar://dreamskin-prism/prism_studio/';
export const CUSTOMIZATION_URI = 'customization://dreamskin-prism';
export const DEFAULT_DEBUG_PORT = 9339;

export const PRISM_DOM = Object.freeze({
  skinVersion: '4.1.0',
  skinAttr: 'data-agy-prism-skin',
  glassAttr: 'data-agy-prism-glass',
  wallpaperAttr: 'data-agy-prism-wallpaper',
  skinModeAttr: 'data-prism-skin-mode',
  opticalFacetAttr: 'data-prism-optical-facet',
  motionAttr: 'data-prism-motion',
  companionAttr: 'data-prism-companion',
  companionId: 'agy-prism-companion',
  staticStyleId: 'agy-prism-static-css',
  adapterStyleId: 'agy-prism-adapter-css',
  themeAttr: 'data-prism-theme',
  schemeAttr: 'data-prism-scheme',
  accentModeAttr: 'data-prism-accent-mode',
  layoutAttr: 'data-prism-layout',
  cornersAttr: 'data-prism-corners',
  bordersAttr: 'data-prism-borders',
  shadowsAttr: 'data-prism-shadows',
  kindAttr: 'data-prism-kind',
  styleId: 'agy-prism-css',
  stageId: 'agy-prism-stage',
  popoverId: 'agy-prism-popover',
  popoverStyleId: 'agy-prism-popover-css',
  pillId: 'agy-prism-pill',
  cornerOrbClass: 'prism-corner-orb',
  bindingName: '__agyPrismCall',
  skinGlobal: '__agyPrism',
  panelGlobal: '__agyPrismPanel',
});

export const STARTUP_MODES = Object.freeze(['gentle-auto', 'manual', 'static-css']);
export const CANARY_STATES = Object.freeze(['idle', 'arming', 'healthy', 'tripped']);
export const WALLPAPER_KINDS = Object.freeze(['image', 'video', 'slideshow', 'web', 'scene', 'none']);
export const LIBRARY_KINDS = Object.freeze(['image', 'video', 'slideshow', 'web', 'scene']);
export const CONTENT_RATINGS = Object.freeze(['everyone', 'pg13', 'mature', 'unrated']);
export const LAYOUT_MODES = Object.freeze(['islands', 'flush']);
export const CORNER_STYLES = Object.freeze(['sharp', 'balanced', 'soft']);
export const BORDER_MODES = Object.freeze(['on', 'subtle', 'off']);
export const THEME_MODES = Object.freeze(['auto', 'dark', 'light']);
export const CODE_READABILITY_MODES = Object.freeze(['translucent', 'frosted', 'solid']);
export const FIT_MODES = Object.freeze(['cover', 'contain', 'center', 'fill']);
export const FILTER_PRESETS = Object.freeze(['none', 'vivid', 'warm', 'cool', 'grayscale', 'sepia', 'contrast', 'darken', 'brighten']);
export const SWITCH_TRANSITIONS = Object.freeze(['cut', 'fade', 'push', 'wipe', 'iris', 'zoom', 'bars']);
export const SWITCH_DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down']);
export const SWITCH_SPEEDS = Object.freeze(['fast', 'normal', 'slow']);
export const ROTATION_ORDERS = Object.freeze(['sequence', 'random']);
export const ROTATION_TRIGGERS = Object.freeze(['interval', 'videoEnd']);
export const TRIGGER_MODES = Object.freeze(['pill', 'corner', 'both', 'shortcut-only']);
export const LANGUAGES = Object.freeze(['auto', 'zh', 'en']);
export const SIDEBAR_RADII = Object.freeze(['auto', 'native', '0', '6', '12', '16', '20']);

/** 8 Paired Light/Dark Color Schemes (Obsidian Prism + Theme Classics). */
export const COLOR_SCHEMES = Object.freeze({
  'prism-default': Object.freeze({
    id: 'prism-default',
    nameZh: '深空黑曜 / 白昼冷晶',
    nameEn: 'Prism Default',
    swatchDark: '#0E0E11',
    swatchLight: '#F4F7FB',
    swatchAccent: '#669DF6',
    dark: Object.freeze({
      ptRgb: '255, 255, 255',
      shadeRgb: '9, 9, 11',
      baseRgb: '14, 14, 17',
      tint1Rgb: '20, 20, 24',
      tint2Rgb: '28, 28, 34',
      popoverRgb: '22, 22, 28',
      fg: '#F2F2F5',
      fg2: '#C4C4CE',
      fgMuted: '#8A8A98',
      fgFaint: '#626270',
      accent: '#669DF6',
      accentRgb: '102, 157, 246',
      link: '#8AB4F8',
    }),
    light: Object.freeze({
      ptRgb: '15, 23, 42',
      shadeRgb: '232, 238, 246',
      baseRgb: '244, 247, 251',
      tint1Rgb: '255, 255, 255',
      tint2Rgb: '233, 239, 248',
      popoverRgb: '252, 253, 255',
      fg: '#0F172A',
      fg2: '#334155',
      fgMuted: '#5B6B82',
      fgFaint: '#7C8CA5',
      accent: '#2563EB',
      accentRgb: '37, 99, 235',
      link: '#1D4ED8',
    }),
  }),
  'warm-carbon': Object.freeze({
    id: 'warm-carbon',
    nameZh: '暖炭玄岩 / 暖白画册',
    nameEn: 'Warm Carbon',
    swatchDark: '#141413',
    swatchLight: '#F6F4EE',
    swatchAccent: '#D97757',
    dark: Object.freeze({
      ptRgb: '255, 250, 240',
      shadeRgb: '16, 16, 15',
      baseRgb: '20, 20, 19',
      tint1Rgb: '27, 26, 24',
      tint2Rgb: '36, 34, 31',
      popoverRgb: '24, 23, 21',
      fg: '#F2EFE9',
      fg2: '#D0C9BE',
      fgMuted: '#A39E93',
      fgFaint: '#726D63',
      accent: '#D97757',
      accentRgb: '217, 119, 87',
      link: '#E59377',
    }),
    light: Object.freeze({
      ptRgb: '28, 24, 20',
      shadeRgb: '235, 230, 220',
      baseRgb: '246, 244, 238',
      tint1Rgb: '255, 253, 249',
      tint2Rgb: '239, 234, 224',
      popoverRgb: '254, 252, 247',
      fg: '#1C1814',
      fg2: '#3F3931',
      fgMuted: '#6B6257',
      fgFaint: '#8E8478',
      accent: '#C25934',
      accentRgb: '194, 89, 52',
      link: '#B54D28',
    }),
  }),
  catppuccin: Object.freeze({
    id: 'catppuccin',
    nameZh: '猫布奇诺 (Mocha / Latte)',
    nameEn: 'Catppuccin',
    swatchDark: '#1E1E2E',
    swatchLight: '#EFF1F5',
    swatchAccent: '#CBA6F7',
    dark: Object.freeze({
      ptRgb: '205, 214, 244',
      shadeRgb: '24, 24, 37',
      baseRgb: '30, 30, 46',
      tint1Rgb: '49, 50, 68',
      tint2Rgb: '69, 71, 90',
      popoverRgb: '36, 39, 58',
      fg: '#CDD6F4',
      fg2: '#BAC2DE',
      fgMuted: '#9399B2',
      fgFaint: '#6C7086',
      accent: '#CBA6F7',
      accentRgb: '203, 166, 247',
      link: '#89B4FA',
    }),
    light: Object.freeze({
      ptRgb: '76, 79, 105',
      shadeRgb: '230, 233, 239',
      baseRgb: '239, 241, 245',
      tint1Rgb: '252, 253, 255',
      tint2Rgb: '220, 224, 232',
      popoverRgb: '250, 251, 254',
      fg: '#4C4F69',
      fg2: '#5C5F77',
      fgMuted: '#6C6F85',
      fgFaint: '#8C8FA1',
      accent: '#8839EF',
      accentRgb: '136, 57, 239',
      link: '#1E66F5',
    }),
  }),
  nord: Object.freeze({
    id: 'nord',
    nameZh: '极地冰川 (Night / Snow)',
    nameEn: 'Nord',
    swatchDark: '#2E3440',
    swatchLight: '#ECEFF4',
    swatchAccent: '#88C0D0',
    dark: Object.freeze({
      ptRgb: '236, 239, 244',
      shadeRgb: '36, 41, 51',
      baseRgb: '46, 52, 64',
      tint1Rgb: '59, 66, 82',
      tint2Rgb: '67, 76, 94',
      popoverRgb: '52, 58, 72',
      fg: '#ECEFF4',
      fg2: '#D8DEE9',
      fgMuted: '#9AA5B8',
      fgFaint: '#727E94',
      accent: '#88C0D0',
      accentRgb: '136, 192, 208',
      link: '#81A1C1',
    }),
    light: Object.freeze({
      ptRgb: '46, 52, 64',
      shadeRgb: '229, 233, 240',
      baseRgb: '236, 239, 244',
      tint1Rgb: '248, 250, 252',
      tint2Rgb: '216, 222, 233',
      popoverRgb: '250, 252, 255',
      fg: '#2E3440',
      fg2: '#3B4252',
      fgMuted: '#5E6B80',
      fgFaint: '#7B889E',
      accent: '#5E81AC',
      accentRgb: '94, 129, 172',
      link: '#4C6E99',
    }),
  }),
  'rose-pine': Object.freeze({
    id: 'rose-pine',
    nameZh: '松间玫瑰 (Main / Dawn)',
    nameEn: 'Rosé Pine',
    swatchDark: '#1F1D2E',
    swatchLight: '#FAF4ED',
    swatchAccent: '#C4A7E7',
    dark: Object.freeze({
      ptRgb: '224, 222, 244',
      shadeRgb: '25, 23, 36',
      baseRgb: '31, 29, 46',
      tint1Rgb: '38, 35, 58',
      tint2Rgb: '52, 48, 76',
      popoverRgb: '34, 31, 52',
      fg: '#E0DEF4',
      fg2: '#C4C0DF',
      fgMuted: '#908CAA',
      fgFaint: '#6E6A86',
      accent: '#C4A7E7',
      accentRgb: '196, 167, 231',
      link: '#EBBCBA',
    }),
    light: Object.freeze({
      ptRgb: '87, 82, 121',
      shadeRgb: '242, 233, 225',
      baseRgb: '250, 244, 237',
      tint1Rgb: '255, 250, 243',
      tint2Rgb: '240, 229, 219',
      popoverRgb: '255, 251, 246',
      fg: '#575279',
      fg2: '#68638A',
      fgMuted: '#797593',
      fgFaint: '#9893A5',
      accent: '#907AA9',
      accentRgb: '144, 122, 169',
      link: '#D7827E',
    }),
  }),
  'tokyo-night': Object.freeze({
    id: 'tokyo-night',
    nameZh: '东京夜色 (Night / Day)',
    nameEn: 'Tokyo Night',
    swatchDark: '#1A1B26',
    swatchLight: '#E1E2E7',
    swatchAccent: '#7AA2F7',
    dark: Object.freeze({
      ptRgb: '192, 202, 245',
      shadeRgb: '22, 22, 30',
      baseRgb: '26, 27, 38',
      tint1Rgb: '36, 40, 59',
      tint2Rgb: '47, 53, 77',
      popoverRgb: '31, 35, 53',
      fg: '#C0CAF5',
      fg2: '#A9B1D6',
      fgMuted: '#787C99',
      fgFaint: '#565F89',
      accent: '#7AA2F7',
      accentRgb: '122, 162, 247',
      link: '#7DCFFF',
    }),
    light: Object.freeze({
      ptRgb: '55, 96, 191',
      shadeRgb: '213, 214, 219',
      baseRgb: '225, 226, 231',
      tint1Rgb: '242, 243, 247',
      tint2Rgb: '208, 211, 222',
      popoverRgb: '246, 247, 251',
      fg: '#3760BF',
      fg2: '#475E9E',
      fgMuted: '#6172B0',
      fgFaint: '#848CB5',
      accent: '#2E7DE9',
      accentRgb: '46, 125, 233',
      link: '#007197',
    }),
  }),
  gruvbox: Object.freeze({
    id: 'gruvbox',
    nameZh: '复古暖砂 (Dark / Light)',
    nameEn: 'Gruvbox',
    swatchDark: '#282828',
    swatchLight: '#FBF1C7',
    swatchAccent: '#FABD2F',
    dark: Object.freeze({
      ptRgb: '235, 219, 178',
      shadeRgb: '29, 32, 33',
      baseRgb: '40, 40, 40',
      tint1Rgb: '60, 56, 54',
      tint2Rgb: '80, 73, 69',
      popoverRgb: '50, 48, 47',
      fg: '#EBDBB2',
      fg2: '#D5C4A1',
      fgMuted: '#A89984',
      fgFaint: '#7C6F64',
      accent: '#FABD2F',
      accentRgb: '250, 189, 47',
      link: '#83A598',
    }),
    light: Object.freeze({
      ptRgb: '60, 56, 54',
      shadeRgb: '235, 219, 178',
      baseRgb: '251, 241, 199',
      tint1Rgb: '249, 245, 215',
      tint2Rgb: '235, 219, 178',
      popoverRgb: '252, 248, 224',
      fg: '#3C3836',
      fg2: '#504945',
      fgMuted: '#7C6F64',
      fgFaint: '#928374',
      accent: '#B57614',
      accentRgb: '181, 118, 20',
      link: '#076678',
    }),
  }),
  'host-native': Object.freeze({
    id: 'host-native',
    nameZh: '跟随宿主原生',
    nameEn: 'Antigravity Native',
    swatchDark: '#070708',
    swatchLight: '#F7F7F8',
    swatchAccent: '#2F71E3',
    dark: Object.freeze({
      ptRgb: '255, 255, 255',
      shadeRgb: '17, 17, 20',
      baseRgb: '7, 7, 8',
      tint1Rgb: '19, 19, 23',
      tint2Rgb: '28, 28, 34',
      popoverRgb: '19, 19, 25',
      fg: '#FFFFFF',
      fg2: '#D4D4DC',
      fgMuted: '#8E929B',
      fgFaint: '#646872',
      accent: '#2F71E3',
      accentRgb: '47, 113, 227',
      link: '#6A9FCB',
    }),
    light: Object.freeze({
      ptRgb: '15, 23, 42',
      shadeRgb: '238, 238, 241',
      baseRgb: '247, 247, 248',
      tint1Rgb: '255, 255, 255',
      tint2Rgb: '234, 236, 240',
      popoverRgb: '255, 255, 255',
      fg: '#111827',
      fg2: '#374151',
      fgMuted: '#6B7280',
      fgFaint: '#9CA3AF',
      accent: '#0066CC',
      accentRgb: '0, 102, 204',
      link: '#0055AA',
    }),
  }),
});

export const COLOR_SCHEME_IDS = Object.freeze(Object.keys(COLOR_SCHEMES));

export const ACCENT_MODES = Object.freeze([
  'dynamic',
  'palette',
  'cobalt',
  'iris',
  'amber',
  'emerald',
  'rose',
  'mono',
  'custom',
]);

export const ACCENT_PRESETS = Object.freeze({
  cobalt: Object.freeze({ dark: '#669DF6', darkFg: '#FFFFFF', light: '#2563EB', lightFg: '#FFFFFF' }),
  iris: Object.freeze({ dark: '#A58AF8', darkFg: '#FFFFFF', light: '#7C3AED', lightFg: '#FFFFFF' }),
  amber: Object.freeze({ dark: '#F2B84B', darkFg: '#14120E', light: '#D97706', lightFg: '#FFFFFF' }),
  emerald: Object.freeze({ dark: '#50A37B', darkFg: '#FFFFFF', light: '#059669', lightFg: '#FFFFFF' }),
  rose: Object.freeze({ dark: '#F472B6', darkFg: '#14120E', light: '#DB2777', lightFg: '#FFFFFF' }),
  mono: Object.freeze({ dark: '#D4D7E0', darkFg: '#0E0F14', light: '#334155', lightFg: '#FFFFFF' }),
});

/** 4 Quick Optical Scene Presets (Crystal | Islands | Focus | Eco). */
export const SCENE_PRESETS = Object.freeze({
  crystal: Object.freeze({
    id: 'crystal',
    nameZh: '通透流光',
    nameEn: 'Crystal',
    patch: Object.freeze({
      preset: 'crystal',
      layoutMode: 'islands',
      islandGap: 8,
      workspacePad: 8,
      cornerStyle: 'balanced',
      borders: 'on',
      shadows: true,
      glassSurfaces: true,
      glassOpacity: 0.34,
      glassBlur: 0,
      glassFidelity: 82,
      chatGlassFidelity: 78,
      scrimOpacity: 0.06,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.018,
      paused: false,
    }),
  }),
  islands: Object.freeze({
    id: 'islands',
    nameZh: '浮岛画境',
    nameEn: 'Islands',
    patch: Object.freeze({
      preset: 'islands',
      layoutMode: 'islands',
      islandGap: 8,
      workspacePad: 8,
      cornerStyle: 'balanced',
      borders: 'on',
      shadows: true,
      glassSurfaces: true,
      glassOpacity: 0.60,
      glassBlur: 8,
      glassFidelity: 92,
      chatGlassFidelity: 90,
      scrimOpacity: 0.14,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.022,
      paused: false,
    }),
  }),
  focus: Object.freeze({
    id: 'focus',
    nameZh: '沉静柔焦',
    nameEn: 'Focus',
    patch: Object.freeze({
      preset: 'focus',
      layoutMode: 'flush',
      islandGap: 0,
      workspacePad: 0,
      cornerStyle: 'balanced',
      borders: 'subtle',
      shadows: false,
      glassSurfaces: true,
      glassOpacity: 0.88,
      glassBlur: 20,
      glassFidelity: 100,
      chatGlassFidelity: 100,
      scrimOpacity: 0.42,
      mediaBlur: 8,
      vignette: true,
      grainAlpha: 0.012,
      paused: false,
    }),
  }),
  eco: Object.freeze({
    id: 'eco',
    nameZh: '极简省电',
    nameEn: 'Eco',
    patch: Object.freeze({
      preset: 'eco',
      layoutMode: 'flush',
      islandGap: 0,
      workspacePad: 0,
      cornerStyle: 'sharp',
      borders: 'subtle',
      shadows: false,
      glassSurfaces: false,
      glassOpacity: 0.94,
      glassBlur: 0,
      glassFidelity: 100,
      chatGlassFidelity: 100,
      scrimOpacity: 0.34,
      mediaBlur: 0,
      vignette: false,
      grainAlpha: 0,
      paused: true,
      fxEnabled: false,
      parallaxEnabled: false,
      fpsCap: 30,
    }),
  }),
});

export const SCENE_PRESET_IDS = Object.freeze(Object.keys(SCENE_PRESETS));

/** 7 Factory Whole-Profile Presets (DSH + Obsidian Prism Parity). */
export const FACTORY_PRESETS = Object.freeze([
  Object.freeze({
    id: 'factory-prism-islands',
    name: '棱镜浮岛',
    nameEn: 'Prism Islands',
    description: 'Obsidian Prism 标志性圆角浮岛与动态壁纸取色',
    descriptionEn: 'Signature Obsidian Prism floating islands with dynamic wallpaper accent',
    builtin: true,
    patch: Object.freeze({
      preset: 'islands',
      layoutMode: 'islands',
      islandGap: 8,
      workspacePad: 8,
      cornerStyle: 'balanced',
      colorScheme: 'prism-default',
      accentMode: 'dynamic',
      glassSurfaces: true,
      glassOpacity: 0.76,
      glassBlur: 16,
      glassFidelity: 92,
      chatGlassFidelity: 90,
      codeReadabilityMode: 'translucent',
      scrimOpacity: 0.26,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.022,
    }),
  }),
  Object.freeze({
    id: 'factory-author',
    name: '作者自用',
    nameEn: "Author's Pick",
    description: 'Catppuccin Mocha 柔和雾面浮岛与自适应光感平衡',
    descriptionEn: 'Catppuccin Mocha frosted islands balanced for long coding sessions',
    builtin: true,
    patch: Object.freeze({
      preset: 'islands',
      layoutMode: 'islands',
      islandGap: 10,
      workspacePad: 8,
      cornerStyle: 'soft',
      colorScheme: 'catppuccin',
      accentMode: 'dynamic',
      glassSurfaces: true,
      glassOpacity: 0.74,
      glassBlur: 18,
      glassFidelity: 94,
      chatGlassFidelity: 92,
      codeReadabilityMode: 'translucent',
      scrimOpacity: 0.24,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.02,
    }),
  }),
  Object.freeze({
    id: 'factory-default',
    name: '黑客绿 (Fish)',
    nameEn: 'Cyber Emerald',
    description: 'DSH 经典翡翠强调色与高锐度暗色毛玻璃',
    descriptionEn: 'Classic DSH cyber emerald accent over crisp dark obsidian glass',
    builtin: true,
    patch: Object.freeze({
      preset: 'crystal',
      layoutMode: 'islands',
      islandGap: 6,
      workspacePad: 6,
      cornerStyle: 'sharp',
      colorScheme: 'prism-default',
      accentMode: 'emerald',
      glassSurfaces: true,
      glassOpacity: 0.70,
      glassBlur: 14,
      glassFidelity: 88,
      chatGlassFidelity: 85,
      codeReadabilityMode: 'translucent',
      scrimOpacity: 0.22,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.015,
    }),
  }),
  Object.freeze({
    id: 'factory-frosted',
    name: '重磨砂',
    nameEn: 'Heavy Frosted',
    description: 'Nord 极地冰川 28px 高斯磨砂亚克力质感',
    descriptionEn: 'Deep 28px Nord frosted acrylic veil taming busy motion wallpapers',
    builtin: true,
    patch: Object.freeze({
      preset: 'custom',
      layoutMode: 'islands',
      islandGap: 8,
      workspacePad: 8,
      cornerStyle: 'balanced',
      colorScheme: 'nord',
      accentMode: 'palette',
      glassSurfaces: true,
      glassOpacity: 0.82,
      glassBlur: 28,
      glassFidelity: 96,
      chatGlassFidelity: 95,
      codeReadabilityMode: 'frosted',
      scrimOpacity: 0.30,
      mediaBlur: 4,
      vignette: true,
      grainAlpha: 0.028,
    }),
  }),
  Object.freeze({
    id: 'factory-night',
    name: '暗夜釉色',
    nameEn: 'Midnight Glaze',
    description: 'Tokyo Night 深海蓝黑釉面与低眩光遮罩',
    descriptionEn: 'Tokyo Night midnight glaze with low-glare reading scrim',
    builtin: true,
    patch: Object.freeze({
      preset: 'custom',
      layoutMode: 'islands',
      islandGap: 8,
      workspacePad: 8,
      cornerStyle: 'balanced',
      colorScheme: 'tokyo-night',
      accentMode: 'cobalt',
      glassSurfaces: true,
      glassOpacity: 0.80,
      glassBlur: 20,
      glassFidelity: 95,
      chatGlassFidelity: 94,
      codeReadabilityMode: 'translucent',
      scrimOpacity: 0.34,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.018,
    }),
  }),
  Object.freeze({
    id: 'factory-readable',
    name: '可读优先',
    nameEn: 'Readability First',
    description: '100% 原生实心代码块与高对比度护眼底色',
    descriptionEn: '100% solid code/terminal surfaces with maximum WCAG readability floor',
    builtin: true,
    patch: Object.freeze({
      preset: 'focus',
      layoutMode: 'flush',
      islandGap: 0,
      workspacePad: 0,
      cornerStyle: 'balanced',
      colorScheme: 'host-native',
      accentMode: 'palette',
      glassSurfaces: true,
      glassOpacity: 0.90,
      glassBlur: 22,
      glassFidelity: 100,
      chatGlassFidelity: 100,
      codeReadabilityMode: 'solid',
      contrastFloor: true,
      scrimOpacity: 0.44,
      mediaBlur: 6,
      vignette: true,
      grainAlpha: 0.01,
    }),
  }),
  Object.freeze({
    id: 'purple-mood',
    name: '紫色心情',
    nameEn: 'Purple Mood',
    description: 'Rosé Pine 松间暮紫与柔和圆角呼吸感画框',
    descriptionEn: 'Rosé Pine twilight iris aura with soft 16px rounded islands',
    builtin: true,
    patch: Object.freeze({
      preset: 'crystal',
      layoutMode: 'islands',
      islandGap: 10,
      workspacePad: 10,
      cornerStyle: 'soft',
      colorScheme: 'rose-pine',
      accentMode: 'iris',
      glassSurfaces: true,
      glassOpacity: 0.68,
      glassBlur: 18,
      glassFidelity: 88,
      chatGlassFidelity: 84,
      codeReadabilityMode: 'translucent',
      scrimOpacity: 0.22,
      mediaBlur: 0,
      vignette: true,
      grainAlpha: 0.024,
    }),
  }),
]);

/** Canonical default configuration for agy-wallpaper-prism. */
export const DEFAULT_CONFIG = Object.freeze({
  // Master state & active wallpaper
  skinEnabled: true,
  skinMode: 'wallpaper',
  modules: DEFAULT_SKIN_MODULES,
  companionStyle: 'clawd',
  companionPosition: 'bottom-right',
  mascotSpec: 'crab',
  prismaticCoat: false,
  completionSound: true,
  rimTone: 'follow',
  motionTier: 'ultra',
  ambientIntensity: 1,
  vividness: 'balanced',
  fontStyle: 'modern',
  textStyle: 'stylized',
  habitatMode: 'auto',
  codeFont: 'default',
  codeLigatures: false,
  sidebarCompact: false,
  startupMode: 'gentle-auto',
  activeWallpaperId: '',
  wallpaperId: '',
  kind: 'image',
  preset: 'islands',
  activeProfilePresetId: 'factory-prism-islands',

  // Layout & Concentric Geometry
  layoutMode: 'islands',
  islandGap: 8,
  workspacePad: 8,
  cornerStyle: 'balanced',
  leftSidebarRadius: 'auto',
  rightSidebarRadius: 'auto',
  borders: 'on',
  shadows: true,

  // Adaptive Theme, Color Scheme & Dynamic Accent
  themeMode: 'auto',
  themeFollow: false,
  colorScheme: 'prism-default',
  accentMode: 'dynamic',
  customAccent: '#669DF6',
  extractedAccent: null,
  accentCache: {},
  wallTintMix: 0.06,

  // Glass & Readability Guardrails
  glassSurfaces: true,
  glassOpacity: 0.60,
  glassBlur: 8,
  glassFidelity: 92,
  chatGlassFidelity: 90,
  codeReadabilityMode: 'translucent',
  contrastFloor: true,
  floaterSolidBase: true,
  caretColor: '',

  // Wallpaper Media Optics & Free Framing
  scrimOpacity: 0.14,
  scrimColor: 'auto',
  vignette: true,
  mediaOpacity: 1.0,
  mediaBlur: 0,
  mediaBrightness: 100,
  mediaContrast: 100,
  mediaSaturate: 105,
  grainAlpha: 0.022,
  filterPreset: 'none',
  fit: 'cover',
  flip: false,
  layerPosX: 50,
  layerPosY: 50,
  layerScale: 100,

  // Playback, Transitions, Audio & Power Lifecycle
  paused: false,
  muted: true,
  audioEnabled: false,
  volume: 0.5,
  playbackRate: 1.0,
  fpsCap: 0,
  pictureSlideSeconds: 0,
  sceneLive: true,
  sceneLiveFps: 30,
  sceneAutoQuality: true,
  liveBootDelay: 1.5,
  interactiveWeb: false,
  switchTransition: 'fade',
  switchTransitionDir: 'left',
  switchTransitionSpeed: 'normal',
  pauseOnHidden: true,
  pauseOnBlur: false,
  pauseOnBattery: true,
  focusFreezeEnabled: true,
  pauseOnFullscreen: false,
  desktopSync: false,

  // Playlists, Library Curation & Per-Wallpaper Memory
  rotationEnabled: false,
  rotationSeeded: false,
  rotationGroupId: '',
  rotationOrder: 'random',
  rotationTrigger: 'interval',
  rotationInterval: 15,
  rotationGroups: [],
  favorites: [],
  hiddenIds: [],
  typeFilter: ['image', 'video', 'slideshow', 'web', 'scene'],
  contentRatingFilter: ['everyone', 'pg13', 'unrated'],
  pickerLayout: 'fixed',
  userProps: {},
  perWallpaperOverrides: {},
  frameVariants: {},
  sceneLiveFailures: [],
  deletedFactoryPresets: [],

  // Storage, Optional Extensions & Host Ergonomics
  uploadDir: '',
  cacheDir: '',
  customFolders: [],
  fxEnabled: false,
  fxClickMode: 'ripple',
  fxTrailMode: 'dust',
  parallaxEnabled: false,
  parallaxStrength: 12,
  triggerMode: 'both',
  debugPort: DEFAULT_DEBUG_PORT,
  language: 'zh',
});

/** Keys reset by each non-destructive 3-tier reset scope (preserves library/uploads/userProps/favorites/hiddenIds). */
export const RESET_SCOPES = Object.freeze({
  skin: Object.freeze([
    'skinMode',
    'modules',
    'companionStyle',
    'companionPosition',
    'preset',
    'layoutMode',
    'islandGap',
    'workspacePad',
    'cornerStyle',
    'leftSidebarRadius',
    'rightSidebarRadius',
    'borders',
    'shadows',
    'themeMode',
    'themeFollow',
    'colorScheme',
    'accentMode',
    'customAccent',
    'wallTintMix',
    'glassSurfaces',
    'glassOpacity',
    'glassBlur',
    'glassFidelity',
    'chatGlassFidelity',
    'codeReadabilityMode',
    'contrastFloor',
    'floaterSolidBase',
    'caretColor',
  ]),
  optics: Object.freeze([
    'scrimOpacity',
    'scrimColor',
    'vignette',
    'mediaOpacity',
    'mediaBlur',
    'mediaBrightness',
    'mediaContrast',
    'mediaSaturate',
    'grainAlpha',
    'filterPreset',
    'fit',
    'flip',
    'layerPosX',
    'layerPosY',
    'layerScale',
    'fxEnabled',
    'fxClickMode',
    'fxTrailMode',
    'parallaxEnabled',
    'parallaxStrength',
  ]),
  playback: Object.freeze([
    'paused',
    'muted',
    'audioEnabled',
    'volume',
    'playbackRate',
    'fpsCap',
    'pictureSlideSeconds',
    'sceneLive',
    'sceneLiveFps',
    'sceneAutoQuality',
    'startupMode',
    'liveBootDelay',
    'interactiveWeb',
    'switchTransition',
    'switchTransitionDir',
    'switchTransitionSpeed',
    'pauseOnHidden',
    'pauseOnBlur',
    'pauseOnBattery',
    'pauseOnFullscreen',
    'desktopSync',
    'rotationEnabled',
    'rotationOrder',
    'rotationTrigger',
    'rotationInterval',
  ]),
});

export const PER_WALLPAPER_OVERRIDE_KEYS = Object.freeze([
  'layoutMode',
  'colorScheme',
  'accentMode',
  'customAccent',
  'glassOpacity',
  'glassBlur',
  'scrimOpacity',
  'mediaOpacity',
  'mediaBlur',
  'mediaBrightness',
  'mediaContrast',
  'mediaSaturate',
  'grainAlpha',
  'vignette',
  'fit',
  'flip',
  'layerPosX',
  'layerPosY',
  'layerScale',
  'playbackRate',
  'volume',
  'muted',
]);

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function num(v, fallback, min, max, decimals = 4) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const c = clamp(n, min, max);
  const f = 10 ** decimals;
  return Math.round(c * f) / f;
}

function percentNum(v, fallback, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  // Accept both 0.4..2.0 factor notation and 40..200 percentage notation seamlessly
  const scaled = n > 0 && n <= 2.5 && max >= 100 ? n * 100 : n;
  return Math.round(clamp(scaled, min, max));
}

function bool(v, fallback) {
  if (typeof v === 'boolean') return v;
  if (v === 'on' || v === 'true' || v === 1) return true;
  if (v === 'off' || v === 'false' || v === 0) return false;
  return fallback;
}

function oneOf(v, list, fallback) {
  return list.includes(v) ? v : fallback;
}

const SAFE_COLOR_RE = /^(?:auto|#[0-9a-f]{3,8}|[a-z]{3,24}|(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,/]+\))$/i;

function cleanColor(v, fallback = '') {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!s) return fallback;
  return s.length <= 64 && SAFE_COLOR_RE.test(s) ? s : fallback;
}

function cleanStringArray(v, fallback = [], nonEmptyChoices = null) {
  if (!Array.isArray(v)) return [...fallback];
  const out = [];
  const seen = new Set();
  for (const item of v) {
    const s = String(item ?? '').trim();
    if (!s || seen.has(s)) continue;
    if (nonEmptyChoices && !nonEmptyChoices.includes(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (nonEmptyChoices && out.length === 0) return [...fallback];
  return out;
}

export function hexToRgbTriplet(hex, fallback = null) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function contrastFgForHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#FFFFFF';
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? '#14120E' : '#FFFFFF';
}

/** Resolve active scheme + accent tokens for either 'dark' or 'light' polarity. */
export function resolveSchemeTokens(config = DEFAULT_CONFIG, polarity = 'dark') {
  const tone = polarity === 'light' ? 'light' : 'dark';
  const scheme = COLOR_SCHEMES[config.colorScheme] || COLOR_SCHEMES['prism-default'];
  const base = scheme[tone];
  const mode = config.accentMode || 'dynamic';

  let accent = base.accent;
  let accentFg = contrastFgForHex(accent);
  let wallTintRgb = base.accentRgb;

  if (mode === 'dynamic' && config.extractedAccent) {
    const ext = config.extractedAccent;
    const candidate = tone === 'light' ? ext.lightHex : ext.darkHex;
    if (candidate && /^#[0-9a-f]{6}$/i.test(candidate)) {
      accent = candidate;
      accentFg = contrastFgForHex(accent);
    }
    if (ext.tintRgb && /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(ext.tintRgb)) {
      wallTintRgb = ext.tintRgb;
    } else {
      wallTintRgb = hexToRgbTriplet(accent, base.accentRgb);
    }
  } else if (mode === 'custom' && config.customAccent) {
    accent = /^#[0-9a-f]{3,6}$/i.test(config.customAccent) ? config.customAccent : base.accent;
    accentFg = contrastFgForHex(accent);
    wallTintRgb = hexToRgbTriplet(accent, base.accentRgb);
  } else if (ACCENT_PRESETS[mode]) {
    const p = ACCENT_PRESETS[mode];
    accent = tone === 'light' ? p.light : p.dark;
    accentFg = tone === 'light' ? p.lightFg : p.darkFg;
    wallTintRgb = hexToRgbTriplet(accent, base.accentRgb);
  } else {
    wallTintRgb = hexToRgbTriplet(accent, base.accentRgb);
  }

  return {
    schemeId: scheme.id,
    tone,
    ...base,
    accent,
    accentRgb: hexToRgbTriplet(accent, base.accentRgb),
    accentFg,
    wallTintRgb,
  };
}

function sanitizeExtractedAccent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const darkHex = cleanColor(raw.darkHex, '');
  const lightHex = cleanColor(raw.lightHex, '');
  const tintRgb = typeof raw.tintRgb === 'string' && /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(raw.tintRgb.trim())
    ? raw.tintRgb.trim()
    : '';
  if (!darkHex && !lightHex) return null;
  return {
    wallpaperId: String(raw.wallpaperId || '').slice(0, 180),
    darkHex: darkHex || '#669DF6',
    lightHex: lightHex || '#2563EB',
    tintRgb: tintRgb || hexToRgbTriplet(darkHex || '#669DF6'),
  };
}

function sanitizeRotationGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const g of raw.slice(0, 64)) {
    if (!g || typeof g !== 'object') continue;
    const id = String(g.id || '').trim().slice(0, 80);
    if (!id) continue;
    const name = String(g.name || 'Playlist').trim().slice(0, 80) || 'Playlist';
    const wallpaperIds = cleanStringArray(g.wallpaperIds, []);
    const order = oneOf(g.order, ROTATION_ORDERS, 'random');
    const trigger = oneOf(g.trigger, ROTATION_TRIGGERS, 'interval');
    const interval = num(g.interval, 15, 1, 1440, 0);
    out.push({ id, name, wallpaperIds, order, trigger, interval });
  }
  return out;
}

/** Sanitize and merge a full or partial config object against `base`. */
export function sanitizeConfig(input = {}, base = DEFAULT_CONFIG) {
  const src = input && typeof input === 'object' ? input : {};
  const b = base && typeof base === 'object' ? base : DEFAULT_CONFIG;
  const merged = { ...DEFAULT_CONFIG, ...b, ...src };

  // Synchronize alias pairs cleanly
  let activeId = typeof src.activeWallpaperId === 'string'
    ? src.activeWallpaperId.trim()
    : typeof src.wallpaperId === 'string'
      ? src.wallpaperId.trim()
      : String(b.activeWallpaperId || b.wallpaperId || '').trim();
  activeId = activeId.slice(0, 240);

  // Sync muted <-> audioEnabled when only one is supplied in `src`
  let muted = bool(merged.muted, DEFAULT_CONFIG.muted);
  let audioEnabled = bool(merged.audioEnabled, !muted);
  if ('muted' in src && !('audioEnabled' in src)) {
    audioEnabled = !muted;
  } else if ('audioEnabled' in src && !('muted' in src)) {
    muted = !audioEnabled;
  }

  // Legacy/DSH field aliases
  const pauseOnBlur = 'pauseOnUnfocus' in src ? bool(src.pauseOnUnfocus, false) : bool(merged.pauseOnBlur, DEFAULT_CONFIG.pauseOnBlur);
  const pauseOnHidden = 'pauseOnMinimized' in src ? bool(src.pauseOnMinimized, true) : bool(merged.pauseOnHidden, DEFAULT_CONFIG.pauseOnHidden);
  const rotationOrder = src.rotationMode === 'shuffle'
    ? 'random'
    : src.rotationMode === 'sequential'
      ? 'sequence'
      : oneOf(merged.rotationOrder, ROTATION_ORDERS, DEFAULT_CONFIG.rotationOrder);
  const rotationInterval = 'rotationIntervalSec' in src && !('rotationInterval' in src)
    ? num(Number(src.rotationIntervalSec) / 60, DEFAULT_CONFIG.rotationInterval, 1, 1440, 0)
    : num(merged.rotationInterval, DEFAULT_CONFIG.rotationInterval, 1, 1440, 0);
  const language = merged.language === 'zh-CN' ? 'zh' : oneOf(merged.language, LANGUAGES, DEFAULT_CONFIG.language);

  const fpsRaw = num(merged.fpsCap, 0, 0, 120, 0);
  const fpsCap = [0, 30, 60].includes(fpsRaw) ? fpsRaw : 0;
  const sceneFpsRaw = num(merged.sceneLiveFps, 30, 15, 60, 0);
  const sceneLiveFps = [15, 30, 60].includes(sceneFpsRaw) ? sceneFpsRaw : 30;
  const rawBootDelay = merged.liveBootDelay === 0 || merged.liveBootDelay === '0'
    ? DEFAULT_CONFIG.liveBootDelay
    : merged.liveBootDelay;

  const prevSkinMode = normalizeSkinMode(b.skinMode, DEFAULT_CONFIG.skinMode);
  const skinMode = normalizeSkinMode(
    'skinMode' in src ? src.skinMode : b.skinMode,
    DEFAULT_CONFIG.skinMode,
  );
  const modeChanged = 'skinMode' in src && skinMode !== prevSkinMode;
  const modeFallback = MODE_PRESET_MODULES[skinMode] || DEFAULT_SKIN_MODULES;
  const baseModules =
    !modeChanged && b.modules && typeof b.modules === 'object'
      ? sanitizeSkinModules(b.modules, modeFallback)
      : { ...modeFallback };
  const incomingModules =
    src.modules && typeof src.modules === 'object' ? { ...src.modules } : {};
  for (const mk of MODULE_KEYS) {
    if (!(mk in incomingModules) && mk in src && typeof src[mk] === 'boolean') {
      incomingModules[mk] = src[mk];
    }
  }
  const modules = sanitizeSkinModules(incomingModules, baseModules);

  return {
    skinEnabled: bool(merged.skinEnabled, DEFAULT_CONFIG.skinEnabled),
    skinMode,
    modules,
    companionStyle: oneOf(merged.companionStyle, COMPANION_STYLES, DEFAULT_CONFIG.companionStyle),
    companionPosition: oneOf(merged.companionPosition, COMPANION_POSITIONS, DEFAULT_CONFIG.companionPosition),
    mascotSpec: (typeof merged.mascotSpec === 'string' && /^r:(?:[ckdwfp][01](?:,[ckdwfp][01])*)?(?:\+m)?$/.test(merged.mascotSpec))
      ? merged.mascotSpec
      : oneOf(merged.mascotSpec, MASCOT_PRESETS, DEFAULT_CONFIG.mascotSpec),
    prismaticCoat: bool(merged.prismaticCoat, DEFAULT_CONFIG.prismaticCoat),
    completionSound: bool(merged.completionSound, DEFAULT_CONFIG.completionSound),
    rimTone: oneOf(merged.rimTone, RIM_TONES, DEFAULT_CONFIG.rimTone),
    motionTier: oneOf(merged.motionTier, MOTION_TIERS, DEFAULT_CONFIG.motionTier),
    ambientIntensity: num(merged.ambientIntensity, DEFAULT_CONFIG.ambientIntensity, 0, 1, 2),
    vividness: oneOf(merged.vividness, ['soft', 'balanced', 'vivid'], DEFAULT_CONFIG.vividness),
    fontStyle: oneOf(merged.fontStyle, ['modern', 'editorial', 'mono'], DEFAULT_CONFIG.fontStyle),
    textStyle: oneOf(merged.textStyle, ['stylized', 'crisp', 'minimal'], DEFAULT_CONFIG.textStyle),
    habitatMode: oneOf(merged.habitatMode, ['auto', 'cactus', 'lamp', 'hourglass'], DEFAULT_CONFIG.habitatMode),
    codeFont: oneOf(merged.codeFont, CODE_FONTS, DEFAULT_CONFIG.codeFont),
    codeLigatures: bool(merged.codeLigatures, DEFAULT_CONFIG.codeLigatures),
    sidebarCompact: bool(merged.sidebarCompact, DEFAULT_CONFIG.sidebarCompact),
    startupMode: oneOf(merged.startupMode, STARTUP_MODES, DEFAULT_CONFIG.startupMode),
    activeWallpaperId: activeId,
    wallpaperId: activeId,
    kind: oneOf(merged.kind, WALLPAPER_KINDS, DEFAULT_CONFIG.kind),
    preset: oneOf(merged.preset, [...SCENE_PRESET_IDS, 'custom'], DEFAULT_CONFIG.preset),
    activeProfilePresetId: String(merged.activeProfilePresetId || '').slice(0, 100),

    layoutMode: oneOf(merged.layoutMode, LAYOUT_MODES, DEFAULT_CONFIG.layoutMode),
    islandGap: num(merged.islandGap, DEFAULT_CONFIG.islandGap, 0, 20, 0),
    workspacePad: num(merged.workspacePad, DEFAULT_CONFIG.workspacePad, 0, 20, 0),
    cornerStyle: oneOf(merged.cornerStyle, CORNER_STYLES, DEFAULT_CONFIG.cornerStyle),
    leftSidebarRadius: oneOf(String(merged.leftSidebarRadius ?? 'auto'), SIDEBAR_RADII, 'auto'),
    rightSidebarRadius: oneOf(String(merged.rightSidebarRadius ?? 'auto'), SIDEBAR_RADII, 'auto'),
    borders: oneOf(merged.borders, BORDER_MODES, DEFAULT_CONFIG.borders),
    shadows: bool(merged.shadows, DEFAULT_CONFIG.shadows),

    themeMode: oneOf(merged.themeMode, THEME_MODES, DEFAULT_CONFIG.themeMode),
    themeFollow: bool(merged.themeFollow, DEFAULT_CONFIG.themeFollow),
    colorScheme: oneOf(merged.colorScheme, COLOR_SCHEME_IDS, DEFAULT_CONFIG.colorScheme),
    accentMode: oneOf(merged.accentMode, ACCENT_MODES, DEFAULT_CONFIG.accentMode),
    customAccent: cleanColor(merged.customAccent, DEFAULT_CONFIG.customAccent),
    extractedAccent: sanitizeExtractedAccent(merged.extractedAccent),
    accentCache: merged.accentCache && typeof merged.accentCache === 'object' && !Array.isArray(merged.accentCache)
      ? { ...merged.accentCache }
      : {},
    wallTintMix: num(merged.wallTintMix, DEFAULT_CONFIG.wallTintMix, 0, 0.18, 3),

    glassSurfaces: bool(merged.glassSurfaces, DEFAULT_CONFIG.glassSurfaces),
    glassOpacity: num(merged.glassOpacity, DEFAULT_CONFIG.glassOpacity, 0.15, 0.98, 3),
    glassBlur: num(merged.glassBlur, DEFAULT_CONFIG.glassBlur, 0, 48, 0),
    glassFidelity: num(merged.glassFidelity, DEFAULT_CONFIG.glassFidelity, 0, 100, 0),
    chatGlassFidelity: num(merged.chatGlassFidelity, DEFAULT_CONFIG.chatGlassFidelity, 0, 100, 0),
    codeReadabilityMode: oneOf(merged.codeReadabilityMode, CODE_READABILITY_MODES, DEFAULT_CONFIG.codeReadabilityMode),
    contrastFloor: bool(merged.contrastFloor, DEFAULT_CONFIG.contrastFloor),
    floaterSolidBase: bool(merged.floaterSolidBase, DEFAULT_CONFIG.floaterSolidBase),
    caretColor: cleanColor(merged.caretColor, ''),

    scrimOpacity: num(merged.scrimOpacity, DEFAULT_CONFIG.scrimOpacity, 0, 0.92, 3),
    scrimColor: cleanColor(merged.scrimColor, 'auto'),
    vignette: bool(merged.vignette, DEFAULT_CONFIG.vignette),
    mediaOpacity: num(merged.mediaOpacity, DEFAULT_CONFIG.mediaOpacity, 0.05, 1, 3),
    mediaBlur: num(merged.mediaBlur, DEFAULT_CONFIG.mediaBlur, 0, 64, 0),
    mediaBrightness: percentNum(merged.mediaBrightness, DEFAULT_CONFIG.mediaBrightness, 40, 160),
    mediaContrast: percentNum(merged.mediaContrast, DEFAULT_CONFIG.mediaContrast, 40, 200),
    mediaSaturate: percentNum(merged.mediaSaturate, DEFAULT_CONFIG.mediaSaturate, 0, 200),
    grainAlpha: num(merged.grainAlpha, DEFAULT_CONFIG.grainAlpha, 0, 0.15, 4),
    filterPreset: oneOf(merged.filterPreset, FILTER_PRESETS, DEFAULT_CONFIG.filterPreset),
    fit: oneOf(merged.fit, FIT_MODES, DEFAULT_CONFIG.fit),
    flip: bool(merged.flip, DEFAULT_CONFIG.flip),
    layerPosX: num(merged.layerPosX, DEFAULT_CONFIG.layerPosX, 0, 100, 1),
    layerPosY: num(merged.layerPosY, DEFAULT_CONFIG.layerPosY, 0, 100, 1),
    layerScale: num(merged.layerScale, DEFAULT_CONFIG.layerScale, 50, 150, 1),

    paused: bool(merged.paused, DEFAULT_CONFIG.paused),
    muted,
    audioEnabled,
    volume: num(merged.volume, DEFAULT_CONFIG.volume, 0, 1, 2),
    playbackRate: num(merged.playbackRate, DEFAULT_CONFIG.playbackRate, 0.25, 2, 2),
    fpsCap,
    pictureSlideSeconds: num(merged.pictureSlideSeconds, DEFAULT_CONFIG.pictureSlideSeconds, 0, 3600, 0),
    sceneLive: bool(merged.sceneLive, DEFAULT_CONFIG.sceneLive),
    sceneLiveFps,
    sceneAutoQuality: bool(merged.sceneAutoQuality, DEFAULT_CONFIG.sceneAutoQuality),
    liveBootDelay: num(rawBootDelay, DEFAULT_CONFIG.liveBootDelay, 0.5, 10, 1),
    interactiveWeb: bool(merged.interactiveWeb, DEFAULT_CONFIG.interactiveWeb),
    switchTransition: oneOf(merged.switchTransition, SWITCH_TRANSITIONS, DEFAULT_CONFIG.switchTransition),
    switchTransitionDir: oneOf(merged.switchTransitionDir, SWITCH_DIRECTIONS, DEFAULT_CONFIG.switchTransitionDir),
    switchTransitionSpeed: oneOf(merged.switchTransitionSpeed, SWITCH_SPEEDS, DEFAULT_CONFIG.switchTransitionSpeed),
    pauseOnHidden,
    pauseOnBlur,
    pauseOnBattery: bool(merged.pauseOnBattery, DEFAULT_CONFIG.pauseOnBattery),
    focusFreezeEnabled: bool(merged.focusFreezeEnabled, DEFAULT_CONFIG.focusFreezeEnabled),
    pauseOnFullscreen: bool(merged.pauseOnFullscreen, DEFAULT_CONFIG.pauseOnFullscreen),
    desktopSync: bool(merged.desktopSync, DEFAULT_CONFIG.desktopSync),

    rotationEnabled: bool(merged.rotationEnabled, DEFAULT_CONFIG.rotationEnabled),
    rotationSeeded: bool(merged.rotationSeeded, DEFAULT_CONFIG.rotationSeeded),
    rotationGroupId: String(merged.rotationGroupId || '').trim().slice(0, 80),
    rotationOrder,
    rotationTrigger: oneOf(merged.rotationTrigger, ROTATION_TRIGGERS, DEFAULT_CONFIG.rotationTrigger),
    rotationInterval,
    rotationGroups: sanitizeRotationGroups(merged.rotationGroups),
    favorites: cleanStringArray(merged.favorites, []),
    hiddenIds: cleanStringArray(merged.hiddenIds, []),
    typeFilter: cleanStringArray(merged.typeFilter, DEFAULT_CONFIG.typeFilter, LIBRARY_KINDS),
    contentRatingFilter: cleanStringArray(merged.contentRatingFilter, DEFAULT_CONFIG.contentRatingFilter, CONTENT_RATINGS),
    pickerLayout: oneOf(merged.pickerLayout, ['fixed', 'classic'], 'fixed'),
    userProps: merged.userProps && typeof merged.userProps === 'object' && !Array.isArray(merged.userProps)
      ? { ...merged.userProps }
      : {},
    perWallpaperOverrides:
      src.perWallpaperOverrides && typeof src.perWallpaperOverrides === 'object' && !Array.isArray(src.perWallpaperOverrides)
        ? { ...src.perWallpaperOverrides }
        : src.perWallpaper && typeof src.perWallpaper === 'object' && !Array.isArray(src.perWallpaper)
          ? { ...src.perWallpaper }
          : b.perWallpaperOverrides && typeof b.perWallpaperOverrides === 'object' && !Array.isArray(b.perWallpaperOverrides)
            ? { ...b.perWallpaperOverrides }
            : {},
    frameVariants:
      merged.frameVariants && typeof merged.frameVariants === 'object' && !Array.isArray(merged.frameVariants)
        ? { ...merged.frameVariants }
        : {},
    sceneLiveFailures: cleanStringArray(merged.sceneLiveFailures, []),
    deletedFactoryPresets: cleanStringArray(merged.deletedFactoryPresets, []),

    uploadDir: String(merged.uploadDir || '').trim(),
    cacheDir: String(merged.cacheDir || '').trim(),
    customFolders: cleanStringArray(merged.customFolders, []),
    fxEnabled: bool(merged.fxEnabled, DEFAULT_CONFIG.fxEnabled),
    fxClickMode: oneOf(merged.fxClickMode, ['ripple', 'spark', 'both', 'off'], DEFAULT_CONFIG.fxClickMode),
    fxTrailMode: oneOf(merged.fxTrailMode, ['comet', 'dust', 'off'], DEFAULT_CONFIG.fxTrailMode),
    parallaxEnabled: bool(merged.parallaxEnabled, DEFAULT_CONFIG.parallaxEnabled),
    parallaxStrength: num(merged.parallaxStrength, DEFAULT_CONFIG.parallaxStrength, 0, 40, 0),
    triggerMode: oneOf(merged.triggerMode, TRIGGER_MODES, DEFAULT_CONFIG.triggerMode),
    debugPort: num(merged.debugPort, DEFAULT_DEBUG_PORT, 1024, 65535, 0),
    language,
  };
}

/** Non-destructive 3-tier reset ('skin' | 'optics' | 'playback' | 'all'). */
export function applyResetScope(currentConfig, scope = 'all') {
  const keys =
    scope === 'skin'
      ? RESET_SCOPES.skin
      : scope === 'optics'
        ? RESET_SCOPES.optics
        : scope === 'playback'
          ? RESET_SCOPES.playback
          : [...RESET_SCOPES.skin, ...RESET_SCOPES.optics, ...RESET_SCOPES.playback];

  const patch = {};
  for (const k of keys) {
    patch[k] = DEFAULT_CONFIG[k];
  }
  return sanitizeConfig(patch, currentConfig);
}

/** Effective config with per-wallpaper optical overrides merged on top when active. */
export function resolveEffectiveConfig(config = DEFAULT_CONFIG, wallpaperId = config.activeWallpaperId) {
  const clean = sanitizeConfig(config);
  const ov = wallpaperId && clean.perWallpaperOverrides ? clean.perWallpaperOverrides[wallpaperId] : null;
  if (!ov || typeof ov !== 'object') return clean;
  const filtered = {};
  for (const k of PER_WALLPAPER_OVERRIDE_KEYS) {
    if (k in ov) filtered[k] = ov[k];
  }
  return sanitizeConfig(filtered, clean);
}

/** v4 multi-app store model: global defaults + per-app independent overrides. */
export const DEFAULT_V4_STORE = Object.freeze({
  version: 4,
  global: DEFAULT_CONFIG,
  apps: Object.freeze({}),
  syncTargets: Object.freeze([]),
});

export function sanitizeV4Store(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const globalSrc = src.global && typeof src.global === 'object' ? src.global : src;
  const globalCfg = sanitizeConfig(globalSrc, DEFAULT_CONFIG);
  const appsIn = src.apps && typeof src.apps === 'object' && !Array.isArray(src.apps) ? src.apps : {};
  const apps = {};
  for (const [appId, entry] of Object.entries(appsIn)) {
    const id = String(appId || '').trim();
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) continue;
    const e = entry && typeof entry === 'object' ? entry : {};
    const overrides = e.overrides && typeof e.overrides === 'object' && !Array.isArray(e.overrides) ? { ...e.overrides } : {};
    apps[id] = {
      skinEnabled: typeof e.skinEnabled === 'boolean' ? e.skinEnabled : true,
      inheritGlobal: typeof e.inheritGlobal === 'boolean' ? e.inheritGlobal : Object.keys(overrides).length === 0,
      overrides,
    };
  }
  const syncTargets = Array.isArray(src.syncTargets)
    ? [...new Set(src.syncTargets.map((s) => String(s || '').trim()).filter(Boolean))]
    : [];
  return {
    version: 4,
    global: globalCfg,
    apps,
    syncTargets,
  };
}

export function resolveAppEffectiveConfig(v4Store, appId, wallpaperIdOverride = '') {
  const store = sanitizeV4Store(v4Store);
  const entry = appId && store.apps[appId] ? store.apps[appId] : null;
  let merged = store.global;
  if (entry && !entry.inheritGlobal && entry.overrides && Object.keys(entry.overrides).length > 0) {
    merged = sanitizeConfig(entry.overrides, store.global);
  }
  if (entry) {
    merged = { ...merged, skinEnabled: entry.skinEnabled };
  }
  const wid = String(wallpaperIdOverride || merged.activeWallpaperId || merged.wallpaperId || '');
  return resolveEffectiveConfig(merged, wid);
}
