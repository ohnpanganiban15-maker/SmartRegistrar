@echo off
title SmartRegistrar - Enable Hotspot (CDLSHS-REGISTRAR)
echo ============================================
echo  Bubuksan ang Mobile Hotspot
echo  SSID     : CDLSHS-REGISTRAR
echo  Password : cdlshs2026
echo  (Run as Administrator)
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ENABLE-HOTSPOT.ps1"
echo.
pause
