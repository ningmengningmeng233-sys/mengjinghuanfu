// dsh-plugin-dreamskin 前端半体（DreamSkin Prism v4.1）：
// 走 DSH NEXT 官方 window.__ModuleLoader__ 协议挂载，无需 CDP、无需重启、零改动 app.asar。
// 完整加载跨平台 Obsidian Prism 光学与桌宠套件（300Hz 虹彩棱镜光带 + 像素桌宠叠叠乐 + 地平线光场 + 4档弹簧），
// 并与 DreamSkin 动静态壁纸 / 液态玻璃三模式协同。
// 严格红线：仅请求同源只读端点 /dsh-plugin-dreamskin/{state,optical.js}，零外网、不碰 Cookie 与业务存储。
(() => {
  try {
    if (typeof window === 'undefined' || !window.__ModuleLoader__ || typeof window.__ModuleLoader__.load !== 'function') {
      return;
    }
    window.__ModuleLoader__.load({
      id: 'dsh-plugin-dreamskin',
      factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

        var react = null;
        try { react = require('react'); } catch (_) {}

        var PLUGIN_VERSION = '{{version}}';
        var STATE_ENDPOINT = '/dsh-plugin-dreamskin/state';
        var OPTICAL_ENDPOINT = '/dsh-plugin-dreamskin/optical.js';
        var OPTICAL_SCRIPT_ID = 'dsh-dreamskin-optical-script';
        var STYLE_IDS = {
          parts: 'dream-skin-2-dsh',
          vars: 'dream-skin-2-dsh-vars',
          extra: 'dream-skin-2-dsh-extra',
        };
        var STAGE_ID = 'agy-prism-dsh-stage';

        var lastMtime = -1;
        var lastState = null;
        var opticalLoading = false;

        function setStyleText(id, css) {
          var head = document.head || document.documentElement;
          var el = document.getElementById(id);
          if (!css) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            return;
          }
          if (!el) {
            el = document.createElement('style');
            el.id = id;
            head.appendChild(el);
          }
          if (el.textContent !== css) el.textContent = css;
        }

        function removeNode(id) {
          var el = document.getElementById(id);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }

        function clearRootAttrs() {
          var root = document.documentElement;
          if (!root) return;
          var attrs = [
            'data-agy-prism-skin',
            'data-agy-prism-glass',
            'data-agy-prism-wallpaper',
            'data-prism-skin-mode',
            'data-prism-theme',
            'data-prism-scheme',
            'data-prism-layout',
            'data-prism-optical-facet',
            'data-prism-motion',
            'data-prism-companion',
          ];
          for (var i = 0; i < attrs.length; i += 1) root.removeAttribute(attrs[i]);
        }

        function ensureOpticalSuiteLoaded(onReady) {
          if (window.__dreamSkinOptical && typeof window.__dreamSkinOptical.apply === 'function') {
            if (onReady) onReady();
            return;
          }
          if (opticalLoading || !document.head) return;
          opticalLoading = true;
          var script = document.getElementById(OPTICAL_SCRIPT_ID);
          if (!script) {
            script = document.createElement('script');
            script.id = OPTICAL_SCRIPT_ID;
            script.src = OPTICAL_ENDPOINT;
            script.async = true;
            script.onload = function () {
              opticalLoading = false;
              if (onReady) onReady();
            };
            script.onerror = function () {
              opticalLoading = false;
            };
            document.head.appendChild(script);
          } else {
            opticalLoading = false;
          }
        }

        function syncStage(payload) {
          var eff = payload && payload.composition && payload.composition.effectiveModules;
          var activeItem = payload && payload.activeItem;
          var cfg = (payload && payload.config) || {};
          if (!eff || !eff.wallpaperLayer) {
            removeNode(STAGE_ID);
            document.documentElement.removeAttribute('data-agy-prism-wallpaper');
            return;
          }
          var mediaUrl = activeItem ? (activeItem.mediaUrl || activeItem.thumbUrl || '') : '';
          var isLocalSafe = !mediaUrl || /^(?:data:|blob:|https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/)/i.test(mediaUrl);
          if (!isLocalSafe) mediaUrl = '';
          if (!document.body) return;
          var stage = document.getElementById(STAGE_ID);
          if (!stage) {
            stage = document.createElement('div');
            stage.id = STAGE_ID;
            stage.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict;background-size:cover;background-position:center;background-repeat:no-repeat;';
            document.body.appendChild(stage);
          }
          if (mediaUrl) {
            var isVideo = activeItem && activeItem.kind === 'video';
            var isWeb = activeItem && activeItem.kind === 'web';
            if (isWeb) {
              var webUrl = activeItem.webUrl || mediaUrl;
              var isWebLoopback = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(webUrl);
              if (isWebLoopback) {
                var frm = stage.querySelector('iframe[data-dsh-dyn="1"]');
                if (!frm) {
                  stage.innerHTML = '';
                  frm = document.createElement('iframe');
                  frm.setAttribute('data-dsh-dyn', '1');
                  frm.setAttribute('sandbox', 'allow-scripts allow-same-origin');
                  frm.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;';
                  stage.appendChild(frm);
                }
                if (frm.src !== webUrl) frm.src = webUrl;
                stage.style.backgroundImage = '';
              }
            } else if (isVideo) {
              var vid = stage.querySelector('video');
              if (!vid) {
                stage.innerHTML = '';
                vid = document.createElement('video');
                vid.autoplay = !cfg.paused;
                vid.loop = true;
                vid.muted = true;
                vid.playsInline = true;
                vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;';
                stage.appendChild(vid);
              }
              if (vid.src !== mediaUrl) vid.src = mediaUrl;
              if (cfg.paused) { try { vid.pause(); } catch (_) {} } else { try { vid.play(); } catch (_) {} }
              stage.style.backgroundImage = '';
            } else {
              if (stage.querySelector('video, iframe')) stage.innerHTML = '';
              stage.style.backgroundImage = 'url("' + mediaUrl.replace(/"/g, '\\"') + '")';
            }
          } else {
            stage.innerHTML = '';
            stage.style.backgroundImage = 'radial-gradient(ellipse 80% 70% at 22% 24%, rgba(102,157,246,0.28) 0%, transparent 65%), linear-gradient(160deg, #0b0e18 0%, #111827 100%)';
          }
          document.documentElement.setAttribute('data-agy-prism-wallpaper', 'ready');
        }

        function syncOpticalSuite(payload) {
          var eff = payload && payload.composition && payload.composition.effectiveModules;
          var needOptical = Boolean(eff && (eff.opticalPalette || eff.opticalFacet || eff.rippleField || eff.microMotion || eff.pixelCompanion));
          if (!needOptical) {
            try { if (window.__dreamSkinOptical && window.__dreamSkinOptical.teardown) window.__dreamSkinOptical.teardown(); } catch (_) {}
            return;
          }
          var applyNow = function () {
            try {
              if (window.__dreamSkinOptical && typeof window.__dreamSkinOptical.apply === 'function') {
                var patched = Object.assign({}, payload, {
                  adapterProfile: Object.assign({ appId: 'dsh' }, (payload && payload.adapterProfile) || {}),
                });
                window.__dreamSkinOptical.apply(patched);
              }
            } catch (_) {}
          };
          if (window.__dreamSkinOptical) applyNow();
          else ensureOpticalSuiteLoaded(applyNow);
        }

        function teardownAll() {
          setStyleText(STYLE_IDS.parts, '');
          setStyleText(STYLE_IDS.vars, '');
          setStyleText(STYLE_IDS.extra, '');
          removeNode(STAGE_ID);
          try { if (window.__dreamSkinOptical && window.__dreamSkinOptical.teardown) window.__dreamSkinOptical.teardown(); } catch (_) {}
          clearRootAttrs();
        }

        function applyRemoteState(data) {
          lastState = data;
          if (!data || !data.active) {
            teardownAll();
            return;
          }
          var layers = data.layers || {};
          var payload = data.payload || {};
          var comp = payload.composition || {};
          var eff = comp.effectiveModules || { wallpaperLayer: true, glassLayer: true, opticalPalette: true };
          var mode = comp.skinMode || (payload.config && payload.config.skinMode) || 'wallpaper';

          var cfg = (payload && payload.config) || {};
          var themeMode = cfg.themeMode === 'light' ? 'light' : 'dark';
          var root = document.documentElement;
          root.setAttribute('data-agy-prism-skin', PLUGIN_VERSION);
          root.setAttribute('data-agy-prism-glass', 'ready');
          root.setAttribute('data-prism-skin-mode', mode);
          root.setAttribute('data-prism-theme', themeMode);
          root.setAttribute('data-prism-scheme', String(cfg.colorScheme || 'prism-default'));
          root.setAttribute('data-prism-layout', String(cfg.layoutMode || 'islands'));
          root.setAttribute('data-prism-optical-facet', eff.opticalFacet ? 'on' : 'off');
          root.setAttribute('data-prism-motion', eff.microMotion ? 'on' : 'off');
          root.setAttribute('data-prism-companion', eff.pixelCompanion ? 'on' : 'off');

          setStyleText(STYLE_IDS.parts, layers.parts || '');
          setStyleText(STYLE_IDS.vars, layers.vars || '');
          setStyleText(STYLE_IDS.extra, layers.extra || '');
          syncStage(payload);
          syncOpticalSuite(payload);
        }

        function syncStagePlayback() {
          var stage = document.getElementById(STAGE_ID);
          if (!stage) return;
          var vid = stage.querySelector('video');
          if (!vid) return;
          var cfg = (lastState && lastState.payload && lastState.payload.config) || {};
          if (document.hidden || cfg.paused) {
            try { vid.pause(); } catch (_) {}
          } else {
            try { vid.play(); } catch (_) {}
          }
        }

        function pollOnce() {
          if (typeof fetch !== 'function') return;
          if (typeof document !== 'undefined' && document.hidden) return;
          var url = lastMtime >= 0 ? (STATE_ENDPOINT + '?since=' + encodeURIComponent(String(lastMtime))) : STATE_ENDPOINT;
          fetch(url, { cache: 'no-store', credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
              if (!data || !data.ok || data.unchanged) return;
              if (data.mtimeMs === lastMtime && Boolean(data.active) === Boolean(lastState && lastState.active)) {
                return;
              }
              lastMtime = data.mtimeMs;
              applyRemoteState(data);
            })
            .catch(function () {});
        }

        exports.name = 'dsh-plugin-dreamskin';
        exports.inject = ['slots'];
        exports.apply = function applyClient(ctx) {
          pollOnce();
          // 5s 低开销条件轮询（文件未变时服务端零读盘，切回窗口立即同步）
          var timer = setInterval(pollOnce, 5000);
          var onVis = function () {
            syncStagePlayback();
            if (typeof document !== 'undefined' && !document.hidden) pollOnce();
          };
          var onFocus = function () { pollOnce(); };
          try { if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis); } catch (_) {}
          try { if (typeof window !== 'undefined') window.addEventListener('focus', onFocus, { passive: true }); } catch (_) {}
          var slotDisp = null;
          try {
            if (react && ctx && ctx.slots && typeof ctx.slots.register === 'function') {
              var h = react.createElement;
              var DreamskinSettingsSection = function DreamskinSettingsSection() {
                var mode = (lastState && lastState.payload && lastState.payload.composition && lastState.payload.composition.skinMode) || '未启用';
                var modeLabel = mode === 'optical' ? '纯黑曜光学' : mode === 'wallpaper' ? '纯梦境壁纸' : mode === 'hybrid' ? '自由混搭' : '未启用';
                return h('div', {
                  style: {
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-card-fill, transparent))',
                    border: '1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, rgba(255,255,255,0.12)))',
                    color: 'var(--dsw-alias-label-primary, inherit)',
                  },
                },
                  h('div', { style: { fontWeight: 600, fontSize: '14px', marginBottom: '6px' } }, '梦境换肤 Prism v' + PLUGIN_VERSION),
                  h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, inherit)', lineHeight: 1.6 } },
                    '当前生效模式：' + modeLabel + ' · 已启用流式输出防卡顿节流、全量 --dsw-* 插件变量桥接，与插件市场/配额/定时任务/轨迹等全部官方及第三方 DSH 插件和平共存。'
                  ),
                );
              };
              // DSH NEXT 2.0.24~2.0.28 官方对象式 slots.register 签名（兼容旧字符串签名回退）
              try {
                slotDisp = ctx.slots.register(
                  {
                    name: 'settings.section',
                    id: 'dreamskin-prism',
                    order: 90,
                    label: function () { return '梦境换肤 Prism'; },
                  },
                  DreamskinSettingsSection,
                );
              } catch (_) {
                slotDisp = ctx.slots.register('settings.section', {
                  id: 'dreamskin-prism',
                  title: '梦境换肤 Prism',
                  render: DreamskinSettingsSection,
                });
              }
            }
          } catch (_) {}
          return function disposeClient() {
            clearInterval(timer);
            try { if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); } catch (_) {}
            try { if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus); } catch (_) {}
            try { if (typeof slotDisp === 'function') slotDisp(); } catch (_) {}
            teardownAll();
          };
        };

        return module.exports;
      },
    });
  } catch (_) {}
})();
