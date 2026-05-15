# start.ps1 — Start BPMN IQ 2.0 (MongoDB + Server + Client)
$ErrorActionPreference = "Stop"

Write-Host "=== BPMN IQ 2.0 Startup ===" -ForegroundColor Cyan

# 1. Ensure MongoDB is running
$mongo = Get-Service MongoDB -ErrorAction SilentlyContinue
if (-not $mongo) {
    Write-Host "[ERROR] MongoDB service not found. Install MongoDB as a Windows service first." -ForegroundColor Red
    exit 1
}
if ($mongo.Status -ne 'Running') {
    Write-Host "[*] Starting MongoDB service (requires admin)..." -ForegroundColor Yellow
    try {
        Start-Service MongoDB -ErrorAction Stop
        Write-Host "[OK] MongoDB started." -ForegroundColor Green
    } catch {
        Write-Host "[*] Elevating to start MongoDB..." -ForegroundColor Yellow
        Start-Process powershell -Verb RunAs -ArgumentList "Start-Service MongoDB" -Wait
        Start-Sleep -Seconds 2
        $mongo = Get-Service MongoDB
        if ($mongo.Status -eq 'Running') {
            Write-Host "[OK] MongoDB started (elevated)." -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Failed to start MongoDB. Start it manually: Start-Service MongoDB (as admin)" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "[OK] MongoDB already running." -ForegroundColor Green
}

# 2. Clear NODE_OPTIONS (Dynatrace workaround)
$env:NODE_OPTIONS = ""

# 3. Start server + client
Write-Host "[*] Starting Express server + Vite client..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
yarn dev
