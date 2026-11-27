// Native application icon resolver for DreamSkin Prism v4.
// Extracts real high-DPI icons from installed Windows executables (PrivateExtractIconsW)
// or MSIX package Assets, caches them as PNGs under <dataDir>/app-icons/, and provides
// crisp bespoke brand vector SVGs as clean fallbacks (never crude letter boxes).
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FALLBACK_SVGS = {
  antigravity: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <defs><linearGradient id="g" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#38BDF8"/><stop offset=".55" stop-color="#6366F1"/><stop offset="1" stop-color="#A855F7"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#101526" stroke="url(#g)" stroke-width="2.5"/>
    <path d="M32 14L48 46L39.5 46L32 30.5L24.5 46L16 46L32 14Z" fill="url(#g)"/>
    <circle cx="32" cy="44" r="4.5" fill="#E0F2FE"/>
  </svg>`,
  cherry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#1E1017" stroke="#FB7185" stroke-opacity=".55" stroke-width="2"/>
    <path d="M23 36C25 24 33 17 44 15C38 22 36 29 38 38" stroke="#4ADE80" stroke-width="3" stroke-linecap="round"/>
    <circle cx="23" cy="41" r="9.5" fill="#F43F5E"/>
    <circle cx="40" cy="43" r="9.5" fill="#E11D48"/>
    <circle cx="20" cy="38" r="2.6" fill="#FFE4E6" fill-opacity=".8"/>
    <circle cx="37" cy="40" r="2.6" fill="#FFE4E6" fill-opacity=".8"/>
  </svg>`,
  codex: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#0F171A" stroke="#34D399" stroke-opacity=".5" stroke-width="2"/>
    <circle cx="32" cy="32" r="14" stroke="#E2E8F0" stroke-width="3.2"/>
    <path d="M25 28L30 32L25 36M33 36H40" stroke="#34D399" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  dsh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#0E172A" stroke="#60A5FA" stroke-opacity=".55" stroke-width="2"/>
    <path d="M16 36C18 24 27 18 37 20C43 21 48 26 49 33C45 31 41 32 38 35C35 39 28 43 20 41C17 40 15.5 38.5 16 36Z" fill="#3B82F6"/>
    <circle cx="39" cy="27" r="2.2" fill="#EFF6FF"/>
  </svg>`,
  'minimax-code': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <defs><linearGradient id="m1" x1="12" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse"><stop stop-color="#FB923C"/><stop offset="1" stop-color="#EC4899"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#1C131C" stroke="url(#m1)" stroke-width="2.2"/>
    <path d="M16 42V22L27 34L37 22V42M43 25L49 32L43 39" stroke="url(#m1)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  'minimax-design': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <defs><linearGradient id="m2" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse"><stop stop-color="#F472B6"/><stop offset="1" stop-color="#A855F7"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#1A1224" stroke="url(#m2)" stroke-width="2.2"/>
    <circle cx="28" cy="30" r="11" fill="url(#m2)" fill-opacity=".85"/>
    <circle cx="38" cy="36" r="10" fill="#60A5FA" fill-opacity=".68"/>
  </svg>`,
  zcode: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <defs><linearGradient id="zc" x1="14" y1="12" x2="50" y2="52" gradientUnits="userSpaceOnUse"><stop stop-color="#A78BFA"/><stop offset="1" stop-color="#38BDF8"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#131126" stroke="url(#zc)" stroke-width="2.2"/>
    <path d="M19 20H45L20 44H45" stroke="url(#zc)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  kiro: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#18122B" stroke="#C084FC" stroke-opacity=".55" stroke-width="2"/>
    <path d="M20 46V29C20 21 25.5 16 32 16C38.5 16 44 21 44 29V46L38 41.5L32 46L26 41.5L20 46Z" fill="#C084FC"/>
    <circle cx="27.5" cy="29" r="2.6" fill="#18122B"/><circle cx="36.5" cy="29" r="2.6" fill="#18122B"/>
  </svg>`,
  windsurf: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#0D1E22" stroke="#2DD4BF" stroke-opacity=".55" stroke-width="2"/>
    <path d="M17 42C22 28 31 20 46 18C41 28 37 35 39 44C32 41 25 40 17 42Z" fill="#2DD4BF"/>
  </svg>`,
  qoder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#101828" stroke="#38BDF8" stroke-opacity=".6" stroke-width="2.2"/>
    <circle cx="31" cy="31" r="13" stroke="#38BDF8" stroke-width="4"/>
    <path d="M39 39L47 47" stroke="#818CF8" stroke-width="4.5" stroke-linecap="round"/>
  </svg>`,
  opencode: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#0F172A" stroke="#22D3EE" stroke-opacity=".55" stroke-width="2.2"/>
    <path d="M24 22L15 32L24 42M40 22L49 32L40 42M35 18L29 46" stroke="#22D3EE" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  workbuddy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#0E1D1A" stroke="#34D399" stroke-opacity=".58" stroke-width="2.2"/>
    <path d="M16 22L23 42L32 26L41 42L48 22" stroke="#34D399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  t3code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#171226" stroke="#A78BFA" stroke-opacity=".6" stroke-width="2.2"/>
    <path d="M16 22H34M25 22V44M37 22H48L41 32H47C48 39 43 44 36 44" stroke="#A78BFA" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  vscode: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#0C192C" stroke="#3B82F6" stroke-opacity=".62" stroke-width="2.2"/>
    <path d="M44 16L22 36L16 32L44 48V16Z" fill="#3B82F6"/>
    <path d="M16 32L44 16V48L22 28" stroke="#93C5FD" stroke-width="3.2" stroke-linejoin="round"/>
  </svg>`,
};

const DEFAULT_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="4" y="4" width="56" height="56" rx="15" fill="#15192B" stroke="#64748B" stroke-width="2"/>
  <rect x="19" y="19" width="26" height="26" rx="7" stroke="#94A3B8" stroke-width="3"/>
</svg>`;

export function getFallbackAppIconSvg(appId) {
  return FALLBACK_SVGS[appId] || DEFAULT_FALLBACK_SVG;
}

const inflight = new Map();

async function extractWindowsIconToPng({ appId, exePath, channel, legacyRoot, destPng }) {
  if (process.platform !== 'win32') return false;
  const legacyIco = legacyRoot ? join(legacyRoot, 'icons', `${appId}.ico`) : '';
  const hasExe = Boolean(exePath && existsSync(exePath));
  const hasLegacyIco = Boolean(legacyIco && existsSync(legacyIco));

  // Fast pure-JS path if we only need to check MSIX or extract via PowerShell
  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dest = $env:DS_ICON_DEST
$exe = $env:DS_ICON_EXE
$icoFile = $env:DS_ICON_ICO
$appId = $env:DS_ICON_APPID
$channel = $env:DS_ICON_CHANNEL

# 1) MSIX package Assets (e.g. OpenAI.Codex)
if ($channel -eq 'msix' -and $appId -eq 'codex') {
  $pkg = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $pkg) { $pkg = Get-AppxPackage -Name '*Codex*' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '*Runtime*' } | Select-Object -First 1 }
  if ($pkg -and $pkg.InstallLocation) {
    $assets = Join-Path $pkg.InstallLocation 'Assets'
    $picks = @(
      'Square44x44Logo.targetsize-256_altform-unplated.png',
      'Square44x44Logo.targetsize-96_altform-unplated.png',
      'Square44x44Logo.targetsize-64_altform-unplated.png',
      'Square150x150Logo.scale-200.png',
      'Square150x150Logo.png',
      'icon.png'
    )
    foreach ($p in $picks) {
      $full = Join-Path $assets $p
      if (Test-Path $full) {
        Copy-Item -LiteralPath $full -Destination $dest -Force
        exit 0
      }
    }
  }
}

# 2) High-res icon extraction from EXE via PrivateExtractIconsW (preferred 128/64/48/32px)
if ($exe -and (Test-Path -LiteralPath $exe)) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DsIconExtractor {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern uint PrivateExtractIcons(string lpszFile, int nIconIndex, int cxIcon, int cyIcon, IntPtr[] phicon, uint[] piconid, uint nIcons, uint flags);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@
  foreach ($sz in @(128, 64, 48, 32)) {
    $hIcons = New-Object IntPtr[] 1
    $ids = New-Object uint32[] 1
    $cnt = [DsIconExtractor]::PrivateExtractIcons($exe, 0, $sz, $sz, $hIcons, $ids, 1, 0)
    if ($cnt -gt 0 -and $hIcons[0] -ne [IntPtr]::Zero) {
      try {
        $ico = [System.Drawing.Icon]::FromHandle($hIcons[0])
        $bmp = $ico.ToBitmap()
        $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $ico.Dispose()
        exit 0
      } finally {
        [DsIconExtractor]::DestroyIcon($hIcons[0]) | Out-Null
      }
    }
  }
  $assoc = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
  if ($assoc) {
    $bmp = $assoc.ToBitmap()
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $assoc.Dispose()
    exit 0
  }
}

# 3) Fallback to legacy DreamSkin cached .ico
if ($icoFile -and (Test-Path -LiteralPath $icoFile)) {
  $ico = New-Object System.Drawing.Icon($icoFile, 64, 64)
  $bmp = $ico.ToBitmap()
  $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $ico.Dispose()
  exit 0
}
exit 1
`;

  if (!hasExe && !hasLegacyIco && channel !== 'msix') return false;

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        timeout: 6000,
        windowsHide: true,
        env: {
          ...process.env,
          DS_ICON_DEST: destPng,
          DS_ICON_EXE: hasExe ? exePath : '',
          DS_ICON_ICO: hasLegacyIco ? legacyIco : '',
          DS_ICON_APPID: String(appId || ''),
          DS_ICON_CHANNEL: String(channel || ''),
        },
      },
    );
    return existsSync(destPng) && statSync(destPng).size > 100;
  } catch {
    return false;
  }
}

export async function resolveAppIcon({ app, dataDir, legacyRoot } = {}) {
  const appId = String(app?.id || 'unknown');
  const iconCacheDir = join(dataDir, 'app-icons');
  mkdirSync(iconCacheDir, { recursive: true });
  const pngPath = join(iconCacheDir, `${appId}.png`);

  if (existsSync(pngPath) && statSync(pngPath).size > 100) {
    return { contentType: 'image/png', body: readFileSync(pngPath), source: 'native-png' };
  }

  // Deduplicate concurrent extractions for the same appId
  const key = `${dataDir}::${appId}`;
  if (!inflight.has(key)) {
    const p = extractWindowsIconToPng({
      appId,
      exePath: app?.exe || '',
      channel: app?.channel || '',
      legacyRoot,
      destPng: pngPath,
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const ok = await inflight.get(key);
  if (ok && existsSync(pngPath) && statSync(pngPath).size > 100) {
    return { contentType: 'image/png', body: readFileSync(pngPath), source: 'native-png' };
  }

  return {
    contentType: 'image/svg+xml; charset=utf-8',
    body: Buffer.from(getFallbackAppIconSvg(appId), 'utf8'),
    source: 'fallback-svg',
  };
}
