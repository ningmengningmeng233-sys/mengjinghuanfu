# tests/fixtures

测试夹具目录。

- `rules-cherry-2.1.txt` / `rules-zcode-2.1.txt`：2.1 规则段规范化快照（T3-2 等价守卫用）。
- `dom-*.html`：**脱敏 DOM 快照夹具**（Q-1）。格式是 `tools/dom-snapshot.mjs` 产出的
  脱敏 HTML：只有标签与 `id` / `class` / `data-*` 属性，没有任何文本内容；首行注释
  声明 `app=<适配器 id>` 与 `synthetic=<true|false>`——`true` 表示按 parts-map 锚点
  手工搭的合成骨架（框架自测用），`false` 才是真机抓取（须主人同意后由工具抓，
  抓前先确认快照里不含用户内容再入库）。
- `dom-minimax-code-real.html`：MiniMax Code 3.1.0 真机快照（2026-11-02，A-4 真机
  验证，主人已授权；抓取时应用为首页态）。入库前已按上款复核并中和三类用户专属
  值：`data-workspace-dir` / `data-project-key` / `data-project-header` 里的工作区
  路径写作 `<workspace>`、`data-session-id` 的会话标识写作 `mvs_redacted`——这三类
  属性不作部件锚点，中和不影响命中率复算；其余结构与属性原样保留。另因该应用
  主窗口为 app:// 承载、工具的 `--app` 过滤只认 file://，本快照以 `--url` 定位
  目标抓取，首行注释的 app 字段为入库时补正（DOM 内容未动）。
- `dom-codex-real.html`：Codex（包版本 26.1021.3705.0）真机快照（2026-11-02，
  A-1 真机验证，主人已授权；经总控台 --activate 真激活 + 段内调试端口抓取，
  抓取时已登录、无会话打开）。该应用已登录，骨架里带有用户专属值，入库前
  已中和：会话标题与项目名（`data-app-action-sidebar-thread-title` /
  `data-app-action-sidebar-project-label` 的值）写作 `redacted`，各类会话 /
  项目 UUID 一律换成零值 UUID、`g-p-` 项目标识写作 `g-p-redacted`；中和的
  属性均不作部件锚点、不影响命中率复算。抓取方式同上（`--url` 定位 +
  app 字段补正）。

命中率测试见 `tests/q-1-parts-hit.test.mjs`：快照经 `src/core/parts-hit.mjs` 对照
适配器 `parts-map.json` 逐部件判命中，mode 由 `src/core/health.mjs` 同口径裁决。
