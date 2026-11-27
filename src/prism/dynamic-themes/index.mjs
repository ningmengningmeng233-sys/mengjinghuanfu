// Built-in Curated Interactive Dynamic Themes Library for DreamSkin Prism v4.
// Inspired by open-source GitHub dynamic wallpaper ecosystems (Lively, Sucrose, aurora-shaders,
// particle-network-background, ambient-effects) — 100% zero-dependency, offline-ready,
// hardware-friendly (pauses automatically when tab/window is hidden), and mouse-reactive.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function wrapCanvasTheme(title, bgCss, scriptBody) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: ${bgCss}; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function() {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  var mouse = { x: -9999, y: -9999, active: false };
  var paused = false;
  function resize() {
    W = window.innerWidth || 1280;
    H = window.innerHeight || 720;
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', function(e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
  window.addEventListener('pointerleave', function() { mouse.active = false; }, { passive: true });
  document.addEventListener('visibilitychange', function() { paused = document.hidden; });
  resize();
  ${scriptBody}
})();
</script>
</body>
</html>`;
}

function makeThumbSvg(c1, c2, c3, glyphPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="52%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c3}"/>
      </linearGradient>
      <radialGradient id="gl" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="320" height="200" fill="url(#bg)"/>
    <rect width="320" height="200" fill="url(#gl)"/>
    ${glyphPath}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const BUILTIN_DYNAMIC_THEMES = [
  {
    id: 'aurora-drift',
    title: '极光流云 · Aurora Drift',
    subtitle: '多层丝绸北极光缓慢流动，写代码护眼耐看',
    category: '极光',
    recommendedScheme: 'prism-default',
    thumbUrl: makeThumbSvg('#071324', '#103b5c', '#2a184d',
      '<path d="M-20 135 Q85 45 180 110 T350 75 L350 210 L-20 210 Z" fill="#38bdf8" fill-opacity="0.28"/><path d="M-20 155 Q110 80 210 135 T350 95 L350 210 L-20 210 Z" fill="#a78bfa" fill-opacity="0.32"/><circle cx="240" cy="48" r="2.2" fill="#e0f2fe"/><circle cx="80" cy="36" r="1.8" fill="#bae6fd"/>'),
    html: wrapCanvasTheme('极光流云 · Aurora Drift', '#060a16', `
      var t = 0;
      var ribbons = [
        { y: 0.32, amp: 64, freq: 0.0022, speed: 0.011, hue: 188, alpha: 0.52, width: 165 },
        { y: 0.48, amp: 78, freq: 0.0017, speed: -0.0085, hue: 224, alpha: 0.50, width: 205 },
        { y: 0.64, amp: 58, freq: 0.0025, speed: 0.013, hue: 282, alpha: 0.46, width: 180 },
        { y: 0.42, amp: 48, freq: 0.0030, speed: 0.008, hue: 160, alpha: 0.38, width: 135 }
      ];
      var stars = Array.from({ length: 75 }, function() {
        return { x: Math.random(), y: Math.random() * 0.72, r: 0.6 + Math.random() * 1.4, p: Math.random() * 6.28 };
      });
      function frame() {
        if (!paused) {
          t += 1;
          var bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#050816');
          bg.addColorStop(0.55, '#0b132b');
          bg.addColorStop(1, '#090d1f');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          for (var s = 0; s < stars.length; s++) {
            var st = stars[s];
            var a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.02 + st.p));
            ctx.fillStyle = 'rgba(224,242,254,' + a.toFixed(2) + ')';
            ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r, 0, 6.283); ctx.fill();
          }
          ctx.globalCompositeOperation = 'screen';
          var mx = mouse.active ? (mouse.x / W - 0.5) * 45 : 0;
          var my = mouse.active ? (mouse.y / H - 0.5) * 35 : 0;
          for (var i = 0; i < ribbons.length; i++) {
            var r = ribbons[i];
            ctx.beginPath();
            var baseY = H * r.y + my * (0.4 + i * 0.2);
            for (var x = -20; x <= W + 20; x += 18) {
              var wave = Math.sin(x * r.freq + t * r.speed + i) * r.amp + Math.cos(x * r.freq * 0.6 - t * r.speed * 1.3) * (r.amp * 0.45);
              if (x === -20) ctx.moveTo(x, baseY + wave);
              else ctx.lineTo(x, baseY + wave);
            }
            var grad = ctx.createLinearGradient(0, baseY - r.width, 0, baseY + r.width);
            grad.addColorStop(0, 'hsla(' + (r.hue + Math.sin(t * 0.005 + i) * 18) + ', 88%, 62%, 0)');
            grad.addColorStop(0.5, 'hsla(' + (r.hue + Math.sin(t * 0.005 + i) * 18) + ', 92%, 64%, ' + r.alpha + ')');
            grad.addColorStop(1, 'hsla(' + (r.hue + 28) + ', 85%, 52%, 0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = r.width;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'liquid-prism',
    title: '液态棱镜 · Liquid Prism',
    subtitle: 'VisionOS 风格通透流体光球缓慢交融折射',
    category: '流体',
    recommendedScheme: 'catppuccin',
    thumbUrl: makeThumbSvg('#090d1c', '#181938', '#0f1d34',
      '<circle cx="115" cy="95" r="64" fill="#5ce1e6" fill-opacity="0.34"/><circle cx="208" cy="110" r="68" fill="#a78bfa" fill-opacity="0.38"/><circle cx="165" cy="68" r="46" fill="#f472b6" fill-opacity="0.28"/>'),
    html: wrapCanvasTheme('液态棱镜 · Liquid Prism', '#070a15', `
      var t = 0;
      var orbs = [
        { bx: 0.26, by: 0.34, r: 0.38, sx: 0.0085, sy: 0.006, c1: 'rgba(56,232,255,0.66)', c2: 'rgba(59,130,246,0)' },
        { bx: 0.74, by: 0.54, r: 0.42, sx: -0.007, sy: 0.009, c1: 'rgba(168,120,255,0.64)', c2: 'rgba(139,92,246,0)' },
        { bx: 0.52, by: 0.24, r: 0.32, sx: 0.006, sy: -0.008, c1: 'rgba(255,96,184,0.54)', c2: 'rgba(236,72,153,0)' },
        { bx: 0.34, by: 0.76, r: 0.36, sx: -0.009, sy: -0.005, c1: 'rgba(72,158,255,0.60)', c2: 'rgba(37,99,235,0)' }
      ];
      function frame() {
        if (!paused) {
          t += 1;
          ctx.fillStyle = '#070a16';
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'screen';
          var radBase = Math.max(W, H);
          for (var i = 0; i < orbs.length; i++) {
            var o = orbs[i];
            var cx = W * o.bx + Math.sin(t * o.sx + i * 1.7) * W * 0.16;
            var cy = H * o.by + Math.cos(t * o.sy + i * 2.1) * H * 0.14;
            if (mouse.active) {
              cx += (mouse.x - W * 0.5) * 0.06 * (i % 2 === 0 ? 1 : -1);
              cy += (mouse.y - H * 0.5) * 0.06;
            }
            var r = radBase * o.r;
            var g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
            g.addColorStop(0, o.c1);
            g.addColorStop(1, o.c2);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'constellation-mesh',
    title: '星空粒子网 · Constellation',
    subtitle: '深空悬浮星尘光丝，鼠标划过柔和牵引连线',
    category: '互动',
    recommendedScheme: 'tokyo-night',
    thumbUrl: makeThumbSvg('#070b18', '#111a33', '#13132b',
      '<path d="M52 140 L118 72 L205 112 L272 56 M118 72 L156 154 L205 112" stroke="#7aa2f7" stroke-opacity="0.6" stroke-width="1.6" fill="none"/><circle cx="52" cy="140" r="3.5" fill="#93c5fd"/><circle cx="118" cy="72" r="4" fill="#5ce1e6"/><circle cx="205" cy="112" r="3.5" fill="#c4b5fd"/><circle cx="272" cy="56" r="3.5" fill="#93c5fd"/><circle cx="156" cy="154" r="3" fill="#7aa2f7"/>'),
    html: wrapCanvasTheme('星空粒子网 · Constellation', '#060a16', `
      var N = 78;
      var pts = Array.from({ length: N }, function() {
        return {
          x: Math.random() * 1400, y: Math.random() * 900,
          vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
          r: 1.4 + Math.random() * 1.9,
          hue: 195 + Math.random() * 75
        };
      });
      function frame() {
        if (!paused) {
          var bg = ctx.createLinearGradient(0, 0, W, H);
          bg.addColorStop(0, '#060a17');
          bg.addColorStop(1, '#10162c');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          var maxDist = 148;
          for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > W) p.vx *= -1;
            if (p.y < 0 || p.y > H) p.vy *= -1;
            p.x = Math.max(0, Math.min(W, p.x));
            p.y = Math.max(0, Math.min(H, p.y));
            if (mouse.active) {
              var dxm = mouse.x - p.x, dym = mouse.y - p.y;
              var dm = Math.hypot(dxm, dym);
              if (dm < 170 && dm > 1) {
                p.x += dxm * 0.008;
                p.y += dym * 0.008;
                ctx.strokeStyle = 'rgba(92,225,230,' + ((1 - dm / 170) * 0.42).toFixed(2) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
              }
            }
            for (var j = i + 1; j < pts.length; j++) {
              var q = pts[j];
              var d = Math.hypot(p.x - q.x, p.y - q.y);
              if (d < maxDist) {
                ctx.strokeStyle = 'rgba(122,162,247,' + ((1 - d / maxDist) * 0.32).toFixed(2) + ')';
                ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
              }
            }
            ctx.fillStyle = 'hsla(' + p.hue + ',92%,76%,0.9)';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'sakura-nightfall',
    title: '绯樱夜雪 · Sakura Nightfall',
    subtitle: '月夜微光中轻盈飘落的绯色樱花瓣，温柔治愈',
    category: '二次元',
    recommendedScheme: 'rose-pine',
    thumbUrl: makeThumbSvg('#191326', '#2b1b3d', '#141122',
      '<circle cx="255" cy="48" r="24" fill="#fde68a" fill-opacity="0.22"/><ellipse cx="95" cy="70" rx="11" ry="6" transform="rotate(-25 95 70)" fill="#f9a8d4" fill-opacity="0.88"/><ellipse cx="185" cy="118" rx="13" ry="7" transform="rotate(20 185 118)" fill="#fbcfe8" fill-opacity="0.82"/><ellipse cx="132" cy="148" rx="9" ry="5" transform="rotate(-15 132 148)" fill="#f472b6" fill-opacity="0.75"/>'),
    html: wrapCanvasTheme('绯樱夜雪 · Sakura Nightfall', '#130e1f', `
      var petals = Array.from({ length: 58 }, function() {
        return {
          x: Math.random() * 1400, y: Math.random() * 900,
          s: 6 + Math.random() * 9,
          vx: -0.45 - Math.random() * 0.85,
          vy: 0.65 + Math.random() * 1.1,
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 0.035,
          sway: Math.random() * 6.28,
          alpha: 0.45 + Math.random() * 0.48
        };
      });
      var t = 0;
      function frame() {
        if (!paused) {
          t += 0.015;
          var bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#120d22');
          bg.addColorStop(0.6, '#231637');
          bg.addColorStop(1, '#151024');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          var moon = ctx.createRadialGradient(W * 0.8, H * 0.22, 8, W * 0.8, H * 0.22, 160);
          moon.addColorStop(0, 'rgba(255,232,245,0.28)');
          moon.addColorStop(0.4, 'rgba(244,114,182,0.12)');
          moon.addColorStop(1, 'rgba(244,114,182,0)');
          ctx.fillStyle = moon;
          ctx.beginPath(); ctx.arc(W * 0.8, H * 0.22, 160, 0, 6.283); ctx.fill();
          for (var i = 0; i < petals.length; i++) {
            var p = petals[i];
            p.x += p.vx + Math.sin(t + p.sway) * 0.65;
            p.y += p.vy;
            p.rot += p.vr;
            if (p.y > H + 24) { p.y = -20; p.x = Math.random() * (W + 120); }
            if (p.x < -30) { p.x = W + 24; }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, 0.58 + 0.32 * Math.sin(t * 2 + p.sway));
            var g = ctx.createLinearGradient(-p.s, 0, p.s, 0);
            g.addColorStop(0, 'rgba(253,216,232,' + p.alpha + ')');
            g.addColorStop(1, 'rgba(244,114,182,' + (p.alpha * 0.85) + ')');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -p.s * 0.6);
            ctx.bezierCurveTo(p.s, -p.s * 0.9, p.s, p.s * 0.8, 0, p.s * 0.65);
            ctx.bezierCurveTo(-p.s, p.s * 0.8, -p.s, -p.s * 0.9, 0, -p.s * 0.6);
            ctx.fill();
            ctx.restore();
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'cyber-synthwave',
    title: '赛博霓虹 · Cyber Grid',
    subtitle: '流动的透视霓虹地平线与复古落日，科幻氛围拉满',
    category: '赛博',
    recommendedScheme: 'tokyo-night',
    thumbUrl: makeThumbSvg('#09051a', '#240b3d', '#0b1430',
      '<circle cx="160" cy="96" r="38" fill="#f43f5e" fill-opacity="0.65"/><line x1="0" y1="128" x2="320" y2="128" stroke="#38bdf8" stroke-width="2"/><path d="M160 128 L20 200 M160 128 L90 200 M160 128 L160 200 M160 128 L230 200 M160 128 L300 200" stroke="#38bdf8" stroke-opacity="0.55" stroke-width="1.3"/>'),
    html: wrapCanvasTheme('赛博霓虹 · Cyber Grid', '#080417', `
      var t = 0;
      function frame() {
        if (!paused) {
          t += 0.025;
          var horizon = H * 0.54;
          var sky = ctx.createLinearGradient(0, 0, 0, horizon);
          sky.addColorStop(0, '#070415');
          sky.addColorStop(0.65, '#1d0b3a');
          sky.addColorStop(1, '#3b114d');
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, W, horizon);

          var sunR = Math.min(W, H) * 0.17;
          var sg = ctx.createLinearGradient(0, horizon - sunR * 1.4, 0, horizon + 10);
          sg.addColorStop(0, '#fde047');
          sg.addColorStop(0.5, '#fb7185');
          sg.addColorStop(1, '#c026d3');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.arc(W * 0.5, horizon - sunR * 0.35, sunR, 0, 6.283); ctx.fill();

          var floor = ctx.createLinearGradient(0, horizon, 0, H);
          floor.addColorStop(0, '#130728');
          floor.addColorStop(1, '#050816');
          ctx.fillStyle = floor;
          ctx.fillRect(0, horizon, W, H - horizon);

          ctx.strokeStyle = 'rgba(56,189,248,0.45)';
          ctx.lineWidth = 1.2;
          for (var i = -12; i <= 12; i++) {
            ctx.beginPath();
            ctx.moveTo(W * 0.5 + i * 26, horizon);
            ctx.lineTo(W * 0.5 + i * 165, H);
            ctx.stroke();
          }
          for (var r = 0; r < 14; r++) {
            var p = ((r + (t % 1)) / 14);
            var y = horizon + Math.pow(p, 2.2) * (H - horizon);
            ctx.strokeStyle = 'rgba(232,121,249,' + (0.15 + p * 0.55).toFixed(2) + ')';
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(56,189,248,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'neon-rain',
    title: '霓虹雨夜 · Neon Rain',
    subtitle: '静谧深夜城市散景光斑与细腻细雨，沉浸感十足',
    category: '护眼',
    recommendedScheme: 'nord',
    thumbUrl: makeThumbSvg('#09111f', '#132238', '#0a101c',
      '<circle cx="88" cy="76" r="26" fill="#38bdf8" fill-opacity="0.24"/><circle cx="222" cy="118" r="32" fill="#fb7185" fill-opacity="0.22"/><line x1="70" y1="20" x2="62" y2="62" stroke="#bae6fd" stroke-opacity="0.65" stroke-width="1.5"/><line x1="160" y1="50" x2="152" y2="96" stroke="#bae6fd" stroke-opacity="0.65" stroke-width="1.5"/><line x1="250" y1="32" x2="242" y2="74" stroke="#bae6fd" stroke-opacity="0.65" stroke-width="1.5"/>'),
    html: wrapCanvasTheme('霓虹雨夜 · Neon Rain', '#070e1a', `
      var bokeh = Array.from({ length: 18 }, function() {
        return {
          x: Math.random(), y: Math.random(),
          r: 28 + Math.random() * 68,
          color: ['rgba(56,189,248,0.16)', 'rgba(251,113,133,0.14)', 'rgba(167,139,250,0.14)', 'rgba(250,204,21,0.11)'][Math.floor(Math.random() * 4)],
          p: Math.random() * 6.28
        };
      });
      var drops = Array.from({ length: 95 }, function() {
        return { x: Math.random() * 1400, y: Math.random() * 900, l: 16 + Math.random() * 24, v: 5.5 + Math.random() * 5, a: 0.14 + Math.random() * 0.28 };
      });
      var t = 0;
      function frame() {
        if (!paused) {
          t += 0.015;
          var bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#070e1c');
          bg.addColorStop(1, '#101b2f');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          for (var b = 0; b < bokeh.length; b++) {
            var k = bokeh[b];
            var bx = k.x * W + Math.sin(t + k.p) * 14;
            var by = k.y * H + Math.cos(t * 0.8 + k.p) * 10;
            var g = ctx.createRadialGradient(bx, by, 2, bx, by, k.r);
            g.addColorStop(0, k.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(bx, by, k.r, 0, 6.283); ctx.fill();
          }
          ctx.lineWidth = 1.1;
          for (var i = 0; i < drops.length; i++) {
            var d = drops[i];
            d.x -= d.v * 0.16; d.y += d.v;
            if (d.y > H + 30) { d.y = -30; d.x = Math.random() * (W + 120); }
            ctx.strokeStyle = 'rgba(186,230,253,' + d.a + ')';
            ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.16, d.y + d.l); ctx.stroke();
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'matrix-cascade',
    title: '矩阵流光 · Matrix Cascade',
    subtitle: '克制低眩光的极客数字代码雨，程序员经典',
    category: '极客',
    recommendedScheme: 'prism-default',
    thumbUrl: makeThumbSvg('#040d0a', '#092219', '#05100c',
      '<text x="54" y="88" fill="#34d399" fill-opacity="0.72" font-family="monospace" font-size="18">0 1 0 1</text><text x="150" y="128" fill="#6ee7b7" fill-opacity="0.82" font-family="monospace" font-size="18">1 0 1 1</text><text x="220" y="70" fill="#10b981" fill-opacity="0.58" font-family="monospace" font-size="16">A 9 F</text>'),
    html: wrapCanvasTheme('矩阵流光 · Matrix Cascade', '#040a08', `
      var cols = 0, drops = [], fs = 16;
      var chars = '01アイウエオカキクケコABCDEF<>/{}[]';
      function initCols() {
        cols = Math.max(12, Math.floor(W / fs));
        drops = Array.from({ length: cols }, function() { return Math.random() * -40; });
      }
      initCols();
      window.addEventListener('resize', initCols);
      var tick = 0;
      function frame() {
        if (!paused) {
          tick++;
          if (tick % 2 === 0) {
            ctx.fillStyle = 'rgba(4, 11, 9, 0.12)';
            ctx.fillRect(0, 0, W, H);
            ctx.font = fs + 'px Consolas, monospace';
            for (var i = 0; i < drops.length; i++) {
              var ch = chars[Math.floor(Math.random() * chars.length)];
              var x = i * fs, y = drops[i] * fs;
              ctx.fillStyle = Math.random() > 0.92 ? 'rgba(167,243,208,0.92)' : 'rgba(52,211,153,0.52)';
              ctx.fillText(ch, x, y);
              if (y > H && Math.random() > 0.975) drops[i] = 0;
              drops[i] += 0.72;
            }
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
  {
    id: 'firefly-forest',
    title: '萤火仲夏 · Firefly Night',
    subtitle: '深蓝夜幕里暖金萤火虫呼吸漂浮，安静舒缓',
    category: '护眼',
    recommendedScheme: 'gruvbox',
    thumbUrl: makeThumbSvg('#09121e', '#13242b', '#121814',
      '<circle cx="95" cy="95" r="14" fill="#fde047" fill-opacity="0.28"/><circle cx="95" cy="95" r="3.5" fill="#fef08a"/><circle cx="210" cy="72" r="18" fill="#fbbf24" fill-opacity="0.25"/><circle cx="210" cy="72" r="4" fill="#fde68a"/><circle cx="165" cy="142" r="12" fill="#a3e635" fill-opacity="0.24"/><circle cx="165" cy="142" r="3" fill="#d9f99d"/>'),
    html: wrapCanvasTheme('萤火仲夏 · Firefly Night', '#081018', `
      var flies = Array.from({ length: 48 }, function() {
        return {
          x: Math.random() * 1400, y: Math.random() * 900,
          vx: (Math.random() - 0.5) * 0.45, vy: -0.15 - Math.random() * 0.35,
          r: 2 + Math.random() * 2.6,
          p: Math.random() * 6.28,
          sp: 0.02 + Math.random() * 0.03,
          warm: Math.random() > 0.3
        };
      });
      function frame() {
        if (!paused) {
          var bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#070f1b');
          bg.addColorStop(0.65, '#0e1d24');
          bg.addColorStop(1, '#0b1615');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          for (var i = 0; i < flies.length; i++) {
            var f = flies[i];
            f.p += f.sp;
            f.x += f.vx + Math.sin(f.p) * 0.3;
            f.y += f.vy + Math.cos(f.p * 0.8) * 0.25;
            if (f.y < -20) { f.y = H + 20; f.x = Math.random() * W; }
            if (f.x < -20) f.x = W + 20;
            if (f.x > W + 20) f.x = -20;
            var glow = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(f.p * 1.5));
            var g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, f.r * 7);
            g.addColorStop(0, f.warm ? ('rgba(254,240,138,' + (glow * 0.9) + ')') : ('rgba(190,242,100,' + (glow * 0.85) + ')'));
            g.addColorStop(0.4, f.warm ? ('rgba(251,191,36,' + (glow * 0.28) + ')') : ('rgba(132,204,22,' + (glow * 0.24) + ')'));
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 7, 0, 6.283); ctx.fill();
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    `),
  },
];

export function listBuiltinDynamicThemes() {
  return BUILTIN_DYNAMIC_THEMES.map((t) => ({
    id: t.id,
    title: t.title,
    subtitle: t.subtitle,
    category: t.category,
    recommendedScheme: t.recommendedScheme,
    thumbUrl: t.thumbUrl,
    previewUrl: `/api/dynamic-themes/${encodeURIComponent(t.id)}/preview.html`,
  }));
}

export function getBuiltinDynamicTheme(id) {
  return BUILTIN_DYNAMIC_THEMES.find((t) => t.id === id) || null;
}

export function materializeDynamicTheme({ id, uploadDir }) {
  const theme = getBuiltinDynamicTheme(id);
  if (!theme) throw new Error(`未知动态主题: ${id}`);
  const folderName = `dyn_${theme.id}`;
  const destDir = join(uploadDir, folderName);
  mkdirSync(destDir, { recursive: true });
  const indexHtmlPath = join(destDir, 'index.html');
  writeFileSync(indexHtmlPath, theme.html, 'utf8');
  const projectJson = {
    title: theme.title,
    description: theme.subtitle,
    type: 'web',
    file: 'index.html',
    tags: ['DynamicTheme', theme.category],
    dreamskinDynamicThemeId: theme.id,
    recommendedScheme: theme.recommendedScheme,
  };
  writeFileSync(join(destDir, 'project.json'), JSON.stringify(projectJson, null, 2) + '\n', 'utf8');
  return {
    theme,
    dir: destDir,
    exists: existsSync(indexHtmlPath),
  };
}
