// ZCode 规则段：与 Cherry 共用同一组 var(--ds-*)（buildVarsCss 生成），所以 18 套主题、滑块、我的皮肤两端通用。
//
// 选择器只用 data-* / data-testid / id / 原生语义标签（ZCode 的 class 是无语义的 Tailwind 工具类），
// 全部取自 docs/zcode-dom-map.md 的实测 SAFE / CAUTION 清单；
// DO NOT TOUCH 清单（富文本编辑器本体、滚动容器、分栏容器、svg/img、monaco、xterm、iframe/canvas/webview）一概不写。
// 作用域：只在有 [data-workspace-shell] 的主窗口生效。
// T3-2 分层：部件层由 parts/ 模板按 ZCODE_PARTS_MAP 渲染；额外层放 ZCode 独有的变量桥接等无部件可归的规则；
// ZCODE_RULES 保留为两者的组合导出，与 2.1 的等价性由夹具测试守住。
import { VERSION } from '../core/version.mjs';
import { renderPartsCss } from '../parts/parts.mjs';
import { ZCODE_PARTS_MAP } from '../parts/maps.mjs';

const W = 'html:has([data-workspace-shell])';
const B = 'body:has([data-workspace-shell])';

export const ZCODE_PARTS_CSS = renderPartsCss(ZCODE_PARTS_MAP);

export const ZCODE_EXTRA_CSS = `/* ===== ZCode Dream Skin ${VERSION} · 额外层 ===== */

/* ZCode 自己的 Tailwind v4 主题变量（--color-*，真机 3.15.3 读出）改接到配色上：卡片、弹窗、输入框、文字、边框一起换色。
      终端 / 编辑器只跟着实心底色走，不做透明。 */
${W} {
  --color-background: var(--ds-bg) !important;
  --color-background-win-alt: rgba(var(--ds-panel-rgb), 0.72) !important;
  --color-sidebar: transparent !important;
  --color-surface: rgba(var(--ds-bubble-rgb), 0.35) !important;
  --color-surface-hover: rgba(var(--ds-accent-rgb), 0.12) !important;
  --color-card: rgb(var(--ds-bubble-rgb)) !important;
  --color-popover: rgb(var(--ds-bubble-rgb)) !important;
  --color-popover-header: rgb(var(--ds-panel-rgb)) !important;
  --color-input: rgba(var(--ds-bubble-rgb), 0.55) !important;
  --color-border: var(--ds-line) !important;
  --color-border-hover: rgba(var(--ds-accent-rgb), 0.35) !important;
  --color-foreground: var(--ds-text) !important;
  --color-foreground-subtle: color-mix(in srgb, var(--ds-text) 62%, transparent) !important;
  --color-foreground-subtlest: color-mix(in srgb, var(--ds-text) 32%, transparent) !important;
  --color-accent: rgba(var(--ds-accent-rgb), 0.18) !important;
  --color-brand: var(--ds-accent) !important;
  --color-terminal-bg: var(--ds-bg) !important;
}
[data-desktop-window-frame] { border-color: var(--ds-line) !important; }
${B} ::selection { background: rgba(var(--ds-accent-rgb), 0.35); }

/* 滚动条：细、圆、跟主色走（只改外观，不改滚动容器本身） */
${W} ::-webkit-scrollbar { width: 8px; height: 8px; }
${W} ::-webkit-scrollbar-track, ${W} ::-webkit-scrollbar-corner { background: transparent; }
${W} ::-webkit-scrollbar-thumb { background-color: rgba(var(--ds-accent-rgb), 0.26); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
${W} ::-webkit-scrollbar-thumb:hover { background-color: rgba(var(--ds-accent-rgb), 0.55); }
`;

export const ZCODE_RULES = `/* ===== ZCode Dream Skin ${VERSION} · 规则段 ===== */

${ZCODE_PARTS_CSS}

${ZCODE_EXTRA_CSS}`;
