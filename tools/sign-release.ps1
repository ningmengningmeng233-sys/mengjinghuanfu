# T0-7: sign a release exe with an OV/EV code-signing certificate provided by the project owner.
# The certificate and its password never enter the repo or this script. Password for -PfxPath is prompted securely.
# Usage: powershell -ExecutionPolicy Bypass -File tools/sign-release.ps1 -ExePath <path> -Thumbprint <cert thumbprint>
#        powershell -ExecutionPolicy Bypass -File tools/sign-release.ps1 -ExePath <path> -PfxPath <path.pfx>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [string]$Thumbprint,
  [string]$PfxPath,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ExePath)) { throw "exe not found: $ExePath" }
if (-not $Thumbprint -and -not $PfxPath) { throw 'provide either -Thumbprint or -PfxPath (certificate comes from the project owner)' }
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $signtool) {
  $kit = Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($kit) { $cand = Join-Path $kit.FullName 'x64/signtool.exe'; if (Test-Path $cand) { $signtool = $cand } }
}
if (-not $signtool) { throw 'signtool.exe not found; install the Windows SDK signing tools first' }
$signArgs = @('sign', '/fd', 'SHA256', '/tr', $TimestampUrl, '/td', 'SHA256')
if ($Thumbprint) { $signArgs += @('/sha1', $Thumbprint) }
else {
  $sec = Read-Host 'PFX password' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  $signArgs += @('/f', $PfxPath, '/p', $plain)
}
$signArgs += $ExePath
& $signtool @signArgs
if ($LASTEXITCODE -ne 0) { throw "signtool sign failed with exit code $LASTEXITCODE" }
& $signtool verify /pa $ExePath
if ($LASTEXITCODE -ne 0) { throw "signtool verify failed with exit code $LASTEXITCODE" }
Write-Host "signed and verified: $ExePath"
