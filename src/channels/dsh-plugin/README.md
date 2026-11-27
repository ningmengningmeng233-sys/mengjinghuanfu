# dsh-plugin-dreamskin (v{{version}})

DreamSkin Prism 原生双半体插件，适配 DeepSeek Harness (DSH NEXT 2.0.24-next 及兼容版本)。

## 工作机制
- **后端半体 (`lib/main.js`)**：通过 `cordis.patch.yml` 挂载，在宿主 `webserver/index-inject` 注入首屏样式，并提供本地只读路由 `/dsh-plugin-dreamskin/state` 读取 `%LOCALAPPDATA%\DreamSkin\dsh\active-skin.css` 与 `active-payload.json`。
- **前端半体 (`lib/client.js`)**：通过 `window.__ModuleLoader__` 自动加载，热同步三模式（纯黑曜光学 / 纯梦境壁纸 / 自由混搭）、壁纸底图舞台与轻量原创像素伙伴，免 CDP、免重启、零改动 `app.asar`。

## 安全红线
- 零外部网络请求；
- 不读取任何会话消息、凭证文件或浏览器存储；
- 关闭通道或撤回皮肤时立即移除全部注入 DOM 与样式，恢复原生界面。
