# Q-4: generate (or verify) a SHA256SUMS.txt for a release directory.
# Hashes every file in -Dir except the sums file itself, one line per file:
#   <sha256 lowercase hex>  <file name>
# (two spaces, sha256sum text-mode layout; file written as UTF-8 without BOM
# so non-ASCII file names survive). After writing, every hash is recomputed
# and compared; any mismatch makes the script exit non-zero.
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/make-release-hashes.ps1 -Dir build/release
#   powershell -ExecutionPolicy Bypass -File tools/make-release-hashes.ps1 -Dir build/release -Verify
param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [string]$OutName = "SHA256SUMS.txt",
  [switch]$Verify
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Dir -PathType Container)) { throw "directory not found: $Dir" }
$dirPath = (Resolve-Path $Dir).Path
$sumsPath = Join-Path $dirPath $OutName

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

if ($Verify) {
  if (-not (Test-Path $sumsPath)) { throw "sums file not found: $sumsPath" }
  $fail = 0; $count = 0
  foreach ($line in [System.IO.File]::ReadAllLines($sumsPath)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch "^([0-9a-f]{64})  (.+)$") { Write-Host "BADLINE: $line"; $fail++; continue }
    $expected = $Matches[1]; $name = $Matches[2]; $count++
    $target = Join-Path $dirPath $name
    if (-not (Test-Path $target -PathType Leaf)) { Write-Host "MISSING: $name"; $fail++; continue }
    $actual = Get-Sha256 $target
    if ($actual -eq $expected) { Write-Host "OK: $name" } else { Write-Host "FAIL: $name expected $expected got $actual"; $fail++ }
  }
  Write-Host ("verified {0} file(s), {1} failure(s)" -f $count, $fail)
  if ($fail -gt 0 -or $count -eq 0) { exit 1 }
  exit 0
}

$files = Get-ChildItem -Path $dirPath -File | Where-Object { $_.Name -ne $OutName } | Sort-Object Name
if (-not $files) { throw "no files to hash in: $dirPath" }
$lines = @()
foreach ($f in $files) {
  $lines += ("{0}  {1}" -f (Get-Sha256 $f.FullName), $f.Name)
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($sumsPath, ($lines -join "`n") + "`n", $utf8NoBom)
Write-Host ("wrote {0} ({1} file(s))" -f $sumsPath, $files.Count)
foreach ($f in $files) {
  $line = $lines | Where-Object { $_ -match [regex]::Escape("  " + $f.Name) + "$" }
  $expected = ($line -split "  ")[0]
  $actual = Get-Sha256 $f.FullName
  if ($actual -ne $expected) { Write-Host "FAIL: $($f.Name)"; exit 1 }
  Write-Host "OK: $($f.Name) $actual"
}
Write-Host "all hashes verified after writing"
