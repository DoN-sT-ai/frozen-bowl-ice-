@echo off
title FryFreeze - Quick-Service POS & Kitchen Management
echo ==============================================================================
echo             FRYFREEZE - POS & KITCHEN MANAGEMENT SYSTEM
echo                       Running in 100% Offline Mode
echo              Database: data\ledgerstore.db (SQLite Embedded)
echo ==============================================================================
echo.
cd /d "%~dp0"
node electron\start.cjs
pause
