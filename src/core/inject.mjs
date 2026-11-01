// 页面注入脚本构造（T3-2 从 dreamskin.mjs 抽出，便于单测）：三层各写一个 <style>，live 预览层排最后；
// 移除时三层 + live 一起撤掉，不需要重启应用（V-C5）。注入脚本只写 textContent：不读页面内容、
// 不碰 Cookie / localStorage、不发网络请求（§4.8）。
// 三层 id（layerStyleIds）：部件层沿用 profile.styleId（2.1 的 id 不变，页面里已有的老注入能被认出来），
// 变量层 / 额外层在它后面加后缀；live 层沿用 profile.liveId。
export function layerStyleIds(app) {
  return { parts: app.styleId, vars: app.styleId + '-vars', extra: app.styleId + '-extra', live: app.liveId };
}

export function makeInjectors(app) {
  const IDS = layerStyleIds(app);
  const READY = app.readySelector;

  // Cherry 自己的 <style id="user-defined-custom-css"> 可能之后才插入；始终把皮肤挪回最后，顺序固定为
  // 部件层 -> 变量层 -> 额外层 -> live 层。观察器带版本号：旧版观察器会被换掉（V2 只认两块，会把新层压错位）。
  const ORDER = [IDS.parts, IDS.vars, IDS.extra, IDS.live];
  const KEEP_LAST = `if (window.__dreamSkinObserverV !== 3) {
      if (window.__dreamSkinObserver) window.__dreamSkinObserver.disconnect();
      const order = () => {
        for (const id of ${JSON.stringify(ORDER)}) {
          const el = document.getElementById(id);
          if (el && el.parentNode === head) head.appendChild(el);
        }
      };
      window.__dreamSkinObserver = new MutationObserver(() => {
        const last = head.lastElementChild;
        const ours = ${JSON.stringify(ORDER)}.map((id) => document.getElementById(id)).filter(Boolean);
        const top = ours[ours.length - 1];
        if (top && last !== top) order();
      });
      window.__dreamSkinObserver.observe(head, { childList: true });
      window.__dreamSkinObserverV = 3;
    }`;

  // 分层注入：每层一个 <style>；某层为空串 = 撤掉那层。返回三层 textContent 总长度（校验用）。
  const injectLayersExpr = (layers) => `(() => {
  const layersIn = ${JSON.stringify([[IDS.parts, layers.parts || ''], [IDS.vars, layers.vars || ''], [IDS.extra, layers.extra || '']])};
  const put = () => {
    const head = document.head || document.documentElement;
    let total = 0;
    for (const [id, css] of layersIn) {
      let s = document.getElementById(id);
      if (!css) { if (s) s.remove(); continue; }
      if (!s) { s = document.createElement('style'); s.id = id; }
      s.textContent = css;
      head.appendChild(s);
      total += css.length;
    }
    const lv = document.getElementById(${JSON.stringify(IDS.live)}); if (lv) head.appendChild(lv);
    ${KEEP_LAST}
    return total;
  };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', put, { once: true }); return -1; }
  return put();
})()`;

  const removeExpr = `(() => { if (window.__dreamSkinObserver) { window.__dreamSkinObserver.disconnect(); window.__dreamSkinObserver = null; window.__dreamSkinObserverV = 0; } for (const id of ${JSON.stringify(ORDER)}) { const s = document.getElementById(id); if (s) s.remove(); } return !document.getElementById(${JSON.stringify(IDS.parts)}); })()`;

  // 实时预览：内容写进 live 层，始终排在 <head> 最后。css 为空串 = 撤掉预览（2.1 行为不变：预览块带规则段 + 变量段整份）。
  const liveExpr = (css) => `(() => {
  const css = ${JSON.stringify(css || '')};
  const head = document.head || document.documentElement;
  ${KEEP_LAST}
  let s = document.getElementById(${JSON.stringify(IDS.live)});
  if (!css) { if (s) s.remove(); return 0; }
  if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(IDS.live)}; }
  s.textContent = css;
  head.appendChild(s);
  return css.length;
})()`;

  const verifyExpr = `(() => {
  const els = ${JSON.stringify([IDS.parts, IDS.vars, IDS.extra])}.map((id) => document.getElementById(id)).filter(Boolean);
  const len = els.reduce((n, el) => n + el.textContent.length, 0);
  const bg = getComputedStyle(document.body, '::before').backgroundImage || '';
  const user = ${JSON.stringify(app.userCssId || '')} ? document.getElementById(${JSON.stringify(app.userCssId || '')}) : null;
  return { len, last: !!els.length && els[els.length - 1] === document.head.lastElementChild,
           userCss: user ? user.textContent.length : 0,
           sidebar: !!document.querySelector(${JSON.stringify(READY)}), wallpaper: bg.includes('url(') };
})()`;

  return { IDS, injectLayersExpr, removeExpr, liveExpr, verifyExpr };
}
