# 支持矩阵

本页与代码逐项对应：适配器事实以 `src/adapters/<id>/adapter.json` 为准，
运行时由 `src/core/app-runtime.mjs` 组装。改适配器时同步更新本页。

## 适配器与已测版本

| id | 应用 | 启动通道 | 已测版本 | 状态 |
|---|---|---|---|---|
| cherry | Cherry Studio | exe | 2.1.4 | 部件地图已按实测 DOM 落地（四必需部件齐全）；应用自带自定义 CSS 入口 `user-defined-custom-css` 参与层叠顺序管理 |
| zcode | ZCode | exe | 3.15.3 | 部件地图已按实测 DOM 落地 |
| codex | Codex | msix（包族 `OpenAI.Codex_2p2nqsd0c76g0`，入口 `ChatGPT.exe`） | 26.1021.3705.0 | 真机验证通过：总控台 `--activate` 真激活、主窗口 app://-/index.html；部件地图已按真机快照回填 7 部件（命中 7/7、mode full）；与同类工具的冲突检测已接（对方样式 id 前缀 `codex-dream-skin`，确切 id 待对方工具在场时订正） |
| dsh | DeepSeek Harness | exe（默认外壳） | 2.0.18（DSH Desktop） | 真机验证通过：带调试端口启动被接受，主窗口为本地回环 HTTP 服务（动态端口）承载的 Web UI，UA 标记 DSHDesktop；部件地图已按真机快照回填 12 部件（命中 12/12、mode full）；三种外壳已声明（见下） |
| minimax-code | MiniMax Code | exe | 3.1.0 | 真机验证通过：主窗口 app://./archon、UA 标记 MiniMaxAgent；部件地图已按真机快照回填 7 部件（命中 7/7、mode full） |
| minimax-design | MiniMax Design | exe（Velopack 安装） | 3.0.13 | 真机验证通过：主窗口 app://./workspace；部件地图已按真机快照回填 9 部件（命中 9/9、mode full）；带参启动稳定性差为已知风险项 |
| claude | Claude | msix（包族 `Claude_pzs8sxrjxfjjc`，入口 `app\Claude.exe`） | 4.4212.0.0 | 包事实与 AUMID 解析实测通过；**当前版本拒绝调试端口**（对照实测：无参 / 无害参数激活正常启动，带 `--remote-debugging-port` 激活则进程不出现），无 CDP 会话、无 DOM 快照，部件地图为空，暂不可换肤；按方案 §5 不改包绕过 |
| cursor | Cursor | exe | 3.27.22 | 真机验证通过：调试端口可用、主窗口为 workbench 页（vscode-file://、UA 标记 Cursor）；首启未登录态下工作台只渲染 `.monaco-workbench`，部件地图仅 app.root（实测命中）；其余骨架部件与 AI 聊天层待主人登录后补抓（待人工验收） |
| trae | Trae CN（国内版） | exe | 3.3.84 | 真机验证通过：调试端口可用（UA 标记 TraeCN）；首启停在初次设置页、工作台未实测，故未声明 target、部件地图为空；待主人完成初次设置并登录后补抓（待人工验收） |
| windsurf | Windsurf | exe | —（未安装） | **未实测**：按方案与 S-6 写好，发现口径为 VS Code 系默认布局，部件地图为共享骨架（`adapters/vscode-base/`）整份复制；装机后先抓 DOM 快照订正再用 |
| kiro | Kiro | exe | —（未安装） | **未实测**：同 windsurf，按方案与 S-6 写好，部件地图为共享骨架整份复制；装机后先抓 DOM 快照订正再用 |

「已测版本」指该适配器数据经过核对的应用版本（`testedVersions` 字段）。
方案内应用至此均有适配器（共 11 个）；VS Code 系另有共享骨架目录
`src/adapters/vscode-base/`（非适配器，加载器跳过），四家 IDE 的骨架条目以它为准、防漂移由单测守住。

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
