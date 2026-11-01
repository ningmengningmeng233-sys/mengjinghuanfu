// 页面级冲突检测（A-1，方案 §3 共存规则 / §5 / §7.5 V-A10）：换肤工具之间不能双重注入。
// T2-2 的 msix 通道已在「端口」层做第一道检测（段外调试端口 = 疑似其他工具在启动）；
// 本模块补「页面」层：连上主窗口后先清点页面里带 id 的 <style>，认出已知冲突工具注入的
// 样式就停手、提示用户二选一，绝不抢、不叠加注入。
// 页面求值只取 style 元素的 id 清单（元数据，与 probes / verifyExpr 同口径）：
// 不读样式内容、不读页面内容、不碰 Cookie / localStorage、不发网络请求（§4.8）。
//
// 对方标记的实证程度（2026-11-02）：Codex-Dream-Skin 的确切 style id 未能从公开资料核到
// （查过其项目公开说明与官网，均未写明），注册表只登记它的公开品牌标识前缀
// codex-dream-skin（其产品名与本机安装目录 ~/.codex/codex-dream-skin-studio 同此名）；
// 确切 id 待 V-A10 真机验证（把对方实际注入的 style id 读出来）后补进 styleIds 并订正。
// 我们自己的 style id 是 dream-skin-2-<适配器 id>（core/app-runtime.mjs 推导），与对方不同（§3）。
export const FOREIGN_SKIN_TOOLS = {
  'codex-dream-skin': {
    name: 'Codex-Dream-Skin',
    styleIds: [],
    styleIdPrefixes: ['codex-dream-skin'],
  },
};

// profile.conflicts（adapter.json 的 conflicts 字段）-> 注册表里有标记的工具清单。
// 注册表里没有的 id 没有已知页面标记，跳过（页面层检测不到不等于没冲突，端口层兜底）。
export function conflictToolsOf(profile) {
  const ids = (profile && profile.conflicts) || [];
  const out = [];
  for (const id of ids) {
    const t = FOREIGN_SKIN_TOOLS[id];
    if (t) out.push({ id, name: t.name, styleIds: [...t.styleIds], styleIdPrefixes: [...t.styleIdPrefixes] });
  }
  return out;
}

// 页面里全部带 id 的 <style> 的 id 清单（只取 id，不取内容）。
export function pageStyleIdsExpr() {
  return `(() => [...document.querySelectorAll('style[id]')].map((el) => el.id))()`;
}

// 纯函数裁决：pageStyleIds 是页面清单；ownIds 是我们自己的全部样式 id（部件 / 变量 /
// 额外 / live 四层 + 应用自身的 userCssId），先排除自己人再比对方标记。
// 返回 null（无冲突）或 { tool, name, hits }（hits 为命中的对方 style id 清单）。
export function detectForeignStyles(pageStyleIds, { ownIds = [], tools = [] } = {}) {
  const own = new Set((ownIds || []).filter(Boolean));
  const ids = [...new Set((pageStyleIds || []).filter((s) => typeof s === 'string' && s && !own.has(s)))];
  for (const t of tools || []) {
    const hits = ids.filter((id) => (t.styleIds || []).includes(id)
      || (t.styleIdPrefixes || []).some((p) => p && id.startsWith(p)));
    if (hits.length) return { tool: t.id, name: t.name, hits };
  }
  return null;
}

// 二选一提示文案（apply 停手时用，明确说明这次没有注入任何样式）。
export function foreignStyleMessage(appName, hit) {
  return `${appName} 的页面里已经有 ${hit.name} 注入的样式（${hit.hits.join('、')}），两个换肤工具同时注入会互相打架。`
    + `梦境换肤这次没有注入任何样式：请先在 ${hit.name} 里还原或退出，再用梦境换肤；或者继续用 ${hit.name}，二选一。`;
}
