# ============================================================
#  START-SMART-REGISTRAR.ps1
#  One-click starter: server + phone hotspot + opens browser.
#  Run via START-SMART-REGISTRAR.bat (double-click that file).
# ============================================================
Write-Host "=== CDLSHS Smart Registrar starter ===" -ForegroundColor Cyan

# ---- 1) server (port 3000) ----
$listen = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host "[OK] Server already running on port 3000" -ForegroundColor Green
} else {
  Write-Host "Starting server..."
  Start-Process node -ArgumentList 'server\index.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  Start-Sleep -Seconds 2
  $listen = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($listen) { Write-Host "[OK] Server started" -ForegroundColor Green }
  else { Write-Host "[FAIL] Server did not start" -ForegroundColor Red }
}

# ---- 2) phone hotspot (CDLSHS-REGISTRAR) ----
$state = (netsh wlan show hostednetwork | Out-String)
if ($state -match 'Status\s*:\s*Started') {
  Write-Host "[OK] Hotspot CDLSHS-REGISTRAR already on" -ForegroundColor Green
} else {
  Write-Host "Starting hotspot..."
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $isAdmin = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdmin) {
    netsh wlan start hostednetwork | Out-Null
  } else {
    # needs admin -> one UAC prompt appears, click Yes
    Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-Command','netsh wlan start hostednetwork' -Wait
    Start-Sleep -Seconds 2
  }
  $state = (netsh wlan show hostednetwork | Out-String)
  if ($state -match 'Status\s*:\s*Started') { Write-Host "[OK] Hotspot CDLSHS-REGISTRAR is on" -ForegroundColor Green }
  else { Write-Host "[WARN] Hotspot not started - run again and click Yes on the UAC prompt" -ForegroundColor Yellow }
}

# ---- 3) open the app in the browser ----
Write-Host ""
Write-Host "On this laptop : http://localhost:3000" -ForegroundColor Cyan
Write-Host "On the phone   : join Wi-Fi CDLSHS-REGISTRAR, open http://192.168.137.1:3000" -ForegroundColor Cyan
Start-Process 'http://localhost:3000'
Write-Host ""
Write-Host "You can close this window - the server keeps running."
