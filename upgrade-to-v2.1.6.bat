@echo off
echo ============================================================
echo Upgrading FryFreeze to v2.1.6...
echo ============================================================
taskkill /F /IM FryFreeze.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo Installing update silently...
start /wait "" "%~dp0installer-output\FryFreeze Setup 2.1.6.exe" /S
timeout /t 1 /nobreak >nul
echo Launching updated FryFreeze v2.1.6...
start "" "%LOCALAPPDATA%\Programs\FryFreeze\FryFreeze.exe"
echo Done! App upgraded to v2.1.6.

