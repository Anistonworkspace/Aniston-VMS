# Boilerplate App — Electron Windows build script (PowerShell)
#
# Produces:
#   - NSIS installer EXE → agent-desktop/dist/BoilerplateAgent Setup <version>.exe
#   - Portable EXE       → agent-desktop/dist/BoilerplateAgent <version>.exe  (if -Portable)
#
# Prerequisites:
#   - Node.js 20+ in PATH
#   - agent-desktop/ package installed (npm install --workspace=agent-desktop)
#   - Code-signing certificate: set WINDOWS_CERT_FILE + WINDOWS_CERT_PASSWORD
#     (leave blank to skip signing — installer will show SmartScreen warning)
#
# Usage:
#   pwsh ./store-releases/electron/build-electron.ps1
#   pwsh ./store-releases/electron/build-electron.ps1 -Portable
#   pwsh ./store-releases/electron/build-electron.ps1 -AllowDirty -SkipSign

[CmdletBinding()]
param(
    [switch]$Portable,        # Also produce a portable single-file EXE
    [switch]$SkipSign,        # Skip code signing even if cert vars are set
    [switch]$AllowDirty       # Build from an unclean working tree
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot/../..").Path
$desktopDir = Join-Path $root "agent-desktop"
$buildDir = Join-Path $PSScriptRoot "build"

Write-Host "==> Building Electron Windows artifacts" -ForegroundColor Cyan
Write-Host "    Repo root: $root"

# --- Verify agent-desktop exists ---
if (-not (Test-Path $desktopDir)) {
    Write-Error "agent-desktop/ directory not found at $desktopDir. Create it first (see README)."
    exit 1
}

# --- Working-tree check ---
if (-not $AllowDirty) {
    Push-Location $root
    $dirty = git status --porcelain
    Pop-Location
    if ($dirty) {
        Write-Error "Working tree is dirty. Commit or stash, or re-run with -AllowDirty."
        exit 1
    }
}

# --- Capture build provenance ---
Push-Location $root
$sha     = (git rev-parse HEAD).Trim()
$branch  = (git rev-parse --abbrev-ref HEAD).Trim()
Pop-Location
$buildTime = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
Write-Host "    Building from $branch @ $sha"

# --- Read version from root package.json ---
$pkg = Get-Content (Join-Path $root "package.json") -ErrorAction SilentlyContinue | ConvertFrom-Json
if (-not $pkg) {
    # Fall back to frontend/package.json
    $pkg = Get-Content (Join-Path $root "frontend/package.json") | ConvertFrom-Json
}
$version = $pkg.version
Write-Host "    Version: $version"

# --- Install agent-desktop deps ---
Write-Host "==> Installing agent-desktop dependencies" -ForegroundColor Cyan
Push-Location $desktopDir
npm install
if ($LASTEXITCODE -ne 0) { Write-Error "npm install in agent-desktop failed"; exit 1 }
Pop-Location

# --- Determine signing config ---
$signArgs = @()
if (-not $SkipSign) {
    $certFile = $env:WINDOWS_CERT_FILE
    $certPass = $env:WINDOWS_CERT_PASSWORD
    if ($certFile -and (Test-Path $certFile)) {
        Write-Host "    Code signing: using cert at $certFile"
        $env:CSC_LINK     = $certFile
        $env:CSC_KEY_PASSWORD = $certPass
    } else {
        Write-Warning "WINDOWS_CERT_FILE not set or file not found — build will not be signed (SmartScreen warning expected)."
    }
}

# --- Build targets list ---
$targets = "--win nsis"
if ($Portable) { $targets = "--win nsis portable" }

# --- Run electron-builder ---
Write-Host "==> Running electron-builder ($targets)" -ForegroundColor Cyan
Push-Location $desktopDir
$buildCmd = "npx electron-builder $targets --publish never"
Write-Host "    CMD: $buildCmd"
Invoke-Expression $buildCmd
if ($LASTEXITCODE -ne 0) { Write-Error "electron-builder failed"; exit 1 }
Pop-Location

# --- Copy artifacts to store-releases/electron/build/ ---
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
$distDir = Join-Path $desktopDir "dist"

$copied = @()
Get-ChildItem -Path $distDir -Filter "*.exe" | Where-Object { $_.Name -notmatch "Uninstall" } | ForEach-Object {
    $dest = Join-Path $buildDir $_.Name
    Copy-Item -Path $_.FullName -Destination $dest -Force
    $copied += $dest
    Write-Host "    Copied: $($_.Name)"
}

# --- Write build manifest ---
$manifestPath = Join-Path $PSScriptRoot "last-build.json"
$manifest = @{
    target      = "electron-windows"
    version     = $version
    gitSha      = $sha
    gitBranch   = $branch
    builtAt     = $buildTime
    builtBy     = "$env:USERNAME on $env:COMPUTERNAME"
    artifacts   = $copied
    signed      = (-not $SkipSign -and $env:CSC_LINK -ne $null)
} | ConvertTo-Json -Depth 5
$manifest | Out-File -FilePath $manifestPath -Encoding utf8

Write-Host ""
Write-Host "==> Done." -ForegroundColor Green
Write-Host "    Manifest: $manifestPath"
foreach ($a in $copied) {
    Write-Host "    EXE:      $a"
}
Write-Host ""
Write-Host "Next: see store-releases/electron/PUBLISH_CHECKLIST.md before distributing."
