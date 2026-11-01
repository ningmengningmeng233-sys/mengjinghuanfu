// 过渡部件地图（T3-1）：Cherry / ZCode 两个现有应用的 parts-map。
// 选择器全部来自 2.1 已实测的规则段（theme/cherry-skin-css.mjs 的 RULES 与 theme/zcode-skin-css.mjs
// 的 ZCODE_RULES），按语义部件重新归位，声明内容不在这里改（等价迁移的对照在 T3-2 的等价测试里）。
// 正式位置是 adapters/<id>/parts-map.json（方案 §4.4），T1-3 迁移适配器时搬过去，本文件随之删除。
// required 标记的口径见 §4.4（体检用，T3-3 消费）；渲染时非字符串值会被忽略。

const W = 'html:has([data-workspace-shell])';
const B = 'body:has([data-workspace-shell])';

export const CHERRY_PARTS_MAP = {
  'app.root': {
    scope: 'html:has(#app-sidebar)',
    scopeBody: 'body:has(#app-sidebar)',
    selector: 'body:has(#app-sidebar) #root, body:has(#app-sidebar) [data-ui="app.main"], body:has(#app-sidebar) .h-screen.w-screen',
    required: true,
  },
  'app.sidebar': {
    selector: '#app-sidebar, [data-ui="app.sidebar"], [data-ui="chat.topic-list"]',
    pane: '[class*="resource-list-pane"]',
    'pane-border': '[class*="resource-list-pane"]',
    required: true,
  },
  'app.topbar': { selector: '[data-ui="app.tab-bar"]' },
  'app.content': {
    selector: '[data-ui="chat.view"], #chat, #home-page',
    wrap: 'div[data-ui="app.content"]',
    card: 'main[data-ui="app.content"]',
    required: true,
  },
  'chat.messages': {
    selector: '[data-ui="part:conversation-main"]',
    list: '[data-ui="chat.message-list"]',
    shell: '[data-ui="chat.message-list"], #messages',
  },
  'chat.bubble.user': { selector: '.message-user .message-content-container' },
  'chat.composer': { selector: '#inputbar, [data-ui="chat.composer"]', required: true },
  'code.block': { selector: '[data-ui="part:code-block"]' },
};

export const ZCODE_PARTS_MAP = {
  'app.root': {
    scope: W,
    scopeBody: B,
    selector: B + ' #root, ' + B + ' #app, [data-workspace-shell], [data-root-workspace-surface], [data-desktop-window-frame]',
    required: true,
  },
  'app.sidebar': {
    selector: '[data-workspace-sidebar-panel]',
    pane: '#sidebar, [data-testid="sidebar"]',
    'pane-border-strong': '#sidebar, [data-testid="sidebar"]',
    required: true,
  },
  'app.sidebar.item': {
    selector: '[data-purpose-section-list]',
    meta: '[data-task-row-metadata], [data-purpose-section-drag-handle]',
  },
  'app.topbar': {
    bar: B + ' header, [data-workspace-header-variant]',
    foot: B + ' footer',
    active: '[data-slot="tabs-trigger"][data-state="active"], [data-testid="task-new-button"]',
  },
  'app.content': {
    selector: '[data-workspace-conversation-frame], [data-panel]',
    main: B + ' main',
    required: true,
  },
  'chat.composer': {
    selector: '[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute)',
    dock: '[data-v4-composer-dock], [data-v4-composer-dock-content]',
    radius: '[data-testid="v4-composer"] .chat-composer-input-surface > form > div:not(.absolute)',
    required: true,
  },
  'overlay.panel': {
    header: '[data-slot="dialog-header"]',
    title: '[data-slot="dialog-title"]',
  },
};

export const PARTS_MAPS = { cherry: CHERRY_PARTS_MAP, zcode: ZCODE_PARTS_MAP };
