@echo off
setlocal
pushd "%~dp0" || exit /b 1
title Q-bits - Galpon de prueba
powershell.exe -NoLogo -NoProfile -NonInteractive -Command - < "galpon-local.ps1"
set "qbitsExit=%errorlevel%"
popd
if not "%qbitsExit%"=="0" pause
exit /b %qbitsExit%
