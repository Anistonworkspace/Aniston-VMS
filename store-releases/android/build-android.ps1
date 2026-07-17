# Boilerplate App — Android build script (Windows PowerShell)
#
# Produces:
#   - Release APK  → frontend/android/app/build/outputs/apk/release/app-release.apk
#   - Release AAB  → frontend/android/app/build/outputs/bundle/release/app-release.aab
#
# Prerequisites:
#   - Java 17 in PATH (javac --version)
#   - ANDROID_HOME / ANDROID_SDK_ROOT set
#   - Release keystore + env (load via .keystore-env)
#   - Frontend already built once: npm run build --workspace=frontend
#   - Capacitor android platform added: cd frontend && npx cap add android
#
# Usage:
#   pwsh ./store-releases/android/build-android.ps1
#   pwsh ./store-releases/android/build-android.ps1 -SkipApk
#   pwsh ./store-releases/android/build-android.ps1 -AllowDirty

[CmdletBinding()]
param(
    [switch]$SkipApk,
    [switch]$SkipAab,
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot/../..").Path

Write-Host "==> Building Android artifacts" -ForegroundColor Cyan
Write-Host "    Repo root: $root"

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
$sha = (git rev-parse HEAD).Trim()
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Pop-Location
$buildTime = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
Write-Host "    Building from $branch @ $sha"

# --- Load keystore env ---
$envFile = Join-Path $PSScriptRoot ".keystore-env"
if (-not (Test-Path $envFile)) {
    Write-Error "Missing .keystore-env file at $envFile. Copy .keystore-env.template and fill in real values."
    exit 1
}
Get-Content $envFile | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
    $name, $value = $_.Split("=", 2)
    Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
}
@("ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD") | ForEach-Object {
    if (-not (Get-Item "Env:$_" -ErrorAction SilentlyContinue).Value) {
        Write-Error "Required env var $_ is empty after loading .keystore-env"
        exit 1
    }
}

# --- Build frontend PWA dist ---
Write-Host "==> Building frontend dist" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
Pop-Location

# --- Sync to Capacitor android project ---
Write-Host "==> Syncing Capacitor android platform" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Error "cap sync failed"; exit 1 }
Pop-Location

# --- Bump version code from package.json ---
$pkg = Get-Content (Join-Path $root "frontend/package.json") | ConvertFrom-Json
$versionName = $pkg.version
$versionCode = [int]((Get-Date -UFormat %s) / 60)  # minutes since epoch — monotonic, fits int32
Write-Host "    versionName=$versionName  versionCode=$versionCode"

$buildGradle = Join-Path $root "frontend/android/app/build.gradle"
if (Test-Path $buildGradle) {
    $content = Get-Content $buildGradle -Raw
    $content = $content -replace 'versionCode\s+\d+', "versionCode $versionCode"
    $content = $content -replace 'versionName\s+"[^"]*"', "versionName `"$versionName`""
    Set-Content -Path $buildGradle -Value $content -Encoding utf8
}

# --- Gradle build ---
$androidDir = Join-Path $root "frontend/android"
Push-Location $androidDir

if (-not $SkipApk) {
    Write-Host "==> Assembling release APK" -ForegroundColor Cyan
    .\gradlew.bat assembleRelease `
        "-Pandroid.injected.signing.store.file=$env:ANDROID_KEYSTORE_PATH" `
        "-Pandroid.injected.signing.store.password=$env:ANDROID_KEYSTORE_PASSWORD" `
        "-Pandroid.injected.signing.key.alias=$env:ANDROID_KEY_ALIAS" `
        "-Pandroid.injected.signing.key.password=$env:ANDROID_KEY_PASSWORD"
    if ($LASTEXITCODE -ne 0) { Write-Error "APK build failed"; exit 1 }
}

if (-not $SkipAab) {
    Write-Host "==> Assembling release AAB" -ForegroundColor Cyan
    .\gradlew.bat bundleRelease `
        "-Pandroid.injected.signing.store.file=$env:ANDROID_KEYSTORE_PATH" `
        "-Pandroid.injected.signing.store.password=$env:ANDROID_KEYSTORE_PASSWORD" `
        "-Pandroid.injected.signing.key.alias=$env:ANDROID_KEY_ALIAS" `
        "-Pandroid.injected.signing.key.password=$env:ANDROID_KEY_PASSWORD"
    if ($LASTEXITCODE -ne 0) { Write-Error "AAB build failed"; exit 1 }
}

Pop-Location

# --- Write build manifest ---
$manifestPath = Join-Path $PSScriptRoot "..\..\store-releases\android\last-build.json"
$manifest = @{
    target = "android"
    versionName = $versionName
    versionCode = $versionCode
    gitSha = $sha
    gitBranch = $branch
    builtAt = $buildTime
    builtBy = "$env:USERNAME on $env:COMPUTERNAME"
    apkPath = if ($SkipApk) { $null } else { "frontend/android/app/build/outputs/apk/release/app-release.apk" }
    aabPath = if ($SkipAab) { $null } else { "frontend/android/app/build/outputs/bundle/release/app-release.aab" }
} | ConvertTo-Json -Depth 5
$manifest | Out-File -FilePath $manifestPath -Encoding utf8

Write-Host ""
Write-Host "==> Done." -ForegroundColor Green
Write-Host "    Manifest: $manifestPath"
if (-not $SkipApk) {
    Write-Host "    APK:      $root/frontend/android/app/build/outputs/apk/release/app-release.apk"
}
if (-not $SkipAab) {
    Write-Host "    AAB:      $root/frontend/android/app/build/outputs/bundle/release/app-release.aab"
}
Write-Host ""
Write-Host "Next: see store-releases/android/PUBLISH_CHECKLIST.md before uploading to Play Console."
