#!/usr/bin/env node
// Authentic Obsidian Prism x DreamSkin Prism Flagship Live Preview for DSH NEXT (2.0.24-next).
// Directly runs the REAL Obsidian Prism frontend modules (motion-engine, animated-icons,
// prism-rim-canvas 300Hz GPU rim, ripple-core WebGL2 horizon glow + ASCII character matrix,
// dual-mascot-rig with casting stage & prismatic coat, smooth-caret) alongside the REAL
// DreamSkin wallpaper-inject.js microkernel, DSH NEXT adapter, and local wallpapers.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appRuntimeById, listRuntimeProfiles } from '../src/core/app-runtime.mjs';
import { findExe } from '../src/core/app-process.mjs';
import { getFallbackAppIconSvg } from '../src/core/app-icons.mjs';
import { VERSION } from '../src/core/version.mjs';
import { compileAdapterPrismCss } from '../src/theme/prism-bridge.mjs';
import {
  buildClientSkinPayload,
  buildStaticCssSheet,
  getHostOpticalScript,
  getHostSkinScript,
} from '../src/prism/host/index.mjs';
import { BUILTIN_DYNAMIC_THEMES } from '../src/prism/dynamic-themes/index.mjs';
import { dshPluginChannel } from '../src/channels/dsh-plugin.mjs';
import {
  DEFAULT_V4_STORE,
  resolveAppEffectiveConfig,
  resolveSkinComposition,
  sanitizeConfig,
  sanitizeV4Store,
} from '../src/prism/shared/schema.mjs';

const PORT = Number(process.env.DSH_PREVIEW_PORT || 41739);
const LOCAL_DATA = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'DreamSkin', 'v4');
const UPLOADS_DIR = join(LOCAL_DATA, 'uploads');
const APP_ICONS_DIR = join(LOCAL_DATA, 'app-icons');
const V4_STORE_FILE = join(LOCAL_DATA, 'v4-store.json');

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.html': 'text/html; charset=utf-8',
};

function scanLocalWallpapers() {
  const list = [];
  for (const dyn of BUILTIN_DYNAMIC_THEMES.slice(0, 2)) {
    list.push({
      id: `dyn:${dyn.id}`,
      title: dyn.title,
      kind: 'web',
      webUrl: `/dyn/${encodeURIComponent(dyn.id)}`,
      mediaUrl: `/dyn/${encodeURIComponent(dyn.id)}`,
      thumbUrl: dyn.thumbUrl,
      badge: '动态',
    });
  }
  if (existsSync(UPLOADS_DIR)) {
    try {
      const entries = readdirSync(UPLOADS_DIR).slice(0, 32);
      for (const f of entries) {
        const full = join(UPLOADS_DIR, f);
        let st = null;
        try { st = statSync(full); } catch { continue; }
        if (st.isFile()) {
          const ext = extname(f).toLowerCase();
          if (!MIME_MAP[ext] || ext === '.html') continue;
          const isVid = ext === '.mp4' || ext === '.webm';
          list.push({
            id: `upload:${f}`,
            title: f.replace(/\.[^.]+$/, ''),
            kind: isVid ? 'video' : 'image',
            mediaUrl: `/uploads/${encodeURIComponent(f)}`,
            thumbUrl: isVid ? '' : `/uploads/${encodeURIComponent(f)}`,
            badge: isVid ? '视频' : '图片',
          });
        } else if (st.isDirectory()) {
          let title = f;
          let mediaFile = '';
          let previewFile = '';
          const metaPath = join(full, 'project.json');
          if (existsSync(metaPath)) {
            try {
              const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
              if (meta.title) title = String(meta.title);
              if (meta.file) mediaFile = String(meta.file);
              if (meta.preview) previewFile = String(meta.preview);
            } catch {}
          }
          if (!mediaFile) {
            try {
              const subFiles = readdirSync(full);
              mediaFile = subFiles.find((sf) => {
                const ext = extname(sf).toLowerCase();
                return Boolean(MIME_MAP[ext] && ext !== '.html');
              }) || '';
            } catch {}
          }
          if (!mediaFile) continue;
          const ext = extname(mediaFile).toLowerCase();
          if (!MIME_MAP[ext] || ext === '.html') continue;
          const isVid = ext === '.mp4' || ext === '.webm';
          const thumb = previewFile || (isVid ? '' : mediaFile);
          list.push({
            id: `upload:${f}/${mediaFile}`,
            title,
            kind: isVid ? 'video' : 'image',
            mediaUrl: `/uploads/${encodeURIComponent(f)}/${encodeURIComponent(mediaFile)}`,
            thumbUrl: thumb ? `/uploads/${encodeURIComponent(f)}/${encodeURIComponent(thumb)}` : '',
            badge: isVid ? '视频' : '本机',
          });
        }
      }
    } catch {}
  }
  for (const dyn of BUILTIN_DYNAMIC_THEMES.slice(2, 4)) {
    list.push({
      id: `dyn:${dyn.id}`,
      title: dyn.title,
      kind: 'web',
      webUrl: `/dyn/${encodeURIComponent(dyn.id)}`,
      mediaUrl: `/dyn/${encodeURIComponent(dyn.id)}`,
      thumbUrl: dyn.thumbUrl,
      badge: '动态',
    });
  }
  return list;
}

let _liveVersionsCache = null;
function detectInstalledClientVersions() {
  if (_liveVersionsCache) return _liveVersionsCache;
  const out = {};
  try {
    const profiles = listRuntimeProfiles();
    const pairs = [];
    for (const p of profiles) {
      const exe = findExe(p, []);
      if (exe && existsSync(exe)) pairs.push({ id: p.id, exe });
    }
    if (pairs.length) {
      const psLines = pairs
        .map((x) => `$v=(Get-Item -LiteralPath '${x.exe.replace(/'/g, "''")}' -ErrorAction SilentlyContinue).VersionInfo; [pscustomobject]@{id='${x.id}';ver=if($v.FileVersion){$v.FileVersion}else{$v.ProductVersion}}`)
        .join(';');
      const raw = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `@(${psLines}) | ConvertTo-Json -Compress`],
        { encoding: 'utf8', windowsHide: true, timeout: 6000 },
      ).trim();
      if (raw) {
        const arr = JSON.parse(raw);
        for (const r of (Array.isArray(arr) ? arr : [arr])) {
          if (r && r.id && r.ver) out[r.id] = String(r.ver).replace(/\.0$/, '');
        }
      }
    }
    const msixRaw = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Select-Object -First 1).Version`],
      { encoding: 'utf8', windowsHide: true, timeout: 4000 },
    ).trim();
    if (msixRaw) out.codex = msixRaw;
  } catch {}
  _liveVersionsCache = out;
  return out;
}

function loadCurrentDshConfig() {
  let store = sanitizeV4Store(DEFAULT_V4_STORE);
  try {
    if (existsSync(V4_STORE_FILE)) {
      store = sanitizeV4Store(JSON.parse(readFileSync(V4_STORE_FILE, 'utf8').replace(/^\uFEFF/, '')));
    }
  } catch {}
  return { store, effective: resolveAppEffectiveConfig(store, 'dsh') };
}

function compileAppPayload(appId, rawCfg, selectedWallpaper, origin) {
  const safeId = appId && /^[a-z0-9-]+$/i.test(String(appId)) ? String(appId).toLowerCase() : 'dsh';
  let profile;
  try { profile = appRuntimeById(safeId); } catch { profile = appRuntimeById('dsh'); }
  const cleanCfg = sanitizeConfig(rawCfg || {});
  const composition = resolveSkinComposition(cleanCfg, {
    appId: profile.id,
    adapterMode: 'full',
    hasWallpaper: Boolean(selectedWallpaper),
  });
  const compiled = compileAdapterPrismCss({
    appId: profile.id,
    partsMap: profile.partsMap,
    extraCss: profile.extraCss,
    mode: 'full',
    composition,
  });
  const payload = buildClientSkinPayload(cleanCfg, selectedWallpaper, origin, {
    skinEnabled: true,
    composition,
    adapterProfile: {
      appId: profile.id,
      mode: compiled.mode,
      adapterCss: compiled.adapterCss,
      browserHoleSupport: false,
    },
  });
  return { profile, cleanCfg, composition, compiled, payload };
}

function readJsonBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolvePromise({});
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

export function renderPreviewHtml() {
  const palettesMeta = [
    {
      id: 'obsidian-dark', label: '深空黑曜', sub: 'Obsidian', scheme: 'prism-default', theme: 'dark',
      bg: '#0E0E11', sb: '#09090B', accent: '#6EA8FF',
      tokens: {
        accent: '#6EA8FF', accent2: '#64D2FF', accent3: '#A78BFA',
        headGrad: 'linear-gradient(100deg, #F5F8FF 0%, #92C8FF 56%, #C4B5FD 100%)',
        barGrad: 'linear-gradient(90deg, #3B82F6 0%, #64D2FF 100%)',
        vialGrad: 'linear-gradient(180deg, #7CE2FF 0%, #3B82F6 54%, #4F46E5 100%)',
        h1: 'rgba(110,168,255,0.28)', h2: 'rgba(110,168,255,0.48)',
        h3: 'linear-gradient(135deg,#6EA8FF,#818CF8)', h4: 'linear-gradient(135deg,#64D2FF,#A78BFA)', h5: 'linear-gradient(135deg,#8CE8FF,#C4B5FD)',
        tokK: '#C4A5FF', tokS: '#6BE5B8', tokP: '#7DC4FF',
      },
    },
    {
      id: 'warm-dark', label: '暖炭玄岩', sub: 'Amber Ink', scheme: 'warm-carbon', theme: 'dark',
      bg: '#141413', sb: '#10100F', accent: '#E8845F',
      tokens: {
        accent: '#E8845F', accent2: '#F5C26B', accent3: '#F2A27E',
        headGrad: 'linear-gradient(100deg, #FAF4EA 0%, #F5C26B 56%, #E8845F 100%)',
        barGrad: 'linear-gradient(90deg, #D97757 0%, #F5C26B 100%)',
        vialGrad: 'linear-gradient(180deg, #FDE68A 0%, #E8845F 56%, #A84423 100%)',
        h1: 'rgba(232,132,95,0.26)', h2: 'rgba(232,132,95,0.46)',
        h3: 'linear-gradient(135deg,#D97757,#EA9A64)', h4: 'linear-gradient(135deg,#EE9664,#F5C26B)', h5: 'linear-gradient(135deg,#F8B978,#FDE68A)',
        tokK: '#F5B07A', tokS: '#A8D59B', tokP: '#F6CB75',
      },
    },
    {
      id: 'cyber-dark', label: '霓虹夜城', sub: 'Tokyo Cyber', scheme: 'tokyo-night', theme: 'dark',
      bg: '#0C1020', sb: '#080B17', accent: '#42E8FF',
      tokens: {
        accent: '#42E8FF', accent2: '#DE85FF', accent3: '#4DF5BC',
        headGrad: 'linear-gradient(100deg, #EBFEFF 0%, #42E8FF 52%, #E294FF 100%)',
        barGrad: 'linear-gradient(90deg, #22D3EE 0%, #C084FC 100%)',
        vialGrad: 'linear-gradient(180deg, #67F5FF 0%, #38BDF8 48%, #A855F7 100%)',
        h1: 'rgba(66,232,255,0.24)', h2: 'rgba(66,232,255,0.44)',
        h3: 'linear-gradient(135deg,#38BDF8,#A855F7)', h4: 'linear-gradient(135deg,#42E8FF,#DE85FF)', h5: 'linear-gradient(135deg,#7CF7FF,#F0ABFC)',
        tokK: '#E28AFF', tokS: '#4DF5BC', tokP: '#5EE7FF',
      },
    },
    {
      id: 'velvet-dark', label: '绯樱暮色', sub: 'Rose Velvet', scheme: 'rose-pine', theme: 'dark',
      bg: '#15111D', sb: '#100D17', accent: '#F48FB1',
      tokens: {
        accent: '#F48FB1', accent2: '#C8A6F5', accent3: '#F8C57C',
        headGrad: 'linear-gradient(100deg, #FFF1F6 0%, #F8A5C2 54%, #D4B5FF 100%)',
        barGrad: 'linear-gradient(90deg, #EC6F9F 0%, #C8A6F5 100%)',
        vialGrad: 'linear-gradient(180deg, #FBCFE8 0%, #F472B6 52%, #9333EA 100%)',
        h1: 'rgba(244,143,177,0.26)', h2: 'rgba(244,143,177,0.46)',
        h3: 'linear-gradient(135deg,#EC6F9F,#B794F4)', h4: 'linear-gradient(135deg,#F48FB1,#C8A6F5)', h5: 'linear-gradient(135deg,#FBCFE8,#F8C57C)',
        tokK: '#D4B2FF', tokS: '#F8C57C', tokP: '#F8A1C4',
      },
    },
    {
      id: 'crystal-light', label: '白昼冷晶', sub: 'Crystal', scheme: 'prism-default', theme: 'light',
      bg: '#F4F7FB', sb: '#E8EEF6', accent: '#2563EB',
      tokens: {
        accent: '#2563EB', accent2: '#6D28D9', accent3: '#0284C7',
        headGrad: 'linear-gradient(100deg, #0F172A 0%, #1D4ED8 58%, #6D28D9 100%)',
        barGrad: 'linear-gradient(90deg, #2563EB 0%, #6366F1 100%)',
        vialGrad: 'linear-gradient(180deg, #38BDF8 0%, #2563EB 54%, #4F46E5 100%)',
        h1: 'rgba(37,99,235,0.20)', h2: 'rgba(37,99,235,0.38)',
        h3: 'linear-gradient(135deg,#2563EB,#6366F1)', h4: 'linear-gradient(135deg,#0284C7,#7C3AED)', h5: 'linear-gradient(135deg,#06B6D4,#8B5CF6)',
        tokK: '#7C3AED', tokS: '#059669', tokP: '#2563EB',
      },
    },
    {
      id: 'paper-light', label: '暖白画册', sub: 'Alabaster', scheme: 'warm-carbon', theme: 'light',
      bg: '#F6F4EE', sb: '#EBE6DC', accent: '#C25934',
      tokens: {
        accent: '#C25934', accent2: '#D97706', accent3: '#9A3412',
        headGrad: 'linear-gradient(100deg, #1C1814 0%, #B54D28 58%, #D97706 100%)',
        barGrad: 'linear-gradient(90deg, #C25934 0%, #E09132 100%)',
        vialGrad: 'linear-gradient(180deg, #FBBF24 0%, #D97757 54%, #9A3412 100%)',
        h1: 'rgba(194,89,52,0.20)', h2: 'rgba(194,89,52,0.38)',
        h3: 'linear-gradient(135deg,#C25934,#D97757)', h4: 'linear-gradient(135deg,#D97757,#D97706)', h5: 'linear-gradient(135deg,#EA580C,#F59E0B)',
        tokK: '#B45309', tokS: '#15803D', tokP: '#C25934',
      },
    },
  ];

  return `<!DOCTYPE html>
<html lang="zh-CN" class="dark" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DSH NEXT · DreamSkin Prism v${VERSION}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
    font-family: "Inter", "Segoe UI Variable", "PingFang SC", "Noto Sans SC", "Microsoft YaHei UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    background: #0b0b0e; color: #f2f2f5;
  }

  /* ── Authentic Obsidian Prism Settings Tokens + Unified Stylized Theme Engine (--st-*) ── */
  :root {
    --op-k0: #131418; --op-k1: #090A0D; --op-k2: #22232A; --op-kb: rgba(255,255,255,.065);
    --op-ks2: inset 0 1px 0 rgba(255,255,255,.088), 0 1px 4px rgba(0,0,0,.45);
    --op-kw: inset 0 1px 2px rgba(0,0,0,.46);
    --op-g0: #F2F3F7; --op-g1: #0E0F14; --op-g2: rgba(255,255,255,.68);
    --op-g3: inset 0 1px 0 #FFF, 0 2px 8px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.12);
    --op-menu-bg: rgba(13, 14, 18, 0.94);
    --op-menu-sheen: linear-gradient(rgba(182,206,255,.046) 0%, rgba(255,255,255,.012) 22%, transparent 52%);
    --op-menu-bd: rgba(220,230,255,.105);
    /* Unified art-directed theme tokens (dynamically synced by active palette — ZERO stray clashing hexes!) */
    --st-accent: #6EA8FF; --st-accent-2: #64D2FF; --st-accent-3: #A78BFA;
    --st-heading-grad: linear-gradient(100deg, #F5F8FF 0%, #92C8FF 56%, #C4B5FD 100%);
    --st-bar-grad: linear-gradient(90deg, #3B82F6 0%, #64D2FF 100%);
    --st-vial-grad: linear-gradient(180deg, #7CE2FF 0%, #3B82F6 54%, #4F46E5 100%);
    --st-heat-1: rgba(110,168,255,0.28); --st-heat-2: rgba(110,168,255,0.48);
    --st-heat-3: linear-gradient(135deg,#6EA8FF,#818CF8);
    --st-heat-4: linear-gradient(135deg,#64D2FF,#A78BFA);
    --st-heat-5: linear-gradient(135deg,#8CE8FF,#C4B5FD);
    --st-tok-k: #C4A5FF; --st-tok-s: #6BE5B8; --st-tok-p: #7DC4FF;
    --st-font-ui: "Inter", "Segoe UI Variable", "PingFang SC", "Noto Sans SC", "Microsoft YaHei UI", system-ui, sans-serif;
  }
  body { font-family: var(--st-font-ui); }
  body[data-font-style="editorial"] { --st-font-ui: "Newsreader", "Songti SC", "Noto Serif SC", Georgia, serif; }
  body[data-font-style="mono"] { --st-font-ui: "JetBrains Mono", "Cascadia Code", "PingFang SC", ui-monospace, monospace; }
  html[data-prism-theme="light"] {
    --op-k0: #FFFFFF; --op-k1: rgba(15,23,42,.05); --op-k2: #FFFFFF; --op-kb: rgba(15,23,42,.085);
    --op-ks2: 0 1px 3px rgba(15,23,42,.10), 0 0 0 1px rgba(15,23,42,.05);
    --op-kw: inset 0 1px 2px rgba(15,23,42,.06);
    --op-g0: #0F172A; --op-g1: #F8FAFC; --op-g2: rgba(255,255,255,.18);
    --op-g3: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 8px rgba(15,23,42,.22), 0 0 0 1px rgba(15,23,42,.12);
    --op-menu-bg: rgba(252, 253, 254, 0.96);
    --op-menu-sheen: linear-gradient(rgba(255,255,255,.92) 0%, rgba(255,255,255,.32) 32%, transparent 60%);
    --op-menu-bd: rgba(15, 23, 42, 0.11);
  }

  /* ── Full-Viewport DSH NEXT 2.0.24-next Layout (Supports Zen Focus Mode Ctrl+Shift+Z!) ── */
  #root {
    width: 100vw; height: 100vh;
    display: grid; grid-template-columns: 256px minmax(0, 1fr);
    padding: 0; gap: 0;
    transition: padding 220ms cubic-bezier(.16,1,.3,1), gap 220ms cubic-bezier(.16,1,.3,1), grid-template-columns 260ms cubic-bezier(.22,1,.36,1);
  }
  body[data-zen="1"] #root { grid-template-columns: 0px minmax(0, 1fr); gap: 0; }
  body[data-zen="1"] [data-slot="sidebar"] { padding: 0; border: 0; opacity: 0; pointer-events: none; }
  html[data-prism-skin-mode="wallpaper"][data-prism-layout="islands"] #root,
  html[data-prism-skin-mode="hybrid"][data-prism-layout="islands"][data-agy-prism-wallpaper="ready"] #root {
    padding: 8px; gap: 8px;
  }

  /* ── Left Sidebar (Obsidian Prism Smoked Sidebar) ── */
  [data-slot="sidebar"] {
    display: flex; flex-direction: column; gap: 6px;
    padding: 12px 9px 10px;
    background: var(--dsw-alias-bg-sidebar, #09090b);
    border-right: 1px solid var(--dsw-alias-border-l1, rgba(218,228,255,0.055));
    color: var(--dsw-alias-label-primary, #f2f2f5);
    overflow: hidden; user-select: none;
  }
  .sb-top {
    display: flex; align-items: center; justify-content: space-between;
    height: 32px; padding: 0 6px;
  }
  .sb-brand {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
  }
  .sb-ver {
    font-family: var(--ag-cs-mono-stack, ui-monospace, Consolas, monospace);
    font-size: 10px; opacity: 0.56; padding: 1.5px 6px; border-radius: 999px;
    border: 1px solid var(--op-kb);
  }
  .sb-nav-btn {
    width: 100%; height: 31px; padding: 0 9px;
    border-radius: var(--ag-cs-r-md, 6px); border: 0;
    background: transparent; color: var(--dsw-alias-label-primary, #c4c4ce);
    font-size: 13px; font-weight: 450;
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .sb-nav-btn:hover { background: rgba(128,136,156,0.08); color: var(--dsw-alias-label-primary, #f2f2f5); }
  .sb-nav-btn.is-active { background: rgba(128,136,156,0.10); color: var(--dsw-alias-label-primary, #f2f2f5); font-weight: 500; }
  .sb-nav-icon { width: 15px; height: 15px; display: inline-flex; align-items: center; justify-content: center; opacity: 0.82; flex-shrink: 0; }
  .sb-kbd { margin-left: auto; font-size: 10.5px; opacity: 0.44; font-family: var(--ag-cs-mono-stack, monospace); }

  .sb-sec-lbl {
    font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
    color: var(--dsw-alias-label-secondary, #8a8a98);
    padding: 10px 8px 3px; opacity: 0.76;
  }
  .dsh-session-list {
    position: relative; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; padding: 2px 1px;
  }
  /* 120Hz Restrained Sidebar Active Pill + Subtle Hover Wash (Aligned to Original Obsidian Prism) */
  .sb-hover-pill {
    position: absolute; left: 1px; right: 1px; top: 0; height: 42px;
    border-radius: var(--ag-cs-r-md, 7px); pointer-events: none; z-index: 0;
    background: rgba(255,255,255,0.036);
    opacity: 0;
    transform: translate3d(0, 0, 0);
    transition: transform 170ms cubic-bezier(.2,0,0,1), height 150ms ease, opacity 130ms ease;
    will-change: transform, height, opacity;
  }
  .sb-active-pill {
    position: absolute; left: 1px; right: 1px; top: 0; height: 44px;
    border-radius: var(--ag-cs-r-md, 7px); pointer-events: none; z-index: 1;
    background: rgba(255,255,255,0.068);
    border: 1px solid rgba(255,255,255,0.055);
    transform: translate3d(0, 0, 0);
    transition: transform 220ms cubic-bezier(.22,1.06,.36,1), height 180ms cubic-bezier(.2,0,0,1), opacity 150ms ease;
    will-change: transform, height;
  }
  .sb-active-pill::before {
    content: ""; position: absolute; left: 3px; top: 9px; bottom: 9px; width: 2px; border-radius: 999px;
    background: var(--st-bar-grad);
    opacity: 0.85;
    transition: background 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
  }
  html[data-ag-cs-streaming="1"] .sb-active-pill {
    background-image: var(--ag-cs-run-wash, linear-gradient(90deg, rgba(49,134,255,.12) 0%, rgba(92,198,252,.04) 55%, transparent));
    border-color: rgba(92,198,252,.22);
  }
  html[data-ag-cs-streaming="1"] .sb-active-pill::before {
    background: var(--ag-cs-run-rb, linear-gradient(#FBBC04 0%, #EA4335 16%, #9B72CB 34%, #5CC6FC 58%, #3186FF 100%));
    box-shadow: 0 0 8px rgba(49,134,255,.45);
    opacity: 1;
  }
  .hdr-sim-btn {
    height: 28px; padding: 0 11px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st-accent, #6EA8FF) 36%, var(--op-kb));
    background: color-mix(in srgb, var(--st-accent, #6EA8FF) 10%, var(--op-k0));
    color: var(--st-accent-2, #64D2FF);
    font-family: var(--font-sans); font-size: 12px; font-weight: 600; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    box-shadow: var(--op-ks2);
    transition: transform 130ms cubic-bezier(.34,1.4,.64,1), border-color 140ms ease, background-color 140ms ease, color 140ms ease;
  }
  .hdr-sim-btn svg { display: block; flex-shrink: 0; }
  .hdr-sim-btn:hover { transform: translateY(-1px); border-color: var(--st-accent-2, #64D2FF); }
  .hdr-sim-btn:active { transform: scale(0.95); }
  .hdr-sim-btn[data-running="1"] {
    color: #fca5a5;
    border-color: rgba(248, 113, 113, 0.45);
    background: rgba(239, 68, 68, 0.14);
  }
  html[data-prism-theme="light"] .sb-active-pill {
    background: #FFFFFF;
    border-color: color-mix(in srgb, var(--st-accent) 26%, rgba(15,23,42,0.08));
    box-shadow: 0 2px 8px -2px rgba(15,23,42,.10), 0 0 0 1px rgba(15,23,42,.04);
  }
  [data-row-key^="session:"] {
    position: relative; z-index: 2; padding: 7px 10px 7px 13px; border-radius: var(--ag-cs-r-md, 7px); cursor: pointer;
    display: flex; flex-direction: column; gap: 2px;
    background: transparent !important; box-shadow: none !important;
    color: var(--dsw-alias-label-secondary, #8a8a98);
    transition: color 160ms ease, transform 160ms cubic-bezier(.22,1,.36,1), padding-right 160ms ease;
    transform-origin: center left;
  }
  [data-row-key^="session:"][data-ag-cs-row-running="1"] { padding-right: 34px; }
  [data-row-key^="session:"][aria-selected="true"][data-ag-cs-row-running="1"]::before { display: none !important; }
  [data-row-key^="session:"]::after { display: none !important; }
  [data-icon-slot] { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
  [data-icon-slot] > svg { display: block; }
  [data-row-key^="session:"]:hover { color: var(--dsw-alias-label-primary, #f2f2f5); }
  [data-row-key^="session:"]:active { transform: scale(0.982); }
  [data-row-key^="session:"][aria-selected="true"] {
    color: var(--dsw-alias-label-primary, #f2f2f5);
  }
  .dsh-sess-title { font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: transform 180ms cubic-bezier(.22,1,.36,1); }
  [data-row-key^="session:"][aria-selected="true"] .dsh-sess-title { font-weight: 600; transform: translateX(1.5px); }
  .dsh-sess-sub { font-size: 11px; opacity: 0.62; }
  @keyframes viewSlideIn {
    from { opacity: 0; transform: translate3d(0, 7px, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  .view-anim-enter { animation: viewSlideIn 230ms cubic-bezier(.16,1,.3,1) both; }

  .dsh-app-icon {
    width: 20px; height: 20px; border-radius: 5px; display: block; object-fit: cover; flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.12);
  }
  .dsh-app-icon-lg {
    width: 24px; height: 24px; border-radius: 6px; display: block; object-fit: cover; flex-shrink: 0;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--st-accent) 34%, transparent), 0 0 0 1px rgba(255,255,255,0.16);
  }

  /* ── Whisper-Minimal Sidebar Multi-Source Pill (Zero Clutter! Click to Open Glass Telemetry Popover) ── */
  .sb-quota-pill {
    margin-top: auto; width: 100%; min-height: 38px; padding: 6px 9px 7px;
    border-radius: 9px; border: 1px solid var(--op-kb);
    background: rgba(128,136,156,0.055);
    color: var(--dsw-alias-label-secondary, #a8aab8);
    font-size: 11.5px; font-weight: 500; cursor: pointer;
    display: flex; flex-direction: column; gap: 5px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.055);
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .sb-quota-top { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sb-quota-mini-bar {
    position: relative; width: 100%; height: 3.5px; border-radius: 999px; overflow: hidden;
    background: rgba(148,163,184,0.14); box-shadow: inset 0 1px 1.5px rgba(0,0,0,0.45);
  }
  .sb-quota-mini-fill {
    position: absolute; inset: 0 auto 0 0; border-radius: 999px;
    background: linear-gradient(90deg, #4D6BFE 0%, #5CC6FC 100%);
    box-shadow: 0 0 8px rgba(92,198,252,0.58);
    transition: width 360ms cubic-bezier(.22,1,.36,1);
  }
  .sb-quota-mini-fill::after {
    content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 5px; border-radius: 999px;
    background: #FFFFFF; box-shadow: 0 0 6px #FFFFFF; opacity: 0.88;
  }
  .sb-quota-pill:hover {
    background: rgba(var(--prism-accent-rgb, 102,157,246), 0.12);
    border-color: rgba(var(--prism-accent-rgb, 102,157,246), 0.34);
    color: var(--dsw-alias-label-primary, #f2f2f5);
  }
  .sb-quota-l { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .sb-dots { display: inline-flex; align-items: center; gap: 3px; }
  .sb-dot { width: 6px; height: 6px; border-radius: 999px; box-shadow: 0 0 6px currentColor; }
  .sb-quota-r { font-family: var(--ag-cs-mono-stack, monospace); font-size: 10.8px; font-weight: 600; color: var(--st-accent); }

  /* ── Composer Inline Telemetry & Living Progress Bar (1:1 Inspired by Obsidian Prism optics.webp) ── */
  .comp-tel-pill {
    height: 26px; padding: 0 9px; border-radius: 999px;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.06);
    color: var(--dsw-alias-label-secondary, #a8aab8);
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 11px; font-variant-numeric: tabular-nums;
    display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .comp-tel-pill:hover, .comp-tel-pill[aria-expanded="true"] {
    background: rgba(var(--prism-accent-rgb, 102,157,246), 0.14);
    border-color: rgba(var(--prism-accent-rgb, 102,157,246), 0.42);
    color: var(--dsw-alias-label-primary, #f2f2f5);
  }
  .comp-tel-sep { opacity: 0.38; }
  .comp-ctx-track {
    width: 44px; height: 5px; border-radius: 999px;
    background: var(--op-k1); box-shadow: var(--op-kw); overflow: hidden;
    position: relative; display: inline-block;
  }
  .comp-ctx-fill {
    position: absolute; inset: 0 auto 0 0; border-radius: 999px;
    background: var(--st-bar-grad);
    box-shadow: 0 0 8px color-mix(in srgb, var(--st-accent-2) 55%, transparent);
    transition: width 320ms cubic-bezier(.22,1,.36,1);
  }
  .comp-ctx-pct { font-weight: 600; color: var(--dsw-alias-label-primary, #f2f2f5); }

  /* ── Floating Smoked-Glass Telemetry Vial & Multi-Source Quota Popover (1:1 optics.webp) ── */
  #ds-telemetry-pop {
    position: fixed; bottom: 118px; right: max(28px, calc(50vw - 498px)); z-index: 2147483644;
    width: 472px; max-width: calc(100vw - 24px); padding: 14px; border-radius: 15px;
    background-color: var(--op-menu-bg); background-image: var(--op-menu-sheen);
    backdrop-filter: blur(22px) saturate(155%); -webkit-backdrop-filter: blur(22px) saturate(155%);
    border: 1px solid var(--op-menu-bd);
    box-shadow: inset 0 1px 0 rgba(235,243,255,0.14), 0 26px 64px -16px rgba(0,0,0,0.78);
    color: var(--dsw-alias-label-primary, #f2f2f5);
    display: none; gap: 14px; align-items: stretch;
    animation: opPopIn 170ms cubic-bezier(.16,1,.3,1);
  }
  #ds-telemetry-pop.open { display: flex; }
  html[data-prism-theme="light"] #ds-telemetry-pop {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.96), 0 24px 56px -14px rgba(15,23,42,0.22);
  }
  .vial-col {
    width: 78px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 7px;
    padding-right: 12px; border-right: 1px solid var(--op-kb);
  }
  .vial-cap { font-family: var(--ag-cs-mono-stack, monospace); font-size: 10.5px; color: var(--dsw-alias-label-secondary, #8a8a98); }
  .vial-pct { font-family: var(--ag-cs-mono-stack, monospace); font-size: 13px; font-weight: 700; color: var(--st-accent-2); }
  .vial-glass {
    position: relative; width: 32px; height: 154px; border-radius: 999px;
    background: linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(12,16,28,0.65) 45%, rgba(255,255,255,0.05) 100%);
    border: 1.5px solid color-mix(in srgb, var(--st-accent) 38%, rgba(255,255,255,0.16));
    box-shadow: inset 0 0 14px rgba(0,0,0,0.55), 0 0 18px -4px color-mix(in srgb, var(--st-accent) 44%, transparent);
    overflow: hidden;
  }
  html[data-prism-theme="light"] .vial-glass {
    background: linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(226,236,250,0.85) 55%, rgba(255,255,255,0.85) 100%);
    border-color: color-mix(in srgb, var(--st-accent) 34%, transparent);
    box-shadow: inset 0 0 10px rgba(30,58,138,0.10), 0 0 14px -4px color-mix(in srgb, var(--st-accent) 26%, transparent);
  }
  .vial-fill {
    position: absolute; left: 2px; right: 2px; bottom: 2px; border-radius: 0 0 999px 999px;
    background: var(--st-vial-grad);
    box-shadow: 0 -2px 12px color-mix(in srgb, var(--st-accent-2) 72%, transparent);
    transition: height 420ms cubic-bezier(.22,1,.36,1);
  }
  .vial-fill::before {
    content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px;
    background: radial-gradient(50% 100% at 50% 50%, rgba(255,255,255,0.92), rgba(124,226,255,0.35));
    border-radius: 999px;
  }
  .vial-ticks { position: absolute; inset: 12px 3px 12px auto; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
  .vial-ticks span { width: 6px; height: 1px; background: rgba(255,255,255,0.36); }
  .tel-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
  .tel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tel-model { font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
  .tel-ver-tag {
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 9.5px; font-weight: 650;
    padding: 1.5px 6px; border-radius: 999px; color: #34d399;
    background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.30);
  }
  .tel-slices {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
    padding: 7px 8px; border-radius: 9px; border: 1px solid var(--op-kb); background: rgba(128,136,156,0.045);
  }
  .tel-sl-k { font-size: 10px; color: var(--dsw-alias-label-secondary, #8a8a98); }
  .tel-sl-v { font-family: var(--ag-cs-mono-stack, monospace); font-size: 11.5px; font-weight: 600; }
  .tel-sec-h { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary, #8a8a98); }
  .mq-mini-btn {
    height: 21px; padding: 0 7px; border-radius: 6px; border: 1px solid var(--op-kb);
    background: rgba(128,136,156,0.07); color: var(--dsw-alias-label-secondary, #8a8a98);
    font-size: 10.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  }
  .mq-mini-btn:hover { background: rgba(128,136,156,0.16); color: var(--dsw-alias-label-primary, #f2f2f5); }
  .mq-list { display: flex; flex-direction: column; gap: 5px; }
  .mq-row {
    width: 100%; border: 1px solid transparent; background: rgba(128,136,156,0.04);
    border-radius: 8px; padding: 6px 8px; cursor: pointer; color: inherit; text-align: left;
    display: flex; flex-direction: column; gap: 4px; transition: background-color 120ms ease, border-color 120ms ease;
  }
  .mq-row:hover { background: rgba(128,136,156,0.10); border-color: var(--op-kb); }
  .mq-row[data-selected="1"] {
    background: rgba(var(--prism-accent-rgb, 102,157,246), 0.12);
    border-color: rgba(var(--prism-accent-rgb, 102,157,246), 0.36);
  }
  .mq-row-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11.5px; }
  .mq-src { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; min-width: 0; }
  .mq-dot { width: 7px; height: 7px; border-radius: 999px; flex-shrink: 0; box-shadow: 0 0 7px currentColor; }
  .mq-val { font-family: var(--ag-cs-mono-stack, monospace); font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
  .mq-eta { font-size: 10px; font-weight: 400; color: var(--dsw-alias-label-secondary, #8a8a98); }
  /* Upgraded Crystal-Luminous Quota Remaining Bars (Recessed Trough + Quarter Ticks + Specular Beam + Glowing Tip) */
  .mq-bar {
    position: relative; height: 7px; border-radius: 999px;
    background: linear-gradient(180deg, rgba(8,10,16,0.68) 0%, rgba(22,26,38,0.52) 100%);
    box-shadow: inset 0 1px 2.5px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.06);
    overflow: hidden;
  }
  html[data-prism-theme="light"] .mq-bar {
    background: linear-gradient(180deg, rgba(15,23,42,0.11) 0%, rgba(15,23,42,0.06) 100%);
    box-shadow: inset 0 1px 2px rgba(15,23,42,0.12), inset 0 0 0 1px rgba(15,23,42,0.06);
  }
  .mq-bar::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 3;
    background: repeating-linear-gradient(90deg, transparent 0, transparent calc(25% - 1px), rgba(255,255,255,0.14) calc(25% - 1px), rgba(255,255,255,0.14) 25%);
  }
  .mq-fill {
    position: absolute; inset: 0 auto 0 0; border-radius: 999px; z-index: 2;
    box-shadow: 0 0 11px -1px var(--q-glow, rgba(92,198,252,0.55)), inset 0 1px 0 rgba(255,255,255,0.42);
    transition: width 360ms cubic-bezier(.22,1,.36,1), filter 180ms ease;
    overflow: hidden;
  }
  .mq-fill::before {
    content: ""; position: absolute; inset: 0 0 48% 0; border-radius: 999px 999px 0 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0) 100%);
    pointer-events: none;
  }
  .mq-fill::after {
    content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 7px; border-radius: 999px;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.92) 100%);
    box-shadow: 0 0 8px rgba(255,255,255,0.85);
    pointer-events: none;
  }
  .mq-row:hover .mq-fill { filter: brightness(1.12) saturate(1.12); }
  .mq-detail { display: flex; justify-content: space-between; font-size: 10px; color: var(--dsw-alias-label-secondary, #8a8a98); font-family: var(--ag-cs-mono-stack, monospace); }

  /* ── Authentic Model Selector Popup with Native AntigravityCodexEffortSlider Inside ── */
  .comp-model-btn { gap: 5px; padding: 0 9px; }
  .comp-model-effort {
    font-size: 11px; font-weight: 600; color: #a855f7;
    transition: color 150ms ease;
  }
  .comp-model-chev { opacity: 0.65; flex-shrink: 0; transition: transform 150ms ease; }
  .comp-model-btn[aria-expanded="true"] .comp-model-chev { transform: rotate(180deg); }
  #ds-model-pop {
    position: fixed; left: 50%; bottom: 132px;
    z-index: 2147483645; width: 312px; max-width: calc(100vw - 24px);
    padding: 8px; border-radius: 14px;
    background-color: var(--op-menu-bg); background-image: var(--op-menu-sheen);
    backdrop-filter: blur(22px) saturate(160%); -webkit-backdrop-filter: blur(22px) saturate(160%);
    border: 1px solid var(--op-menu-bd);
    box-shadow: inset 0 1px 0 rgba(235,243,255,0.14), 0 24px 60px -14px rgba(0,0,0,0.78);
    color: var(--dsw-alias-label-primary, #f2f2f5);
    display: none; flex-direction: column; gap: 4px;
    animation: opPopIn 150ms cubic-bezier(.16,1,.3,1);
    user-select: none;
  }
  #ds-model-pop.open { display: flex; }
  .mdl-pop-head {
    font-size: 11.5px; font-weight: 500; color: var(--dsw-alias-label-secondary, #8a8a98);
    padding: 4px 8px 3px;
  }
  .mdl-list { display: flex; flex-direction: column; gap: 2px; }
  .mdl-row {
    width: 100%; border: 1px solid transparent; border-radius: 9px;
    padding: 7px 9px; background: transparent; color: inherit;
    font-family: inherit; font-size: 13px; font-weight: 500;
    display: flex; align-items: center; gap: 8px; cursor: pointer; text-align: left;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .mdl-row:hover { background: rgba(255,255,255,0.052); }
  .mdl-row[data-active="1"] {
    background: rgba(255,255,255,0.072);
    border-color: rgba(255,255,255,0.12);
    font-weight: 600;
  }
  html[data-prism-theme="light"] .mdl-row:hover { background: rgba(15,23,42,0.048); }
  html[data-prism-theme="light"] .mdl-row[data-active="1"] {
    background: rgba(15,23,42,0.078);
    border-color: rgba(15,23,42,0.12);
  }
  .mdl-row-ico { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .mdl-row-name { flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mdl-row-eff { font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .mdl-row-tag {
    margin-left: auto; font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12); color: var(--dsw-alias-label-secondary, #9ea3b4);
    flex-shrink: 0;
  }
  html[data-prism-theme="light"] .mdl-row-tag { border-color: rgba(15,23,42,0.14); }
  .mdl-divider { height: 1px; background: var(--op-kb); margin: 4px 2px; }
  .mdl-usage-row {
    width: 100%; border: 0; border-radius: 8px; padding: 7px 9px;
    background: transparent; color: var(--dsw-alias-label-secondary, #c4c4ce);
    font-family: inherit; font-size: 12.5px; font-weight: 500;
    display: flex; align-items: center; justify-content: space-between; cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .mdl-usage-row:hover { background: rgba(255,255,255,0.055); color: var(--dsw-alias-label-primary, #fff); }
  html[data-prism-theme="light"] .mdl-usage-row:hover { background: rgba(15,23,42,0.05); color: #0f172a; }
  .mdl-usage-l { display: inline-flex; align-items: center; gap: 7px; }

  /* ── GitHub-Inspired Global Command Palette (Ctrl+K) ── */
  #ds-cmd-backdrop {
    position: fixed; inset: 0; z-index: 2147483646;
    background: rgba(5, 6, 10, 0.56); backdrop-filter: blur(6px);
    display: none; align-items: flex-start; justify-content: center; padding-top: 13vh;
  }
  #ds-cmd-backdrop.open { display: flex; }
  .cmd-box {
    width: 480px; max-width: calc(100vw - 24px); border-radius: 14px; overflow: hidden;
    background-color: var(--op-menu-bg); background-image: var(--op-menu-sheen);
    border: 1px solid var(--op-menu-bd);
    box-shadow: inset 0 1px 0 rgba(235,243,255,0.16), 0 28px 72px -12px rgba(0,0,0,0.82);
    color: var(--dsw-alias-label-primary, #f2f2f5);
    animation: opPopIn 140ms cubic-bezier(.16,1,.3,1);
  }
  .cmd-input-row { display: flex; align-items: center; gap: 9px; padding: 11px 14px; border-bottom: 1px solid var(--op-kb); }
  #ds-cmd-input {
    flex: 1; border: 0; outline: 0; background: transparent; color: inherit;
    font-family: inherit; font-size: 13.5px;
  }
  .cmd-kbd {
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 10px; padding: 2px 6px;
    border-radius: 5px; border: 1px solid var(--op-kb); color: var(--dsw-alias-label-secondary, #8a8a98);
  }
  .cmd-list { max-height: 310px; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .cmd-item {
    width: 100%; border: 0; border-radius: 8px; padding: 8px 10px; background: transparent; color: inherit;
    display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; text-align: left;
    font-size: 12.5px; transition: background-color 100ms ease;
  }
  .cmd-item:hover, .cmd-item[data-active="1"] {
    background: rgba(var(--prism-accent-rgb, 102,157,246), 0.16);
    color: var(--dsw-alias-label-primary, #fff);
  }
  .cmd-item-sub { font-size: 11px; color: var(--dsw-alias-label-secondary, #8a8a98); }

  /* ── Conversation Turn Minimap Rail (Right edge subtle glowing ticks) ── */
  #conv-turn-rail {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%); z-index: 5;
    display: none; flex-direction: column; gap: 7px; padding: 6px 4px;
  }
  body[data-view="conv"] #conv-turn-rail { display: flex; }
  .turn-dot {
    width: 4px; height: 14px; border-radius: 999px; border: 0; padding: 0; cursor: pointer;
    background: rgba(148,163,184,0.34); transition: all 140ms ease;
  }
  .turn-dot:hover, .turn-dot[data-active="1"] {
    background: var(--st-accent-2); height: 22px; box-shadow: 0 0 9px color-mix(in srgb, var(--st-accent-2) 70%, transparent);
  }
  .hdr-cmd-btn {
    height: 26px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--op-kb);
    background: var(--op-k1); color: var(--dsw-alias-label-secondary, #8a8a98);
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 11px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 4px;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .hdr-cmd-btn:hover { color: var(--dsw-alias-label-primary, #f2f2f5); border-color: rgba(var(--prism-accent-rgb, 102,157,246), 0.42); }

  .sb-foot-btn {
    margin-top: 2px; height: 32px; padding: 0 9px; border-radius: var(--ag-cs-r-md, 6px); border: 0;
    background: transparent; color: var(--dsw-alias-label-secondary, #8a8a98);
    font-size: 12.5px; font-weight: 500;
    display: flex; align-items: center; gap: 8px; cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .sb-foot-btn:hover { background: rgba(128,136,156,0.08); color: var(--dsw-alias-label-primary, #f2f2f5); }

  /* ── Main Stage (Hosts FULL WebGL2 Horizon Glow + Interactive ASCII Character Matrix!) ── */
  [data-slot="main"] {
    position: relative; isolation: isolate;
    display: flex; flex-direction: column; min-width: 0; min-height: 0;
    background: var(--dsw-alias-bg-layer-1, #0e0e11);
    overflow: hidden;
  }
  html[data-prism-skin-mode="wallpaper"][data-prism-layout="islands"] [data-slot="main"],
  html[data-prism-skin-mode="hybrid"][data-prism-layout="islands"][data-agy-prism-wallpaper="ready"] [data-slot="main"] {
    border-radius: 12px;
    border: 1px solid var(--op-kb);
  }

  [data-slot="conversation.header"] {
    position: relative; z-index: 8;
    height: 44px; padding: 0 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    border-bottom: 1px solid var(--op-kb);
    flex-shrink: 0;
  }
  .hdr-left { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; }
  .hdr-crumb-dim { color: var(--dsw-alias-label-secondary, #8a8a98); }
  .hdr-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hdr-right { display: inline-flex; align-items: center; gap: 6px; }

  .hdr-seg-view {
    display: inline-flex; align-items: center; padding: 2px; gap: 2px; border-radius: 8px;
    background: var(--op-k1); border: 1px solid var(--op-kb); box-shadow: var(--op-kw);
  }
  .hdr-seg-btn {
    height: 24px; padding: 0 9px; border: 0; border-radius: 6px;
    background: transparent; color: var(--dsw-alias-label-secondary, #8a8a98);
    font-size: 11.5px; font-weight: 500; cursor: pointer;
    transition: background-color 130ms ease, color 130ms ease;
  }
  .hdr-seg-btn[aria-selected="true"] {
    background: var(--op-k2); color: var(--dsw-alias-label-primary, #f2f2f5); box-shadow: var(--op-ks2); font-weight: 600;
  }

  #ds-studio-trigger {
    height: 28px; padding: 0 11px; border-radius: 999px;
    border: 1px solid var(--op-kb);
    background: var(--op-k0);
    color: var(--dsw-alias-label-primary, #f2f2f5);
    font-size: 12px; font-weight: 500; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    box-shadow: var(--op-ks2);
    transition: border-color 140ms ease, background-color 140ms ease;
  }
  #ds-studio-trigger:hover { border-color: rgba(var(--prism-accent-rgb, 102,157,246), 0.45); }
  .trig-dot {
    width: 6.5px; height: 6.5px; border-radius: 999px;
    background: var(--st-accent);
    box-shadow: 0 0 7px var(--st-accent);
  }

  /* ── Dual Content View: Studio Home (like palettes.webp / hero-dark.webp) & Conversation ── */
  [data-slot="conversation.view"] {
    position: relative; z-index: 2;
    flex: 1; min-height: 0; display: flex; flex-direction: column;
  }
  [data-conversation-scroll] {
    flex: 1; overflow-y: auto;
    padding: 24px 24px 12px;
    display: flex; flex-direction: column;
  }
  /* Studio Home: Authentic Obsidian Prism Dashboard (ported 1:1 from palettes.webp & style.css lines 345-423) */
  #view-home {
    flex: 1; display: none; flex-direction: column; align-items: center; justify-content: center;
    gap: 13px; width: 100%; max-width: 720px; margin: 0 auto; padding-bottom: 4px;
  }
  body[data-view="home"] #view-home { display: flex; }
  body[data-view="home"] #view-conv { display: none; }
  .home-greet-row {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .home-greet-l { display: inline-flex; align-items: center; gap: 10px; }
  .home-h1 {
    margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.022em;
    background: var(--st-heading-grad); -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  body[data-text-style="minimal"] .home-h1 { background: none; color: var(--dsw-alias-label-primary, #f2f2f5); }
  body[data-text-style="crisp"] .home-h1 { background: none; color: var(--st-accent); }
  .home-ready-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 10.5px; font-weight: 600;
    color: var(--st-accent);
    padding: 3px 9px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st-accent) 34%, transparent);
    background: color-mix(in srgb, var(--st-accent) 11%, transparent);
  }
  .home-ready-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--st-accent-2); box-shadow: 0 0 7px var(--st-accent-2); }

  .ag-cs-home-panel {
    position: relative; isolation: isolate; width: 100%;
    display: flex; flex-direction: column; gap: 12px;
    padding: 14px 15px; border-radius: 13px;
    border: 1px solid var(--op-menu-bd);
    background-color: var(--op-menu-bg);
    background-image: radial-gradient(108% 58px at 50% 0%, color-mix(in srgb, var(--st-accent) 11%, transparent) 0%, transparent 74%), var(--op-menu-sheen);
    box-shadow: inset 0 1px 0 rgba(235,243,255,0.12), 0 20px 44px -16px rgba(0,0,0,0.68);
  }
  html[data-prism-theme="light"] .ag-cs-home-panel {
    background-color: rgba(255,255,255,0.92);
    background-image: radial-gradient(108% 58px at 50% 0%, color-mix(in srgb, var(--st-accent) 9%, transparent) 0%, transparent 74%), var(--op-menu-sheen);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 14px 36px -12px rgba(30,58,138,0.14), 0 0 0 1px rgba(15,23,42,0.06);
  }
  .ag-cs-home-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .ag-cs-home-tabs, .ag-cs-home-ranges {
    display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px;
    background: var(--op-k1); border: 1px solid var(--op-kb); box-shadow: var(--op-kw);
  }
  .ag-cs-home-tab, .ag-cs-home-range {
    height: 23px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent;
    color: var(--dsw-alias-label-secondary, #8a8a98); font-size: 11.5px; font-weight: 500; cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .ag-cs-home-tab[data-active="1"], .ag-cs-home-range[data-active="1"] {
    background: var(--op-k2); color: var(--dsw-alias-label-primary, #f2f2f5); box-shadow: var(--op-ks2); font-weight: 600;
  }
  .ag-cs-home-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .ag-cs-home-stat {
    padding: 7px 9px; border-radius: 8px; border: 1px solid var(--op-kb);
    background: rgba(128,136,156,0.045); display: flex; flex-direction: column; gap: 2px;
  }
  .ag-cs-home-stat-label { font-size: 10.5px; color: var(--dsw-alias-label-secondary, #8a8a98); }
  .ag-cs-home-stat-value {
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 14px; font-weight: 650;
    color: var(--dsw-alias-label-primary, #f2f2f5); font-variant-numeric: tabular-nums;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ag-cs-home-heat-wrap { position: relative; }
  .ag-cs-home-heat {
    display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 1fr); grid-auto-columns: 1fr;
    gap: 3.5px; position: relative;
  }
  .ag-cs-home-heat-cell {
    aspect-ratio: 1; border-radius: 3px;
    background: rgba(148,163,184,0.10);
    transition: transform 110ms ease, filter 110ms ease;
  }
  .ag-cs-home-heat-cell:hover { transform: scale(1.25); filter: brightness(1.18); z-index: 2; }
  .ag-cs-home-heat-cell[data-level="1"] { background: var(--st-heat-1); }
  .ag-cs-home-heat-cell[data-level="2"] { background: var(--st-heat-2); }
  .ag-cs-home-heat-cell[data-level="3"] { background: var(--st-heat-3); }
  .ag-cs-home-heat-cell[data-level="4"] { background: var(--st-heat-4); }
  .ag-cs-home-heat-cell[data-level="5"] { background: var(--st-heat-5); box-shadow: 0 0 7px color-mix(in srgb, var(--st-accent-2) 48%, transparent); }
  html[data-prism-theme="light"] .ag-cs-home-heat-cell { background: rgba(15,23,42,0.06); }
  .ag-cs-home-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    font-size: 11.5px; color: var(--dsw-alias-label-secondary, #8a8a98);
  }
  .ag-cs-home-fun {
    display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--st-accent) 28%, var(--op-kb));
    background: color-mix(in srgb, var(--st-accent) 8%, transparent);
    color: var(--dsw-alias-label-primary, #e4e6f0); font-size: 11.2px; cursor: pointer;
    transition: transform 140ms cubic-bezier(.34,1.4,.64,1), border-color 140ms ease, background-color 140ms ease;
  }
  .ag-cs-home-fun:hover {
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    background: color-mix(in srgb, var(--st-accent) 15%, transparent);
  }
  .ag-cs-home-fun:active { transform: scale(0.96); }
  .ag-cs-home-fun strong { color: var(--st-accent); font-weight: 650; }
  .ag-cs-home-fun-hint { font-size: 10px; opacity: 0.56; }
  .ag-cs-home-tip { font-family: var(--ag-cs-mono-stack, monospace); font-size: 10.5px; color: var(--st-accent-2); }
  .studio-play-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--op-kb);
  }
  .studio-mood-pill {
    display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 999px;
    border: 1px solid var(--op-kb); background: var(--op-k1); color: var(--dsw-alias-label-secondary, #b2b6c8);
    font-size: 11px; cursor: pointer; transition: border-color 130ms ease, color 130ms ease, background-color 130ms ease;
  }
  .studio-mood-pill:hover {
    border-color: color-mix(in srgb, var(--st-accent-2) 52%, transparent);
    color: var(--dsw-alias-label-primary, #fff);
  }
  .studio-mood-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--st-accent-2); box-shadow: 0 0 6px var(--st-accent-2); }
  .studio-hab-group { display: inline-flex; align-items: center; gap: 4px; }
  .studio-hab-btn {
    height: 23px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--op-kb);
    background: transparent; color: var(--dsw-alias-label-secondary, #9ea3b4);
    font-size: 10.8px; cursor: pointer; transition: all 130ms ease;
  }
  .studio-hab-btn:hover { color: var(--dsw-alias-label-primary, #fff); background: rgba(128,136,156,0.10); }
  .studio-hab-btn[data-active="1"] {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--op-k2));
    border-color: color-mix(in srgb, var(--st-accent) 52%, transparent);
    color: var(--dsw-alias-label-primary, #fff); font-weight: 600;
  }

  /* Multi-Client Switcher Dropdown (Real Extracted Icons for All Adapted Apps!) */
  .sb-brand-btn {
    display: inline-flex; align-items: center; gap: 8px; padding: 3px 6px 3px 3px; border-radius: 8px;
    border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer;
    font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
    transition: background-color 130ms ease, border-color 130ms ease;
  }
  .sb-brand-btn:hover { background: rgba(128,136,156,0.10); border-color: var(--op-kb); }
  .sb-brand-chev { font-size: 10px; opacity: 0.55; margin-left: 1px; }
  #ds-client-pop {
    position: fixed; top: 48px; left: 10px; z-index: 2147483645;
    width: 286px; max-height: 440px; overflow-y: auto; padding: 8px; border-radius: 13px;
    background-color: var(--op-menu-bg); background-image: var(--op-menu-sheen);
    backdrop-filter: blur(22px) saturate(155%); -webkit-backdrop-filter: blur(22px) saturate(155%);
    border: 1px solid var(--op-menu-bd);
    box-shadow: inset 0 1px 0 rgba(235,243,255,0.14), 0 22px 54px -14px rgba(0,0,0,0.78);
    color: var(--dsw-alias-label-primary, #f2f2f5);
    display: none; flex-direction: column; gap: 3px;
    animation: opPopIn 150ms cubic-bezier(.16,1,.3,1);
  }
  #ds-client-pop.open { display: flex; }
  .cl-pop-head { font-size: 10.5px; font-weight: 600; color: var(--dsw-alias-label-secondary, #8a8a98); padding: 4px 8px 6px; display: flex; justify-content: space-between; }
  .cl-item {
    width: 100%; border: 1px solid transparent; border-radius: 9px; padding: 6px 8px;
    background: transparent; color: inherit; cursor: pointer; text-align: left;
    display: flex; align-items: center; gap: 9px; transition: all 120ms ease;
  }
  .cl-item:hover { background: rgba(128,136,156,0.10); }
  .cl-item[data-active="1"] {
    background: color-mix(in srgb, var(--st-accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--st-accent) 44%, transparent);
  }
  .cl-item-info { flex: 1; min-width: 0; }
  .cl-item-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cl-item-sub { font-size: 10px; opacity: 0.62; font-family: var(--ag-cs-mono-stack, monospace); }
  .cl-badge { font-size: 9.5px; padding: 1.5px 6px; border-radius: 999px; border: 1px solid var(--op-kb); opacity: 0.85; white-space: nowrap; }
  .comp-pomo-pill {
    height: 26px; padding: 0 9px; border-radius: 999px;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.06);
    color: var(--dsw-alias-label-secondary, #a8aab8);
    font-family: var(--ag-cs-mono-stack, monospace); font-size: 11px; font-variant-numeric: tabular-nums;
    display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
    transition: all 140ms ease;
  }
  .comp-pomo-pill:hover, .comp-pomo-pill[data-running="1"] {
    border-color: color-mix(in srgb, var(--st-accent) 48%, transparent);
    background: color-mix(in srgb, var(--st-accent) 14%, transparent);
    color: var(--dsw-alias-label-primary, #fff);
  }

  /* Studio Models & Quotas Panes */
  .studio-models-list { display: flex; flex-direction: column; gap: 7px; }
  .sm-row { display: flex; align-items: center; gap: 9px; font-size: 12px; }
  .sm-name { width: 126px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sm-bar { flex: 1; height: 7px; border-radius: 999px; background: var(--op-k1); box-shadow: var(--op-kw); overflow: hidden; }
  .sm-fill { height: 100%; border-radius: 999px; }
  .sm-pct { width: 42px; text-align: right; font-family: var(--ag-cs-mono-stack, monospace); font-size: 11px; font-weight: 600; }
  .studio-quota-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .sq-card {
    padding: 9px 10px; border-radius: 9px; border: 1px solid var(--op-kb);
    background: rgba(128,136,156,0.04); display: flex; flex-direction: column; gap: 6px;
  }
  .sq-head { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 600; }
  .sq-pace { font-size: 9.5px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--op-kb); }
  .sq-win { display: flex; flex-direction: column; gap: 3px; }
  .sq-win-r { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #8a8a98); font-family: var(--ag-cs-mono-stack, monospace); }

  .home-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; }
  .home-chip {
    height: 28px; padding: 0 12px; border-radius: 999px;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.08);
    color: var(--dsw-alias-label-secondary, #c4c4ce); font-size: 11.8px; font-weight: 500; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .home-chip:hover { background: rgba(var(--prism-accent-rgb, 102,157,246), 0.16); color: var(--dsw-alias-label-primary, #fff); border-color: rgba(var(--prism-accent-rgb, 102,157,246), 0.45); }

  /* Conversation Flow (Authentic Smoked Obsidian Editorial Layout) */
  [data-slot="conversation.chat.flow"] {
    width: 100%; max-width: 740px; margin: 0 auto;
    display: flex; flex-direction: column; gap: 18px;
  }
  [data-chat-flow-kind="user"] { display: flex; justify-content: flex-end; }
  [data-chat-flow-kind="user"] > div {
    max-width: 78%; padding: 10px 15px; border-radius: 16px;
    font-size: 13.5px; line-height: 1.65;
    background-color: var(--op-k0);
    background-image: linear-gradient(rgba(255,255,255,.022) 0%, transparent 55%);
    border: 1px solid var(--op-kb);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.058), 0 6px 20px -10px rgba(0,0,0,.44);
  }
  [data-chat-group-part="response"] {
    display: flex; flex-direction: column; gap: 12px;
    font-size: 14px; line-height: 1.72;
    color: var(--dsw-alias-label-primary, #f2f2f5);
  }
  .thought-trigger {
    display: inline-flex; align-items: center; gap: 7px; width: fit-content;
    font-size: 12.5px; color: var(--dsw-alias-label-secondary, #8a8a98);
    padding: 2px 6px; border-radius: 5px;
  }
  .resp-p { margin: 0; font-size: 14px; line-height: 1.72; }
  .md-code-block {
    border-radius: 11px; overflow: hidden;
    border: 1px solid var(--op-kb);
    background: rgba(11, 12, 16, 0.84);
  }
  html[data-prism-theme="light"] .md-code-block {
    background: rgba(255, 255, 255, 0.88);
    border-color: rgba(15, 23, 42, 0.10);
  }
  .code-hdr {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 12px; font-size: 11.5px;
    color: var(--dsw-alias-label-secondary, #8a8a98);
    border-bottom: 1px solid var(--op-kb);
    font-family: var(--ag-cs-mono-stack, monospace);
  }
  .code-copy-btn {
    height: 24px; padding: 0 8px; border-radius: 6px;
    border: 1px solid transparent; background: transparent;
    color: inherit; font-size: 11.5px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .code-copy-btn:hover { background: rgba(128,136,156,0.12); color: var(--dsw-alias-label-primary, #fff); }
  .md-code-block pre {
    margin: 0; padding: 12px 14px; overflow-x: auto;
    font-size: 12.2px; line-height: 1.62;
  }
  .tok-k { color: var(--st-tok-k); font-weight: 500; } .tok-s { color: var(--st-tok-s); } .tok-p { color: var(--st-tok-p); } .tok-c { opacity: 0.56; font-style: italic; }
  .turn-dot:hover, .turn-dot[data-active="1"] {
    background: var(--st-accent); height: 22px; box-shadow: 0 0 9px color-mix(in srgb, var(--st-accent) 72%, transparent);
  }

  /* ── Composer Dock (Authentic Obsidian Prism surface-composer-card + circular ↑ send button) ── */
  [data-slot="conversation.composer"] {
    position: relative; z-index: 6;
    width: 100%; max-width: 824px; margin: 0 auto;
    padding: 58px 20px 20px;
    flex-shrink: 0;
  }
  [data-composer-card] {
    position: relative; overflow: visible !important;
    padding: 12px 12px 9px;
    border-radius: var(--ag-cs-r-lg, 12px);
    background-color: var(--dsw-alias-bg-layer-2, rgba(20, 21, 26, 0.96));
    background-image: var(--ag-cs-composer-sheen, none);
    border: 1px solid var(--op-kb);
    display: flex; flex-direction: column; gap: 8px;
  }
  [data-composer-input] {
    width: 100%; min-height: 42px; max-height: 120px; resize: none;
    background: transparent; border: none; outline: none; padding: 2px 4px;
    color: var(--dsw-alias-label-primary, #f2f2f5);
    font-family: inherit; font-size: 14px; line-height: 1.55;
  }
  [data-composer-input]::placeholder { color: var(--dsw-alias-label-secondary, #626270); opacity: 0.85; }
  .comp-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; width: 100%; }
  .comp-tools { display: flex; align-items: center; gap: 5px; min-width: 0; flex-shrink: 1; }
  .comp-icon-btn {
    width: 28px; height: 28px; border-radius: 999px; flex-shrink: 0;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.08);
    color: var(--dsw-alias-label-secondary, #c4c4ce);
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
    transition: background-color 130ms ease, color 130ms ease;
  }
  .comp-icon-btn:hover { background: rgba(128,136,156,0.16); color: var(--dsw-alias-label-primary, #fff); }
  .comp-pill {
    height: 28px; padding: 0 8px; border-radius: 999px;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.08);
    color: var(--dsw-alias-label-secondary, #c4c4ce);
    font-size: 11.5px; font-weight: 500; white-space: nowrap; flex-shrink: 0;
    display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
    transition: background-color 130ms ease, color 130ms ease;
  }
  .comp-pill:hover { background: rgba(128,136,156,0.16); color: var(--dsw-alias-label-primary, #fff); }
  .comp-right { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .comp-meta { font-family: var(--ag-cs-mono-stack, monospace); font-size: 10.8px; color: var(--dsw-alias-label-secondary, #8a8a98); white-space: nowrap; flex-shrink: 0; }
  /* Authentic Obsidian Prism specular circular ↑ send button */
  .comp-send {
    width: 30px; height: 30px; border-radius: 999px; border: 0; padding: 0;
    background-color: var(--op-g0);
    background-image: linear-gradient(var(--op-g2) 0%, rgba(255,255,255,0) 58%);
    box-shadow: var(--op-g3);
    color: var(--op-g1);
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    transition: transform 140ms cubic-bezier(.34,1.4,.64,1);
  }
  .comp-send:hover { transform: translateY(-1px); }
  .comp-send:active { transform: scale(0.92); }

  /* ── Authentic Obsidian Prism Control Center Drawer (1:1 ported from style.css lines 588-662) ── */
  #ds-drawer {
    position: fixed; top: 52px; right: 16px; z-index: 2147483645;
    width: 468px; max-width: calc(100vw - 24px); max-height: min(640px, calc(100vh - 245px));
    overflow-y: auto;
    padding: 14px; border-radius: 14px;
    background-color: var(--op-menu-bg);
    background-image: var(--op-menu-sheen);
    backdrop-filter: blur(22px) saturate(150%);
    -webkit-backdrop-filter: blur(22px) saturate(150%);
    border: 1px solid var(--op-menu-bd);
    box-shadow: inset 0 1px 0 rgba(235,243,255,.115), 0 24px 60px -16px rgba(0,0,0,.72);
    color: var(--dsw-alias-label-primary, #f2f2f5);
    display: none; flex-direction: column; gap: 11px;
    animation: opPopIn 170ms cubic-bezier(.16,1,.3,1);
  }
  #ds-drawer.open { display: flex; }
  html[data-prism-theme="light"] #ds-drawer {
    box-shadow: inset 0 1px 0 rgba(255,255,255,.94), 0 24px 56px -14px rgba(15,23,42,.20);
  }
  @keyframes opPopIn { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }

  .op-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .op-brand { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; }
  .op-ver {
    height: 19px; padding: 0 7px; border-radius: 999px; font-size: 10.5px; font-weight: 500;
    font-family: var(--ag-cs-mono-stack, monospace);
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.08);
    display: inline-flex; align-items: center; color: var(--dsw-alias-label-secondary, #a1a1aa);
  }
  .op-close {
    width: 26px; height: 26px; border-radius: 7px; border: 1px solid transparent;
    background: transparent; color: var(--dsw-alias-label-secondary, #8a8a98);
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .op-close:hover { background: rgba(128,136,156,0.12); color: inherit; }

  /* Top 3-mode selector + recessed subtabs */
  .op-subtabs {
    display: flex; align-items: center; width: 100%; padding: 2.5px; gap: 2px;
    border-radius: 9px; border: 1px solid var(--op-kb); background: var(--op-k1); box-shadow: var(--op-kw);
  }
  .op-subtab-btn {
    flex: 1; height: 26px; padding: 0 8px; border-radius: 6.5px; border: 0;
    background: transparent; color: var(--dsw-alias-label-secondary, #8a8a98);
    font-size: 11.5px; font-weight: 500; cursor: pointer; white-space: nowrap;
    transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .op-subtab-btn:hover { color: inherit; }
  .op-subtab-btn[aria-selected="true"] {
    background: var(--op-k2); box-shadow: var(--op-ks2); color: var(--dsw-alias-label-primary, #f2f2f5); font-weight: 600;
  }

  /* Authentic Obsidian Prism card list with rows (py-2) */
  .op-card {
    border-radius: 12px; border: 1px solid var(--op-kb); background: var(--op-k0);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.045); overflow: hidden;
  }
  .op-row {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 8px 12px; padding: 10px 13px;
    border-bottom: 1px solid var(--op-kb);
  }
  .op-row:last-child { border-bottom: 0; }
  .op-row-txt { display: flex; flex-direction: column; gap: 2px; flex: 1 1 160px; min-width: 140px; }
  .op-row-t { font-size: 12.5px; font-weight: 500; }
  .op-row-d { font-size: 11px; color: var(--dsw-alias-label-secondary, #8a8a98); line-height: 1.38; }

  /* Authentic Obsidian Prism toggle switch */
  .op-switch {
    position: relative; width: 38px; height: 21px; padding: 2px; border-radius: 999px;
    border: 1px solid var(--op-kb); background: var(--op-k1); box-shadow: var(--op-kw);
    cursor: pointer; display: inline-flex; align-items: center; flex-shrink: 0;
    transition: background-color 160ms ease, border-color 160ms ease;
  }
  .op-switch[data-on="1"] {
    background: color-mix(in srgb, var(--dsw-alias-brand-primary, #669df6) 78%, #1d2230);
    border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #669df6) 85%, rgba(255,255,255,.2));
  }
  .op-switch[data-locked="1"] { opacity: 0.4; cursor: not-allowed; }
  .op-switch-thumb {
    width: 15px; height: 15px; border-radius: 999px; background: #9EA4B0;
    box-shadow: 0 1px 3px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.35);
    transform: translate3d(0,0,0); transition: transform 170ms cubic-bezier(.22,1,.36,1), background-color 150ms ease;
  }
  .op-switch[data-on="1"] .op-switch-thumb { transform: translate3d(17px,0,0); background: #F4F5F8; }

  /* Segmented inline control */
  .op-seg {
    display: inline-flex; align-items: center; gap: 2px; padding: 2px;
    border-radius: 8px; border: 1px solid var(--op-kb); background: var(--op-k1); box-shadow: var(--op-kw);
  }
  .op-seg button {
    height: 23px; padding: 0 8px; border: 0; border-radius: 6px;
    background: transparent; color: var(--dsw-alias-label-secondary, #8a8a98);
    font-size: 11.5px; font-weight: 500; cursor: pointer; white-space: nowrap;
    display: inline-flex; align-items: center; gap: 5px;
  }
  .op-seg button[data-active="1"] {
    background: var(--op-k2); box-shadow: var(--op-ks2); color: var(--dsw-alias-label-primary, #f2f2f5); font-weight: 600;
  }
  .op-tone-dot { width: 7px; height: 7px; border-radius: 999px; display: inline-block; flex-shrink: 0; }

  /* Palette grid */
  .op-pal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 12px; }
  .op-pal {
    display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 9px;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.04); color: inherit; cursor: pointer; text-align: left;
    transition: border-color 130ms ease, background-color 130ms ease;
  }
  .op-pal:hover { border-color: rgba(128,136,156,0.34); }
  .op-pal[data-active="1"] {
    border-color: var(--dsw-alias-brand-primary, #669df6);
    background: rgba(var(--prism-accent-rgb, 102,157,246), 0.12);
  }
  .op-swatch {
    width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; position: relative; overflow: hidden;
    border: 1px solid rgba(128,136,156,0.28);
  }
  .op-swatch-sb { position: absolute; left: 0; top: 0; bottom: 0; width: 7px; }
  .op-swatch-ac { position: absolute; right: 2px; bottom: 2px; width: 7px; height: 7px; border-radius: 999px; }
  .op-pal-n { font-size: 11.5px; font-weight: 600; line-height: 1.2; }
  .op-pal-s { font-size: 10px; opacity: 0.58; }

  /* Live Pixel Mascot Casting Stage (renders REAL mascotArt pixels!) */
  .op-cast-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 12px; }
  .op-cast-card {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 8px 4px 7px; border-radius: 10px;
    border: 1px solid var(--op-kb); background: rgba(128,136,156,0.04);
    color: inherit; cursor: pointer; transition: all 140ms ease; position: relative;
  }
  .op-cast-card:hover { border-color: rgba(128,136,156,0.34); background: rgba(128,136,156,0.08); }
  .op-cast-card[data-active="1"] {
    border-color: var(--dsw-alias-brand-primary, #669df6);
    background: rgba(var(--prism-accent-rgb, 102,157,246), 0.14);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .op-cast-cv { width: 48px; height: 42px; image-rendering: pixelated; display: block; }
  .op-cast-name { font-size: 10.5px; font-weight: 600; white-space: nowrap; }
  .op-cast-dot {
    position: absolute; top: 5px; right: 5px; width: 5.5px; height: 5.5px; border-radius: 999px;
    background: rgba(128,136,156,0.3);
  }
  .op-cast-card[data-active="1"] .op-cast-dot { background: #34d399; box-shadow: 0 0 6px rgba(52,211,153,0.75); }

  /* Wallpapers + Sliders */
  .op-walls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 12px; }
  .op-wall {
    position: relative; height: 56px; border-radius: 9px; overflow: hidden; padding: 0;
    border: 1.5px solid var(--op-kb); cursor: pointer; background: linear-gradient(135deg, #13182b, #231938);
  }
  .op-wall[data-active="1"] { border-color: var(--dsw-alias-brand-primary, #669df6); }
  .op-wall img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .op-wall-cap {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px;
    font-size: 10px; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,.78));
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;
  }
  .op-slider { width: 132px; accent-color: var(--dsw-alias-brand-primary, #669df6); cursor: pointer; }

  .op-notice {
    padding: 8px 11px; border-radius: 9px; font-size: 11px; line-height: 1.45;
    color: color-mix(in srgb, #F59E0B 78%, currentColor);
    background: rgba(245, 158, 11, 0.10); border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .op-footer { display: flex; align-items: center; gap: 8px; }
  .op-btn-primary {
    flex: 1; height: 33px; border-radius: 9px; border: 0; cursor: pointer;
    background: var(--dsw-alias-brand-primary, #669df6); color: #fff;
    font-size: 12px; font-weight: 600;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 4px 14px -4px rgba(var(--prism-accent-rgb, 102,157,246), 0.5);
  }
  .op-btn-primary:hover { filter: brightness(1.06); }
  .op-btn-ghost {
    height: 33px; padding: 0 12px; border-radius: 9px;
    border: 1px solid var(--op-kb); background: transparent; color: inherit;
    font-size: 12px; font-weight: 500; cursor: pointer;
  }
  .op-btn-ghost:hover { background: rgba(128,136,156,0.10); }

  .ds-toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    z-index: 2147483646; padding: 7px 14px; border-radius: 999px;
    background: var(--op-menu-bg); border: 1px solid var(--op-menu-bd);
    color: var(--dsw-alias-label-primary, #fff); font-size: 12px; display: none;
    box-shadow: 0 12px 32px rgba(0,0,0,0.45);
  }
</style>
</head>
<body data-view="home">
  <div id="root">
    <!-- Left Sidebar -->
    <aside data-slot="sidebar">
      <div class="sb-top">
        <button class="sb-brand-btn" id="btn-client-switch" title="切换预览与适配的桌面 AI 客户端（共 11 端实时适配）">
          <span id="sb-brand-spark"><img class="dsh-app-icon" id="sb-app-icon" src="/app-icon/dsh.png" alt="DSH NEXT" /></span>
          <span id="sb-app-name">DSH NEXT</span>
          <span class="sb-brand-chev">▾</span>
        </button>
        <span class="sb-ver" id="sb-app-ver">2.0.24-next</span>
      </div>

      <button class="sb-nav-btn" id="btn-go-home">
        <span class="sb-nav-icon" data-icon-slot="sparkles-pen"></span>
        <span>新建对话</span>
        <span class="sb-kbd">Ctrl+N</span>
      </button>
      <button class="sb-nav-btn" id="btn-open-drawer-sb">
        <span class="sb-nav-icon" data-icon-slot="sliders-tune"></span>
        <span>外观与光效</span>
      </button>

      <div class="sb-sec-lbl">近期对话</div>
      <div class="dsh-session-list" id="sb-session-list">
        <div class="sb-hover-pill" id="sb-hover-pill"></div>
        <div class="sb-active-pill" id="sb-active-pill"></div>
        <div data-row-key="session:1" aria-selected="true" data-selected="true">
          <div class="dsh-sess-title">DreamSkin Prism 三模式融合</div>
          <div class="dsh-sess-sub">DeepSeek-R1 · 刚刚</div>
        </div>
        <div data-row-key="session:2">
          <div class="dsh-sess-title">DSH NEXT 原生双半体插件</div>
          <div class="dsh-sess-sub">dsh-plugin-dreamskin · 8 分钟前</div>
        </div>
        <div data-row-key="session:3">
          <div class="dsh-sess-title">14 端适配器自动发现</div>
          <div class="dsh-sess-sub">Velopack + MSIX · 1 小时前</div>
        </div>
        <div data-row-key="session:4">
          <div class="dsh-sess-title">WebGL2 地平线与 300Hz 棱镜</div>
          <div class="dsh-sess-sub">Obsidian Prism Core · 今天</div>
        </div>
      </div>

      <!-- Whisper-Minimal Sidebar Multi-Source Status Pill (Click to Open Floating Glass Popover!) -->
      <button class="sb-quota-pill" id="btn-sb-quota-pill" title="查看上下文试管与 4 源配额明细">
        <span class="sb-quota-top">
          <span class="sb-quota-l">
            <span class="sb-dots" id="sb-quota-dots"></span>
            <span>多源配额</span>
          </span>
          <span class="sb-quota-r" id="sb-quota-pct">88%</span>
        </span>
        <span class="sb-quota-mini-bar"><span class="sb-quota-mini-fill" id="sb-quota-mini-fill" style="width:88%"></span></span>
      </button>

      <button class="sb-foot-btn" id="btn-foot-settings">
        <span class="sb-nav-icon" data-icon-slot="settings-gear"></span>
        <span>外观与偏好设置</span>
      </button>
    </aside>

    <!-- Main Stage -->
    <main data-slot="main">
      <header data-slot="conversation.header">
        <div class="hdr-left">
          <span class="hdr-crumb-dim" id="hdr-ws-crumb">dsh-workspace</span>
          <span class="hdr-crumb-dim">/</span>
          <span class="hdr-title" id="hdr-title">DreamSkin Prism 三模式融合</span>
        </div>
        <div class="hdr-right">
          <button class="hdr-sim-btn" id="btn-sim-task" data-running="0" title="模拟 AI 任务运行中：体验原版左侧旋转棱镜星轨、彩虹流光竖条、双宠干活与完成声呐欢呼">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 2.1c0-.62.68-1 1.21-.68l6.1 3.9a.8.8 0 0 1 0 1.36l-6.1 3.9A.8.8 0 0 1 3 9.9V2.1Z"/></svg>
            <span>模拟运行任务</span>
          </button>
          <button class="hdr-cmd-btn" id="btn-open-cmd" title="打开全局命令面板 (Ctrl+K)">⌘K</button>
          <div class="hdr-seg-view" role="tablist">
            <button class="hdr-seg-btn" id="tab-view-home" aria-selected="true">首页光场</button>
            <button class="hdr-seg-btn" id="tab-view-conv" aria-selected="false">对话视图</button>
          </div>
          <button id="ds-studio-trigger" data-dreamskin-control-panel="1" title="打开 Obsidian x DreamSkin 外观设置中心">
            <span class="trig-dot"></span>
            <span id="trig-label">纯黑曜光学</span>
            <span class="sb-nav-icon" data-icon-slot="sliders-tune" style="width:13px;height:13px"></span>
          </button>
        </div>
      </header>

      <section data-slot="conversation.view">
        <div data-conversation-scroll>
          <!-- View A: Authentic Obsidian Prism Studio Home Dashboard (Full WebGL2 Electric Horizon + ASCII Matrix + Activity Heatmap + Multi-Source Quotas) -->
          <div id="view-home">
            <div class="home-greet-row">
              <div class="home-greet-l">
                <span id="home-hello-spark"><img class="dsh-app-icon-lg" id="home-app-icon" src="/app-icon/dsh.png" alt="DSH NEXT" /></span>
                <h1 class="home-h1" id="home-greeting-h1">晚上好，准备构建什么？</h1>
              </div>
              <span class="home-ready-badge"><span class="home-ready-dot"></span><span id="home-ready-label">DSH NEXT READY</span></span>
            </div>

            <section class="ag-cs-home-panel" data-prism-mirror-card="1" id="studio-home-panel">
              <div class="ag-cs-home-panel-head">
                <div class="ag-cs-home-tabs" id="studio-tabs">
                  <button class="ag-cs-home-tab" data-stab="overview" data-active="1">活跃概览</button>
                  <button class="ag-cs-home-tab" data-stab="models" data-active="0">模型分布</button>
                  <button class="ag-cs-home-tab" data-stab="quotas" data-active="0">多源配额</button>
                </div>
                <div class="ag-cs-home-ranges" id="studio-ranges">
                  <button class="ag-cs-home-range" data-srange="7d" data-active="0">7天</button>
                  <button class="ag-cs-home-range" data-srange="30d" data-active="1">30天</button>
                  <button class="ag-cs-home-range" data-srange="all" data-active="0">全部</button>
                </div>
              </div>
              <div id="studio-body"></div>
            </section>

            <div class="home-chips">
              <button class="home-chip" data-quick-mode="optical">纯黑曜光学</button>
              <button class="home-chip" data-quick-mode="wallpaper">纯梦境壁纸</button>
              <button class="home-chip" data-quick-mode="hybrid">自由混搭</button>
              <button class="home-chip" id="btn-home-rainbow">点亮小紫猫彩虹极光</button>
              <button class="home-chip" id="btn-home-sim-task">▶ 看任务运行中效果</button>
            </div>
          </div>

          <!-- View B: Authentic Conversation View -->
          <div id="view-conv">
            <div data-slot="conversation.chat.flow">
              <div data-chat-flow-kind="user">
                <div data-message-bubble>请把 Obsidian Prism 原版的黑曜光学配色、WebGL2 地平线字符矩阵、300Hz 棱镜追光与像素双宠完整移植到 DSH NEXT，并与 DreamSkin 动态壁纸 / 液态玻璃做成三模式自由搭配。</div>
              </div>

              <div data-chat-group-part="response">
                <div class="thought-trigger">
                  <span id="resp-thought-spark"></span>
                  <span>已完成 Obsidian Prism 核心引擎 1:1 跨平台适配 · 零外网 · 零 app.asar 改动</span>
                </div>
                <p class="resp-p">当前页面运行的是 <strong>Obsidian Prism 原版前端引擎</strong>（<code>ripple-core</code> + <code>prism-rim-canvas</code> + <code>dual-mascot-rig</code> + <code>motion-engine</code> + <code>animated-icons</code> + <code>smooth-caret</code>）与 <strong>DreamSkin 动态壁纸/液态玻璃内核</strong> 的双引擎融合体。可在右上角 <strong>外观设置中心</strong> 自由切换三模式、4 套黑曜深浅配色、像素选角舞台、彩虹极光羽衣与壁纸玻璃参数。</p>

                <div class="md-code-block">
                  <div class="code-hdr">
                    <span>dsh-plugin-dreamskin / optical-bundle.js</span>
                    <button class="code-copy-btn" id="btn-copy-code">
                      <span class="sb-nav-icon" data-icon-slot="copy-check" style="width:13px;height:13px"></span>
                      <span id="copy-code-lbl">复制</span>
                    </button>
                  </div>
                  <pre><code><span class="tok-c">// 原版 Obsidian Prism 引擎 + DreamSkin 三模式裁决，零外网热更新</span>
<span class="tok-k">export const</span> <span class="tok-p">dshPrismConfig</span> = {
  <span class="tok-p">skinMode</span>: <span class="tok-s">'optical'</span> | <span class="tok-s">'wallpaper'</span> | <span class="tok-s">'hybrid'</span>,
  <span class="tok-p">mascot</span>: <span class="tok-s">'crab'</span>, <span class="tok-c">// 默认纯净双宠 (Clawd + 小紫猫)，可在选角舞台自由增减</span>
  <span class="tok-p">engines</span>: [<span class="tok-s">'ripple-core-webgl2'</span>, <span class="tok-s">'prism-rim-300hz'</span>, <span class="tok-s">'motion-spring-4tier'</span>],
};</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Composer Dock: Authentic Smoked Obsidian surface-composer-card + mascots appended LAST (zero clipping!) -->
        <div data-slot="conversation.composer">
          <div data-composer-card>
            <textarea data-composer-input id="dsh-input" placeholder="输入想法，或键入 ? / ! 与上方 Clawd 和小紫猫互动…"></textarea>
            <div class="comp-foot">
              <div class="comp-tools">
                <button class="comp-icon-btn" id="btn-comp-add" title="添加上下文"><span data-icon-slot="plus-spin"></span></button>
                <button class="comp-pill comp-model-btn" id="btn-comp-model" aria-expanded="false" title="点击切换模型并拖动底部星轨滑块调节推理等级">
                  <span id="comp-model-spark"></span>
                  <span id="comp-model-label">DeepSeek-R1</span>
                  <span class="comp-model-effort" id="comp-model-effort">超高</span>
                  <svg class="comp-model-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button class="comp-pill" id="btn-comp-stage">
                  <span data-icon-slot="layers-stack"></span>
                  <span>桌宠选角</span>
                </button>
                <button class="comp-pomo-pill" id="btn-pomo-pill" data-running="0" title="点击开启 25 分钟心流番茄钟（自动切换像素沙漏，结束时双宠欢呼）">
                  <span>⏳</span><span id="pomo-time">25:00</span>
                </button>
              </div>
              <div class="comp-right">
                <button class="comp-tel-pill" id="btn-telemetry-pill" aria-expanded="false" title="点击展开自适应上下文液柱与 4 源配额浮窗">
                  <span id="comp-tps">74.8 t/s</span>
                  <span class="comp-tel-sep">·</span>
                  <span id="comp-cache">缓存 86.9%</span>
                  <span class="comp-ctx-track"><span class="comp-ctx-fill" id="comp-ctx-fill" style="width:46.5%"></span></span>
                  <span class="comp-ctx-pct" id="comp-ctx-pct">46.5%</span>
                </button>
                <button class="comp-send" id="btn-send-demo" title="发送消息">
                  <span data-icon-slot="arrow-up-launch"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div id="conv-turn-rail" aria-label="对话大纲导轨"></div>
      </section>
    </main>
  </div>

  <!-- Multi-Client Adapter Switcher Popover -->
  <div id="ds-client-pop" data-dreamskin-control-panel="1" role="menu" aria-label="切换客户端预览">
    <div class="cl-pop-head"><span>切换客户端实时预览</span><span>多端配置预览</span></div>
    <div id="ds-client-list"></div>
  </div>

  <!-- Authentic Model Selector Popup (Directly hosts original AntigravityCodexEffortSlider underneath models) -->
  <div id="ds-model-pop" data-dreamskin-control-panel="1" role="dialog" aria-label="选择模型与推理等级">
    <div class="mdl-pop-head">模型</div>
    <div class="mdl-list" id="ds-model-list"></div>
    <div class="mdl-divider"></div>
    <div class="ces-ag-section" id="ds-model-effort-section">
      <div class="ces-ag-effort-row" id="ds-model-effort-row" data-ces-effort-row="true">
        <div class="ces-ag-effort-head">
          <span class="ces-ag-effort-title">推理等级</span>
          <span class="ces-ag-effort-value" id="ds-model-effort-val">超高</span>
        </div>
        <div class="ces-inline" id="ds-real-effort-mount"></div>
      </div>
    </div>
    <div class="mdl-divider"></div>
    <button class="mdl-usage-row" id="btn-model-open-usage">
      <span class="mdl-usage-l">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 12 16 8"/><path d="M8.5 16.5h7"/></svg>
        <span>查看用量明细</span>
      </span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  </div>

  <!-- Floating Smoked-Glass Telemetry Vial & Multi-Source Quota Popover (1:1 optics.webp) -->
  <div id="ds-telemetry-pop" data-dreamskin-control-panel="1" role="dialog" aria-label="上下文与多源配额详情">
    <div class="vial-col">
      <span class="vial-cap">AUTO</span>
      <span class="vial-pct" id="vial-pct">46.5%</span>
      <div class="vial-glass">
        <div class="vial-fill" id="vial-fill" style="height:46.5%"></div>
        <div class="vial-ticks"><span></span><span></span><span></span></div>
      </div>
      <span class="vial-cap">238.1k</span>
    </div>
    <div class="tel-main">
      <div class="tel-head">
        <span class="tel-model"><span id="pop-model-name">DeepSeek-R1</span><span class="tel-ver-tag">VERIFIED</span></span>
        <div style="display:inline-flex;gap:5px">
          <button class="mq-mini-btn" id="btn-pop-refresh">刷新</button>
          <button class="mq-mini-btn" id="btn-pop-close">收起</button>
        </div>
      </div>
      <div class="tel-slices">
        <div><div class="tel-sl-k">系统规则</div><div class="tel-sl-v">38.9k</div></div>
        <div><div class="tel-sl-k">对话轮次</div><div class="tel-sl-v">136.2k</div></div>
        <div><div class="tel-sl-k">工具上下文</div><div class="tel-sl-v">63.0k</div></div>
      </div>
      <div class="tel-sec-h"><span>多来源配额池（点击切换模型）</span><span>5h + 周度</span></div>
      <div class="mq-list" id="pop-quota-list"></div>
    </div>
  </div>

  <!-- Global Command Palette (Ctrl+K) -->
  <div id="ds-cmd-backdrop" data-dreamskin-control-panel="1">
    <div class="cmd-box" role="dialog" aria-label="快捷命令面板">
      <div class="cmd-input-row">
        <span class="sb-nav-icon" data-icon-slot="sliders-tune"></span>
        <input id="ds-cmd-input" type="text" placeholder="搜索命令：切换模式 / 极彩光场 / Zen 专注 / 彩虹小紫猫 / 切换模型…" autocomplete="off" />
        <span class="cmd-kbd">ESC</span>
      </div>
      <div class="cmd-list" id="ds-cmd-list"></div>
    </div>
  </div>

  <!-- Authentic Obsidian Prism Control Center Drawer (4 Subtabs + Real Pixel Casting Stage + Glass Sliders) -->
  <aside id="ds-drawer" data-dreamskin-control-panel="1">
    <div class="op-head">
      <div class="op-brand">
        <span id="dr-brand-spark"></span>
        <span>DreamSkin Prism 控制中心</span>
        <span class="op-ver">v${VERSION}</span>
      </div>
      <button class="op-close" id="btn-close-drawer" title="收起"><span data-icon-slot="x-close"></span></button>
    </div>

    <!-- Top 3-Mode Switcher -->
    <div class="op-subtabs" id="dr-mode-seg" role="tablist">
      <button class="op-subtab-btn" data-mode="optical" aria-selected="true">纯黑曜光学</button>
      <button class="op-subtab-btn" data-mode="wallpaper" aria-selected="false">纯梦境壁纸</button>
      <button class="op-subtab-btn" data-mode="hybrid" aria-selected="false">自由混搭</button>
    </div>

    <!-- 4 Subtabs (Obsidian Prism Settings Style) -->
    <div class="op-subtabs" id="dr-subtabs" role="tablist">
      <button class="op-subtab-btn" data-subtab="appearance" aria-selected="true">外观配色</button>
      <button class="op-subtab-btn" data-subtab="optics" aria-selected="false">光场动效</button>
      <button class="op-subtab-btn" data-subtab="mascot" aria-selected="false">桌宠舞台</button>
      <button class="op-subtab-btn" data-subtab="wallpaper" aria-selected="false">壁纸玻璃</button>
    </div>

    <!-- Tab 1: Appearance -->
    <div class="op-tab-pane" data-pane="appearance">
      <div class="op-card">
        <div class="op-pal-grid" id="dr-pal-grid"></div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">字体气质与文字色彩</span><span class="op-row-d">现代 / 人文衬线 / 极客，搭配鲜明风格化标题</span></div>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="op-seg" id="dr-ui-font-seg"></div>
            <div class="op-seg" id="dr-text-style-seg"></div>
          </div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">棱镜光谱色调</span><span class="op-row-d">控制输入卡 300Hz 棱镜光带与地平线光谱</span></div>
          <div class="op-seg" id="dr-rim-seg"></div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">全局圆角</span><span class="op-row-d">锐利 / 均衡 / 柔和三档切角</span></div>
          <div class="op-seg" id="dr-corner-seg"></div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">代码字体与连字</span><span class="op-row-d">开启编程连字（calt / liga）</span></div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="op-seg" id="dr-font-seg"></div>
            <button class="op-switch" id="sw-ligatures" data-on="0"><span class="op-switch-thumb"></span></button>
          </div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">紧凑侧栏列表</span><span class="op-row-d">收紧会话行距，一屏展示更多对话</span></div>
          <button class="op-switch" id="sw-sb-compact" data-on="0"><span class="op-switch-thumb"></span></button>
        </div>
      </div>
    </div>

    <!-- Tab 2: Optics & Motion -->
    <div class="op-tab-pane" data-pane="optics" style="display:none">
      <div class="op-card">
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">场景预设</span><span class="op-row-d">一键切换完整光效 / 专注编码 / 静默省电</span></div>
          <div class="op-seg" id="dr-scene-seg">
            <button data-scene="ultra">完整光效</button>
            <button data-scene="focus">专注编码</button>
            <button data-scene="eco">静默省电</button>
          </div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">300Hz 棱镜光带</span><span class="op-row-d">GPU Canvas 随指针折射虹彩边光</span></div>
          <button class="op-switch" data-mod-sw="opticalFacet"><span class="op-switch-thumb"></span></button>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">WebGL2 地平线与字符波纹</span><span class="op-row-d">全屏呼吸 ASCII 矩阵与柔和底部地平线光幕</span></div>
          <button class="op-switch" data-mod-sw="rippleField"><span class="op-switch-thumb"></span></button>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">背景色彩鲜艳度</span><span class="op-row-d">调节 WebGL2 棱镜地平线色散、呼吸极光与波纹饱和度</span></div>
          <div class="op-seg" id="dr-vivid-seg"></div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">环境光浓度</span><span class="op-row-d">同时控制地平线与棱镜光带亮度</span></div>
          <div class="op-seg" id="dr-amb-seg"></div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">4 档弹簧物理动效</span><span class="op-row-d">驱动按钮微弹压、图标弹簧与丝滑流光光标</span></div>
          <div class="op-seg" id="dr-motion-seg"></div>
        </div>
      </div>
    </div>

    <!-- Tab 3: Mascot Casting Stage (Real Pixel Canvas Preview!) -->
    <div class="op-tab-pane" data-pane="mascot" style="display:none">
      <div class="op-card">
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">桌面像素伙伴</span><span class="op-row-d">站立于输入卡顶边，支持拖拽抛掷、叠叠乐与打字互动</span></div>
          <button class="op-switch" data-mod-sw="pixelCompanion"><span class="op-switch-thumb"></span></button>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">自由选角</span><span class="op-row-d">点下方卡片自由勾选你想出场的桌面宠物（含小赤狐与小熊猫）</span></div>
          <div class="op-seg" id="dr-mascot-presets">
            <button data-mp="crab">双宠经典</button>
            <button data-mp="quad">四宠同台</button>
            <button data-mp="off">休息</button>
          </div>
        </div>
        <div class="op-cast-grid" id="dr-cast-grid"></div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">实时互动剧场</span><span class="op-row-d">随时触发原版投喂、戳戳与欢呼，双击任意桌宠可放专属动作</span></div>
          <div class="op-seg" id="dr-mascot-theater">
            <button data-mact="donut">投喂甜甜圈</button>
            <button data-mact="coffee">递热咖啡</button>
            <button data-mact="poke">戳一戳</button>
            <button data-mact="cheer">双宠欢呼</button>
          </div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">角隅像素栖息地</span><span class="op-row-d">输入框右下角微型像素摆件（自动随深夜/专注切换）</span></div>
          <div class="op-seg" id="dr-hab-seg"></div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">小紫猫 · 彩虹极光羽衣</span><span class="op-row-d">点亮原版隐藏彩蛋，小紫猫披上动态虹彩极光</span></div>
          <button class="op-switch" id="sw-chroma" data-on="0"><span class="op-switch-thumb"></span></button>
        </div>
      </div>
    </div>

    <!-- Tab 4: Wallpaper & Liquid Glass -->
    <div class="op-tab-pane" data-pane="wallpaper" style="display:none">
      <div class="op-card">
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">动静态背景壁纸</span><span class="op-row-d">加载本机上传图片/视频或内置动态交互场景</span></div>
          <button class="op-switch" data-mod-sw="wallpaperLayer"><span class="op-switch-thumb"></span></button>
        </div>
        <div class="op-walls" id="dr-wall-grid"></div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">液态玻璃透光层</span><span class="op-row-d">浮岛亚克力磨砂玻璃与护眼对比底线</span></div>
          <button class="op-switch" data-mod-sw="glassLayer"><span class="op-switch-thumb"></span></button>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">窗口布局</span><span class="op-row-d">圆角浮岛留缝或经典齐边</span></div>
          <div class="op-seg" id="dr-layout-seg">
            <button data-lay="islands">浮岛画境</button>
            <button data-lay="flush">经典齐边</button>
          </div>
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">玻璃不透明度 <span id="val-glass-op">62%</span></span><span class="op-row-d">越低越通透，越高文字越清晰</span></div>
          <input class="op-slider" id="sl-glass-op" type="range" min="30" max="95" value="62" />
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">毛玻璃模糊度 <span id="val-glass-blur">14px</span></span><span class="op-row-d">控制面板背后高斯模糊半径</span></div>
          <input class="op-slider" id="sl-glass-blur" type="range" min="0" max="32" value="14" />
        </div>
        <div class="op-row">
          <div class="op-row-txt"><span class="op-row-t">护眼暗幕 <span id="val-scrim">16%</span></span><span class="op-row-d">压暗亮色壁纸保护阅读视力</span></div>
          <input class="op-slider" id="sl-scrim" type="range" min="0" max="65" value="16" />
        </div>
      </div>
    </div>

    <div class="op-notice" id="dr-conflict-box" style="display:none"></div>

    <div class="op-footer">
      <button class="op-btn-primary" id="btn-save-live">同步应用到本机 DSH NEXT</button>
      <button class="op-btn-ghost" id="btn-sync-all" title="一键同步当前风格到全部已安装的兼容客户端（自动避让 Antigravity 原生插件）">同步全部软件</button>
      <button class="op-btn-ghost" id="btn-reset-def">恢复默认</button>
    </div>
  </aside>

  <div class="ds-toast" id="ds-toast"></div>

  <!-- Load REAL Obsidian Prism optical/mascot/icon bundle + REAL DreamSkin microkernel -->
  <script src="/optical-bundle.js"></script>
  <script src="/wallpaper-inject.js"></script>
  <script>
    (function () {
      var PALETTES = ${JSON.stringify(palettesMeta)};
      var CAST_SPECIES = [
        { key: 'c', kind: 'clawd', name: 'Clawd' },
        { key: 'k', kind: 'cat', name: '小紫猫' },
        { key: 'd', kind: 'dragon', name: '银白龙' },
        { key: 'w', kind: 'whale', name: 'Deepy' },
        { key: 'f', kind: 'fox', name: '小赤狐' },
        { key: 'p', kind: 'panda', name: '小熊猫' },
        { key: 'm', kind: 'mini', name: '3 迷你蟹' },
      ];

      // Authentic brand SVGs: DSH DeepSeek Whale + Obsidian Prism Crystal (ZERO Gemini logo on DSH!)
      var DSH_WHALE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.9 7.4c-.9.3-1.7.9-2.2 1.7-.4-.8-1.1-1.5-2-1.8-.3-.1-.6.2-.5.5.4 1.1.3 2.2-.2 3.2-.7-.7-1.7-1.3-3-1.5-3.1-.5-6.4 1.1-7.4 4.2-.8 2.6.5 5.6 3.2 6.7 2.8 1.2 6.3.4 8.5-1.7 1.4-1.3 2.3-3 2.7-4.8.9-.2 1.8-.8 2.4-1.6.2-.3 0-.7-.4-.7-.5 0-1-.1-1.5-.3.6-.5 1.1-1.2 1.3-2 .1-.3-.2-.7-.5-.6-.5.1-1 .3-1.4.7Zm-9.6 7.8c-.7 0-1.3-.5-1.3-1.2 0-.7.6-1.2 1.3-1.2.7 0 1.2.5 1.2 1.2 0 .7-.5 1.2-1.2 1.2Z" fill="currentColor"/></svg>';
      var PRISM_CRYSTAL_SVG = '<svg width="18" height="18" viewBox="0 0 1024 1024" aria-hidden="true"><rect x="110" y="110" width="804" height="804" rx="188" fill="#12151E" stroke="#36486B" stroke-width="24"/><path fill="#DCEBFF" d="M512 206L319 468l33 111 160-191z"/><path fill="#4285F4" d="M512 206l184 247-170 58-28-123z"/><path fill="#9B72CB" d="M628 341l68 112-170 58z"/><path fill="#EA4335" d="M696 453l133 235-306-169 173-66z"/><path fill="#FBBC04" d="M696 453l133 235c3 40-20 71-60 71H659L517 525z"/><path fill="#FFFFFF" d="M319 468l85 290H260c-54 0-76-48-50-104z"/></svg>';

      var QUOTA_SOURCES = [
        {
          id: 'deepseek',
          name: 'DeepSeek 官网',
          model: 'DeepSeek-R1',
          providerTag: '直连 API',
          pct5h: 88,
          pctWeek: 92,
          eta: '¥142.80',
          weekEta: '日额充裕',
          color: '#4D6BFE',
          grad: 'linear-gradient(90deg, #4D6BFE 0%, #5CC6FC 100%)',
          pace: '充裕',
          paceColor: '#5CC6FC',
          tokens: '1.64M',
        },
        {
          id: 'claude',
          name: 'Claude Pool',
          model: 'Claude 3.7 Sonnet',
          providerTag: 'Anthropic 5h',
          pct5h: 82,
          pctWeek: 74,
          eta: '1h 48m',
          weekEta: '周额 74%',
          color: '#D97757',
          grad: 'linear-gradient(90deg, #D97757 0%, #F6BD60 100%)',
          pace: '充裕',
          paceColor: '#F6BD60',
          tokens: '980K',
        },
        {
          id: 'gemini',
          name: 'Gemini Pro',
          model: 'Gemini 2.5 Pro',
          providerTag: 'Google AI',
          pct5h: 94,
          pctWeek: 91,
          eta: '3h 12m',
          weekEta: '周额 91%',
          color: '#669DF6',
          grad: 'linear-gradient(90deg, #669DF6 0%, #A58AF8 100%)',
          pace: '充裕',
          paceColor: '#A58AF8',
          tokens: '580K',
        },
        {
          id: 'codex',
          name: 'OpenAI / Codex',
          model: 'Codex o3',
          providerTag: 'Team 池',
          pct5h: 64,
          pctWeek: 79,
          eta: '2d 6h',
          weekEta: '周额 79%',
          color: '#34A853',
          grad: 'linear-gradient(90deg, #34A853 0%, #5CC6FC 100%)',
          pace: '良好',
          paceColor: '#34D399',
          tokens: '360K',
        },
      ];

      var ADAPTED_CLIENTS = [
        { id: 'dsh', name: 'DSH NEXT', ver: '2.0.24-next', ws: 'dsh-workspace', channel: '原生双半体', model: 'DeepSeek-R1', sessions: [['DreamSkin Prism 三模式融合', 'DeepSeek-R1 · 刚刚'], ['DSH NEXT 原生双半体插件', 'dsh-plugin-dreamskin · 8 分钟前'], ['14 端适配器自动发现', 'Velopack + MSIX · 1 小时前'], ['WebGL2 地平线与 300Hz 棱镜', 'Obsidian Prism Core · 今天']] },
        { id: 'zcode', name: 'ZCode', ver: '4.0.0', ws: 'zcode-v4', channel: 'CDP 热注入', model: 'GLM-5 / Claude', sessions: [['ZCode 4.0.0 v4-composer 适配', 'GLM-5 · 刚刚'], ['timeline-message-layer 与气泡核验', 'ZCode 4.0 · 12 分钟前'], ['双宠顶边防裁切与侧栏丝滑轨', 'v4.0.0 · 今天']] },
        { id: 'cherry', name: 'Cherry Studio', ver: '2.1.6', ws: 'cherry-studio', channel: 'CDP 热注入', model: 'Claude 3.7 Sonnet', sessions: [['Cherry 2.1.6 / 2.2.3 双模式适配', 'Claude 3.7 Sonnet · 刚刚'], ['Agent 模式 agent-chat-main 适配', 'DeepSeek-R1 · 15 分钟前'], ['AntD 浮窗与浮动胶囊输入卡', 'Gemini 2.5 Pro · 今天']] },
        { id: 'codex', name: 'Codex', ver: '26.1117.4957', ws: 'codex-desktop', channel: 'MSIX 通道', model: 'Codex o3', sessions: [['Codex 26.1117 composer-surface 适配', 'Codex o3 · 刚刚'], ['MSIX 侧栏 thread-selected 光条', 'o4-mini · 22 分钟前'], ['300Hz 棱镜追光与像素双宠', 'MSIX 适配 · 今天']] },
        { id: 'opencode', name: 'OpenCode', ver: '1.18.33', ws: 'opencode-desk', channel: 'CDP 热注入', model: 'Claude Sonnet 4', sessions: [['OpenCode 1.18 / v2 桌面端适配', 'Claude Sonnet 4 · 刚刚'], ['session-followup-dock 追光输入栏', 'GPT-4.1 · 40 分钟前'], ['侧栏审查树与代码片段统一配色', 'OpenCode · 今天']] },
        { id: 'minimax-code', name: 'MiniMax Code', ver: '3.1.0', ws: 'minimax-code', channel: 'CDP 热注入', model: 'MiniMax-M1', sessions: [['MiniMax Code 3.1 message-input 适配', 'MiniMax-M1 · 刚刚'], ['compact-code-highlight 统一色调', 'MiniMax-M1 · 1 小时前'], ['黑曜光场与双宠协同', '3.1.0 · 今天']] },
        { id: 'minimax-design', name: 'MiniMax Design', ver: '3.0.13', ws: 'minimax-design', channel: 'CDP 热注入', model: 'MiniMax-Design', sessions: [['设计画布 chat/canvas 双分栏适配', 'MiniMax-Design · 刚刚'], ['绯樱暮色 × 衬线排版预览', 'Rose Velvet · 今天']] },
        { id: 'workbuddy', name: 'WorkBuddy', ver: '5.5.6', ws: 'workbuddy', channel: 'CDP 热注入', model: 'DeepSeek-V3', sessions: [['WorkBuddy 5.5.6 conversation-shell 适配', 'DeepSeek-V3 · 刚刚'], ['conversation-input-area 棱镜卡', 'WorkBuddy 5.5.6 · 今天']] },
        { id: 'qoder', name: 'Qoder', ver: '0.3.3', ws: 'qoder-ide', channel: 'IDE 融合', model: 'Qwen3-Coder', sessions: [['Qoder IDE 聊天输入栏双宠', 'Qwen3-Coder · 刚刚'], ['Monaco 编辑器与终端护眼底色', 'Qoder IDE · 18 分钟前'], ['侧栏文件树丝滑光条', 'IDE 适配 · 今天']] },
        { id: 'vscode', name: 'VS Code', ver: '1.147.0', ws: 'vscode-chat', channel: 'IDE 融合', model: 'Copilot / Claude', sessions: [['Copilot Chat 交互输入栏适配', 'Claude 3.7 · 刚刚'], ['Monaco + xterm 护眼底色', 'VS Code 1.147 · 今天'], ['快捷命令面板液态玻璃', 'IDE 融合 · 今天']] },
        { id: 't3code', name: 'T3 Code', ver: '0.1.11', ws: 't3code-beta', channel: 'CDP 热注入', model: 'Gemini 2.5 Pro', sessions: [['T3 Code chat-composer-surface 适配', 'Gemini 2.5 Pro · 刚刚'], ['sidebar-wrapper 线程行丝滑切换', 'T3 Code · 今天']] },
      ];

      var studioState = {
        appId: 'dsh',
        tab: 'overview',
        range: '30d',
        selectedSource: 'deepseek',
        ctxPct: 46.5,
        zen: false,
        cmdIndex: 0,
        fontStyle: 'modern',
        textStyle: 'stylized',
        funIdx: 0,
        pomoLeft: 25 * 60,
        pomoRunning: false,
        pomoTimer: 0,
      };

      function applyUnifiedPaletteTokens() {
        var cfg = state && state.config ? state.config : { colorScheme: 'prism-default', themeMode: 'dark' };
        var pal = PALETTES.find(function (p) { return p.scheme === cfg.colorScheme && p.theme === cfg.themeMode; })
          || PALETTES.find(function (p) { return p.theme === cfg.themeMode; })
          || PALETTES[0];
        if (pal && pal.tokens) {
          var t = pal.tokens;
          var rs = document.documentElement.style;
          rs.setProperty('--st-accent', t.accent);
          rs.setProperty('--st-accent-2', t.accent2);
          rs.setProperty('--st-accent-3', t.accent3);
          rs.setProperty('--st-heading-grad', t.headGrad);
          rs.setProperty('--st-bar-grad', t.barGrad);
          rs.setProperty('--st-vial-grad', t.vialGrad);
          rs.setProperty('--st-heat-1', t.h1);
          rs.setProperty('--st-heat-2', t.h2);
          rs.setProperty('--st-heat-3', t.h3);
          rs.setProperty('--st-heat-4', t.h4);
          rs.setProperty('--st-heat-5', t.h5);
          rs.setProperty('--st-tok-k', t.tokK);
          rs.setProperty('--st-tok-s', t.tokS);
          rs.setProperty('--st-tok-p', t.tokP);
        }
        document.body.setAttribute('data-font-style', studioState.fontStyle || 'modern');
        document.body.setAttribute('data-text-style', studioState.textStyle || 'stylized');
      }

      function renderMultiQuota() {
        var dotsEl = document.getElementById('sb-quota-dots');
        var pctEl = document.getElementById('sb-quota-pct');
        var popListEl = document.getElementById('pop-quota-list');
        var activeSrc = QUOTA_SOURCES.find(function (x) { return x.id === studioState.selectedSource; }) || QUOTA_SOURCES[0];
        if (dotsEl) {
          dotsEl.innerHTML = QUOTA_SOURCES.map(function (q) {
            return '<span class="sb-dot" style="background:' + q.color + ';color:' + q.color + '" title="' + q.name + ' ' + q.pct5h + '%"></span>';
          }).join('');
        }
        if (pctEl && activeSrc) pctEl.textContent = activeSrc.pct5h + '%';
        var miniFill = document.getElementById('sb-quota-mini-fill');
        if (miniFill && activeSrc) {
          miniFill.style.width = activeSrc.pct5h + '%';
          miniFill.style.background = activeSrc.grad;
          miniFill.style.boxShadow = '0 0 8px ' + activeSrc.color;
        }
        var popModel = document.getElementById('pop-model-name');
        if (popModel && activeSrc) popModel.textContent = activeSrc.model;
        if (!popListEl) return;
        popListEl.innerHTML = QUOTA_SOURCES.map(function (q) {
          var sel = studioState.selectedSource === q.id;
          return '<button class="mq-row" data-qsrc="' + q.id + '" data-selected="' + (sel ? '1' : '0') + '" style="--q-glow:' + q.color + '">' +
            '<div class="mq-row-top">' +
              '<span class="mq-src"><span class="mq-dot" style="background:' + q.color + ';color:' + q.color + '"></span><span>' + q.name + '</span></span>' +
              '<span class="mq-val"><span>' + q.pct5h + '%</span><span class="mq-eta">' + q.eta + '</span></span>' +
            '</div>' +
            '<div class="mq-bar"><div class="mq-fill" style="width:' + q.pct5h + '%;background:' + q.grad + '"></div></div>' +
            '<div class="mq-detail"><span>' + q.providerTag + '</span><span>' + q.weekEta + ' · ' + q.tokens + '</span></div>' +
          '</button>';
        }).join('');
        popListEl.querySelectorAll('.mq-row').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-qsrc');
            studioState.selectedSource = id;
            var src = QUOTA_SOURCES.find(function (x) { return x.id === id; });
            if (src) {
              var lbl = document.getElementById('comp-model-label');
              if (lbl) lbl.textContent = src.model;
              if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
                window.__dreamSkinOptical.notifyMascot('model-shift', { model: src.model });
              }
              if (window.__dreamSkinOptical && window.__dreamSkinOptical.setCamp) {
                window.__dreamSkinOptical.setCamp(src.model);
              }
              toast('已切换当前推理源：' + src.name + ' (' + src.model + ') · 对应阵营桌宠就位');
            }
            renderMultiQuota();
          };
        });
      }

      function syncTelemetryBars() {
        var p = Math.max(8, Math.min(98, studioState.ctxPct));
        var txt = p.toFixed(1) + '%';
        var f1 = document.getElementById('comp-ctx-fill');
        var p1 = document.getElementById('comp-ctx-pct');
        var f2 = document.getElementById('vial-fill');
        var p2 = document.getElementById('vial-pct');
        if (f1) f1.style.width = txt;
        if (p1) p1.textContent = txt;
        if (f2) f2.style.height = txt;
        if (p2) p2.textContent = txt;
      }

      function renderTurnRail() {
        var rail = document.getElementById('conv-turn-rail');
        var flow = document.querySelector('[data-slot="conversation.chat.flow"]');
        if (!rail || !flow) return;
        var turns = Array.from(flow.children);
        rail.innerHTML = turns.map(function (_, idx) {
          return '<button class="turn-dot" data-turn="' + idx + '" data-active="' + (idx === turns.length - 1 ? '1' : '0') + '" title="跳至第 ' + (idx + 1) + ' 轮"></button>';
        }).join('');
        rail.querySelectorAll('.turn-dot').forEach(function (dot) {
          dot.onclick = function () {
            var i = Number(dot.getAttribute('data-turn'));
            if (turns[i] && turns[i].scrollIntoView) turns[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            rail.querySelectorAll('.turn-dot').forEach(function (d, j) { d.setAttribute('data-active', j === i ? '1' : '0'); });
          };
        });
      }

      function renderStudioHomePanel() {
        var body = document.getElementById('studio-body');
        if (!body) return;
        document.querySelectorAll('#studio-tabs button').forEach(function (b) {
          b.setAttribute('data-active', b.getAttribute('data-stab') === studioState.tab ? '1' : '0');
        });
        document.querySelectorAll('#studio-ranges button').forEach(function (b) {
          b.setAttribute('data-active', b.getAttribute('data-srange') === studioState.range ? '1' : '0');
        });
        var mul = studioState.range === '7d' ? 0.32 : studioState.range === 'all' ? 2.4 : 1;

        var funMilestones = [
          '⚡ 约合写完 <strong>' + (4.5 * mul).toFixed(1) + ' 本《三体》</strong> 的文字量',
          '☕ 相当于省下 <strong>' + Math.max(8, Math.round(38 * mul)) + ' 杯冰美式</strong> 与 <strong>' + Math.max(4, Math.round(16 * mul)) + ' 小时</strong>熬夜',
          '⌨️ 指尖在键盘滑行 <strong>' + (6.2 * mul).toFixed(1) + ' 公里</strong> · 产出 <strong>' + Math.round(142 * mul) + '</strong> 个好点子',
          '🐾 小紫猫陪你连肝 <strong>' + Math.max(5, Math.round(14 * mul)) + ' 天</strong> · 默契值拉满',
          '🧩 已同步覆盖本机 <strong>12 款</strong>桌面 AI 软件的统一美学',
        ];
        var funLine = funMilestones[studioState.funIdx % funMilestones.length];
        var curHab = (state && state.config && state.config.habitatMode) || 'auto';

        if (studioState.tab === 'overview') {
          var sessions = Math.round(48 * mul);
          var msgs = Math.round(612 * mul);
          var toks = (3.56 * mul).toFixed(2) + 'M';
          var cells = [];
          for (var i = 0; i < 238; i += 1) {
            var wave = Math.sin(i * 0.23 + (mul * 2.1)) + Math.cos(i * 0.11) + ((i * 19) % 11) * 0.14;
            var lv = wave > 1.85 ? 5 : wave > 1.25 ? 4 : wave > 0.65 ? 3 : wave > 0.1 ? 2 : wave > -0.45 ? 1 : 0;
            var dTok = lv === 0 ? '0' : (lv * 18 + (i % 9) * 3) + 'K';
            cells.push('<span class="ag-cs-home-heat-cell" data-level="' + lv + '" data-tip="Day -' + (238 - i) + ' · ' + dTok + ' tokens"></span>');
          }
          body.innerHTML =
            '<div class="ag-cs-home-stats">' +
              '<div class="ag-cs-home-stat"><span class="ag-cs-home-stat-label">会话</span><span class="ag-cs-home-stat-value">' + sessions + '</span></div>' +
              '<div class="ag-cs-home-stat"><span class="ag-cs-home-stat-label">消息轮次</span><span class="ag-cs-home-stat-value">' + msgs + '</span></div>' +
              '<div class="ag-cs-home-stat"><span class="ag-cs-home-stat-label">总用量</span><span class="ag-cs-home-stat-value">' + toks + '</span></div>' +
              '<div class="ag-cs-home-stat"><span class="ag-cs-home-stat-label">缓存命中</span><span class="ag-cs-home-stat-value" style="color:var(--st-accent-2)">86.9%</span></div>' +
              '<div class="ag-cs-home-stat"><span class="ag-cs-home-stat-label">主力模型</span><span class="ag-cs-home-stat-value" id="studio-main-model">' + (currentClient().model) + '</span></div>' +
            '</div>' +
            '<div class="ag-cs-home-heat-wrap" style="margin-top:10px">' +
              '<div class="ag-cs-home-heat" id="studio-heat-grid">' + cells.join('') + '</div>' +
            '</div>' +
            '<div class="ag-cs-home-foot" style="margin-top:8px">' +
              '<button class="ag-cs-home-fun" id="studio-fun-pill" title="点击换一条趣味里程碑，小紫猫也会回应你！">' + funLine + '<span class="ag-cs-home-fun-hint">↻ 换一条</span></button>' +
              '<span class="ag-cs-home-tip" id="studio-heat-tip">悬停热力格查看单日消耗</span>' +
            '</div>' +
            '<div class="studio-play-bar">' +
              '<button class="studio-mood-pill" id="studio-mood-pill" title="点我随机扔一个原版桌宠彩蛋（小鱼干 / 甜甜圈 / 热咖啡 / 双宠欢呼）">' +
                '<span class="studio-mood-dot"></span><span id="studio-mood-text">小紫猫待机中 · 点我触发惊喜彩蛋</span>' +
              '</button>' +
              '<div class="studio-hab-group" id="studio-hab-bar">' +
                '<button class="studio-hab-btn" data-hab="cactus" data-active="' + (curHab === 'cactus' ? '1' : '0') + '" title="输入框右下角切换像素仙人掌">🌵 仙人掌</button>' +
                '<button class="studio-hab-btn" data-hab="lamp" data-active="' + (curHab === 'lamp' ? '1' : '0') + '" title="输入框右下角切换深夜暖光台灯">💡 台灯</button>' +
                '<button class="studio-hab-btn" data-hab="hourglass" data-active="' + (curHab === 'hourglass' ? '1' : '0') + '" title="输入框右下角切换像素专注沙漏">⏳ 沙漏</button>' +
              '</div>' +
            '</div>';
          var hg = document.getElementById('studio-heat-grid');
          var ht = document.getElementById('studio-heat-tip');
          if (hg && ht) {
            hg.onmouseover = function (ev) {
              var c = ev.target && ev.target.closest ? ev.target.closest('.ag-cs-home-heat-cell') : null;
              if (c) ht.textContent = c.getAttribute('data-tip') || '';
            };
          }
          var fp = document.getElementById('studio-fun-pill');
          if (fp) {
            fp.onclick = function () {
              studioState.funIdx = (studioState.funIdx + 1) % 5;
              renderStudioHomePanel();
              if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
                window.__dreamSkinOptical.notifyMascot('code-copied', {});
              }
            };
          }
          var mp = document.getElementById('studio-mood-pill');
          if (mp) {
            mp.onclick = function () { triggerRandomMascotEgg(); };
          }
          document.querySelectorAll('#studio-hab-bar button').forEach(function (b) {
            b.onclick = function () {
              var h = b.getAttribute('data-hab');
              state.config.habitatMode = h;
              if (window.__dreamSkinOptical && window.__dreamSkinOptical.setHabitatMode) {
                window.__dreamSkinOptical.setHabitatMode(h);
              }
              renderStudioHomePanel();
              renderDrawer();
              toast('角隅像素摆件已切换：' + b.textContent);
            };
          });
          syncMascotMoodChip();
          return;
        }

        if (studioState.tab === 'models') {
          var rows = [
            { name: 'DeepSeek-R1', pct: 46, tok: (1.64 * mul).toFixed(2) + 'M', grad: 'linear-gradient(90deg,#4D6BFE,#5CC6FC)' },
            { name: 'Claude 3.7 Sonnet', pct: 28, tok: (0.98 * mul).toFixed(2) + 'M', grad: 'linear-gradient(90deg,#D97757,#F6BD60)' },
            { name: 'Gemini 2.5 Pro', pct: 16, tok: (0.58 * mul).toFixed(2) + 'M', grad: 'linear-gradient(90deg,#669DF6,#A58AF8)' },
            { name: 'OpenAI Codex o3', pct: 10, tok: (0.36 * mul).toFixed(2) + 'M', grad: 'linear-gradient(90deg,#34A853,#5CC6FC)' },
          ];
          body.innerHTML = '<div class="studio-models-list">' + rows.map(function (r) {
            return '<div class="sm-row">' +
              '<span class="sm-name">' + r.name + '</span>' +
              '<div class="sm-bar"><div class="sm-fill" style="width:' + r.pct + '%;background:' + r.grad + '"></div></div>' +
              '<span class="sm-pct">' + r.pct + '%</span>' +
            '</div>';
          }).join('') + '</div>';
          return;
        }

        // Quotas tab: full 2x2 multi-source dual-window view
        body.innerHTML = '<div class="studio-quota-grid">' + QUOTA_SOURCES.map(function (q) {
          return '<div class="sq-card">' +
            '<div class="sq-head">' +
              '<span class="mq-src"><span class="mq-dot" style="background:' + q.color + ';color:' + q.color + '"></span><span>' + q.name + '</span></span>' +
              '<span class="sq-pace" style="color:' + q.paceColor + '">' + q.pace + '</span>' +
            '</div>' +
            '<div class="sq-win"><div class="sq-win-r"><span>5h 窗口</span><span>' + q.pct5h + '% · ' + q.eta + '</span></div>' +
              '<div class="mq-bar"><div class="mq-fill" style="width:' + q.pct5h + '%;background:' + q.grad + '"></div></div></div>' +
            '<div class="sq-win"><div class="sq-win-r"><span>周度配额</span><span>' + q.pctWeek + '% · ' + q.tokens + '</span></div>' +
              '<div class="mq-bar"><div class="mq-fill" style="width:' + q.pctWeek + '%;background:' + q.grad + ';opacity:0.78"></div></div></div>' +
          '</div>';
        }).join('') + '</div>';
      }

      // Hydrate ALL UI icons with authentic Obsidian Prism animated-icons.js + Authentic DSH Whale & Prism Crystal (ZERO Gemini logo on DSH!)
      function hydrateIcons() {
        var ai = window.__agAnimatedIcons;
        if (ai) {
          document.querySelectorAll('[data-icon-slot]').forEach(function (el) {
            var name = el.getAttribute('data-icon-slot');
            var sz = Number(el.getAttribute('data-icon-size')) || 15;
            var inner = ai.renderIcon ? ai.renderIcon(name, { size: sz }) : '';
            if (inner) {
              el.innerHTML = '<svg class="ag-anim-icon" data-anim-icon="' + name + '" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
            }
          });
        }
        var drMark = document.getElementById('dr-brand-spark');
        if (drMark) drMark.innerHTML = PRISM_CRYSTAL_SVG;
        ['resp-thought-spark', 'comp-model-spark'].forEach(function (id) {
          var n = document.getElementById(id);
          if (n) {
            n.style.color = 'var(--st-accent)';
            n.style.display = 'inline-flex';
            n.innerHTML = DSH_WHALE_SVG;
          }
        });
      }

      var qs = new URLSearchParams(window.location.search);
      function defaultConfig() {
        return {
          skinEnabled: true,
          skinMode: qs.get('mode') || 'optical',
          themeMode: qs.get('theme') || 'dark',
          colorScheme: qs.get('scheme') || 'prism-default',
          mascotSpec: qs.get('mascot') || 'crab',
          prismaticCoat: qs.get('chroma') === '1',
          rimTone: qs.get('rim') || 'follow',
          cornerStyle: 'balanced',
          motionTier: 'ultra',
          ambientIntensity: 1,
          vividness: qs.get('vivid') || 'balanced',
          fontStyle: 'modern',
          textStyle: 'stylized',
          habitatMode: 'auto',
          codeFont: 'default',
          codeLigatures: false,
          sidebarCompact: false,
          glassOpacity: 0.62,
          glassBlur: 14,
          scrimOpacity: 0.16,
          layoutMode: 'islands',
          glassSurfaces: false,
          modules: {
            wallpaperLayer: false,
            glassLayer: false,
            opticalPalette: true,
            opticalFacet: true,
            rippleField: true,
            microMotion: true,
            pixelCompanion: true,
          },
        };
      }

      var state = {
        activeSubtab: qs.get('tab') || 'appearance',
        wallpapers: [],
        selectedWallpaperId: '',
        config: defaultConfig(),
        composition: null,
      };

      function presetModulesForMode(mode) {
        if (mode === 'optical') return { wallpaperLayer: false, glassLayer: false, opticalPalette: true, opticalFacet: true, rippleField: true, microMotion: true, pixelCompanion: true };
        if (mode === 'wallpaper') return { wallpaperLayer: true, glassLayer: true, opticalPalette: true, opticalFacet: false, rippleField: false, microMotion: false, pixelCompanion: false };
        return { wallpaperLayer: true, glassLayer: true, opticalPalette: true, opticalFacet: true, rippleField: false, microMotion: true, pixelCompanion: true };
      }
      if (qs.get('mode')) {
        state.config.modules = presetModulesForMode(state.config.skinMode);
        state.config.glassSurfaces = Boolean(state.config.modules.glassLayer);
      }
      if (qs.get('view') === 'home') document.body.setAttribute('data-view', 'home');

      function currentClient() {
        return ADAPTED_CLIENTS.find(function (c) { return c.id === studioState.appId; }) || ADAPTED_CLIENTS[0];
      }

      var POSE_ZH = {
        idle: '小紫猫伸耳巡逻待机中 · 点我扔彩蛋',
        groom: '小紫猫正在认真舔爪理毛',
        eatFish: '小紫猫正在津津有味啃小鱼干',
        chaseDot: '小紫猫发现激光红点啦！',
        catStretch: '小紫猫弓背伸了个大懒腰',
        yawnStretch: '小紫猫打着哈欠伸懒腰',
        walk: '小紫猫正在输入框顶边遛弯',
        coffee: '小紫猫端着热咖啡提神中',
        feedDonut: '小紫猫一口咬住甜甜圈！',
        feedCoffee: '小紫猫捧着热咖啡开心极了',
        butterfly: '小紫猫在追着像素蝴蝶跑',
        write: '小紫猫正挥笔疯狂记笔记',
        cheer: 'Clawd 与小紫猫双宠击掌欢呼！',
        happy: '小紫猫心情极佳 · 冒爱心啦',
        sleep: '小紫猫打盹中…点我轻轻叫醒',
        loaf: '小紫猫揣手变成紫薯面包啦',
        letter: '小紫猫正在读一封像素小信件',
        plant: '小紫猫正在给像素小盆栽浇水',
        polish: '桌宠正在认真擦亮棱镜边角',
        eat: '桌宠正在吧唧吧唧吃零食',
        stretch: '桌宠舒舒服服伸了个大懒腰',
        spinHop: '桌宠开心地原地转圈蹦高高！',
        wave: '桌宠正在朝你招手打招呼',
        yawn: '桌宠张嘴打了个小哈欠',
        salute: '桌宠立正敬礼 · 准备出发！',
        readAlong: '桌宠正跟着你一起读代码',
        dragonFlame: '银白龙呼出一朵酷炫像素龙息！',
        whaleSpout: 'Deepy 小蓝鲸开心喷起水花啦！',
        foxWisp: '小赤狐挥动大尾巴放出了灵狐星火！',
        pandaBamboo: '团子小熊猫正津津有味啃着脆竹子！',
      };

      function syncMascotMoodChip() {
        var el = document.getElementById('studio-mood-text');
        if (!el) return;
        var opt = window.__dreamSkinOptical;
        var snap = opt && opt.getMascotSnapshot ? opt.getMascotSnapshot() : null;
        if (!snap || !snap.actors || !snap.actors.length) return;
        var cat = snap.actors.find(function (a) { return a.id === 'cat'; }) || snap.actors[0];
        var text = POSE_ZH[cat.pose] || ('小紫猫动作：' + cat.pose + ' · 点我扔彩蛋');
        if (el.textContent !== text) el.textContent = text;
      }

      var eggStep = 0;
      function triggerRandomMascotEgg() {
        var opt = window.__dreamSkinOptical;
        if (!opt) return;
        var acts = [
          function () { opt.feedMascot('cat', 'donut'); toast('🍩 投喂桌宠一枚草莓甜甜圈！'); },
          function () { opt.feedMascot('cat', 'coffee'); toast('☕ 给桌宠递上一杯现磨热美式！'); },
          function () { opt.playMascotDemo('cheer'); toast('🎉 桌宠同步欢呼剧场！'); },
          function () { opt.pokeMascot('cat'); toast('👉 戳了戳桌宠软乎乎的小脑袋！'); },
          function () { opt.notifyMascot('slash-cmd', { cmd: '/plan' }); toast('📐 触发桌宠蓝图规划彩蛋！'); },
        ];
        acts[eggStep % acts.length]();
        eggStep += 1;
        setTimeout(syncMascotMoodChip, 220);
      }

      function renderClientMenu() {
        var listEl = document.getElementById('ds-client-list');
        if (!listEl) return;
        listEl.innerHTML = ADAPTED_CLIENTS.map(function (c) {
          var act = c.id === studioState.appId;
          return '<button class="cl-item" data-cid="' + c.id + '" data-active="' + (act ? '1' : '0') + '">' +
            '<img class="dsh-app-icon" src="/app-icon/' + c.id + '.png" alt="" />' +
            '<div class="cl-item-info"><div class="cl-item-name">' + c.name + '</div><div class="cl-item-sub">' + c.ver + ' · ' + c.model + '</div></div>' +
            '<span class="cl-badge">' + c.channel + '</span>' +
          '</button>';
        }).join('');
        listEl.querySelectorAll('.cl-item').forEach(function (b) {
          b.onclick = function () {
            switchClient(b.getAttribute('data-cid'));
            document.getElementById('ds-client-pop').classList.remove('open');
          };
        });
      }

      function syncSidebarActivePill(immediate) {
        var list = document.getElementById('sb-session-list');
        var pill = document.getElementById('sb-active-pill');
        if (!list || !pill) return;
        var activeRow = list.querySelector('[data-row-key^="session:"][aria-selected="true"]') || list.querySelector('[data-row-key^="session:"]');
        if (!activeRow) { pill.style.opacity = '0'; return; }
        if (immediate) pill.style.transition = 'none';
        pill.style.opacity = '1';
        pill.style.height = activeRow.offsetHeight + 'px';
        pill.style.transform = 'translate3d(0,' + activeRow.offsetTop + 'px,0)';
        if (immediate) {
          pill.offsetHeight; // force reflow once for instant snap on client switch
          pill.style.transition = '';
        }
      }

      function animateViewSwap(el) {
        if (!el) return;
        el.classList.remove('view-anim-enter');
        void el.offsetWidth;
        el.classList.add('view-anim-enter');
      }

      function bindSessionRows() {
        var list = document.getElementById('sb-session-list');
        var hoverPill = document.getElementById('sb-hover-pill');
        if (list && hoverPill) {
          list.onmouseleave = function () { hoverPill.style.opacity = '0'; };
        }
        document.querySelectorAll('[data-row-key^="session:"]').forEach(function (row) {
          row.onmouseenter = function () {
            if (!hoverPill) return;
            if (row.getAttribute('aria-selected') === 'true') { hoverPill.style.opacity = '0'; return; }
            hoverPill.style.opacity = '1';
            hoverPill.style.height = row.offsetHeight + 'px';
            hoverPill.style.transform = 'translate3d(0,' + row.offsetTop + 'px,0)';
          };
          row.onclick = function () {
            document.querySelectorAll('[data-row-key^="session:"]').forEach(function (r) {
              r.removeAttribute('aria-selected'); r.removeAttribute('data-selected');
            });
            row.setAttribute('aria-selected', 'true');
            row.setAttribute('data-selected', 'true');
            if (hoverPill) hoverPill.style.opacity = '0';
            syncSidebarActivePill(false);
            var t = row.querySelector('.dsh-sess-title');
            var sub = row.querySelector('.dsh-sess-sub');
            var titleTxt = t ? t.textContent : '';
            var subTxt = sub ? sub.textContent : '';
            if (titleTxt) document.getElementById('hdr-title').textContent = titleTxt;
            var firstBubble = document.querySelector('[data-chat-flow-kind="user"] [data-message-bubble]');
            if (firstBubble && titleTxt) {
              firstBubble.textContent = '【' + currentClient().name + ' ' + currentClient().ver + '】检查任务「' + titleTxt + '」：保持 300Hz 棱镜光带、统一风格化色调与完整桌宠待机动作，切换任务栏如丝般顺滑。';
            }
            var thoughtSpan = document.querySelector('.thought-trigger span:last-child');
            if (thoughtSpan && subTxt) {
              thoughtSpan.textContent = currentClient().name + ' (' + currentClient().ver + ') · ' + subTxt + ' · 零 app.asar 改动';
            }
            setView('conv');
            animateViewSwap(document.querySelector('[data-slot="conversation.chat.flow"]'));
          };
        });
        requestAnimationFrame(function () { syncSidebarActivePill(true); });
      }

      function switchClient(appId) {
        var c = ADAPTED_CLIENTS.find(function (x) { return x.id === appId; }) || ADAPTED_CLIENTS[0];
        studioState.appId = c.id;
        var iconUrl = '/app-icon/' + c.id + '.png';
        var sbIcon = document.getElementById('sb-app-icon');
        var hmIcon = document.getElementById('home-app-icon');
        if (sbIcon) { sbIcon.src = iconUrl; sbIcon.alt = c.name; }
        if (hmIcon) { hmIcon.src = iconUrl; hmIcon.alt = c.name; }
        var sbName = document.getElementById('sb-app-name');
        var sbVer = document.getElementById('sb-app-ver');
        var crumb = document.getElementById('hdr-ws-crumb');
        var ready = document.getElementById('home-ready-label');
        var modLbl = document.getElementById('comp-model-label');
        var saveBtn = document.getElementById('btn-save-live');
        if (sbName) sbName.textContent = c.name;
        if (sbVer) sbVer.textContent = c.ver;
        if (crumb) crumb.textContent = c.ws;
        if (ready) ready.textContent = c.name.toUpperCase() + ' READY';
        if (modLbl) modLbl.textContent = c.model;
        if (saveBtn) saveBtn.textContent = '同步应用到本机 ' + c.name;
        var sessList = document.getElementById('sb-session-list');
        if (sessList && c.sessions) {
          sessList.innerHTML =
            '<div class="sb-hover-pill" id="sb-hover-pill"></div>' +
            '<div class="sb-active-pill" id="sb-active-pill"></div>' +
            c.sessions.map(function (s, idx) {
              return '<div data-row-key="session:' + (idx + 1) + '"' + (idx === 0 ? ' aria-selected="true" data-selected="true"' : '') + '>' +
                '<div class="dsh-sess-title">' + s[0] + '</div>' +
                '<div class="dsh-sess-sub">' + s[1] + '</div>' +
              '</div>';
            }).join('');
          bindSessionRows();
          var hTitle = document.getElementById('hdr-title');
          if (hTitle && c.sessions[0]) hTitle.textContent = c.sessions[0][0];
        }
        document.title = c.name + ' · DreamSkin Prism v${VERSION}';
        renderClientMenu();
        renderStudioHomePanel();
        applyNow();
        toast('已切换客户端实时适配预览：' + c.name + ' v' + c.ver + ' (' + c.channel + ')');
      }

      function toast(msg) {
        var el = document.getElementById('ds-toast');
        el.textContent = msg;
        el.style.display = 'block';
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.style.display = 'none'; }, 2400);
      }

      function parseRoster(spec) {
        var rig = window.__agDualMascotRig;
        if (rig && rig.parseMascotSpec) {
          return rig.parseMascotSpec(spec) || { c: 1, k: 1, d: 0, w: 0, minis: false };
        }
        return { c: 1, k: 1, d: 0, w: 0, minis: false };
      }

      function encodeRoster(r) {
        var rig = window.__agDualMascotRig;
        if (rig && rig.encodeMascotSpec) return rig.encodeMascotSpec(r);
        return 'crab';
      }

      function modeLabel(m) {
        return m === 'optical' ? '纯黑曜光学' : m === 'wallpaper' ? '纯梦境壁纸' : '自由混搭';
      }

      function syncHtmlThemeClass() {
        var isLight = state.config.themeMode === 'light';
        document.documentElement.classList.toggle('light', isLight);
        document.documentElement.classList.toggle('dark', !isLight);
        document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
      }

      function paintCastingStageCanvases() {
        var art = window.__agDualMascotRig && window.__agDualMascotRig.mascotArt;
        if (!art) return;
        document.querySelectorAll('.op-cast-cv').forEach(function (cv) {
          var kind = cv.getAttribute('data-cast-kind');
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          cv.width = Math.round(48 * dpr);
          cv.height = Math.round(42 * dpr);
          var ctx = cv.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, 48, 42);
          ctx.imageSmoothingEnabled = false;
          if (kind === 'mini') {
            art.drawMiniCrab(ctx, 'cowboy', null, 1, 14, 1.45);
            art.drawMiniCrab(ctx, 'shades', null, 16, 14, 1.45);
            art.drawMiniCrab(ctx, 'wizard', null, 8.5, 4, 1.45);
          } else {
            var ox = kind === 'whale' ? 1 : 4;
            art.drawMainActor(ctx, kind, 'idle', 0, ox, 6, 2, {});
          }
        });
      }

      function renderDrawer() {
        var cfg = state.config;
        var mode = cfg.skinMode;
        var eff = (state.composition && state.composition.effectiveModules) || cfg.modules;
        var disabledList = (state.composition && state.composition.disabledModules) || [];
        var locked = {};
        disabledList.forEach(function (d) { locked[d.module] = d.reasonZh; });

        document.getElementById('trig-label').textContent = modeLabel(mode);

        // Mode & Subtabs
        document.querySelectorAll('#dr-mode-seg button').forEach(function (b) {
          b.setAttribute('aria-selected', b.getAttribute('data-mode') === mode ? 'true' : 'false');
        });
        document.querySelectorAll('#dr-subtabs button').forEach(function (b) {
          b.setAttribute('aria-selected', b.getAttribute('data-subtab') === state.activeSubtab ? 'true' : 'false');
        });
        document.querySelectorAll('.op-tab-pane').forEach(function (p) {
          p.style.display = p.getAttribute('data-pane') === state.activeSubtab ? 'block' : 'none';
        });

        // Palettes
        var palEl = document.getElementById('dr-pal-grid');
        palEl.innerHTML = PALETTES.map(function (p) {
          var act = cfg.colorScheme === p.scheme && cfg.themeMode === p.theme;
          return '<button class="op-pal" data-pal="' + p.id + '" data-active="' + (act ? '1' : '0') + '">' +
            '<span class="op-swatch" style="background:' + p.bg + '"><span class="op-swatch-sb" style="background:' + p.sb + '"></span><span class="op-swatch-ac" style="background:' + p.accent + '"></span></span>' +
            '<span><div class="op-pal-n">' + p.label + '</div><div class="op-pal-s">' + p.sub + '</div></span>' +
          '</button>';
        }).join('');
        palEl.querySelectorAll('.op-pal').forEach(function (btn) {
          btn.onclick = function () {
            var p = PALETTES.find(function (x) { return x.id === btn.getAttribute('data-pal'); });
            if (!p) return;
            cfg.colorScheme = p.scheme; cfg.themeMode = p.theme;
            applyNow();
          };
        });

        // UI Font Style (Modern / Editorial Serif / Mono Geek) & Stylized Text Accent (Gradient / Crisp / Minimal)
        var uiFonts = [['modern', '现代'], ['editorial', '衬线'], ['mono', '极客']];
        var ufEl = document.getElementById('dr-ui-font-seg');
        ufEl.innerHTML = uiFonts.map(function (u) {
          return '<button data-uf="' + u[0] + '" data-active="' + (studioState.fontStyle === u[0] ? '1' : '0') + '">' + u[1] + '</button>';
        }).join('');
        ufEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () {
            studioState.fontStyle = b.getAttribute('data-uf');
            cfg.fontStyle = studioState.fontStyle;
            applyUnifiedPaletteTokens();
            applyNow();
          };
        });
        var tStyles = [['stylized', '渐变'], ['crisp', '鲜明'], ['minimal', '素雅']];
        var tsEl = document.getElementById('dr-text-style-seg');
        tsEl.innerHTML = tStyles.map(function (t) {
          return '<button data-ts="' + t[0] + '" data-active="' + (studioState.textStyle === t[0] ? '1' : '0') + '">' + t[1] + '</button>';
        }).join('');
        tsEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () {
            studioState.textStyle = b.getAttribute('data-ts');
            cfg.textStyle = studioState.textStyle;
            applyUnifiedPaletteTokens();
            applyNow();
          };
        });

        // Rim tone segmented bar
        var rims = [
          ['follow', '跟随', 'linear-gradient(135deg,#4285F4,#9B72CB,#EA4335)'],
          ['cobalt', '钴蓝', '#4285F4'],
          ['iris', '鸢尾', '#A58AF8'],
          ['amber', '琥珀', '#F2B84B'],
          ['mono', '纯银', '#94A3B8'],
        ];
        var rimEl = document.getElementById('dr-rim-seg');
        rimEl.innerHTML = rims.map(function (r) {
          return '<button data-rim="' + r[0] + '" data-active="' + (cfg.rimTone === r[0] ? '1' : '0') + '"><span class="op-tone-dot" style="background:' + r[2] + '"></span>' + r[1] + '</button>';
        }).join('');
        rimEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () { cfg.rimTone = b.getAttribute('data-rim'); applyNow(); };
        });

        // Corners
        var corners = [['sharp', '锐利'], ['balanced', '均衡'], ['soft', '柔和']];
        var cEl = document.getElementById('dr-corner-seg');
        cEl.innerHTML = corners.map(function (c) {
          return '<button data-cn="' + c[0] + '" data-active="' + (cfg.cornerStyle === c[0] ? '1' : '0') + '">' + c[1] + '</button>';
        }).join('');
        cEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () { cfg.cornerStyle = b.getAttribute('data-cn'); applyNow(); };
        });

        // Code Font + Ligatures + Compact sidebar
        var fonts = [['default', '默认'], ['jetbrains', 'JetBrains'], ['cascadia', 'Cascadia']];
        var fEl = document.getElementById('dr-font-seg');
        fEl.innerHTML = fonts.map(function (f) {
          return '<button data-cf="' + f[0] + '" data-active="' + (cfg.codeFont === f[0] ? '1' : '0') + '">' + f[1] + '</button>';
        }).join('');
        fEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () { cfg.codeFont = b.getAttribute('data-cf'); applyNow(); };
        });
        document.getElementById('sw-ligatures').setAttribute('data-on', cfg.codeLigatures ? '1' : '0');
        document.getElementById('sw-sb-compact').setAttribute('data-on', cfg.sidebarCompact ? '1' : '0');

        // Module toggles
        document.querySelectorAll('[data-mod-sw]').forEach(function (sw) {
          var k = sw.getAttribute('data-mod-sw');
          var isLocked = Boolean(locked[k]);
          sw.setAttribute('data-on', eff[k] ? '1' : '0');
          sw.setAttribute('data-locked', isLocked ? '1' : '0');
          sw.title = locked[k] || '';
        });

        // Background chroma vividness (Soft / Balanced / Vivid — refined atmospheric default)
        var vivids = [['soft', '柔和'], ['balanced', '平衡'], ['vivid', '鲜艳']];
        var vEl = document.getElementById('dr-vivid-seg');
        vEl.innerHTML = vivids.map(function (v) {
          return '<button data-vv="' + v[0] + '" data-active="' + ((cfg.vividness || 'balanced') === v[0] ? '1' : '0') + '">' + v[1] + '</button>';
        }).join('');
        vEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () { cfg.vividness = b.getAttribute('data-vv'); applyNow(); };
        });

        // Ambient intensity
        var ambs = [[0, '0%'], [0.35, '35%'], [0.7, '70%'], [1, '100%']];
        var aEl = document.getElementById('dr-amb-seg');
        aEl.innerHTML = ambs.map(function (a) {
          var act = Math.abs(Number(cfg.ambientIntensity) - a[0]) < 0.05;
          return '<button data-amb="' + a[0] + '" data-active="' + (act ? '1' : '0') + '">' + a[1] + '</button>';
        }).join('');
        aEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () { cfg.ambientIntensity = Number(b.getAttribute('data-amb')); applyNow(); };
        });

        // Motion tier
        var mts = [['off', '关'], ['subtle', '轻柔'], ['standard', '标准'], ['ultra', '极致']];
        var mEl = document.getElementById('dr-motion-seg');
        mEl.innerHTML = mts.map(function (m) {
          var cur = eff.microMotion ? cfg.motionTier : 'off';
          return '<button data-mt="' + m[0] + '" data-active="' + (cur === m[0] ? '1' : '0') + '">' + m[1] + '</button>';
        }).join('');
        mEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () {
            var v = b.getAttribute('data-mt');
            cfg.motionTier = v;
            if (!locked.microMotion) {
              cfg.modules = Object.assign({}, eff, { microMotion: v !== 'off' });
            }
            applyNow();
          };
        });

        // Mascot Presets & Real Pixel Casting Stage
        var roster = parseRoster(eff.pixelCompanion ? cfg.mascotSpec : 'off');
        document.querySelectorAll('#dr-mascot-presets button').forEach(function (b) {
          var v = b.getAttribute('data-mp');
          var cur = eff.pixelCompanion ? cfg.mascotSpec : 'off';
          b.setAttribute('data-active', cur === v ? '1' : '0');
        });
        var castEl = document.getElementById('dr-cast-grid');
        castEl.innerHTML = CAST_SPECIES.map(function (sp) {
          var isOn = sp.key === 'm' ? Boolean(roster.minis) : Number(roster[sp.key]) > 0;
          return '<button class="op-cast-card" data-sp="' + sp.key + '" data-active="' + (isOn ? '1' : '0') + '">' +
            '<span class="op-cast-dot"></span>' +
            '<canvas class="op-cast-cv" data-cast-kind="' + sp.kind + '"></canvas>' +
            '<span class="op-cast-name">' + sp.name + '</span>' +
          '</button>';
        }).join('');
        paintCastingStageCanvases();
        castEl.querySelectorAll('.op-cast-card').forEach(function (btn) {
          btn.onclick = function () {
            if (locked.pixelCompanion) {
              toast('当前为纯梦境壁纸模式，切换到「纯黑曜光学」或「自由混搭」即可启用桌宠');
              return;
            }
            var k = btn.getAttribute('data-sp');
            var next = Object.assign({}, roster);
            if (k === 'm') next.minis = !next.minis;
            else next[k] = next[k] > 0 ? 0 : 1;
            var encoded = encodeRoster(next);
            cfg.mascotSpec = encoded;
            cfg.modules = Object.assign({}, eff, { pixelCompanion: encoded !== 'off' });
            applyNow();
          };
        });
        // Corner pixel habitat prop selector
        var habs = [['auto', '自动'], ['cactus', '仙人掌'], ['lamp', '台灯'], ['hourglass', '沙漏']];
        var hEl = document.getElementById('dr-hab-seg');
        hEl.innerHTML = habs.map(function (h) {
          return '<button data-hb="' + h[0] + '" data-active="' + ((cfg.habitatMode || 'auto') === h[0] ? '1' : '0') + '">' + h[1] + '</button>';
        }).join('');
        hEl.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () {
            cfg.habitatMode = b.getAttribute('data-hb');
            if (window.__dreamSkinOptical && window.__dreamSkinOptical.setHabitatMode) {
              window.__dreamSkinOptical.setHabitatMode(cfg.habitatMode);
            }
            renderStudioHomePanel();
            applyNow();
          };
        });
        document.getElementById('sw-chroma').setAttribute('data-on', cfg.prismaticCoat ? '1' : '0');

        // Wallpapers & Glass Sliders
        var wallEl = document.getElementById('dr-wall-grid');
        wallEl.innerHTML = state.wallpapers.slice(0, 6).map(function (w) {
          var act = state.selectedWallpaperId === w.id;
          var thumb = w.thumbUrl ? '<img src="' + w.thumbUrl + '" alt="" />' : '';
          return '<button class="op-wall" data-wid="' + w.id + '" data-active="' + (act ? '1' : '0') + '">' +
            thumb + '<span class="op-wall-cap">' + w.title + '</span>' +
          '</button>';
        }).join('');
        wallEl.querySelectorAll('.op-wall').forEach(function (btn) {
          btn.onclick = function () {
            state.selectedWallpaperId = btn.getAttribute('data-wid');
            if (cfg.skinMode === 'optical') {
              cfg.skinMode = 'hybrid';
              cfg.modules = presetModulesForMode('hybrid');
              cfg.glassSurfaces = true;
            }
            applyNow();
          };
        });

        document.querySelectorAll('#dr-layout-seg button').forEach(function (b) {
          b.setAttribute('data-active', cfg.layoutMode === b.getAttribute('data-lay') ? '1' : '0');
        });
        var gOpPct = Math.round((cfg.glassOpacity || 0.62) * 100);
        document.getElementById('sl-glass-op').value = String(gOpPct);
        document.getElementById('val-glass-op').textContent = gOpPct + '%';
        document.getElementById('sl-glass-blur').value = String(cfg.glassBlur || 14);
        document.getElementById('val-glass-blur').textContent = (cfg.glassBlur || 14) + 'px';
        var scPct = Math.round((cfg.scrimOpacity || 0.16) * 100);
        document.getElementById('sl-scrim').value = String(scPct);
        document.getElementById('val-scrim').textContent = scPct + '%';

        // Conflict / auto-guard notice
        var cBox = document.getElementById('dr-conflict-box');
        var msgs = ((state.composition && state.composition.conflicts) || []).map(function (c) { return c.reasonZh; });
        if (msgs.length) { cBox.style.display = 'block'; cBox.textContent = msgs.join(' '); }
        else { cBox.style.display = 'none'; }
      }

      function applyNow() {
        syncHtmlThemeClass();
        applyUnifiedPaletteTokens();
        var activeWp = state.wallpapers.find(function (w) { return w.id === state.selectedWallpaperId; }) || state.wallpapers[0] || null;
        return fetch('/api/preview/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: studioState.appId, config: state.config, activeItem: activeWp }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok) return;
            state.composition = data.composition;
            if (window.__agyPrism && typeof window.__agyPrism.applyPayload === 'function') {
              window.__agyPrism.applyPayload(data.payload);
            }
            renderDrawer();
          })
          .catch(function (err) { toast('更新失败：' + err.message); });
      }

      // ── Event Bindings ────────────────────────────────────────────────────
      var drawer = document.getElementById('ds-drawer');
      var trigger = document.getElementById('ds-studio-trigger');
      drawer.addEventListener('click', function (ev) { ev.stopPropagation(); });
      var openDrawer = function (subtab) {
        if (subtab) state.activeSubtab = subtab;
        drawer.classList.add('open');
        renderDrawer();
      };
      trigger.onclick = function (ev) { ev.stopPropagation(); drawer.classList.toggle('open'); if (drawer.classList.contains('open')) renderDrawer(); };
      document.getElementById('btn-open-drawer-sb').onclick = function (ev) { ev.stopPropagation(); openDrawer('appearance'); };
      document.getElementById('btn-foot-settings').onclick = function (ev) { ev.stopPropagation(); openDrawer('appearance'); };
      document.getElementById('btn-comp-stage').onclick = function (ev) { ev.stopPropagation(); openDrawer('mascot'); };
      document.getElementById('btn-close-drawer').onclick = function () { drawer.classList.remove('open'); };
      var clientPop = document.getElementById('ds-client-pop');
      var clientBtn = document.getElementById('btn-client-switch');
      clientPop.addEventListener('click', function (ev) { ev.stopPropagation(); });
      clientBtn.onclick = function (ev) {
        ev.stopPropagation();
        renderClientMenu();
        clientPop.classList.toggle('open');
      };
      document.addEventListener('click', function (ev) {
        if (drawer.classList.contains('open') && !drawer.contains(ev.target) && !trigger.contains(ev.target)) {
          drawer.classList.remove('open');
        }
        if (clientPop.classList.contains('open') && !clientPop.contains(ev.target) && !clientBtn.contains(ev.target)) {
          clientPop.classList.remove('open');
        }
      });

      // Mode switcher
      document.querySelectorAll('#dr-mode-seg button').forEach(function (btn) {
        btn.onclick = function () {
          var mode = btn.getAttribute('data-mode');
          state.config.skinMode = mode;
          state.config.modules = presetModulesForMode(mode);
          state.config.glassSurfaces = Boolean(state.config.modules.glassLayer);
          applyNow();
        };
      });
      document.querySelectorAll('[data-quick-mode]').forEach(function (btn) {
        btn.onclick = function () {
          var mode = btn.getAttribute('data-quick-mode');
          state.config.skinMode = mode;
          state.config.modules = presetModulesForMode(mode);
          state.config.glassSurfaces = Boolean(state.config.modules.glassLayer);
          applyNow();
        };
      });
      document.getElementById('btn-home-rainbow').onclick = function () {
        state.config.prismaticCoat = !state.config.prismaticCoat;
        if (state.config.skinMode === 'wallpaper') {
          state.config.skinMode = 'hybrid';
          state.config.modules = presetModulesForMode('hybrid');
        }
        applyNow();
        toast(state.config.prismaticCoat ? '已点亮小紫猫彩虹极光羽衣' : '已恢复小紫猫经典紫绒毛');
      };

      // Subtabs
      document.querySelectorAll('#dr-subtabs button').forEach(function (btn) {
        btn.onclick = function () { state.activeSubtab = btn.getAttribute('data-subtab'); renderDrawer(); };
      });

      // Module switches
      document.querySelectorAll('[data-mod-sw]').forEach(function (sw) {
        sw.onclick = function () {
          if (sw.getAttribute('data-locked') === '1') {
            toast('当前模式已自动锁定此项，切到「自由混搭」可任意组合');
            return;
          }
          var k = sw.getAttribute('data-mod-sw');
          var eff = (state.composition && state.composition.effectiveModules) || state.config.modules;
          state.config.modules = Object.assign({}, eff);
          state.config.modules[k] = !eff[k];
          if (k === 'glassLayer') state.config.glassSurfaces = state.config.modules[k];
          applyNow();
        };
      });

      // Scene presets (Obsidian Prism Full / Focus / Eco)
      document.querySelectorAll('#dr-scene-seg button').forEach(function (btn) {
        btn.onclick = function () {
          var s = btn.getAttribute('data-scene');
          if (s === 'ultra') {
            Object.assign(state.config, { motionTier: 'ultra', ambientIntensity: 1, sidebarCompact: false });
            state.config.modules = Object.assign({}, state.config.modules, { opticalFacet: true, rippleField: true, microMotion: true, pixelCompanion: true });
          } else if (s === 'focus') {
            Object.assign(state.config, { motionTier: 'subtle', ambientIntensity: 0.35, sidebarCompact: true });
            state.config.modules = Object.assign({}, state.config.modules, { rippleField: false, pixelCompanion: false });
          } else {
            Object.assign(state.config, { motionTier: 'off', ambientIntensity: 0, sidebarCompact: false });
            state.config.modules = Object.assign({}, state.config.modules, { opticalFacet: false, rippleField: false, microMotion: false, pixelCompanion: false });
          }
          applyNow();
        };
      });

      // Mascot presets + chroma + code toggles
      document.querySelectorAll('#dr-mascot-presets button').forEach(function (btn) {
        btn.onclick = function () {
          var mp = btn.getAttribute('data-mp');
          if (state.config.skinMode === 'wallpaper' && mp !== 'off') {
            toast('当前为纯梦境壁纸模式，切换到「纯黑曜光学」或「自由混搭」即可显示桌宠');
            return;
          }
          state.config.mascotSpec = mp;
          state.config.modules = Object.assign({}, (state.composition && state.composition.effectiveModules) || state.config.modules, { pixelCompanion: mp !== 'off' });
          applyNow();
        };
      });
      document.querySelectorAll('#dr-mascot-theater button').forEach(function (btn) {
        btn.onclick = function () {
          var opt = window.__dreamSkinOptical;
          if (!opt) return;
          var act = btn.getAttribute('data-mact');
          if (act === 'donut') { opt.feedMascot('cat', 'donut'); toast('已投喂甜甜圈'); }
          else if (act === 'coffee') { opt.feedMascot('cat', 'coffee'); toast('已递上热咖啡'); }
          else if (act === 'poke') { opt.pokeMascot('cat'); toast('戳了戳桌宠！'); }
          else if (act === 'cheer') { opt.playMascotDemo('cheer'); toast('双宠同步欢呼剧场已触发'); }
        };
      });
      document.getElementById('sw-chroma').onclick = function () { state.config.prismaticCoat = !state.config.prismaticCoat; applyNow(); };
      document.getElementById('sw-ligatures').onclick = function () { state.config.codeLigatures = !state.config.codeLigatures; applyNow(); };
      document.getElementById('sw-sb-compact').onclick = function () { state.config.sidebarCompact = !state.config.sidebarCompact; applyNow(); };

      // Layout + Glass sliders
      document.querySelectorAll('#dr-layout-seg button').forEach(function (b) {
        b.onclick = function () { state.config.layoutMode = b.getAttribute('data-lay'); applyNow(); };
      });
      document.getElementById('sl-glass-op').oninput = function (e) {
        state.config.glassOpacity = Number(e.target.value) / 100;
        document.getElementById('val-glass-op').textContent = e.target.value + '%';
        applyNow();
      };
      document.getElementById('sl-glass-blur').oninput = function (e) {
        state.config.glassBlur = Number(e.target.value);
        document.getElementById('val-glass-blur').textContent = e.target.value + 'px';
        applyNow();
      };
      document.getElementById('sl-scrim').oninput = function (e) {
        state.config.scrimOpacity = Number(e.target.value) / 100;
        document.getElementById('val-scrim').textContent = e.target.value + '%';
        applyNow();
      };

      // Home vs Conversation view switching (with smooth cross-fade + vertical glide)
      function setView(v) {
        var prev = document.body.getAttribute('data-view');
        document.body.setAttribute('data-view', v);
        document.getElementById('tab-view-home').setAttribute('aria-selected', v === 'home' ? 'true' : 'false');
        document.getElementById('tab-view-conv').setAttribute('aria-selected', v === 'conv' ? 'true' : 'false');
        document.getElementById('btn-go-home').classList.toggle('is-active', v === 'home');
        if (prev !== v) {
          animateViewSwap(document.getElementById(v === 'home' ? 'view-home' : 'view-conv'));
        }
      }
      document.getElementById('tab-view-home').onclick = function () { setView('home'); };
      document.getElementById('tab-view-conv').onclick = function () { setView('conv'); };
      document.getElementById('btn-go-home').onclick = function () { setView('home'); };

      bindSessionRows();

      // 25-minute Flow Pomodoro Micro-Pill (auto-activates pixel hourglass + dual-mascot cheer on finish!)
      var pomoBtn = document.getElementById('btn-pomo-pill');
      var pomoTimeEl = document.getElementById('pomo-time');
      function renderPomo() {
        var mm = String(Math.floor(studioState.pomoLeft / 60)).padStart(2, '0');
        var ss = String(studioState.pomoLeft % 60).padStart(2, '0');
        if (pomoTimeEl) pomoTimeEl.textContent = mm + ':' + ss;
        if (pomoBtn) pomoBtn.setAttribute('data-running', studioState.pomoRunning ? '1' : '0');
      }
      pomoBtn.onclick = function () {
        if (studioState.pomoRunning) {
          clearInterval(studioState.pomoTimer);
          studioState.pomoRunning = false;
          studioState.pomoLeft = 25 * 60;
          renderPomo();
          toast('心流专注计时已重置');
          return;
        }
        studioState.pomoRunning = true;
        state.config.habitatMode = 'hourglass';
        if (window.__dreamSkinOptical) {
          if (window.__dreamSkinOptical.setHabitatMode) window.__dreamSkinOptical.setHabitatMode('hourglass');
          if (window.__dreamSkinOptical.notifyMascot) window.__dreamSkinOptical.notifyMascot('slash-cmd', { cmd: '/schedule' });
        }
        renderPomo();
        renderStudioHomePanel();
        toast('⏳ 已开启 25 分钟心流专注 · 角隅自动点亮像素沙漏');
        clearInterval(studioState.pomoTimer);
        studioState.pomoTimer = setInterval(function () {
          if (!studioState.pomoRunning) return;
          studioState.pomoLeft = Math.max(0, studioState.pomoLeft - 1);
          renderPomo();
          if (studioState.pomoLeft === 0) {
            clearInterval(studioState.pomoTimer);
            studioState.pomoRunning = false;
            studioState.pomoLeft = 25 * 60;
            renderPomo();
            if (window.__dreamSkinOptical && window.__dreamSkinOptical.playMascotDemo) {
              window.__dreamSkinOptical.playMascotDemo('cheer');
            }
            toast('🎉 25 分钟心流达成！Clawd 和小紫猫为你放烟花欢呼！');
          }
        }, 1000);
      };

      // Code copy with animated-icons check morph + real mascot code-copied hook
      document.getElementById('btn-copy-code').onclick = function () {
        var lbl = document.getElementById('copy-code-lbl');
        lbl.textContent = '已复制';
        if (window.__agMotionEngine && window.__agMotionEngine.triggerIcon) {
          window.__agMotionEngine.triggerIcon(this, 'check', { revertAfterMs: 1400 });
        }
        if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
          window.__dreamSkinOptical.notifyMascot('code-copied', {});
        }
        setTimeout(function () { lbl.textContent = '复制'; }, 1400);
      };

      // Live AI Task Running / Streaming Simulation (shows real busy mascots, prism stream bar, sidebar pulse & completion cheer!)
      var simState = { running: false, timer: null, step: 0, msgEl: null, thoughtEl: null };
      var simBtnHdr = document.getElementById('btn-sim-task');
      var simBtnHome = document.getElementById('btn-home-sim-task');
      var sendBtnEl = document.getElementById('btn-send-demo');
      var SIM_CHUNKS = [
        '正在扫描本机 DSH NEXT 2.0.24-next 与其余 13 款客户端适配器… ',
        '已检测到多插件共存环境，自动启用流式防卡顿降频保护（背景画布让出 65% GPU 像素开销）。\\n\\n',
        '1. 像素双宠（Clawd + 小紫猫）已切换为原版阵营工作态（主模型干活、伙伴休整，完成同步欢呼）；\\n',
        '2. 左侧运行中对话亮起原版彩虹流光竖条与旋转棱镜星轨，输入框顶部浮现思考流光与旋转棱镜停止键；\\n',
        '3. 所有 DSH 官方 --dsw-* 插件变量保持实时同步，绝不遮挡审批卡与右侧抽屉。\\n\\n',
        '✓ 全部 14 端状态检查通过，任务执行完成！'
      ];
      var PLAY_SVG = '<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 2.1c0-.62.68-1 1.21-.68l6.1 3.9a.8.8 0 0 1 0 1.36l-6.1 3.9A.8.8 0 0 1 3 9.9V2.1Z"/></svg><span>模拟运行任务</span>';
      var STOP_SVG = '<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="2"/></svg><span>停止模拟</span>';
      function spawnLiftoffRing(anchorEl) {
        if (!anchorEl) return;
        var r = anchorEl.getBoundingClientRect();
        var ring = document.createElement('div');
        ring.className = 'ag-cs-liftoff-ring';
        ring.style.left = Math.round(r.left + r.width / 2) + 'px';
        ring.style.top = Math.round(r.top + r.height / 2) + 'px';
        document.body.appendChild(ring);
        setTimeout(function () { if (ring.parentNode) ring.parentNode.removeChild(ring); }, 560);
      }
      function stopTaskSimulation(aborted) {
        if (!simState.running) return;
        clearInterval(simState.timer);
        simState.timer = null;
        simState.running = false;
        if (simBtnHdr) { simBtnHdr.setAttribute('data-running', '0'); simBtnHdr.innerHTML = PLAY_SVG; }
        if (simBtnHome) simBtnHome.textContent = '看任务运行中效果';
        if (sendBtnEl) {
          sendBtnEl.removeAttribute('data-streaming');
          sendBtnEl.removeAttribute('data-testid');
          sendBtnEl.setAttribute('title', '发送消息');
          sendBtnEl.setAttribute('aria-label', '发送消息');
          sendBtnEl.innerHTML = '<span data-icon-slot="arrow-up-launch"></span>';
          hydrateIcons();
        }
        if (simState.thoughtWrap) simState.thoughtWrap.removeAttribute('data-ag-cs-thought-streaming');
        if (simState.respEl) simState.respEl.removeAttribute('data-chat-streaming');
        if (simState.thoughtSpin && simState.thoughtSpin.parentNode) {
          var doneBadge = document.createElement('span');
          doneBadge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex-shrink:0;';
          doneBadge.innerHTML = aborted
            ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="#94a3b8" stroke-width="1.4"/><rect x="4.5" y="4.5" width="3" height="3" rx="0.6" fill="#94a3b8"/></svg>'
            : '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="rgba(52,211,153,0.16)" stroke="#34d399" stroke-width="1.2"/><path d="M4.3 7.2 6.1 9 9.7 5.2" stroke="#34d399" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          simState.thoughtSpin.parentNode.replaceChild(doneBadge, simState.thoughtSpin);
          simState.thoughtSpin = null;
        }
        if (simState.thoughtEl) {
          simState.thoughtEl.textContent = aborted
            ? '已手动中止任务 · 双宠返回待机'
            : '已完成深度思考与多端校验 · 耗时 6.4s · 0 掉帧';
        }
        if (window.__dreamSkinOptical && window.__dreamSkinOptical.setStreaming) {
          window.__dreamSkinOptical.setStreaming(false, { hasError: false, silent: Boolean(aborted) });
        }
        toast(aborted ? '已中止模拟任务' : '✓ 任务运行完成 · 左侧声呐光晕 + 双宠欢呼提醒！');
      }
      function startTaskSimulation() {
        if (simState.running) { stopTaskSimulation(true); return; }
        setView('conv');
        simState.running = true;
        simState.step = 0;
        if (simBtnHdr) { simBtnHdr.setAttribute('data-running', '1'); simBtnHdr.innerHTML = STOP_SVG; }
        if (simBtnHome) simBtnHome.textContent = '停止模拟任务';
        if (sendBtnEl) {
          sendBtnEl.setAttribute('data-streaming', '1');
          sendBtnEl.setAttribute('data-testid', 'input-cancel-button');
          sendBtnEl.setAttribute('title', '停止生成');
          sendBtnEl.setAttribute('aria-label', '停止生成');
          sendBtnEl.innerHTML = '<span></span>';
          spawnLiftoffRing(sendBtnEl);
        }
        var flow = document.querySelector('[data-slot="conversation.chat.flow"]');
        var resp = document.createElement('div');
        resp.setAttribute('data-chat-group-part', 'response');
        resp.setAttribute('data-chat-streaming', '1');
        var th = document.createElement('div');
        th.className = 'thought-trigger';
        th.innerHTML = '<span class="ag-cs-orbit-spinner" style="width:14px !important;height:14px !important;min-width:14px !important;"><span data-agent-state-dot="1"></span></span><span class="sim-th-txt">DeepSeek-R1 正在深度思考并实时输出…（观察左侧旋转星轨、双宠与右下角棱镜停止环）</span>';
        var thoughtWrap = document.createElement('div');
        thoughtWrap.setAttribute('data-ag-cs-thought-streaming', '1');
        thoughtWrap.style.cssText = 'margin: 6px 0 8px; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #98a2b3);';
        thoughtWrap.textContent = '▸ 思考链路：检测本机 DSH NEXT 2.0.24-next 插件变量 → 启用流式降频退让 → 激活双宠工作态与左侧星轨…';
        var bodyP = document.createElement('p');
        bodyP.className = 'resp-p ag-cs-stream-chunk';
        bodyP.style.whiteSpace = 'pre-wrap';
        bodyP.textContent = '';
        resp.appendChild(th);
        resp.appendChild(thoughtWrap);
        resp.appendChild(bodyP);
        flow.appendChild(resp);
        simState.msgEl = bodyP;
        simState.thoughtEl = th.querySelector('.sim-th-txt');
        simState.thoughtSpin = th.querySelector('.ag-cs-orbit-spinner');
        simState.thoughtWrap = thoughtWrap;
        simState.respEl = resp;
        var sc = document.querySelector('[data-conversation-scroll]');
        if (sc) sc.scrollTop = sc.scrollHeight;
        if (window.__dreamSkinOptical && window.__dreamSkinOptical.setStreaming) {
          window.__dreamSkinOptical.setStreaming(true, { tier: 2 });
        }
        toast('⚡ 原版运行态已启动 · 左侧彩虹条+星轨 / 思考彗星 / 旋转棱镜停止键 / 双宠工作态');
        var fullText = SIM_CHUNKS.join('');
        var charIdx = 0;
        simState.timer = setInterval(function () {
          if (!simState.running) return;
          charIdx = Math.min(fullText.length, charIdx + 5);
          if (simState.msgEl) simState.msgEl.textContent = fullText.slice(0, charIdx);
          studioState.ctxPct = Math.min(92, studioState.ctxPct + 0.14);
          var tpsEl = document.getElementById('comp-tps');
          if (tpsEl) tpsEl.textContent = (78 + Math.random() * 14).toFixed(1) + ' t/s';
          syncTelemetryBars();
          if (sc) sc.scrollTop = sc.scrollHeight;
          if (charIdx >= fullText.length) {
            resp.removeAttribute('data-chat-streaming');
            stopTaskSimulation(false);
          }
        }, 120);
      }
      if (simBtnHdr) simBtnHdr.onclick = startTaskSimulation;
      if (simBtnHome) simBtnHome.onclick = startTaskSimulation;

      // Send demo message + real mascot send / slash-cmd reactions
      var sendDemo = function () {
        if (simState.running) { stopTaskSimulation(true); return; }
        var inp = document.getElementById('dsh-input');
        var txt = (inp.value || '').trim();
        if (!txt) return;
        setView('conv');
        var flow = document.querySelector('[data-slot="conversation.chat.flow"]');
        var u = document.createElement('div');
        u.setAttribute('data-chat-flow-kind', 'user');
        var b = document.createElement('div');
        b.setAttribute('data-message-bubble', '');
        b.textContent = txt;
        u.appendChild(b);
        flow.appendChild(u);
        inp.value = '';
        studioState.ctxPct = Math.min(96, studioState.ctxPct + 2.4);
        syncTelemetryBars();
        renderTurnRail();
        if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
          if (txt.charAt(0) === '/') {
            var cmdToken = txt.split(' ')[0].toLowerCase();
            window.__dreamSkinOptical.notifyMascot('slash-cmd', { cmd: cmdToken });
          } else {
            window.__dreamSkinOptical.notifyMascot('send', {});
          }
        }
        var sc = document.querySelector('[data-conversation-scroll]');
        sc.scrollTop = sc.scrollHeight;
      };
      document.getElementById('btn-send-demo').onclick = sendDemo;
      document.getElementById('dsh-input').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendDemo(); }
      });

      // Save to live selected app & Sync All Installed Apps & Reset
      document.getElementById('btn-save-live').onclick = function () {
        var activeWp = state.wallpapers.find(function (w) { return w.id === state.selectedWallpaperId; }) || state.wallpapers[0] || null;
        fetch('/api/preview/apply-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: studioState.appId, config: state.config, activeItem: activeWp }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok) toast('已同步写入本机 ' + currentClient().name + '（' + modeLabel(d.skinMode) + '）');
            else toast('写入失败：' + (d && d.error || '未知错误'));
          })
          .catch(function (e) { toast('同步失败：' + e.message); });
      };
      document.getElementById('btn-sync-all').onclick = function () {
        var activeWp = state.wallpapers.find(function (w) { return w.id === state.selectedWallpaperId; }) || state.wallpapers[0] || null;
        fetch('/api/preview/sync-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: state.config, activeItem: activeWp }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok) toast('已一键同步当前风格至全部 ' + (d.syncedCount || 11) + ' 款兼容客户端（已自动避让 Antigravity）');
            else toast('全端同步失败：' + (d && d.error || '未知错误'));
          })
          .catch(function (e) { toast('全端同步失败：' + e.message); });
      };
      document.getElementById('btn-reset-def').onclick = function () {
        state.config = defaultConfig();
        applyNow();
        toast('已恢复默认光学配置');
      };

      // Studio Home Dashboard, Floating Telemetry Popover & Global Command Palette (Ctrl+K)
      document.querySelectorAll('#studio-tabs button').forEach(function (b) {
        b.onclick = function () { studioState.tab = b.getAttribute('data-stab'); renderStudioHomePanel(); };
      });
      document.querySelectorAll('#studio-ranges button').forEach(function (b) {
        b.onclick = function () { studioState.range = b.getAttribute('data-srange'); renderStudioHomePanel(); };
      });

      var telPop = document.getElementById('ds-telemetry-pop');
      var telPill = document.getElementById('btn-telemetry-pill');
      var sbQuotaPill = document.getElementById('btn-sb-quota-pill');
      var toggleTelPop = function (force) {
        var next = typeof force === 'boolean' ? force : !telPop.classList.contains('open');
        telPop.classList.toggle('open', next);
        if (next && typeof toggleModelPop === 'function') toggleModelPop(false);
        telPill.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (next) {
          drawer.classList.remove('open');
          renderMultiQuota();
          syncTelemetryBars();
          if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
            window.__dreamSkinOptical.notifyMascot('vial-opened', {});
          }
        }
      };
      telPop.addEventListener('click', function (ev) { ev.stopPropagation(); });
      telPill.onclick = function (ev) { ev.stopPropagation(); toggleTelPop(); };
      sbQuotaPill.onclick = function (ev) { ev.stopPropagation(); toggleTelPop(); };
      document.getElementById('btn-pop-close').onclick = function () { toggleTelPop(false); };
      document.getElementById('btn-pop-refresh').onclick = function () {
        QUOTA_SOURCES.forEach(function (q) {
          var delta = (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2);
          q.pct5h = Math.max(12, Math.min(99, q.pct5h + delta));
        });
        var tps = (68 + Math.random() * 18).toFixed(1);
        document.getElementById('comp-tps').textContent = tps + ' t/s';
        renderMultiQuota();
        if (studioState.tab === 'quotas') renderStudioHomePanel();
        toast('已刷新 4 个配额来源与实时吞吐指标');
      };
      document.addEventListener('click', function (ev) {
        if (telPop.classList.contains('open') && !telPop.contains(ev.target) && !telPill.contains(ev.target) && !sbQuotaPill.contains(ev.target)) {
          toggleTelPop(false);
        }
        if (modelPop && modelPop.classList.contains('open') && !modelPop.contains(ev.target) && !modelBtn.contains(ev.target)) {
          toggleModelPop(false);
        }
      });

      // Authentic Model Selector + Native AntigravityCodexEffortSlider (22-particle accelerating starfield + Claude pixel dither)
      var EFFORT_LEVELS = [
        { effort: 'off', label: '关闭' },
        { effort: 'low', label: '低' },
        { effort: 'medium', label: '中等' },
        { effort: 'high', label: '高' },
        { effort: 'xhigh', label: '超高' },
      ];
      var MODEL_CATALOG = [
        { id: 'deepseek-r1', name: 'DeepSeek-R1', camp: 'deepseek', effort: 'xhigh', tag: '主力', icon: 'spark' },
        { id: 'gemini-4-neon', name: 'Gemini 4 Neon', camp: 'gemini', effort: 'xhigh', tag: '新', icon: 'spark' },
        { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', camp: 'gemini', effort: 'high', tag: '新', icon: 'spark' },
        { id: 'claude-opus-55', name: 'Claude Opus 5.5', camp: 'claude', effort: 'high', tag: '点阵', icon: 'claude' },
        { id: 'claude-sonnet-55', name: 'Claude Sonnet 5.5', camp: 'claude', effort: 'medium', tag: '点阵', icon: 'claude' },
        { id: 'gpt-52-codex', name: 'GPT-5.2 Codex', camp: 'gpt', effort: 'high', tag: 'Codex', icon: 'gpt' },
      ];
      var activeModelId = 'deepseek-r1';
      var modelPop = document.getElementById('ds-model-pop');
      var modelBtn = document.getElementById('btn-comp-model');
      var modelListEl = document.getElementById('ds-model-list');
      var modelEffBadgeEl = document.getElementById('comp-model-effort');
      var modelEffRowEl = document.getElementById('ds-model-effort-row');
      var modelEffValEl = document.getElementById('ds-model-effort-val');
      var realEffMountEl = document.getElementById('ds-real-effort-mount');
      var modelOpenUsageBtn = document.getElementById('btn-model-open-usage');
      var realEffortHandle = null;

      var getActiveModel = function () {
        for (var i = 0; i < MODEL_CATALOG.length; i += 1) {
          if (MODEL_CATALOG[i].id === activeModelId) return MODEL_CATALOG[i];
        }
        return MODEL_CATALOG[0];
      };
      var effortMetaOf = function (key, isClaude) {
        var idx = 3;
        for (var i = 0; i < EFFORT_LEVELS.length; i += 1) {
          if (EFFORT_LEVELS[i].effort === key) { idx = i; break; }
        }
        var item = EFFORT_LEVELS[idx];
        var isMax = idx === EFFORT_LEVELS.length - 1;
        var lib = window.AntigravityCodexEffortSlider;
        var color = (lib && typeof lib.valueColorFor === 'function')
          ? lib.valueColorFor(item.label, idx, EFFORT_LEVELS.length, isMax, true, Boolean(isClaude), 'follow')
          : (idx <= 0 ? '#94a3b8' : idx <= 2 ? '#60a5fa' : idx === 3 ? '#9466f5' : '#b77cff');
        return { idx: idx, effort: item.effort, label: item.label, isMax: isMax, color: color || '#60a5fa' };
      };
      var modelIconSvg = function (kind, active) {
        if (kind === 'claude') {
          return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + (active ? '#c4b5fd' : 'currentColor') + '" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg>';
        }
        if (kind === 'gpt') {
          return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + (active ? '#7dd3fc' : 'currentColor') + '" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 6.9 4M12 20a8 8 0 0 1-6.9-4"/></svg>';
        }
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (active ? '#60a5fa' : 'currentColor') + '" opacity="' + (active ? '1' : '0.68') + '"><path d="M12 2.5C12 8 16 12 21.5 12 16 12 12 16 12 21.5 12 16 8 12 2.5 12 8 12 12 8 12 2.5Z"/></svg>';
      };
      var syncModelTriggerUi = function () {
        var m = getActiveModel();
        var isCl = /claude/i.test(m.name);
        var meta = effortMetaOf(m.effort, isCl);
        var lbl = document.getElementById('comp-model-label');
        if (lbl) lbl.textContent = m.name;
        if (modelEffBadgeEl) {
          modelEffBadgeEl.textContent = meta.label;
          modelEffBadgeEl.style.color = meta.color;
        }
        var popModelName = document.getElementById('pop-model-name');
        if (popModelName) popModelName.textContent = m.name;
      };
      var renderModelList = function () {
        if (!modelListEl) return;
        modelListEl.innerHTML = MODEL_CATALOG.map(function (m) {
          var isAct = m.id === activeModelId;
          var isCl = /claude/i.test(m.name);
          var meta = effortMetaOf(m.effort, isCl);
          return '<button class="mdl-row" data-mid="' + m.id + '" data-active="' + (isAct ? '1' : '0') + '">' +
            '<span class="mdl-row-ico">' + modelIconSvg(m.icon, isAct) + '</span>' +
            '<span class="mdl-row-name">' + m.name + '</span>' +
            '<span class="mdl-row-eff" style="color:' + meta.color + '">' + meta.label + '</span>' +
            (m.tag ? '<span class="mdl-row-tag">' + m.tag + '</span>' : '') +
          '</button>';
        }).join('');
        modelListEl.querySelectorAll('.mdl-row').forEach(function (btn) {
          btn.onclick = function () {
            var mid = btn.getAttribute('data-mid');
            if (!mid) return;
            activeModelId = mid;
            var m = getActiveModel();
            syncModelTriggerUi();
            renderModelList();
            mountRealEffortSlider();
            if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
              window.__dreamSkinOptical.notifyMascot('model-shift', { model: m.name });
            }
            if (window.__dreamSkinOptical && window.__dreamSkinOptical.setCamp) {
              window.__dreamSkinOptical.setCamp(m.camp || m.name);
            }
          };
        });
      };
      var mountRealEffortSlider = function () {
        if (realEffortHandle && typeof realEffortHandle.unmount === 'function') {
          try { realEffortHandle.unmount(); } catch (_) {}
          realEffortHandle = null;
        }
        var lib = window.AntigravityCodexEffortSlider;
        if (!realEffMountEl || !lib || typeof lib.mountCodexEffortSlider !== 'function') return;
        var seat = {
          _read: function () {
            var m = getActiveModel();
            var isCl = /claude/i.test(m.name);
            return {
              baseName: m.name,
              isClaude: isCl,
              theme: isCl ? 'claude' : 'codex',
              locked: false,
              levels: EFFORT_LEVELS,
              currentEffort: m.effort,
            };
          },
          selectEffort: function (item) {
            var m = getActiveModel();
            var key = (item && item.effort) || String(item || 'high');
            m.effort = key;
            syncModelTriggerUi();
            renderModelList();
            if (window.__dreamSkinOptical && window.__dreamSkinOptical.notifyMascot) {
              window.__dreamSkinOptical.notifyMascot('effort-tier', { tier: key });
            }
          },
        };
        realEffortHandle = lib.mountCodexEffortSlider({
          container: realEffMountEl,
          row: modelEffRowEl,
          valueElement: modelEffValEl,
          seat: seat,
          document: document,
          window: window,
          onVisualChange: function (vis) {
            if (!vis) return;
            var m = getActiveModel();
            var isCl = /claude/i.test(m.name);
            var meta = effortMetaOf(vis.effort || m.effort, isCl);
            if (modelEffBadgeEl) {
              modelEffBadgeEl.textContent = vis.label || meta.label;
              modelEffBadgeEl.style.color = meta.color;
            }
          },
        });
      };
      var toggleModelPop = function (force) {
        if (!modelPop || !modelBtn) return;
        var next = typeof force === 'boolean' ? force : !modelPop.classList.contains('open');
        modelPop.classList.toggle('open', next);
        modelBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (next) {
          toggleTelPop(false);
          drawer.classList.remove('open');
          var r = modelBtn.getBoundingClientRect();
          modelPop.style.left = Math.max(12, Math.min(window.innerWidth - 324, Math.round(r.left - 8))) + 'px';
          renderModelList();
          mountRealEffortSlider();
        }
      };
      if (modelPop) modelPop.addEventListener('click', function (ev) { ev.stopPropagation(); });
      if (modelBtn) modelBtn.onclick = function (ev) { ev.stopPropagation(); toggleModelPop(); };
      if (modelOpenUsageBtn) {
        modelOpenUsageBtn.onclick = function (ev) {
          ev.stopPropagation();
          toggleModelPop(false);
          toggleTelPop(true);
        };
      }
      window.__dsPreviewModelApi = {
        open: function () { toggleModelPop(true); },
        close: function () { toggleModelPop(false); },
        selectModel: function (id) {
          activeModelId = id;
          syncModelTriggerUi();
          renderModelList();
          mountRealEffortSlider();
        },
        setEffort: function (key) {
          var m = getActiveModel();
          m.effort = key;
          syncModelTriggerUi();
          renderModelList();
          mountRealEffortSlider();
        },
      };
      syncModelTriggerUi();

      // Global Command Palette (Ctrl+K) + Zen Mode (Ctrl+Shift+Z)
      var cmdBackdrop = document.getElementById('ds-cmd-backdrop');
      var cmdInput = document.getElementById('ds-cmd-input');
      var cmdList = document.getElementById('ds-cmd-list');
      var setZen = function (on) {
        studioState.zen = typeof on === 'boolean' ? on : !studioState.zen;
        document.body.setAttribute('data-zen', studioState.zen ? '1' : '0');
        toast(studioState.zen ? '已进入 Zen 专注模式（Ctrl+Shift+Z 退出）' : '已退出 Zen 专注模式');
      };
      var buildCommands = function () {
        var clientCmds = ADAPTED_CLIENTS.map(function (c) {
          return { title: '切换预览客户端：' + c.name + ' (' + c.ver + ')', sub: c.channel + ' · ' + c.model, run: function () { switchClient(c.id); } };
        });
        return [
          { title: '一键同步当前风格到全部已装软件', sub: '覆盖 DSH / Cherry / Codex / ZCode / OpenCode / MiniMax / Qoder / VS Code 等', run: function () { document.getElementById('btn-sync-all').click(); } },
          { title: '开启 / 重置 25 分钟心流番茄钟', sub: '自动点亮角隅像素沙漏，结束时双宠欢呼', run: function () { document.getElementById('btn-pomo-pill').click(); } },
          { title: '触发随机桌宠惊喜彩蛋', sub: '甜甜圈 / 热咖啡 / 双宠欢呼 / 戳耳朵 / 规划蓝图', run: function () { triggerRandomMascotEgg(); } },
          { title: '切换风格配色：深空黑曜 (Obsidian)', sub: '统一冷蓝紫主色 · 经典深空', run: function () { state.config.colorScheme = 'prism-default'; state.config.themeMode = 'dark'; applyNow(); } },
          { title: '切换风格配色：暖炭玄岩 (Amber Ink)', sub: '琥珀暖铜主色 · 舒适阅读', run: function () { state.config.colorScheme = 'warm-carbon'; state.config.themeMode = 'dark'; applyNow(); } },
          { title: '切换风格配色：霓虹夜城 (Tokyo Cyber)', sub: '电青 × 紫晶风格化主色', run: function () { state.config.colorScheme = 'tokyo-night'; state.config.themeMode = 'dark'; applyNow(); } },
          { title: '切换风格配色：绯樱暮色 (Rose Velvet)', sub: '绯樱粉 × 鸢尾紫丝绒主色', run: function () { state.config.colorScheme = 'rose-pine'; state.config.themeMode = 'dark'; applyNow(); } },
          { title: '切换风格配色：白昼冷晶 (Crystal 浅色)', sub: 'Daylight Crystal 浅色水彩光幕', run: function () { state.config.colorScheme = 'prism-default'; state.config.themeMode = 'light'; applyNow(); } },
          { title: '切换风格配色：暖白画册 (Alabaster 浅色)', sub: '温润纸白 × 暖陶主色', run: function () { state.config.colorScheme = 'warm-carbon'; state.config.themeMode = 'light'; applyNow(); } },
          { title: '切换背景光效：柔和护眼 (Soft)', sub: '低饱和沉静背景，突出前景文字', run: function () { state.config.vividness = 'soft'; applyNow(); } },
          { title: '切换背景光效：雅致平衡 (Balanced)', sub: '推荐默认 · 克制和谐的棱镜地平线', run: function () { state.config.vividness = 'balanced'; applyNow(); } },
          { title: '切换背景光效：鲜艳极光 (Vivid)', sub: '高饱和色散与呼吸极光', run: function () { state.config.vividness = 'vivid'; applyNow(); } },
          { title: '切换字体气质：人文衬线 / 极客等宽 / 现代无衬线', sub: '循环切换全局 UI 字体风格', run: function () { var order = ['modern', 'editorial', 'mono']; studioState.fontStyle = order[(order.indexOf(studioState.fontStyle) + 1) % 3]; state.config.fontStyle = studioState.fontStyle; applyUnifiedPaletteTokens(); applyNow(); } },
          { title: '切换标题文字色彩：流光渐变 / 鲜明单色 / 素雅克制', sub: '循环切换风格化文字色彩', run: function () { var order = ['stylized', 'crisp', 'minimal']; studioState.textStyle = order[(order.indexOf(studioState.textStyle) + 1) % 3]; state.config.textStyle = studioState.textStyle; applyUnifiedPaletteTokens(); applyNow(); } },
          { title: '切换模式：纯黑曜光学', sub: 'WebGL2 棱镜地平线 + 300Hz 光带 + 双宠', run: function () { state.config.skinMode = 'optical'; state.config.modules = presetModulesForMode('optical'); state.config.glassSurfaces = false; applyNow(); } },
          { title: '切换模式：纯梦境壁纸', sub: '本机/动态壁纸 + 浮岛液态玻璃', run: function () { state.config.skinMode = 'wallpaper'; state.config.modules = presetModulesForMode('wallpaper'); state.config.glassSurfaces = true; applyNow(); } },
          { title: '切换模式：自由混搭', sub: '壁纸液态玻璃 + 300Hz 棱镜 + 像素双宠', run: function () { state.config.skinMode = 'hybrid'; state.config.modules = presetModulesForMode('hybrid'); state.config.glassSurfaces = true; applyNow(); } },
          { title: '点亮 / 关闭小紫猫彩虹极光羽衣', sub: '原版隐藏彩蛋', run: function () { document.getElementById('btn-home-rainbow').click(); } },
          { title: '召唤四宠同台 (Clawd + 小紫猫 + 银白龙 + Deepy)', sub: '桌宠选角舞台', run: function () { state.config.mascotSpec = 'quad'; state.config.modules = Object.assign({}, state.config.modules, { pixelCompanion: true }); applyNow(); } },
          { title: '打开自适应上下文试管与多源配额浮窗', sub: 'DeepSeek / Claude / Gemini / Codex', run: function () { toggleTelPop(true); } },
          { title: '打开模型选择与原版星轨推理滑块', sub: '关闭 / 低 / 中等 / 高 / 超高（支持加速星尘与 Claude 点阵）', run: function () { toggleModelPop(true); } },
          { title: '切换 Zen 专注模式 (隐藏/显示侧栏)', sub: 'Ctrl+Shift+Z', run: function () { setZen(); } },
          { title: '切换视图：首页光场 / 对话视图', sub: 'Studio Home ⇄ Conversation', run: function () { setView(document.body.getAttribute('data-view') === 'home' ? 'conv' : 'home'); } },
        ].concat(clientCmds);
      };
      var filteredCmds = [];
      var renderCmdList = function () {
        var q = (cmdInput.value || '').trim().toLowerCase();
        filteredCmds = buildCommands().filter(function (c) {
          return !q || c.title.toLowerCase().indexOf(q) >= 0 || c.sub.toLowerCase().indexOf(q) >= 0;
        });
        if (studioState.cmdIndex >= filteredCmds.length) studioState.cmdIndex = 0;
        cmdList.innerHTML = filteredCmds.map(function (c, idx) {
          return '<button class="cmd-item" data-cidx="' + idx + '" data-active="' + (idx === studioState.cmdIndex ? '1' : '0') + '">' +
            '<span>' + c.title + '</span><span class="cmd-item-sub">' + c.sub + '</span>' +
          '</button>';
        }).join('');
        cmdList.querySelectorAll('.cmd-item').forEach(function (b) {
          b.onclick = function () {
            var c = filteredCmds[Number(b.getAttribute('data-cidx'))];
            closeCmd();
            if (c) c.run();
          };
        });
      };
      var openCmd = function () {
        drawer.classList.remove('open');
        toggleTelPop(false);
        toggleModelPop(false);
        cmdBackdrop.classList.add('open');
        cmdInput.value = '';
        studioState.cmdIndex = 0;
        renderCmdList();
        setTimeout(function () { cmdInput.focus(); }, 20);
      };
      var closeCmd = function () { cmdBackdrop.classList.remove('open'); };
      document.getElementById('btn-open-cmd').onclick = openCmd;
      cmdBackdrop.onclick = function (ev) { if (ev.target === cmdBackdrop) closeCmd(); };
      cmdInput.oninput = function () { studioState.cmdIndex = 0; renderCmdList(); };
      cmdInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { closeCmd(); return; }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); studioState.cmdIndex = (studioState.cmdIndex + 1) % Math.max(1, filteredCmds.length); renderCmdList(); }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); studioState.cmdIndex = (studioState.cmdIndex - 1 + Math.max(1, filteredCmds.length)) % Math.max(1, filteredCmds.length); renderCmdList(); }
        if (ev.key === 'Enter' && filteredCmds[studioState.cmdIndex]) { ev.preventDefault(); var c = filteredCmds[studioState.cmdIndex]; closeCmd(); c.run(); }
      });
      document.addEventListener('keydown', function (ev) {
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); if (cmdBackdrop.classList.contains('open')) closeCmd(); else openCmd(); }
        else if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); setZen(); }
        else if (ev.key === 'Escape') { closeCmd(); toggleTelPop(false); toggleModelPop(false); drawer.classList.remove('open'); }
      });

      // Boot
      applyUnifiedPaletteTokens();
      hydrateIcons();
      renderClientMenu();
      renderMultiQuota();
      syncTelemetryBars();
      renderTurnRail();
      renderStudioHomePanel();
      setInterval(syncMascotMoodChip, 1200);
      var initApp = qs.get('app');
      if (initApp && ADAPTED_CLIENTS.some(function (x) { return x.id === initApp; })) {
        studioState.appId = initApp;
      }
      fetch('/api/preview/bootstrap')
        .then(function (r) { return r.json(); })
        .then(function (boot) {
          state.wallpapers = boot.wallpapers || [];
          if (boot.installedVersions && typeof boot.installedVersions === 'object') {
            ADAPTED_CLIENTS.forEach(function (c) {
              if (boot.installedVersions[c.id]) c.ver = boot.installedVersions[c.id];
            });
            var cur = currentClient();
            var sbVer = document.getElementById('sb-app-ver');
            if (sbVer && cur) sbVer.textContent = cur.ver;
            renderClientMenu();
          }
          if (state.wallpapers.length) state.selectedWallpaperId = state.wallpapers[0].id;
          if (qs.get('panel') === 'open') drawer.classList.add('open');
          if (qs.get('pop') === 'open') toggleTelPop(true);
          setView(qs.get('view') === 'conv' ? 'conv' : 'home');
          syncSidebarActivePill(true);
          if (studioState.appId !== 'dsh') { switchClient(studioState.appId); return; }
          return applyNow();
        });
      window.addEventListener('resize', function () { syncSidebarActivePill(true); });
    })();
  </script>
</body>
</html>`;
}

export function startPreviewServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
      const p = url.pathname;

      if (p === '/' || p === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(renderPreviewHtml());
        return;
      }

      const appIconMatch = /^\/app-icon\/([a-z0-9-]+)\.png$/i.exec(p);
      if (appIconMatch) {
        const iconId = appIconMatch[1].toLowerCase();
        const iconPath = join(APP_ICONS_DIR, `${iconId}.png`);
        if (existsSync(iconPath)) {
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
          res.end(readFileSync(iconPath));
          return;
        }
        res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' });
        res.end(getFallbackAppIconSvg(iconId));
        return;
      }

      if (p === '/optical-bundle.js') {
        res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
        res.end(getHostOpticalScript({ reload: true }));
        return;
      }

      if (p === '/wallpaper-inject.js') {
        res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
        res.end(getHostSkinScript({ reload: true, includeOptical: false }));
        return;
      }

      if (p === '/api/preview/bootstrap') {
        const wallpapers = scanLocalWallpapers();
        const { effective } = loadCurrentDshConfig();
        const installedVersions = detectInstalledClientVersions();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true, version: VERSION, wallpapers, effective, installedVersions }));
        return;
      }

      if (p === '/api/preview/compile' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const origin = `http://127.0.0.1:${PORT}`;
        const { profile, composition, payload } = compileAppPayload(body.appId || 'dsh', body.config || {}, body.activeItem || null, origin);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true, appId: profile.id, composition, payload }));
        return;
      }

      if (p === '/api/preview/apply-live' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const targetAppId = String(body.appId || 'dsh').toLowerCase();
        const origin = `http://127.0.0.1:${PORT}`;
        const { profile, cleanCfg, composition, compiled, payload } = compileAppPayload(
          targetAppId,
          body.config || {},
          body.activeItem || null,
          origin,
        );
        let store = sanitizeV4Store(DEFAULT_V4_STORE);
        if (existsSync(V4_STORE_FILE)) {
          try { store = sanitizeV4Store(JSON.parse(readFileSync(V4_STORE_FILE, 'utf8').replace(/^\uFEFF/, ''))); } catch {}
        }
        const prev = store.apps[profile.id] || { skinEnabled: true, inheritGlobal: false, overrides: {} };
        store.apps[profile.id] = {
          skinEnabled: true,
          inheritGlobal: false,
          overrides: {
            ...(prev.overrides || {}),
            skinEnabled: true,
            skinMode: cleanCfg.skinMode,
            modules: cleanCfg.modules,
            colorScheme: cleanCfg.colorScheme,
            themeMode: cleanCfg.themeMode,
            mascotSpec: cleanCfg.mascotSpec,
            prismaticCoat: cleanCfg.prismaticCoat,
            rimTone: cleanCfg.rimTone,
            cornerStyle: cleanCfg.cornerStyle,
            motionTier: cleanCfg.motionTier,
            ambientIntensity: cleanCfg.ambientIntensity,
            vividness: cleanCfg.vividness,
            fontStyle: cleanCfg.fontStyle,
            textStyle: cleanCfg.textStyle,
            habitatMode: cleanCfg.habitatMode,
            codeFont: cleanCfg.codeFont,
            codeLigatures: cleanCfg.codeLigatures,
            sidebarCompact: cleanCfg.sidebarCompact,
            glassSurfaces: cleanCfg.glassSurfaces,
            glassOpacity: cleanCfg.glassOpacity,
            glassBlur: cleanCfg.glassBlur,
            scrimOpacity: cleanCfg.scrimOpacity,
            layoutMode: cleanCfg.layoutMode,
          },
        };
        store = sanitizeV4Store(store);
        mkdirSync(LOCAL_DATA, { recursive: true });
        writeFileSync(V4_STORE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');

        if (profile.id === 'dsh') {
          const st = await dshPluginChannel.status(profile);
          if (!st.installed) await dshPluginChannel.install(profile, { consent: true });
          if (!st.enabled) await dshPluginChannel.setEnabled(profile, true);
          const varsCss = buildStaticCssSheet(payload);
          await dshPluginChannel.launch(profile, {
            layers: { vars: varsCss, parts: compiled.adapterCss, extra: profile.extraCss || '' },
            payload,
          });
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, appId: profile.id, skinMode: composition.skinMode }));
        return;
      }

      if (p === '/api/preview/sync-all' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const origin = `http://127.0.0.1:${PORT}`;
        const cleanCfg = sanitizeConfig(body.config || {});
        let store = sanitizeV4Store(DEFAULT_V4_STORE);
        if (existsSync(V4_STORE_FILE)) {
          try { store = sanitizeV4Store(JSON.parse(readFileSync(V4_STORE_FILE, 'utf8').replace(/^\uFEFF/, ''))); } catch {}
        }
        const snap = {
          skinEnabled: true,
          skinMode: cleanCfg.skinMode,
          modules: cleanCfg.modules,
          colorScheme: cleanCfg.colorScheme,
          themeMode: cleanCfg.themeMode,
          mascotSpec: cleanCfg.mascotSpec,
          prismaticCoat: cleanCfg.prismaticCoat,
          rimTone: cleanCfg.rimTone,
          cornerStyle: cleanCfg.cornerStyle,
          motionTier: cleanCfg.motionTier,
          ambientIntensity: cleanCfg.ambientIntensity,
          vividness: cleanCfg.vividness,
          fontStyle: cleanCfg.fontStyle,
          textStyle: cleanCfg.textStyle,
          habitatMode: cleanCfg.habitatMode,
          codeFont: cleanCfg.codeFont,
          codeLigatures: cleanCfg.codeLigatures,
          sidebarCompact: cleanCfg.sidebarCompact,
          glassSurfaces: cleanCfg.glassSurfaces,
          glassOpacity: cleanCfg.glassOpacity,
          glassBlur: cleanCfg.glassBlur,
          scrimOpacity: cleanCfg.scrimOpacity,
          layoutMode: cleanCfg.layoutMode,
        };
        const synced = [];
        for (const prof of listRuntimeProfiles()) {
          if (prof.id === 'antigravity') continue; // Peaceful coexistence with Obsidian Prism!
          const prev = store.apps[prof.id] || { skinEnabled: true, inheritGlobal: false, overrides: {} };
          store.apps[prof.id] = {
            skinEnabled: true,
            inheritGlobal: false,
            overrides: { ...(prev.overrides || {}), ...snap },
          };
          synced.push(prof.id);
        }
        store = sanitizeV4Store(store);
        mkdirSync(LOCAL_DATA, { recursive: true });
        writeFileSync(V4_STORE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
        // Hot-push DSH NEXT native plugin as well
        const { profile: dshProf, compiled: dshCompiled, payload: dshPayload } = compileAppPayload('dsh', cleanCfg, body.activeItem || null, origin);
        const st = await dshPluginChannel.status(dshProf);
        if (st.installed && st.enabled) {
          await dshPluginChannel.launch(dshProf, {
            layers: { vars: buildStaticCssSheet(dshPayload), parts: dshCompiled.adapterCss, extra: dshProf.extraCss || '' },
            payload: dshPayload,
          });
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, syncedCount: synced.length, syncedApps: synced }));
        return;
      }

      if (p.startsWith('/dyn/')) {
        const dynId = decodeURIComponent(p.slice('/dyn/'.length));
        const theme = BUILTIN_DYNAMIC_THEMES.find((t) => t.id === dynId);
        if (!theme) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(theme.html);
        return;
      }

      if (p.startsWith('/uploads/')) {
        const rel = p
          .slice('/uploads/'.length)
          .split('/')
          .filter(Boolean)
          .map((seg) => decodeURIComponent(seg));
        if (!rel.length || rel.length > 2 || rel.some((seg) => seg.includes('..') || seg.includes('/') || seg.includes('\\'))) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        const full = join(UPLOADS_DIR, ...rel);
        if (!existsSync(full)) { res.writeHead(404); res.end('Not found'); return; }
        const mime = MIME_MAP[extname(full).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': mime, 'cache-control': 'public, max-age=300' });
        res.end(readFileSync(full));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`DSH NEXT flagship live preview listening on http://127.0.0.1:${PORT}/`);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startPreviewServer();
}
