# 支持矩阵

本页与代码逐项对应：适配器事实以 `src/adapters/<id>/adapter.json` 为准，
运行时由 `src/core/app-runtime.mjs` 组装。改适配器时同步更新本页。

## 适配器与已测版本

| id | 应用 | 启动通道 | 已测版本 | 状态 |
|---|---|---|---|---|
| cherry | Cherry Studio | exe | 2.1.6 | 部件地图已按实测 DOM 落地（四必需部件齐全）；2.1.6 已按真机双视图刷新并往返通过（2026-11-05）；应用自带自定义 CSS 入口 `user-defined-custom-css` 参与层叠顺序管理 |
| zcode | ZCode | exe | 3.15.3 | 部件地图已按实测 DOM 落地 |
| codex | Codex | msix（包族 `OpenAI.Codex_2p2nqsd0c76g0`，入口 `ChatGPT.exe`） | 26.1021.3705.0 | 真机验证通过：总控台 `--activate` 真激活、主窗口 app://-/index.html；部件地图已按真机快照回填 7 部件（命中 7/7、mode full）；与同类工具的冲突检测已接（对方样式 id 前缀 `codex-dream-skin`，确切 id 待对方工具在场时订正） |
| dsh | DeepSeek Harness | exe（默认外壳） | 2.0.18（DSH Desktop） | 真机验证通过：带调试端口启动被接受，主窗口为本地回环 HTTP 服务（动态端口）承载的 Web UI，UA 标记 DSHDesktop；部件地图已按真机快照回填 12 部件（命中 12/12、mode full）；三种外壳已声明（见下） |
| minimax-code | MiniMax Code | exe | 3.1.0 | 真机验证通过：主窗口 app://./archon、UA 标记 MiniMaxAgent；部件地图已按真机快照回填 7 部件（命中 7/7、mode full） |
| minimax-design | MiniMax Design | exe（Velopack 安装） | 3.0.13 | 真机验证通过：主窗口 app://./workspace；部件地图已按真机快照回填 9 部件（命中 9/9、mode full）；带参启动稳定性差为已知风险项 |
| windsurf | Windsurf | exe | —（未安装） | **未实测**：按方案与 S-6 写好，发现口径为 VS Code 系默认布局，部件地图为共享骨架（`adapters/vscode-base/`）整份复制；装机后先抓 DOM 快照订正再用 |
| kiro | Kiro | exe | —（未安装） | **未实测**：同 windsurf，按方案与 S-6 写好，部件地图为共享骨架整份复制；装机后先抓 DOM 快照订正再用 |

「已测版本」指该适配器数据经过核对的应用版本（`testedVersions` 字段）。
现行适配器共 8 个；VS Code 系另有共享骨架目录 `src/adapters/vscode-base/`（非适配器，加载器跳过），windsurf / kiro 两家的骨架条目以它为准、防漂移由单测守住。

> 注记：2026-11-02 主人决定移除 Claude/Cursor/Trae（应用已卸载）。

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

## 应用更新后的复检

应用自身更新后跑 `node tools/recheck-after-update.mjs`（只读）：逐家对比安装版本与 `tools/recheck-baseline.json` 基线，未运行的启动抓快照复算、运行中的不打扰。

| 结论 | 含义 | 动作 |
| --- | --- | --- |
| 完好 full | 部件全命中 | 无 |
| 降级可用 compat | 已自动降级为配色+壁纸，不断供 | 可继续用；恢复完整皮肤走刷新 |
| 需刷新部件表 | 版本已变且必需部件缺失 >30%，或抓不到主窗口 | 按 Q-1 方法重抓快照、重算 parts-map 后再复检 |
| 未安装 | 本机未装 | 跳过 |
| 待复检 | 应用在运行，只完成版本比对 | 空闲时再跑一次 |

DSH 冷启动慢（实测约 9–12 分钟），其复检等待窗口 ≥15 分钟为正常口径。
