# T0-6: download portable Node 22 LTS win-x64 into build/cache/node-win-x64/ (local only, not committed, no global install, no PATH change).
# Try nodejs.org first, fall back to npmmirror. Verify the zip against official SHASUMS256.txt; delete and fail on mismatch.
# Usage (from repo root): powershell -ExecutionPolicy Bypass -File tools/fetch-node-runtime.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $root 'build/cache'
$dest = Join-Path $cache 'node-win-x64'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$bases = @('https://nodejs.org/dist', 'https://npmmirror.com/mirrors/node')
$ver = $null; $base = $null
foreach ($b in $bases) {
  try {
    $idx = Invoke-RestMethod -Uri "$b/index.json" -TimeoutSec 30
    $hit = $idx | Where-Object { $_.version -like 'v22.*' -and $_.lts } | Select-Object -First 1
    if ($hit) { $ver = $hit.version; $base = $b; break }
  } catch { Write-Host "source $b unavailable, trying next" }
}
if (-not $ver) { throw 'could not get Node 22 LTS version from either source' }
Write-Host "selected Node $ver from $base"
$zipName = "node-$ver-win-x64.zip"
$zip = Join-Path $cache $zipName
if (-not (Test-Path $zip)) { Invoke-WebRequest -Uri "$base/$ver/$zipName" -OutFile $zip -TimeoutSec 600 }
$sums = Invoke-RestMethod -Uri "$base/$ver/SHASUMS256.txt" -TimeoutSec 30
$want = (($sums -split "`n") | Where-Object { $_ -match [regex]::Escape($zipName) }) -split '\s+' | Select-Object -First 1
$got = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
if ($want -and $got -ne $want.ToLower()) { Remove-Item $zip -Force; throw "zip sha256 mismatch, deleted" }
Write-Host "zip sha256 verified"
$tmp = Join-Path $cache 'extract-tmp'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$inner = Join-Path $tmp "node-$ver-win-x64"
Copy-Item (Join-Path $inner 'node.exe') (Join-Path $dest 'node.exe') -Force
Copy-Item (Join-Path $inner 'LICENSE') (Join-Path $dest 'LICENSE') -Force
Remove-Item $tmp -Recurse -Force
& (Join-Path $dest 'node.exe') --version
Write-Host "portable node ready at $dest"
