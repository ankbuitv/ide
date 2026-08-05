@echo off
echo === ide.ankb Desktop Build ===
echo Checking .NET SDK...
dotnet --version
if %errorlevel% neq 0 (
  echo .NET 8 SDK not found! Download from https://dotnet.microsoft.com/download
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
echo Publishing single-file .exe (win-x64 self-contained)...
dotnet publish IdeAnkb.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish

echo.
echo === Build Done ===
dir publish
echo.
echo File: app\publish\IdeAnkb.exe
echo Size:
for %%A in (publish\IdeAnkb.exe) do echo %%~zA bytes
echo.
echo To run:
echo   set JUDGE0_API_URL=https://ce.judge0.com
echo   publish\IdeAnkb.exe
pause
