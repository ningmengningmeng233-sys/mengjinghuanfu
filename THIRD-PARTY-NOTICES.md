# Third-Party Notices

本项目（DreamSkin Prism v4.1+）复用了以下开源项目的代码、数据或设计。由于合并并跨平台适配了 **Obsidian Prism**（`GPL-3.0-only`）的光学渲染与像素桌宠引擎，本项目整体及派生分发遵循 **GNU General Public License v3.0 (`GPL-3.0-only`)**（见根目录 [`LICENSE`](./LICENSE)），并完整保留以下全部上游版权与许可声明。

## RMvdesi/obsidian-prism（GPL-3.0-only, Copyright (C) 2026 RMvdesi）
https://github.com/RMvdesi/obsidian-prism
- 跨平台光学与像素桌宠套件（`src/prism/optical/` 及随 DSH 插件分发的 `optical-bundle.js`）直接复用并跨平台适配了 Obsidian Prism 的核心前端引擎：
  - `motion-engine.js`：统一 4 档弹簧物理微交互编排引擎（`off / subtle / standard / ultra`）
  - `prism-rim-canvas.js`：零回流 300Hz GPU Canvas 虹彩棱镜随光标流光边框引擎
  - `ripple-core.js`：WebGL2 / 2D 地平线氛围光晕（Brand Horizon Glow）与交互字符矩阵波纹场
  - `dual-mascot-rig.js`：Clawd、小紫猫、GPT 银白龙、DeepSeek 蓝鲸（Deepy）与三只迷你蟹叠叠乐物理像素桌宠引擎（适配跨平台输入卡锚点，并去除 `localStorage` 读写以遵循零存储访问隐私边界）
  - `smooth-caret.js`：FastDOM 丝滑流光光标引擎（扩展兼容 `<textarea>` 与 `[contenteditable]`）
  - 4 套黑曜光学深浅配色体系（深空黑曜 / 暖炭玄岩 / 白昼冷晶 / 暖白画册）与 Smoked Obsidian 层次语言。
- 同步保留 Obsidian Prism 吸收的上游 MIT 项目署名：
  - `0DNANCY/agy-claude-style`（MIT, Copyright (c) 2026 0DNANCY）：光学主题基础、4 档弹簧基础、WebGL2 地平线光场与像素桌宠基础
  - `wp3171216237/dsh-TUI`（MIT, Copyright (c) 2026 chimney / @wp3171216237）：Deepy 蓝鲸桌宠配色与喷水形态灵感
  - `Nwflower/dsh-claude-style`：极简排版与输入卡美学参考

## azwosile/agy-wallpaper-prism（MIT，已获原作者授权直接使用）
https://github.com/azwosile/agy-wallpaper-prism
- 梦境换肤 4.0 全面吸收其 Obsidian Prism 6 层液态玻璃光学皮肤内核（`src/prism/host/`、`src/prism/shared/`）、全能动态壁纸引擎（`src/prism/engine/`：Steam Workshop 431960 扫描、MP4 虚拟 faststart、HTTP 206 Range 媒体服、PKGV/LZ4 Scene 提取、Web 交互壁纸沙盒与播放列表）、温和 Fail-Open CDP 桥、两阶段 Boot Canary、纯 Node `[MS-SHLLINK]` 快捷方式补丁与 Antigravity `2.34.0` `[data-browser-hole]` GPU 挖洞机制。

## Fei-Away/Codex-Dream-Skin（MIT, Copyright (c) 2026 Codex Dream Skin Studio contributors）
https://github.com/Fei-Away/Codex-Dream-Skin
- 早期的 ZCode 托盘版（原 `src/zcode/payload/`，2.1 已移除）整体源自其 Windows 版本；当时的 `docs/zcode-dom-map.md` 是 ZCode DOM 实测清单，该批锚点现维护在 `src/adapters/zcode/`（parts-map 与 extra.css）。
- `src/core/cdp-core.mjs` 的 `CdpSession`、`validatedDebuggerUrl` 取自其 Windows 版 `scripts/injector.mjs`。
- `src/core/app-process.mjs` 的启动流程（优雅关闭 → 空闲端口 → 带调试端口启动 → 轮询主窗口）参照其 `start-dream-skin.ps1` / `common-windows.ps1`。
- `src/theme/cherry-skin-css.mjs` 的遮罩强度取自其 `assets/dream-skin.css` 的 immersive 档。

## boilcy/CherryCSS（MIT, Copyright (c) 2025 Caiyun Liu）
https://github.com/boilcy/CherryCSS
- Cherry Studio v2 的 `data-ui` 语义锚点清单与 Shadcn 变量配对规则（`lib/themes/v2Compatibility.ts`）用于核对 `cherry-skin-css.mjs` 的选择器与变量。

## CherryHQ/cherry-studio（AGPL-3.0，仅参考，未复制代码）
https://github.com/CherryHQ/cherry-studio
- 选择器、主窗口路径（`windows/main/index.html`）、CSP 与 `--remote-debugging-port` 用法均按 v2.1.4 源码核对。

## tinted-theming/schemes（MIT, Copyright (c) 2022 Tinted Theming）
https://github.com/tinted-theming/schemes
- `src/theme/data/base16-palettes.json` 由其 `base16/*.yaml`（360 套配色）在开发期转换生成（生成工具不随包发布），保留每套配色的名称与作者字段。

## material-foundation/material-color-utilities（Apache-2.0, Copyright 2021 Google LLC）
https://github.com/material-foundation/material-color-utilities
- `src/theme/mcu-palette.bundle.mjs` 是 npm 包 `@material/material-color-utilities` 0.4.0 在开发期用 esbuild 打成的单文件（打包入口不随包发布），文件内保留原许可证头。用于“从壁纸取色”（Celebi 量化 + Score + Material You 动态配色）。

## obsidian-community/obsidian-style-settings（MIT，仅借用声明格式，未复制代码）
https://github.com/obsidian-community/obsidian-style-settings
- `cherry-skin-css.mjs` 的 `SETTINGS` 使用其字段格式（id / title / type / min / max / step / default / format，类型 heading / variable-number-slider / class-toggle / variable-color），总控台据此自动生成调节控件。

## DreamSkin 主题库（dreamskin.cc）

- 来源：https://dreamskin.cc （Codex Dream Skin 社区主题站，公开 API `api.dreamskin.cc/v1/themes`）
- 用途：总控台「主题库」直接浏览社区主题、下载到用户本机 `%LOCALAPPDATA%\DreamSkin\gallery\` 自用。
- 仓库**不包含也不分发**任何主题库的图片或配色；每套主题的作者与许可证（MIT、CC BY-NC 4.0、个人使用许可等）
  在总控台选中时显示，以各主题自己的许可证为准。

## Node.js（随包发布的便携运行时）

- 发布包的 payload 内置便携 Node.js 运行时（`runtime/node.exe` 及同目录 LICENSE），由 `tools/fetch-node-runtime.ps1` 从 nodejs.org 官方发布获取，未做修改。Node.js 及其依赖的许可证见运行时自带的 LICENSE 文件。

## 预设配色灵感（仅配色数值，未复制代码）

- 引擎内置预设的配色参考了以下开源主题的公开配色（均为 MIT）：Catppuccin、Rosé Pine、Tokyo Night、Nord、Kanagawa、Everforest、Gruvbox Material、Dracula、Ayu、Oxocarbon。出处标注保留在 `src/theme/cherry-skin-css.mjs` 的注释中。

## 主题库风格分类（开发期工具，不随程序分发）

- src/theme/data/gallery-styles.json 在开发期用 OpenCLIP（MIT，https://github.com/mlfoundations/open_clip）ViT-B-32 laion2b_s34b_b79k 权重对 dreamskin.cc 缩略图零样本分类得到（生成脚本不随包发布），只含主题 id 与风格名，不含图片。

