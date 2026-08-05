Write-Host "=== ide.ankb Desktop Build (.NET 10) ===" -ForegroundColor Cyan
Write-Host "Checking .NET SDK (10.x)..." -ForegroundColor Yellow
dotnet --version
if ($LASTEXITCODE -ne 0) {
  Write-Host ".NET SDK not found! Run: winget install Microsoft.DotNet.SDK.10" -ForegroundColor Red
  Write-Host "Or download from https://dotnet.microsoft.com/download" -ForegroundColor Yellow
  exit 1
}

Write-Host "`nRestoring..." -ForegroundColor Yellow
dotnet restore IdeAnkb.csproj

Write-Host "`nBuilding Release..." -ForegroundColor Yellow
dotnet build IdeAnkb.csproj -c Release

Write-Host "`nPublishing single-file .exe (win-x64 self-contained, .NET 10)..." -ForegroundColor Yellow
dotnet publish IdeAnkb.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish

Write-Host "`n=== Build Done ===" -ForegroundColor Green
Get-ChildItem publish | Format-Table Name, Length, LastWriteTime
Write-Host "`nFile: app\publish\IdeAnkb.exe - Single exe for other machines (no .NET needed)" -ForegroundColor Cyan
Write-Host "Run: .\publish\IdeAnkb.exe" -ForegroundColor Yellow
Write-Host "Self-host Judge0: docker run -d -p 2358:2358 judge0/judge0:1.13.1; `$env:JUDGE0_API_URL='http://localhost:2358'; .\publish\IdeAnkb.exe"
