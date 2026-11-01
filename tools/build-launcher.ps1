# Build the Dream Skin launcher (WinForms console) end to end:
#   1) build the payload directory with tools/build-payload.mjs (win32, bundled node runtime included)
#   2) pack build/payload-win into src/launcher/DreamSkin.payload.zip using the 2.1 zip layout
#      (payload files under "src/", LICENSE and THIRD-PARTY-NOTICES.md at the zip root),
#      because the console extracts this zip at first run and then looks for
#      src/cherry/skin-cherry.mjs inside the extracted tree
#   3) dotnet build the launcher project so the zip is embedded as resource "DreamSkin.payload.zip"
# Usage: powershell -ExecutionPolicy Bypass -File tools/build-launcher.ps1 [-Configuration Release]
param([string]$Configuration = "Release")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[1/3] Building payload (win32)..."
& node "tools/build-payload.mjs" --platform win32 --out "build/payload-win"
if ($LASTEXITCODE -ne 0) { throw "build-payload failed with exit code $LASTEXITCODE" }

if (Test-Path (Join-Path $root "build\payload-win\launcher")) { throw "payload output unexpectedly contains a launcher folder; check the exclusions in tools/build-payload.mjs" }

Write-Host "[2/3] Packing DreamSkin.payload.zip ..."
$payloadDir = Join-Path $root "build\payload-win"
$zipPath = Join-Path $root "src\launcher\DreamSkin.payload.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootNames = @("LICENSE", "THIRD-PARTY-NOTICES.md")
$files = Get-ChildItem -Recurse -File $payloadDir
$stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
try {
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            $rel = $file.FullName.Substring($payloadDir.Length).TrimStart('\', '/') -replace '\\', '/'
            if (($rootNames -contains $file.Name) -and ($rel -eq $file.Name)) { $entryName = $file.Name }
            else { $entryName = "src/" + $rel }
            $level = [System.IO.Compression.CompressionLevel]::Optimal
            if ($file.Extension -eq ".exe") { $level = [System.IO.Compression.CompressionLevel]::Fastest }
            $entry = $archive.CreateEntry($entryName, $level)
            $entryStream = $entry.Open()
            try {
                $input = [System.IO.File]::OpenRead($file.FullName)
                try { $input.CopyTo($entryStream) } finally { $input.Dispose() }
            } finally { $entryStream.Dispose() }
        }
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
$zipInfo = Get-Item $zipPath
Write-Host ("    packed {0} files, zip size {1:N0} bytes" -f $files.Count, $zipInfo.Length)

Write-Host "[3/3] Building launcher ($Configuration)..."
& dotnet build "src/launcher" -c $Configuration
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed with exit code $LASTEXITCODE" }
$exe = Get-ChildItem (Join-Path $root "src\launcher\bin\$Configuration\net48\*.exe") | Select-Object -First 1
Write-Host ("Done: {0} ({1:N0} bytes, FileVersion {2})" -f $exe.FullName, $exe.Length, $exe.VersionInfo.FileVersion)
