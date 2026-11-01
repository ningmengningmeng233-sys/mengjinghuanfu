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
