# 如何新增一个适配器

梦境换肤的应用支持是纯数据驱动的：**新增一个应用 = 在 `src/adapters/`
下新建一个 `<id>/` 目录，放三件套，不改核心代码**。加载器
（`src/core/adapters.mjs`）会校验每份适配器，校验不过的会被跳过并收集
错误（不会拖垮其他应用），运行时档案由 `src/core/app-runtime.mjs` 组装。

## 三件套

```
src/adapters/<id>/
  adapter.json     必需：应用事实（发现方式、通道、目标判定等）
  parts-map.json   adapter.json 的 partsMap 字段引用（部件 -> 选择器）
  extra.css        adapter.json 的 extraCss 字段引用（该应用专属的额外样式，可为空文件）
```

`partsMap` / `extraCss` 必须是相对本目录的相对路径，且文件真实存在；
缺文件或写绝对路径都会被校验拒绝。**整个 adapter.json 里不许出现盘符
绝对路径**（加载器递归检查），安装路径一律用 `%ENV%` 占位（如
`%LOCALAPPDATA%\Programs\...`）或靠进程发现。

## adapter.json 字段

必填：

| 字段 | 规则 |
|---|---|
| `id` | `^[a-z0-9][a-z0-9-]*$`，且必须与目录名一致 |
| `name` | 显示名，非空 |
| `schema` | 固定 `"dreamskin-adapter/1"` |
| `channel` | 五选一：`exe` / `msix` / `webview2` / `dsh-plugin` / `browser` |

按通道追加必填（都在 `discover` 里）：

| 通道 | 必填 | 说明 |
|---|---|---|
| exe / webview2 | `discover.exeNames` | 进程 exe 名（非空字符串数组） |
| msix | `discover.msixPackageFamily` | 包族名（Package Family Name） |
| browser | `target.urlPattern` | 目标页 URL 正则 |
| dsh-plugin | — | 无额外必填 |

常用可选字段：

| 字段 | 说明 |
|---|---|
| `discover.candidates` | 候选安装路径数组（`%ENV%` 占位） |
| `discover.envExe` | 覆盖用的环境变量名（合法标识符；约定 `DREAMSKIN_<ID 大写>_EXE`，设置后优先于一切发现逻辑，直接指向 exe 全路径） |
| `discover.uninstallDisplayName` | 注册表卸载项显示名，兜底查安装目录用 |
| `discover.macBundle` | macOS 形态预留 |
| `target.uaToken` / `target.rejectPattern` | 主窗口判定：UA 须含 token、URL 命中 reject 正则的页面（登录/设置等）不算主窗口 |
| `process.gracefulCloseMs` | 优雅关闭等待毫秒 |
| `process.helperCmdPattern` | 辅助进程命令行正则（状态聚合用） |
| `readySelector` | 页面就绪锚点选择器 |
| `userCssId` | 应用自带自定义 CSS 的 style id（参与层叠顺序管理，如 cherry） |
| `probes` | 旧式探针元组 `[选择器, 标签, requiredWhen?]`（新适配器优先用 parts-map） |
| `testedVersions` | 已测版本字符串数组，发版时同步到支持矩阵 |
| `conflicts` | 其他换肤工具在本页面的 style id 前缀数组；命中时 `apply` 停手、`check` 报冲突（见 `src/core/conflicts.mjs`） |
| `restartNote` | 需要重启应用时给用户的提示文案 |
| `shells` | 多外壳声明（见下节） |

发现 exe 的优先级（`src/core/app-process.mjs`）：envExe 环境变量 >
已知路径候选 > 注册表卸载信息（InstallLocation）。

## parts-map.json 部件地图

部件 id 是语义层的固定词汇（定义在 `src/parts/parts.json`，共 16 个：
`app.root`、`app.sidebar`、`app.content`、`app.header`、`tab.bar`、
`chat.composer`、`chat.message-list`、`chat.message-user`、`code.block`、
`code.inline`、`syntax`、`file.tree`、`modal`、`notification`、
`scrollbar`、`status.bar`），不要自创 id。

每个部件是一个对象，键是「形态」名（`base` 是默认形态，其余如 `pane`、
`frame` 按该部件在模板里的占位命名）：

```json
{
  "app.sidebar": {
    "base": { "selector": "#app-sidebar", "required": true,
              "css": "#app-sidebar { background: var(--ds-panel); }" },
    "pane": { "selector": "[class*=\"resource-list-pane\"]" }
  }
}
```

- `selector`：命中判定用的选择器（可逗号列表）。**必须来自真实 DOM 证据**
  ——用脱敏快照工具抓结构后照锚点写，不许凭界面截图猜（见下面流程）。
- `css`：该形态的样式模板，`{{selector}}` 会被替换成选择器本身，
  `{{selector:形态名}}` 引用同部件另一形态的选择器；变量用 `--ds-*`
  变量层变量，不要写死颜色。
- `required: true`：必需部件。体检口径（`src/core/health.mjs`）：必需部件
  缺失比例 > 30% 时整体降级为兼容模式。
- `requiredWhen`：一个选择器字符串；在场时该部件才计入必需判定，
  不在场记 skip、不计分母。
- `value`：变量覆盖对象（键为 `--ds-` 开头的 CSS 变量）。

部件命中率可用夹具离线验证：把脱敏快照放进 `tests/fixtures/`，
用 `src/core/parts-hit.mjs` 的 `hitReport(partsMap, tree)` 跑（口径与
health 裁决一致），写单测锁定。

## extra.css

该应用专属的零散样式（不属于任何语义部件的修补）。文件里可以用
`{{version}}` 占位，运行时替换为 `src/core/version.mjs` 的当前版本，
用来给来源注释打版本标记。没有专属样式时放空文件即可。

## 通道选型

| 通道 | 适用 | 行为要点 |
|---|---|---|
| exe | 普通桌面安装（NSIS / Velopack 等） | 找 exe 后带 `--remote-debugging-port=<空闲回环端口>` 启动，CDP 注入 |
| msix | 商店/MSIX 打包应用 | 不能直接拉起 exe：经总控台 `--activate` 桥按 AUMID 激活并传调试参数；端口只用 9340–9399 专用段 |
| webview2 | WebView2 / Tauri 类外壳 | 调试开关经 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 只注入子进程环境，不污染当前会话 |
| dsh-plugin | DSH 浏览器模式 | 往 DSH 插件目录装插件包；默认关闭、装前必须 consent、按清单精确卸载（见支持矩阵） |
| browser | 浏览器页面形态 | 预留：以 `target.urlPattern` 认页面 |

一个应用有多种外壳时（如 DSH），在 adapter.json 顶层写 `shells` 数组：
每项 `{ id, channel, name?, exeNames?, url? }`，顶层 `channel` 是默认外壳
的通道；运行时 `selectShell` 按 exeNames 探测自动选，命令行可用
`--shell <外壳 id>` 显式指定。没有 exeNames 的外壳不会被自动探测命中，
只能显式选。

## 运行时组装（不要在别处复制应用事实）

`app-runtime.mjs` 从适配器数据派生：样式 id `dream-skin-2-<id>`
（变量/额外/预览层再加 `-vars` / `-extra` / `-live` 后缀）、数据目录、
会话与端口口径（会话文件优先）等。任何模块需要应用信息都从 profile 取，
不要再写一份硬编码清单。

## 新增应用的完整流程

1. 调研：确认应用形态（Electron / WebView2 / MSIX）、安装与启动方式、
   是否允许带调试端口启动；结论影响交付时先写 Spike 报告再动手。
2. 建三件套：先写 adapter.json 与空的 parts-map.json（`{}`）、空 extra.css。
3. 自检：`node -e "import('./src/core/adapters.mjs').then(m=>console.log(m.adapterErrors()))"`
   应为 `[]`；再补单测（参考 `tests/` 里按工单命名的既有文件）。
4. 状态冒烟：让应用普通启动，`node src/dreamskin.mjs status --app <id>`
   与 `apps-status` 应能正确报五态。
5. 抓锚点（需应用已带调试端口启动）：`node tools/dom-snapshot.mjs
   --port <端口> --app <id> --out snap.html` 得到脱敏骨架；照骨架把
   parts-map 的选择器逐个落定，快照复制进 `tests/fixtures/` 并写命中率
   单测（框架见 `tests/q-1-parts-hit.test.mjs`）。
6. 更新 `docs/support-matrix.md` 的版本表与 `testedVersions`。
7. 全量回归：`node --test "tests/*.test.mjs"` 全过、
   `node tools/check-version.mjs` 全 PASS、全部 .mjs 过 `node --check`；
   仓库里不得出现开发机绝对路径。

## 构建与发布

```powershell
powershell -ExecutionPolicy Bypass -File tools/fetch-node-runtime.ps1  # 便携 Node（打进 payload 的 runtime/）
node tools/build-payload.mjs          # 按平台筛文件打包 payload（Windows 包排除 macOS 的 panel.mjs）
powershell -ExecutionPolicy Bypass -File tools/build-launcher.ps1     # 总控台 exe（内嵌当前 payload zip）
node tools/check-version.mjs          # 版本一致性（唯一来源 src/core/version.mjs）
powershell -ExecutionPolicy Bypass -File tools/sign-release.ps1 -ExePath <exe> -Thumbprint <指纹>  # 有证书时签名
```

发新版本只改 `src/core/version.mjs` 一处；发布说明附支持矩阵与各适配器
的部件命中率（夹具报告）。
