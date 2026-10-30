@echo off
title FryFreeze - Build Windows Installers
echo ==============================================================================
echo             FRYFREEZE - BUILD WINDOWS INSTALLERS (EXE + MSI)
echo ==============================================================================
echo.
cd /d "%~dp0"

echo [1/3] Building client and embedded server bundles...
call node build.js
if %ERRORLEVEL% NEQ 0 (
    echo Error: Build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Checking app icon...
if not exist "assets\icon.ico" (
    call node scripts\generate-icon.cjs
)

echo.
echo [3/3] Packaging Windows Installers...
call node .\node_modules\electron-builder\out\cli\cli.js --win --x64
if %ERRORLEVEL% NEQ 0 (
    echo Error: Installer generation failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ==============================================================================
echo  BUILD SUCCESSFUL!
echo  Installers located at:
echo    - installer-output\FryFreeze Setup 2.0.0.exe (Recommended Setup)
echo    - installer-output\FryFreeze 2.0.0.msi (Windows MSI)
echo ==============================================================================
echo.
pause
