@echo off
title SmartRegistrar - Allow port 3000
echo ============================================
echo  SmartRegistrar: opening firewall for TCP 3000
echo  (Run as Administrator)
echo ============================================
netsh advfirewall firewall add rule name="SmartRegistrar TCP 3000" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="SmartRegistrar node.exe" dir=in action=allow program="%ProgramFiles%\nodejs\node.exe" enable=yes
echo.
echo DONE. Close this window, then retry the download on your phone:
echo    http://<PC-IP>:3000/downloads/SmartRegistrar.apk  (tingnan ang IP sa terminal ng server)
pause
