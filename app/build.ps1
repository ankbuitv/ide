Write-Host "=== ide.ankb Desktop Build ===" -ForegroundColor Cyan
Write-Host "Checking .NET SDK..."
dotnet --version
if ($LASTEXITCODE -ne 0) {
  Write-Host ".NET 8 SDK not found! https://dotnet.microsoft.com/download" -ForegroundColor Red
  exit 1
}

Write-Host "`nRestoring..." -ForegroundColor Yellow
dotnet restore IdeAnkb.csproj

Write-Host "`nBuilding Release..." -ForegroundColor Yellow
dotnet build IdeAnkb.csproj -c Release

Write-Host "`nPublishing single-file .exe..." -ForegroundColor Yellow
dotnet publish IdeAnkb.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish

Write-Host "`n=== Build Done ===" -ForegroundColor Green
Get-ChildItem publish | Format-Table Name, Length, LastWriteTime
Write-Host "`nFile: app\publish\IdeAnkb.exe" -ForegroundColor Cyan
Write-Host "Run: `$env:JUDGE0_API_URL='https://ce.judge0.com'; .\publish\IdeAnkb.exe"
