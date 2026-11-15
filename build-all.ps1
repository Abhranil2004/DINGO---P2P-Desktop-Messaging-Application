#!/usr/bin/env pwsh
param(
  [ValidateSet('release','debug')]
  [string]$BuildType = 'release',
  [switch]$SkipFrontend = $false
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$ReleaseDir = "$ProjectRoot\dist-release"
$Version = (Get-Content "src-tauri\tauri.conf.json" | ConvertFrom-Json).version

Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Dingo v$Version — Build All ($BuildType)" -ForegroundColor Cyan
Write-Host "  Platform: Windows + Android" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
""

# ─── Prerequisites ─────────────────────────────────────────────
@("node","rustc","pnpm") | ForEach-Object {
  if (-not (Get-Command $_ -ErrorAction SilentlyContinue)) {
    if ($_ -eq 'pnpm') {
      Write-Host "Installing pnpm..."; npm install -g pnpm
    } else {
      throw "$_ is required. Please install it."
    }
  }
}

if (-not (Get-Command "cargo" -ErrorAction SilentlyContinue)) {
  throw "Rust/Cargo required. Install from https://rustup.rs"
}

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# ─── Step 1: Frontend ──────────────────────────────────────────
if (-not $SkipFrontend) {
  Write-Host "[1/4] Installing frontend dependencies..." -ForegroundColor Yellow
  pnpm install --frozen-lockfile 2>$null
  if (-not $?) { pnpm install }

  Write-Host "[2/4] Building frontend..." -ForegroundColor Yellow
  pnpm build
  Write-Host "       → dist/"
} else {
  Write-Host "[1/4] [SKIP] Frontend build" -ForegroundColor DarkGray
}

# ─── Step 2: Windows Desktop ──────────────────────────────────
Write-Host "[3/4] Building Windows desktop..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\src-tauri"
if ($BuildType -eq 'release') {
  pnpm tauri build --bundles nsis
} else {
  cargo build
  Write-Host "       (debug — no installer created)" -ForegroundColor DarkGray
}

# Copy installer artifact
$bundleDir = "$ProjectRoot\src-tauri\target\release\bundle"
if (Test-Path $bundleDir) {
  Get-ChildItem -Path $bundleDir -Recurse -Include @('*.exe','*.msi') | ForEach-Object {
    Copy-Item $_.FullName -Destination "$ReleaseDir\" -Force
  }
  Write-Host "       Installer(s) copied:" -ForegroundColor Green
  Get-ChildItem $ReleaseDir\*.exe,$ReleaseDir\*.msi -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "         $($_.Name) ($('{0:N1} MB' -f ($_.Length/1MB)))" }
}

# ─── Step 3: Android ──────────────────────────────────────────
$androidDir = "$ProjectRoot\src-tauri\gen\android"
if (Test-Path $androidDir) {
  Write-Host "[4/4] Building Android..." -ForegroundColor Yellow

  # cargo-ndk
  if (-not (Get-Command "cargo-ndk" -ErrorAction SilentlyContinue)) {
    Write-Host "       Installing cargo-ndk..." -ForegroundColor DarkGray
    cargo install cargo-ndk
  }

  # Auto-detect NDK if not set
  if (-not $env:ANDROID_NDK_HOME) {
    $ndkRoot = "$env:USERPROFILE\Android\Sdk\ndk"
    if (Test-Path $ndkRoot) {
      $ndkDir = Get-ChildItem $ndkRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
      if ($ndkDir) {
        $env:ANDROID_NDK_HOME = $ndkDir.FullName
        Write-Host "       Detected NDK: $env:ANDROID_NDK_HOME" -ForegroundColor DarkGray
      }
    }
  }
  if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "$env:USERPROFILE\Android\Sdk"
  }

  # Build .so for all 4 ABIs
  Set-Location "$ProjectRoot\src-tauri"
  $buildFlag = if ($BuildType -eq 'release') { '--release' } else { '' }
  cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 build --lib $buildFlag
  Write-Host "       .so files built for all 4 ABIs"

  # Copy frontend assets
  $assetsDir = "$ProjectRoot\src-tauri\gen\android\app\src\main\assets"
  New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
  if (Test-Path "$ProjectRoot\dist\*") {
    Copy-Item "$ProjectRoot\dist\*" -Destination $assetsDir -Recurse -Force
    Write-Host "       Frontend assets copied"
  }

  # Build APK
  Set-Location $androidDir

  if ($BuildType -eq 'release') {
    & .\gradlew.bat assembleRelease 2>&1 | Select-Object -Last 5
    if (-not $?) {
      Write-Host "       Release build failed — falling back to debug" -ForegroundColor DarkYellow
      & .\gradlew.bat assembleDebug 2>&1 | Select-Object -Last 5
    }
  } else {
    & .\gradlew.bat assembleDebug 2>&1 | Select-Object -Last 5
  }

  # Copy APK
  Get-ChildItem -Path "$androidDir\app\build\outputs\apk" -Recurse -Filter "*.apk" | ForEach-Object {
    Copy-Item $_.FullName -Destination "$ReleaseDir\" -Force
  }
  Write-Host "       APK(s) copied:" -ForegroundColor Green
  Get-ChildItem $ReleaseDir\*.apk -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "         $($_.Name) ($('{0:N1} MB' -f ($_.Length/1MB)))" }
} else {
  Write-Host "[4/4] [SKIP] Android project not found at $androidDir" -ForegroundColor DarkGray
  Write-Host "       Run 'pnpm tauri android init' first if needed" -ForegroundColor DarkGray
}

Set-Location $ProjectRoot
""
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Build complete." -ForegroundColor Cyan
Write-Host "  Artifacts in: $ReleaseDir" -ForegroundColor Cyan
Get-ChildItem $ReleaseDir -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host "    $($_.Name)" }
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan