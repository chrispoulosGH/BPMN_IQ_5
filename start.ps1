# start.ps1 — Start BPMN IQ 2.0 (MongoDB + Server + Client)
$ErrorActionPreference = "Stop"

Write-Host "=== BPMN IQ 2.0 Startup ===" -ForegroundColor Cyan

# 1. Ensure MongoDB is reachable (service OR standalone mongod)
$mongoReachable = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect('127.0.0.1', 27017, $null, $null)
    $connected = $iar.AsyncWaitHandle.WaitOne(1000, $false)
    if ($connected) {
        $tcp.EndConnect($iar)
        $mongoReachable = $true
    }
    $tcp.Close()
} catch {
    $mongoReachable = $false
}

if ($mongoReachable) {
    Write-Host "[OK] MongoDB reachable on 127.0.0.1:27017." -ForegroundColor Green
} else {
    Write-Host "[*] MongoDB is not reachable on 127.0.0.1:27017; checking service..." -ForegroundColor Yellow
}

$mongo = Get-Service MongoDB -ErrorAction SilentlyContinue
if (-not $mongo -and -not $mongoReachable) {
    Write-Host "[ERROR] MongoDB service not found and MongoDB is not reachable on port 27017." -ForegroundColor Red
    Write-Host "  Start mongod manually and keep that terminal open." -ForegroundColor Yellow
    exit 1
}

if (-not $mongoReachable -and $mongo.Status -ne 'Running') {
    Write-Host "[*] Starting MongoDB service..." -ForegroundColor Yellow
    try {
        Start-Service MongoDB -ErrorAction Stop
        Write-Host "[OK] MongoDB started." -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Could not start MongoDB service. Please start it manually:" -ForegroundColor Red
        Write-Host "  Open PowerShell as Administrator and run:" -ForegroundColor Yellow
        Write-Host "    Start-Service MongoDB" -ForegroundColor Cyan
        Write-Host "  Or run mongod.exe manually and keep that window open." -ForegroundColor Cyan
        exit 1
    }
} else {
    if ($mongoReachable) {
        Write-Host "[OK] Using running MongoDB instance on port 27017." -ForegroundColor Green
    } else {
        Write-Host "[OK] MongoDB service already running." -ForegroundColor Green
    }
}

# 2. Clear NODE_OPTIONS (Dynatrace workaround)
$env:NODE_OPTIONS = ""

# 3. Start server + client
Write-Host "[*] Starting Express server + Vite client..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
yarn dev
