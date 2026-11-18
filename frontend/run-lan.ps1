$ErrorActionPreference = "Stop"

$route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
if (-not $route) {
    throw "No active IPv4 default route found. Connect the computer to Wi-Fi or Ethernet and retry."
}

$address = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1
if (-not $address) {
    throw "Could not find an IPv4 address on the active network interface."
}

$profile = Get-NetConnectionProfile -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
if ($profile -and $profile.NetworkCategory -eq "Public") {
    Write-Warning "This Wi-Fi network is marked Public. Windows may block phone connections. Only on a trusted network, change its profile to Private in Windows Settings > Network & internet > Wi-Fi > network properties."
}

$ports = @(3000)
$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $ports }
if ($busy) {
    $busy | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
    throw "Port 3000 is already in use. Stop the old TRISCRIPT frontend (Ctrl+C in its terminal) and retry."
}

$lanIp = $address.IPAddress
$env:NEXT_PUBLIC_API_URL = "http://${lanIp}:8080"
$env:NEXT_PUBLIC_WEB_URL = "http://${lanIp}:3000"
$env:TRISCRIPT_API_URL = "http://127.0.0.1:8080"
$env:NEXT_TELEMETRY_DISABLED = "1"

Set-Location $PSScriptRoot
Write-Host "TRISCRIPT frontend: $env:NEXT_PUBLIC_WEB_URL"
Write-Host "Phone capture page: $env:NEXT_PUBLIC_WEB_URL/m/<session-id>?t=<token>"
Write-Host "Keep this terminal open. Open the frontend link on the computer, then scan its QR code."
node .\scripts\next.js dev -H 0.0.0.0 -p 3000
