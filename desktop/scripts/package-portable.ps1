param(
  [ValidateSet("standard", "beta", "nightly")]
  [string]$Channel = "standard",
  [string]$BuildDir = "src-tauri\target\release"
)

$ErrorActionPreference = "Stop"
$desktopDir = Split-Path -Parent $PSScriptRoot
$releaseDir = if ([System.IO.Path]::IsPathRooted($BuildDir)) { $BuildDir } else { Join-Path $desktopDir $BuildDir }
$outDir = Join-Path $desktopDir "portable"
$stageDir = Join-Path $outDir "ide-ankb-$Channel"
$zipPath = Join-Path $outDir "ide-ankb-$Channel-portable.zip"

if (!(Test-Path $releaseDir)) {
  throw "Release build not found. Run npm run tauri:build:$Channel first."
}

$exe = Get-ChildItem $releaseDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notmatch "setup|uninstall|WebView2" } |
  Select-Object -First 1

if (!$exe) {
  throw "Could not find the portable executable in $releaseDir."
}

if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
Copy-Item $exe.FullName (Join-Path $stageDir "ide.ankb-$Channel.exe")
New-Item -ItemType File -Path (Join-Path $stageDir "portable.flag") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir "data") -Force | Out-Null

@"
ide.ankb $Channel portable

This build stores user data in the normal user profile unless portable mode is enabled by the app.
Requires the Microsoft WebView2 Runtime on Windows.
"@ | Set-Content (Join-Path $stageDir "README.txt")

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "Created $zipPath"
