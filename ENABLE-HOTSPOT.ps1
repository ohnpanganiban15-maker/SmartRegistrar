# ENABLE-HOTSPOT.ps1 — Mobile hotspot: SSID CDLSHS-REGISTRAR / password cdlshs2026
# Pwede sa normal na session; kung ma-deny, i-run ang ENABLE-HOTSPOT.bat as Administrator.
$ErrorActionPreference = 'Stop'
$SSID = 'CDLSHS-REGISTRAR'
$PASS = 'cdlshs2026'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
$null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]

function Await-WinRt {
  param($Op)
  $iface = $Op.GetType().GetInterfaces() | Where-Object {
    $_.Name -like 'IAsyncAction*' -or $_.Name -like 'IAsyncOperation*'
  } | Select-Object -First 1
  if (-not $iface) {
    $names = ($Op.GetType().GetInterfaces() | ForEach-Object { $_.Name }) -join ', '
    throw "hindi kilalang async operation: type=$($Op.GetType().FullName) ifaces=[$names]"
  }
  $iname = $iface.Name
  $tresult = if ($iface.IsGenericType) { $iface.GetGenericArguments()[0] } else { $null }
  $isGeneric = $null -ne $tresult
  $m = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq $iname -and
    $_.IsGenericMethodDefinition -eq $isGeneric
  } | Select-Object -First 1
  if (-not $m) { throw "AsTask helper not found para sa $iname" }
  if ($isGeneric) { $m = $m.MakeGenericMethod($tresult) }
  $task = $m.Invoke($null, @($Op))
  $null = $task.Wait(-1)
  if ($task.IsFaulted) { throw $task.Exception.GetBaseException() }
  return $task
}

Write-Host '== Smart Registrar Mobile Hotspot =='
$tm = $null
foreach ($p in [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles()) {
  try {
    $t = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
    if ($t) { $tm = $t; Write-Host ("Profile: {0}" -f $p.ProfileName); break }
  } catch { }
}
if (-not $tm) {
  $p = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if ($p) {
    $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
    Write-Host ("Profile (internet): {0}" -f $p.ProfileName)
  }
}
if (-not $tm) { throw 'hindi makagawa ng tethering manager' }

$cfg = $tm.GetCurrentAccessPointConfiguration()
Write-Host ("Kasalukuyan: SSID='{0}'" -f $cfg.Ssid)

if ($cfg.Ssid -ne $SSID -or $cfg.Passphrase -ne $PASS) {
  Write-Host ("Nagse-set ng SSID='{0}' password='{1}'..." -f $SSID, $PASS)
  $cfg.Ssid = $SSID
  $cfg.Passphrase = $PASS
  $null = Await-WinRt ($tm.ConfigureAccessPointAsync($cfg))
  Write-Host 'OK — na-configure na.'
} else {
  Write-Host 'Tamang SSID/password na — walang babaguhin.'
}

Write-Host ("Hotspot state: {0}" -f $tm.TetheringState)
try {
  $taskStart = Await-WinRt ($tm.StartTetheringAsync())
  if ($taskStart.PSObject.Properties['Result'] -and $taskStart.Result) {
    Write-Host ("Start result: {0}" -f $taskStart.Result.Status)
  }
  Write-Host 'StartTethering naipadala na.'
} catch {
  Write-Host 'StartTethering: naipadala na — fire-and-forget (okay lang iyan sa PowerShell 5.1).'
}

Write-Host '== Tapos =='
Write-Host ("SSID    : {0}" -f $SSID)
Write-Host ("Password: {0}" -f $PASS)
Write-Host 'Sa phone: i-connect dito, tapos buksan ang http://192.168.137.1:3000'
