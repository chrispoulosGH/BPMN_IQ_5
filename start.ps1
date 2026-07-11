# start.ps1 — Start BPMN IQ 2.0 (Server + Client)
$ErrorActionPreference = "Stop"

Write-Host "=== BPMN IQ 2.0 Startup ===" -ForegroundColor Cyan

# 1. MongoDB: using a remote cluster (MONGO_URI in server/.env), so no local
#    Mongo service/port check is needed here.
Write-Host "[OK] Using MongoDB connection from server/.env (MONGO_URI)." -ForegroundColor Green

# 2. Clear NODE_OPTIONS (Dynatrace workaround)
$env:NODE_OPTIONS = ""

# 3. Start server + client
Write-Host "[*] Starting Express server + Vite client..." -ForegroundColor Yellow
Set-Location $PSScriptRoot
yarn dev
