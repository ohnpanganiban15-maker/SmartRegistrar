@echo off
title SmartRegistrar - FIX download sa phone (Run as Administrator)
echo ============================================================
echo  AYUSIN ANG PAG-DA DOWNLOAD NG PHONE
echo  (Right-click -^> Run as administrator)
echo ============================================================
echo.
echo [1/4] Inaayos ang firewall para sa hotspot subnet (192.168.137.x)...
netsh advfirewall firewall delete rule name="SR-hotspot-allow" >nul 2>&1
netsh advfirewall firewall add rule name="SR-hotspot-allow" dir=in action=allow protocol=TCP localport=3000 remoteip=192.168.137.0/24
netsh advfirewall firewall add rule name="SR-hotspot-allow" dir=in action=allow protocol=TCP localport=3000
echo      done.
echo.
echo [2/4] Tinuturing ang hotspot network bilang PRIVATE...
powershell -NoProfile -Command "Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -like '*Local Area Connection*' } | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "$a = Get-NetIPAddress -IPAddress '192.168.137.*' -ErrorAction SilentlyContinue; if ($a) { try { Set-NetConnectionProfile -InterfaceIndex $a[0].InterfaceIndex -NetworkCategory Private -ErrorAction Stop; Write-Host '      Private OK' } catch { Write-Host '      (skip - walang profile pa)' } }"
echo      done.
echo.
echo [3/4] Tinitingnan kung naka-on ang server at hotspot...
powershell -NoProfile -Command "$s = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; $h = Get-NetIPAddress -IPAddress '192.168.137.*' -ErrorAction SilentlyContinue; Write-Host ('      Server: ' + $(if ($s) { 'OK' } else { 'DOWN!' })); Write-Host ('      Hotspot: ' + $(if ($h) { 'OK ' + $h[0].IPAddress } else { 'DOWN!' }))"
echo.
echo [4/4] Test download mula sa PC...
powershell -NoProfile -Command "$h = Get-NetIPAddress -IPAddress '192.168.137.*' -ErrorAction SilentlyContinue; if ($h) { $ip = $h[0].IPAddress; $r = curl.exe -s -o NUL -w '%{http_code}' --max-time 5 ('http://' + $ip + ':3000/downloads/SmartRegistrar.apk'); Write-Host ('      http://' + $ip + ':3000/downloads/SmartRegistrar.apk = HTTP ' + $r) } else { Write-Host '      Hotspot OFF - hindi ma-test' }"
echo.
echo ============================================================
echo  TAPOS. Sa PHONE:
echo    1. Siguraduhing naka-WiFi sa CDLSHS-REGISTRAR
echo    2. Buksan: http://192.168.137.1:3000/downloads/SmartRegistrar.apk
echo    3. Kung "Download" ang lumabas - pindutin
echo ============================================================
pause
