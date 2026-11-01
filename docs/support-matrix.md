# 支持矩阵

本页与代码逐项对应：适配器事实以 `src/adapters/<id>/adapter.json` 为准，
运行时由 `src/core/app-runtime.mjs` 组装。改适配器时同步更新本页。

## 适配器与已测版本

| id | 应用 | 启动通道 | 已测版本 | 状态 |
|---|---|---|---|---|
| cherry | Cherry Studio | exe | 2.1.4 | 部件地图已按实测 DOM 落地（四必需部件齐全）；应用自带自定义 CSS 入口 `user-defined-custom-css` 参与层叠顺序管理 |
| zcode | ZCode | exe | 3.15.3 | 部件地图已按实测 DOM 落地 |
| codex | Codex | msix（包族 `OpenAI.Codex_2p2nqsd0c76g0`，入口 `ChatGPT.exe`） | 26.1021.3705.0 | 适配器与激活通道就绪；部件地图为空，待真实 DOM 锚点（抓快照工具见 Q-1）；与同类工具的冲突检测已接（对方样式 id 前缀 `codex-dream-skin`） |
| dsh | DeepSeek Harness | exe（默认外壳） | 2.0.18（DSH Desktop） | 三种外壳已声明（见下）；部件地图为空，待真实 DOM 锚点 |
| minimax-code | MiniMax Code | exe | 3.1.0 | 适配器就绪；部件地图为空，待真实 DOM 锚点 |
| minimax-design | MiniMax Design | exe（Velopack 安装） | 3.0.13 | 适配器就绪；部件地图为空，待真实 DOM 锚点 |

「已测版本」指该适配器数据经过核对的应用版本（`testedVersions` 字段）。
不在表内的应用（Claude、Cursor、Trae、Windsurf、Kiro）尚未提供适配器。

## DSH 的三种外壳

| 外壳 id | 形态 | 通道 | 说明 |
|---|---|---|---|
| desktop | DSH Desktop（Electron 社区外壳） | exe | 默认；带调试端口启动后走 CDP 注入 |
| tauri | Tauri 社区外壳 | webview2 | 经 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 只给子进程开调试 |
| web | 浏览器模式（`dsh web`） | dsh-plugin | 在 `http://127.0.0.1:3080` 的本地服务上装插件包注入 |

插件通道规则（`core/channels/dsh-plugin.mjs`）：默认关闭；开关状态存在
`%LOCALAPPDATA%\DreamSkin\dsh\plugin-channel.json`；安装必须显式 consent
（总控台确认，或命令行 `plugin-install --consent`），没有 consent 时拒绝且
零写入；卸载按安装时记录的清单逐个精确移除，不碰未记录文件。

## 端口

- exe / webview2 通道：启动时取一个本机空闲端口（仅回环），实际端口以
  会话文件为准（数据目录下的 session 记录优先于通道探测）。
- msix 通道：专用端口段 **9340–9399**，段内逐个找空闲；段外端口若已被占用
  并属于该应用，会被拒绝（避免误连普通启动的实例）。

## 注入的样式 id

以适配器 id 拼装（`core/inject.mjs` 的 `layerStyleIds`）：

| 层 | style id |
|---|---|
| 部件层 | `dream-skin-2-<id>` |
| 变量层 | `dream-skin-2-<id>-vars` |
| 额外层 | `dream-skin-2-<id>-extra` |
| 实时预览层 | `dream-skin-2-<id>-live` |

还原会把四层一起移除。体检的降级口径：必需部件缺失比例 > 30% 时进入
兼容模式（只保留变量层 + 壁纸，底衬 scrim 可升一档保证可读）；对比度
正文需 ≥ 4.5:1、大字 ≥ 3:1；结果写入该应用数据目录的 `compat.json`。

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 失败，且未改动任何状态 |
| 2 | 结果不确定（例如进程状态无法确认） |
| 3 | 需要重启目标应用后才能生效/确认 |

## 数据目录

- 根目录：`%LOCALAPPDATA%\DreamSkin\`（可用环境变量 `DREAMSKIN_DATA_DIR` 覆盖，供测试）。
- 每应用：`%LOCALAPPDATA%\DreamSkin\<id>\`（会话、体检 compat.json、上次选择等）。
- 共用：`skins\`（我的皮肤）、`gallery\`（在线界面库缓存）。
