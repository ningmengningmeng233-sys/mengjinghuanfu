# 梦境换肤 Dream Skin

给桌面 AI 应用换主题的 Windows 工具：总控台（`.exe`）+ 内嵌 Node 引擎（payload）。
通过本机调试通道（CDP）向应用页面注入主题 CSS，不修改应用的任何官方文件，
一键还原。总控台源码在 `src/launcher/`（由 2.1.0 发布 exe 反编译重建，
见该目录的 README），Node 引擎入口是 `src/dreamskin.mjs`。

English: [README.en.md](README.en.md)

## 支持的应用

应用支持以「适配器」形式提供：每个应用一份数据（`src/adapters/<id>/`），
新增应用不需要改核心代码。当前适配器与已测版本见
[支持矩阵](docs/support-matrix.md)，要点：

- Cherry Studio、ZCode：部件层已按实测 DOM 落地。
- Codex（MSIX）、DeepSeek Harness、MiniMax Code、MiniMax Design：
  适配器与启动通道已就绪，部件地图待真实 DOM 锚点补全（见支持矩阵的状态列）。

## 快速开始（图形界面）

1. 下载/构建得到 `梦境换肤-*-Windows.exe`，双击打开总控台。
2. 在应用列表里选目标应用、挑一款皮肤，点「应用」。
3. 需要选壁纸时点「界面」区域的按钮；想恢复原样点「还原为默认」。
4. 「我的皮肤」跨应用共用，放在 `%LOCALAPPDATA%\DreamSkin\skins`；
   每个应用自己的运行数据在 `%LOCALAPPDATA%\DreamSkin\<应用 id>`，互不影响。

从 zip 解压运行也可以：包里已自带 Node 运行时（`runtime/node.exe`），
不需要另外安装 Node。

## 命令行用法

引擎可直接调（源码运行时需要系统 Node 22+）：

```powershell
node src/dreamskin.mjs apply    --app cherry            # 应用当前所选皮肤
node src/dreamskin.mjs check    --app cherry            # 体检：部件命中、对比度、冲突
node src/dreamskin.mjs restore  --app cherry            # 还原（移除注入的样式）
node src/dreamskin.mjs status   --app cherry            # 运行状态
node src/dreamskin.mjs apps-status                      # 全部应用五态聚合
node src/dreamskin.mjs sync --app cherry --to zcode     # 把当前选择同步到其他应用
```

退出码：0 成功 / 1 失败（未改动）/ 2 结果不确定 / 3 需要重启应用。

应用更新导致界面结构变化时，体检会把缺失的必需部件计入降级判断：
缺失超过 30% 时自动只保留变量层与壁纸并标记「兼容模式」，细节写在该应用
数据目录的 `compat.json`。与其他换肤工具同时注入同一页面时，`check` 会报
冲突、`apply` 会停手，处理办法见支持矩阵。

DSH 的插件通道默认关闭：在总控台里开启、并经你确认（consent）后才会安装，
卸载按安装清单精确回滚；命令行对应 `plugin-status / plugin-enable /
plugin-disable / plugin-install --consent / plugin-uninstall`。

## 安全说明

- 只注入 CSS 与必要的装饰节点；不读取对话内容；不碰 Cookie / localStorage；
  注入脚本不发任何网络请求。
- 不改目标应用的安装目录、程序包（asar）、签名与配置；换肤靠带调试端口
  启动应用 + 本机回环 CDP 连接实现。
- 还原 = 移除注入的 `<style>` 并恢复普通启动，不留残留。

## Windows SmartScreen 提示

未签名的 exe 首次运行时，Windows 可能弹出「Windows 已保护你的电脑」
（Microsoft Defender SmartScreen）。这是因为程序没有代码签名证书，
不代表程序有问题。确认来源可信后，点「更多信息」→「仍要运行」即可。
发布方也可以用证书签名消除该提示，见下一节。

## 签名发布（给发布方）

有 Authenticode 证书时，用仓库脚本签名并自动验签（带 RFC 3161 时间戳）：

```powershell
powershell -ExecutionPolicy Bypass -File tools/sign-release.ps1 -ExePath <exe 路径> -Thumbprint <证书指纹>
# 或用 pfx 文件：
powershell -ExecutionPolicy Bypass -File tools/sign-release.ps1 -ExePath <exe 路径> -PfxPath <证书.pfx>
```

脚本会先校验版本一致性（`tools/check-version.mjs`），签名后立即 `signtool verify`；
任何一步失败都会以非 0 退出码停下，不会产出半签名的文件。

## 从源码构建

```powershell
powershell -ExecutionPolicy Bypass -File tools/fetch-node-runtime.ps1   # 首次：下载便携 Node 运行时
node tools/build-payload.mjs                                            # 打包 payload（Windows 包会排除 macOS 面板脚本）
powershell -ExecutionPolicy Bypass -File tools/build-launcher.ps1       # 构建总控台 exe（内嵌当前 payload）
node tools/check-version.mjs                                            # 版本单一来源校验
node --test "tests/*.test.mjs"                                          # 全部单元测试
```

给适配器补部件地图时，先用脱敏快照工具抓结构骨架（只含标签与
id/class/data 属性，不含任何内容）：

```powershell
node tools/dom-snapshot.mjs --port <调试端口> --app <id> --out snapshot.html
```

## 常见问题

- **应用更新后皮肤变怪/只剩壁纸**：多半是新版界面锚点变了，体检已自动降级
  到兼容模式；等对应适配器的部件地图更新即可，`check` 能看到缺哪些部件。
- **提示与其他换肤工具冲突**：同页面只能保留一套注入，先在对方工具里还原，
  或在本工具 `restore` 后再应用。
- **DSH 插件通道为什么默认关**：它会往 DSH 的插件目录写文件，属于超出
  「只注入 CSS」的动作，所以必须由你在总控台明确开启并确认后才安装。

## 开发文档

- [支持矩阵](docs/support-matrix.md)：适配器、已测版本、端口、样式 id、退出码。
- [如何新增一个适配器](docs/adapter-guide.md)：三件套格式、通道选型、测试与发布流程。
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)：第三方来源与许可证。

## 版本

版本号唯一来源是 `src/core/version.mjs`；总控台版本、payload 版本与
CDP User-Agent 都从它派生，`tools/check-version.mjs` 负责校验一致。

## 应用更新后怎么办

目标应用（Cherry Studio、ZCode、Codex、DSH、MiniMax Design、MiniMax Code）自己更新后，界面结构可能变化，皮肤部件可能对不上。先跑一键复检（只读，不改任何皮肤状态）：

    node tools/recheck-after-update.mjs

它逐家对比当前安装版本与基线（`tools/recheck-baseline.json`）；未运行的应用会带调试端口启动、抓取脱敏快照复算部件命中后关回。逐家结论与对应动作：

- **完好 full**：部件全命中，什么都不用做。
- **降级可用 compat**：皮肤已自动只保留配色与壁纸（兼容模式），可继续用；想恢复完整皮肤时按下面刷新部件表。
- **需刷新部件表**：版本已变且必需部件缺失超过 30%（方案 §4.5 线），或抓不到主窗口。按 Q-1 方法重抓该应用的 DOM 快照（`tools/dom-snapshot.mjs`）、对照新快照重算 `src/adapters/<id>/parts-map.json`，再跑一次复检确认变回 full。
- **未安装**：跳过。**待复检**：应用正在运行，复检不打扰它，只报版本比对；等它空闲时再跑一次。

DSH 在本机冷启动很慢（实测约 9–12 分钟才就绪），复检给它的等待窗口 ≥15 分钟，属正常现象。退出码：0 = 没有需刷新的；1 = 至少一家需刷新部件表；2 = 参数或基线错误。

## macOS（代码层适配，未实测）

架构一直按可移植设计（方案定版：macOS 正式发布不在本期、只保持架构可移植、只验收 Windows x64）。3.0.1 之后做了一批代码层适配，但**手边没有 Mac，全部未经真机验证**——下面写「已做」的只是代码与单测层面的就绪，不是可用承诺。

- **已做**：平台判定与口径收口到 `src/core/platform.mjs`（数据根、应用发现、进程列举与关闭的判定都从它取数，Windows 行为不变、全套单测守卫）；mac 数据根按 `~/Library/Application Support/DreamSkin`；应用发现按 `/Applications` 与 `~/Applications` 下的 `.app` 包，包内主程序名优先读 `Contents/Info.plist` 的 `CFBundleExecutable`（合成夹具单测覆盖，解析器只处理字符串键子集）；六家适配器都补了 `discover.mac` 段（包名与来源说明），状态一律 `unverified`，且适配器校验器钉死了这个状态目前只能是 `unverified`；`open` 命令口径的打开/激活已在平台层备好（预留，未接入任何通道）。
- **未做 / 未接**：带调试端口的启动在 mac 上仍走 spawn 包内二进制（既有口径，各家是否接受调试参数未验证）；msix 通道是 Windows 专属，Codex 在 mac 上预期改走 exe 通道加 .app 发现，未核实；DSH 插件通道是 Windows 数据目录口径，mac 上未做；**总控台是 .NET WinForms、Windows 专用，不移植**——mac 侧界面按方案既有口径用核心自带的浏览器版控制台 `panel.mjs`（payload 构建在 darwin 上会纳入 panel、win32 剔除，该构建分支同样未实测）。
- **mac 侧形态结论**：核心 CLI（Node ESM、零依赖）可移植；总控台 mac 版不在本批。可选路线（均未实施）：① 继续用 panel.mjs 浏览器控制台；② 另做轻量 CLI 入口；③ 换跨平台 UI 框架重写总控台。
- **拿到 Mac 后先照单验证**：六家 .app 包名与 CFBundleExecutable 与 discover.mac 逐项核对、plist 发现实测、带调试端口启动并连 CDP、进程列举与关闭、panel.mjs 打开与全流程换肤、darwin payload 构建产物实测——逐项清单见支持矩阵页与本批报告（`证据/mac适配批报告.md`）。
