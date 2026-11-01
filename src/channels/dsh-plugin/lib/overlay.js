// 页面侧样式层（T2-4 插件模板）：纯函数、无宿主依赖，只碰梦境换肤自己的三个 <style>。
// 做的事只有：按三层内容建 / 更新样式元素、内容为空或文件没了就移除。
// 红线（方案 4.8）：不读取页面里的任何已有内容，不碰 Cookie 与本地存储，不发起网络请求。
// 样式 id 与 CDP 路线同一套推导（core/inject.mjs 的 layerStyleIds，应用 id 为 dsh）：
// 部件层 dream-skin-2-dsh、变量层加 -vars、额外层加 -extra，两条路线不会互相认错。

export const STYLE_IDS = { parts: 'dream-skin-2-dsh', vars: 'dream-skin-2-dsh-vars', extra: 'dream-skin-2-dsh-extra' };
const ORDER = [STYLE_IDS.parts, STYLE_IDS.vars, STYLE_IDS.extra];

// 与 theme/layers.mjs 的 parseSkinFile 同一口径：JSON 分层格式取三层；
// 旧的纯 CSS 文本整份当部件层；空文本返回 null（表示没有皮肤）。
export function parseSkinFile(text) {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (j && j.format === 'dreamskin-skin/1' && j.layers && typeof j.layers === 'object') {
      return { vars: j.layers.vars || '', parts: j.layers.parts || '', extra: j.layers.extra || '' };
    }
  } catch {}
  return { vars: '', parts: String(text), extra: '' };
}

// 把三层写进页面：每层一个 <style>，顺序固定部件 -> 变量 -> 额外；某层为空串 = 撤掉那层。
// doc 只需要 getElementById / createElement / head（或 documentElement）这点表面，单测用假 doc 验证。
export function applyLayers(doc, layers) {
  const head = doc.head || doc.documentElement;
  const byId = { [STYLE_IDS.parts]: layers.parts || '', [STYLE_IDS.vars]: layers.vars || '', [STYLE_IDS.extra]: layers.extra || '' };
  let total = 0;
  for (const id of ORDER) {
    const css = byId[id];
    let el = doc.getElementById(id);
    if (!css) { if (el) el.remove(); continue; }
    if (!el) { el = doc.createElement('style'); el.id = id; }
    el.textContent = css;
    head.appendChild(el);
    total += css.length;
  }
  return total;
}

// 撤掉全部三层（皮肤文件被删 / 通道关闭时用）。返回实际移除的个数。
export function removeLayers(doc) {
  let n = 0;
  for (const id of ORDER) {
    const el = doc.getElementById(id);
    if (el) { el.remove(); n++; }
  }
  return n;
}
