# tests/fixtures

测试夹具目录。

- `rules-cherry-2.1.txt` / `rules-zcode-2.1.txt`：2.1 规则段规范化快照（T3-2 等价守卫用）。
- `dom-*.html`：**脱敏 DOM 快照夹具**（Q-1）。格式是 `tools/dom-snapshot.mjs` 产出的
  脱敏 HTML：只有标签与 `id` / `class` / `data-*` 属性，没有任何文本内容；首行注释
  声明 `app=<适配器 id>` 与 `synthetic=<true|false>`——`true` 表示按 parts-map 锚点
  手工搭的合成骨架（框架自测用），`false` 才是真机抓取（须主人同意后由工具抓，
  抓前先确认快照里不含用户内容再入库）。

命中率测试见 `tests/q-1-parts-hit.test.mjs`：快照经 `src/core/parts-hit.mjs` 对照
适配器 `parts-map.json` 逐部件判命中，mode 由 `src/core/health.mjs` 同口径裁决。
