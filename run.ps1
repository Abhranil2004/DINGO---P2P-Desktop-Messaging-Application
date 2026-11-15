<#
.SYNOPSIS
  Dingo Project Runner (Windows PowerShell)
.DESCRIPTION
  Installs dependencies and launches Dingo in dev mode.
  Use -Relay to start the WebSocket relay server alongside.
.EXAMPLE
  .\run.ps1          # normal dev
  .\run.ps1 -Relay   # also start relay server
#>
param([switch]$Relay)

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Dingo P2P Messaging And Sharing App" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

# Ensure Rust is in PATH (rustup default location)
$rustPath = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $rustPath) {
  $env:PATH = "$rustPath;$env:PATH"
}

# Check prerequisites
$missing = @()
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
  $missing += "Node.js (v18+) — download from https://nodejs.org"
}
if (-not (Get-Command "rustc" -ErrorAction SilentlyContinue)) {
  $missing += "Rust — install from https://rustup.rs"
}
if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
  Write-Host "[...] Installing pnpm globally..." -ForegroundColor Yellow
  npm install -g pnpm
}

if ($missing.Count -gt 0) {
  Write-Host "ERROR: Missing prerequisites:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "[1/3] Installing frontend dependencies..." -ForegroundColor Green
pnpm install

Write-Host "[2/3] Building frontend..." -ForegroundColor Green
pnpm build

Write-Host "[3/3] Checking tauri.conf.json..." -ForegroundColor Green
if (-not (Test-Path "src-tauri/tauri.conf.json")) {
  Write-Host "ERROR: src-tauri/tauri.conf.json missing. It was gitignored — create it or restore from backup." -ForegroundColor Red
  exit 1
}

# Start relay server (optional)
$relayJob = $null
if ($Relay) {
  Write-Host "[  + ] Starting WebSocket relay server..." -ForegroundColor Yellow
  Push-Location relay-server
  npm install --silent
  $relayJob = Start-Job -ScriptBlock { node server.js }
  Pop-Location
  Write-Host "       Relay running (Job ID $($relayJob.Id))" -ForegroundColor Yellow
}

Write-Host "`nLaunching Dingo in dev mode..." -ForegroundColor Green

try {
  pnpm tauri dev
}
finally {
  if ($relayJob) {
    Write-Host "Stopping relay server..." -ForegroundColor Yellow
    Stop-Job $relayJob -ErrorAction SilentlyContinue
    Remove-Job $relayJob -ErrorAction SilentlyContinue
  }
}
