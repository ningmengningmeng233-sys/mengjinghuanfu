# 梦境换肤 Dream Skin

给 Electron 类 AI 应用换肤的小工具：带调试端口启动应用、通过本机 CDP 注入一套 `<style>`，
不改应用官方文件，可一键还原。配色、参数、我的皮肤和 dreamskin.cc 主题库跨应用共用。

当前状态：2.1.0 修正版（3.0 多应用适配开发中，进度见上级目录的 `工单状态.md`）。
版本号以 `src/cherry/lib/version.mjs` 为单一来源，发布时只改这一处。

## 构建（Windows payload）

```powershell
# 在 源码/ 目录
powershell -ExecutionPolicy Bypass -File tools/fetch-node-runtime.ps1   # 首次：下载便携 Node 22 到 build/cache/（只下一次）
node tools/build-payload.mjs --platform win32 --out build/payload-win   # 产物含 runtime/node.exe，不含 panel.mjs
node tools/check-version.mjs                                            # 版本一致性校验
node --test tests/                                                      # 单测
```

总控台 exe（.NET WinForms）目前只有 2.1.0 的成品 exe，没有 C# 源码；重建计划见上级目录 `工作日志.md`。

## 关于签名与 SmartScreen（重要）

**当前构建未做代码签名。** 这是预期状态，不是出错：

- 从网上下载未签名的 exe，Windows SmartScreen 可能弹出蓝色提示「Windows 已保护你的电脑」。
  处理方法：点提示里的「更多信息」→「仍要运行」。只从本项目的正式发布处下载时才这样做；
  如果这个文件来自不明链接，不要运行。
- 右键 exe → 属性，如果底部有「解除锁定」勾选框，勾上再打开，可以少一次拦截。

**给维护者：如何做签名构建**

1. 准备一张 OV 或 EV 代码签名证书（USB Key 或证书存储区），证书由项目负责人保管，不要把证书文件或密码提交进仓库。
2. 安装 Windows SDK 的签名工具（signtool.exe）。
3. 在 `源码/` 目录运行（ASCII 脚本，证书指纹换成你自己的）：

```powershell
powershell -ExecutionPolicy Bypass -File tools/sign-release.ps1 -ExePath .\build\release\DreamSkin.exe -Thumbprint <证书指纹>
# 或用 pfx 文件： -PfxPath <路径> （密码会在运行时安全提示输入，不要写在命令里保存）
```

4. 脚本会加 RFC3161 时间戳并在签完后自动验签（signtool verify /pa）。验签不过不要发布。
5. 发布说明里写明已签名构建的 SHA-256，方便用户核对。
