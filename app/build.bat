@echo off
echo === ide.ankb Desktop Build (.NET 10) ===
echo Checking .NET SDK...
dotnet --version
if %errorlevel% neq 0 (
  echo .NET SDK not found! Install with: winget install Microsoft.DotNet.SDK.10
  echo Or download from https://dotnet.microsoft.com/download
  pause
  exit /b 1
)

echo.
echo Restoring...
dotnet restore IdeAnkb.csproj

echo.
echo Building Release...
dotnet build IdeAnkb.csproj -c Release

echo.
echo Publishing single-file .exe (win-x64 self-contained, .NET 10)...
dotnet publish IdeAnkb.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish

echo.
echo === Build Done ===
dir publish
echo.
echo File: app\publish\IdeAnkb.exe
for %%A in (publish\IdeAnkb.exe) do echo Size: %%~zA bytes
echo.
echo To run (Judge0 CE default):
echo   publish\IdeAnkb.exe
echo.
echo To self-host Judge0:
echo   docker run -d -p 2358:2358 judge0/judge0:1.13.1
echo   set JUDGE0_API_URL=http://localhost:2358
echo   publish\IdeAnkb.exe
echo.
echo Or own backend (simplest):
echo   docker-compose up -d --build ide
echo   set BACKEND_URL=http://localhost:8080
echo   publish\IdeAnkb.exe
pause
