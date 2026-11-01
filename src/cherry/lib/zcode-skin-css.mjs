// ZCode 规则段：与 Cherry 共用同一组 var(--ds-*)（buildVarsCss 生成），所以 18 套主题、滑块、我的皮肤两端通用。
//
// 选择器只用 data-* / data-testid / id / 原生语义标签（ZCode 的 class 是无语义的 Tailwind 工具类），
// 全部取自 docs/zcode-dom-map.md 的实测 SAFE / CAUTION 清单；
// DO NOT TOUCH 清单（富文本编辑器本体、滚动容器、分栏容器、svg/img、monaco、xterm、iframe/canvas/webview）一概不写。
// 作用域：只在有 [data-workspace-shell] 的主窗口生效。
import { VERSION } from './version.mjs';

const W = 'html:has([data-workspace-shell])';
const B = 'body:has([data-workspace-shell])';

export const ZCODE_RULES = `/* ===== ZCode Dream Skin ${VERSION} · 规则段 ===== */

/* 0. ZCode 自己的 Tailwind v4 主题变量（--color-*，真机 3.15.3 读出）改接到配色上：卡片、弹窗、输入框、文字、边框一起换色。
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

/* 1. 整窗壁纸 + 遮罩 */
${W} { background: var(--ds-bg) !important; }
${B} { background: transparent !important; color: var(--ds-text); }
${B}::before {
  content: ""; position: fixed; inset: -40px; z-index: -1; pointer-events: none;
  background: var(--ds-art) var(--ds-focus) / cover no-repeat;
  filter: var(--ds-wall-filter);
}
${B}::after {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: var(--ds-scrim);
}

/* 2. 外壳层透明，让壁纸贯穿 */
${B} #root,
${B} #app,
[data-workspace-shell],
[data-root-workspace-surface],
[data-desktop-window-frame],
[data-workspace-sidebar-panel],
[data-workspace-conversation-frame],
[data-panel] {
  background: transparent !important;
  background-color: transparent !important;
}
[data-desktop-window-frame] { border-color: var(--ds-line) !important; }

/* 3. 侧栏：磨砂玻璃 */
#sidebar,
[data-testid="sidebar"] {
  background: var(--ds-pane-bg) !important;
  backdrop-filter: var(--ds-blur);
  -webkit-backdrop-filter: var(--ds-blur);
  border-right: 1px solid var(--ds-line) !important;
}
[data-purpose-section-list] { background: transparent !important; }
[data-task-row-metadata] { color: var(--ds-muted) !important; }
[data-purpose-section-drag-handle] { color: var(--ds-muted) !important; }

/* 4. 主区：上浅下深的渐变遮罩 */
${B} main {
  background: linear-gradient(180deg, var(--ds-chat-top) 0%, var(--ds-chat-top) 55%, var(--ds-chat-bottom) 100%) !important;
  border-radius: var(--ds-radius) !important;
  box-shadow: var(--ds-content-shadow) !important;
  text-shadow: var(--ds-text-shadow);
}

/* 5. 顶栏 / 底栏 */
${B} header,
[data-workspace-header-variant] {
  background: transparent !important;
  border-bottom-color: var(--ds-line) !important;
}
${B} footer { background: transparent !important; }

/* 6. 输入区：浮起的磨砂卡片。
   皮肤只上在 ZCode 自己画的那层输入框（form 里带边框和圆角的 div）上；外层 dock 容器带 0 16 16 的内边距，
   给它上皮肤会套出比输入框大一圈的第二个框（2026-10-18 实测错位，已改）。 */
[data-v4-composer-dock],
[data-v4-composer-dock-content] {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute) {
  background: var(--ds-composer-bg) !important;
  backdrop-filter: var(--ds-blur);
  -webkit-backdrop-filter: var(--ds-blur);
  border: 1px solid rgba(var(--ds-accent-rgb), 0.28) !important;
  border-radius: calc(var(--ds-radius) + 4px) !important;
  box-shadow: var(--ds-composer-shadow) !important;
}
[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute):focus-within { border-color: rgba(var(--ds-accent-rgb), 0.55) !important; }

/* 7. 弹窗标题、选中态、文字选中 */
[data-slot="dialog-header"] { background: rgba(var(--ds-panel-rgb), 0.92) !important; }
[data-slot="dialog-title"] { color: var(--ds-text) !important; }
[data-slot="tabs-trigger"][data-state="active"] { color: var(--ds-accent) !important; }
[data-testid="task-new-button"] { color: var(--ds-accent) !important; }
${B} ::selection { background: rgba(var(--ds-accent-rgb), 0.35); }

/* 滚动条：细、圆、跟主色走（只改外观，不改滚动容器本身） */
${W} ::-webkit-scrollbar { width: 8px; height: 8px; }
${W} ::-webkit-scrollbar-track, ${W} ::-webkit-scrollbar-corner { background: transparent; }
${W} ::-webkit-scrollbar-thumb { background-color: rgba(var(--ds-accent-rgb), 0.26); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
${W} ::-webkit-scrollbar-thumb:hover { background-color: rgba(var(--ds-accent-rgb), 0.55); }
`;
