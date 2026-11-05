# 总控台（launcher）—— 由 2.1.0 exe 反编译重建

本目录是梦境换肤总控台（.NET WinForms）的 C# 源码，**由 2.1.0 发布 exe 反编译重建，不是原始源码**
（原仓库只有 exe、无 C# 源码；2026-11-02 用 ilspycmd 导出项目后修通构建，过程与证据见
`06-梦境换肤/证据/launcher-反编译重建基础.txt`）。原始文件 `2.1.0原始文件/` 保持只读。

## 工具链

- .NET SDK：本机已全局安装 9.0.314，直接可用，不需要另装。
- ilspycmd 是本仓库的**本地 dotnet 工具**：清单在 `源码/.config/dotnet-tools.json`（ilspycmd 9.1.0.7988），
  在 `源码/` 目录下以 `dotnet ilspycmd` 调用，不进 PATH、没装全局命令。换机器先 `dotnet tool restore`。
- 目标框架 net48；本机没有 .NET Framework 本地引用程序集目录，靠 NuGet 包
  `Microsoft.NETFramework.ReferenceAssemblies` 1.0.3 还原（PrivateAssets=all，不进产物）。

## 构建

正式构建一条命令（在 `源码/` 目录下）：

    powershell -ExecutionPolicy Bypass -File tools/build-launcher.ps1

它依次做三件事：

1. `tools/build-payload.mjs` 构建 win32 payload（带便携 Node 运行时）到 `build/payload-win`；
2. 按 2.1 的 zip 版式把 payload 打成 `src/launcher/DreamSkin.payload.zip`
   （payload 文件放在 `src/` 前缀下，LICENSE 与 THIRD-PARTY-NOTICES.md 在 zip 根部）——
   总控台首次运行释放这个 zip 后按 `src/cherry/skin-cherry.mjs` 定位脚本，**版式不能变**；
3. `dotnet build src/launcher -c Release`，产物在 `src/launcher/bin/Release/net48/`。

注意：直接 `dotnet build` 嵌进去的是当前 `DreamSkin.payload.zip` 文件的内容；该文件是构建生成物
（已 gitignore），发版与验收一律走上面的脚本，避免嵌到旧包。

## 与原 exe 的差异（仅构建层，行为不变）

- csproj：反编译导出的 `Microsoft.NET.Sdk.WindowsDesktop` / net40 改为 `Microsoft.NET.Sdk` / net48。
  原代码用到 `System.IO.Compression.ZipArchive`（.NET 4.5 起才有），真实下限本就高于 net40；
  net48 与原 exe 同属 .NET Framework 4.x（就地升级系、同一 CLR），用户侧运行环境不变。
- 两处反编译作用域冲突（CS0136）做改名修正，代码里有注释，逻辑不变：
  ThemeTile 的尾段 `path`/`pen` 改为 `pathEnd`/`penEnd`；MainForm.LoadOwnIcon256 的第二个
  `memoryStream` 改为 `memoryStream2`。
- 内嵌 payload 不再是 2.1.0 的冻结快照，而是构建时由当前 `src/` 生成（见构建节）。
  相应地 `tools/build-payload.mjs` 已把 `launcher`、`bin`、`obj` 整目录排除在 payload 之外——
  payload 若把总控台工程打回去会自引用膨胀（本批实测踩到并已清理，见证据）。
- 版本口径：AssemblyVersion / FileVersion 均为 3.0.3.0、InformationalVersion（ProductVersion）3.0.3，
  与 Node 侧 `src/core/version.mjs` 的 VERSION=3.0.3 一致，由 `tools/check-version.mjs` 校验
  （已走 launcher 校验分支，全 PASS）。窗口标题与界面标签的短版式随 3.0.0 改为「3.0」
  （2.1.0 重建时曾按原版保留「2.1」，Q-4 发布批决定改为与文件版本一致的 3.0 口径）。
- NuGet 依赖新增 Microsoft.Windows.SDK.Contracts 10.0.26100.1742（第二批）：
  `--resolve-aumid` 用 Windows.Management.Deployment.PackageManager 解析已注册包。

## 第二批已落地（launcher 桥与内置 Node，2026-11-02）

- 无界面子命令在 `DreamSkin/HeadlessCommands.cs`，Main 在开 GUI 前分发：
  `--resolve-aumid <packageFamilyPrefix> [--exe <exeName>]`（只读解析已注册包 -> AUMID，
  标准输出一行 JSON，退出码 0/1）、`--activate <aumid> --args "<args>"`（经 COM
  IApplicationActivationManager 激活，退出码 0/1/2；真激活会启动目标应用，须主人同意后才验，
  本批只测错误路径）、`--which-node`（只读诊断，输出 Node 三档定位结果）。
  Node 端 `channels/msix.mjs` 的包查询已改为总控台优先、PowerShell 兜底（同一输出契约）。
- Node 定位改为 payload 自带优先（`MainForm.ResolveNodePath`，T0-6 收口）：
  先 `<appRoot>/src/runtime/node.exe`，其次数据目录下载的 runtime，最后 PATH 上的 node.exe；
  GUI 与无界面启动（LaunchCore）同口径，子进程的 PATH 前置目录随解析结果走。
  原「安装 / 修复 Node.js 22」下载流程原样保留，排在自带运行时之后。

## 待后续批次

- U-1 / U-2 / U-3 的总控台界面改动（应用列表与状态点、多端同步、兼容矩阵页、冲突弹窗、DSH 插件开关）。
- `--activate` 真激活与 msix 通道真机启动验证（V-CH-msix）：等主人同意带调试端口启动 Codex 一次。
- 总控台 GUI 的真人目视验收（待人工验收）：原程序没有无副作用的无界面参数——无参直接开 GUI，
  `--launch <app>` 会真的带皮肤启动目标应用，两者都不在本批冒烟范围内；本批只做了构建成功与
  静态核验（文件版本、内嵌资源清单），未运行重建 exe、未替换用户现装的 2.1.0 exe。
