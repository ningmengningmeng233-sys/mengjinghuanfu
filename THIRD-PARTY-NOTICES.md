# Third-Party Notices

本项目复用了以下开源项目的代码、数据或设计，协议见各条目（MIT / Apache-2.0）。

## Fei-Away/Codex-Dream-Skin（MIT, Copyright (c) 2026 Codex Dream Skin Studio contributors）
https://github.com/Fei-Away/Codex-Dream-Skin
- 早期的 ZCode 托盘版（原 `src/zcode/payload/`，2.1 已移除）整体源自其 Windows 版本；`docs/zcode-dom-map.md` 是当时随附的 ZCode DOM 实测清单。
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
- `src/theme/data/base16-palettes.json` 由其 `base16/*.yaml`（360 套配色）经 `tools/gen-base16-palettes.mjs` 转换生成，保留每套配色的名称与作者字段。

## material-foundation/material-color-utilities（Apache-2.0, Copyright 2021 Google LLC）
https://github.com/material-foundation/material-color-utilities
- `src/theme/mcu-palette.bundle.mjs` 是 npm 包 `@material/material-color-utilities` 0.4.0 与 `tools/mcu-palette.entry.mjs` 用 esbuild 打成的单文件，文件内保留原许可证头。用于“从壁纸取色”（Celebi 量化 + Score + Material You 动态配色）。

## obsidian-community/obsidian-style-settings（MIT，仅借用声明格式，未复制代码）
https://github.com/obsidian-community/obsidian-style-settings
- `cherry-skin-css.mjs` 的 `SETTINGS` 使用其字段格式（id / title / type / min / max / step / default / format，类型 heading / variable-number-slider / class-toggle / variable-color），总控台据此自动生成调节控件。

## DreamSkin 主题库（dreamskin.cc）

- 来源：https://dreamskin.cc （Codex Dream Skin 社区主题站，公开 API `api.dreamskin.cc/v1/themes`）
- 用途：总控台「主题库」直接浏览社区主题、下载到用户本机 `%LOCALAPPDATA%\DreamSkin\gallery\` 自用。
- 仓库**不包含也不分发**任何主题库的图片或配色；每套主题的作者与许可证（MIT、CC BY-NC 4.0、个人使用许可等）
  在总控台选中时显示，以各主题自己的许可证为准。

## 主题库风格分类（开发期工具，不随程序分发）

- src/theme/data/gallery-styles.json 由 tools/gen-gallery-styles.py 用 OpenCLIP（MIT，https://github.com/mlfoundations/open_clip）ViT-B-32 laion2b_s34b_b79k 权重对 dreamskin.cc 缩略图零样本分类得到，只含主题 id 与风格名，不含图片。

