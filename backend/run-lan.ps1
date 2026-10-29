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

$ports = @(8080)
$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $ports }
if ($busy) {
    $busy | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
    throw "Port 8080 is already in use. Stop the old TRISCRIPT backend (Ctrl+C in its terminal) and retry."
}

$lanIp = $address.IPAddress
$env:LISTEN_ADDR = ":8080"
$env:PUBLIC_URL = "http://${lanIp}:8080"
$env:WEB_ORIGIN = "http://${lanIp}:3000"

if (-not $env:DATABASE_URL) {
    $securePassword = Read-Host "Enter the triscript PostgreSQL password" -AsSecureString
    $passwordPointer = [IntPtr]::Zero
    try {
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $databasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        if ([string]::IsNullOrWhiteSpace($databasePassword)) {
            throw "A PostgreSQL password is required to enable saving."
        }
        $encodedPassword = [Uri]::EscapeDataString($databasePassword)
        $env:DATABASE_URL = "postgres://triscript:${encodedPassword}@localhost:5432/triscript?sslmode=disable"
    } finally {
        if ($passwordPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        }
        if ($null -ne $securePassword) {
            $securePassword.Dispose()
        }
        Remove-Variable databasePassword, encodedPassword, securePassword, passwordPointer -ErrorAction SilentlyContinue
    }
}

Set-Location $PSScriptRoot
Write-Host "TRISCRIPT backend will be available at $env:PUBLIC_URL"
Write-Host "Phone capture page: $env:PUBLIC_URL/m/<session-id>?t=<token>"
Write-Host "Start the frontend on $env:WEB_ORIGIN in a second PowerShell terminal."
try {
    go run .
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
