# One-command local setup for boilerplate-app (Windows PowerShell)
# Usage: .\scripts\setup.ps1
# Run in PowerShell (not Command Prompt)

$ErrorActionPreference = "Stop"

function ok($msg)   { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function info($msg) { Write-Host "  -->   $msg" -ForegroundColor Cyan }
function warn($msg) { Write-Host "  [!]   $msg" -ForegroundColor Yellow }
function fail($msg) { Write-Host "  [X]   $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Boilerplate App -- One-Command Setup (Windows)" -ForegroundColor White
Write-Host "  ================================================" -ForegroundColor White
Write-Host ""

# -- Prerequisites check ------------------------------------------------------
info "Checking prerequisites..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { fail "Node.js not found. Install from https://nodejs.org (v20+)" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { fail "Docker not found. Install Docker Desktop from https://docker.com/products/docker-desktop" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { fail "npm not found (should come with Node.js)" }

$nodeVersion = (node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if ([int]$nodeVersion -lt 20) { fail "Node.js v20+ required (found v$nodeVersion)" }

ok "Node.js $(node --version)"
ok "Docker $(docker --version)"

# -- Docker running? ----------------------------------------------------------
try { docker info 2>&1 | Out-Null } catch { fail "Docker daemon is not running. Start Docker Desktop and try again." }
ok "Docker daemon is running"

# -- .env setup ---------------------------------------------------------------
if (-not (Test-Path ".env")) {
    info "Creating .env from .env.example..."
    Copy-Item ".env.example" ".env"

    info "Generating secrets..."
    $jwtSecret    = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    $jwtRefresh   = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    $encKey       = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"

    $content = Get-Content ".env" -Raw
    $content = $content -replace 'JWT_SECRET=.*',        "JWT_SECRET=$jwtSecret"
    $content = $content -replace 'JWT_REFRESH_SECRET=.*', "JWT_REFRESH_SECRET=$jwtRefresh"
    $content = $content -replace 'ENCRYPTION_KEY=.*',    "ENCRYPTION_KEY=$encKey"
    Set-Content ".env" $content
    ok ".env created with generated secrets"
} else {
    ok ".env already exists -- skipping"
}

# -- Start Docker services ----------------------------------------------------
info "Starting PostgreSQL + Redis..."
Push-Location docker
docker compose -f docker-compose.yml up -d
Pop-Location

info "Waiting for PostgreSQL to be ready..."
$maxWait = 30; $waited = 0
while ($true) {
    $result = docker exec boilerplate_postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
    $waited++
    if ($waited -ge $maxWait) { fail "PostgreSQL did not start in ${maxWait}s" }
}
ok "PostgreSQL is ready"

$waited = 0
while ($true) {
    $result = docker exec boilerplate_redis redis-cli ping 2>&1
    if ($result -eq "PONG") { break }
    Start-Sleep -Seconds 1
    $waited++
    if ($waited -ge 20) { fail "Redis did not start in 20s" }
}
ok "Redis is ready"

# -- npm install --------------------------------------------------------------
info "Installing npm dependencies..."
npm install --silent
ok "Dependencies installed"

# -- Database setup -----------------------------------------------------------
info "Running Prisma migrations..."
npm run db:generate --silent
npm run db:push --silent
ok "Database schema applied"

info "Seeding database..."
npm run db:seed
ok "Database seeded (admin@example.com / manager@example.com / employee@example.com -- password: Password123!)"

# -- Done ---------------------------------------------------------------------
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run the app:"
Write-Host "    npm run dev"
Write-Host ""
Write-Host "  URLs:"
Write-Host "    App           -> http://localhost:5173"
Write-Host "    API docs      -> http://localhost:4000/api/docs"
Write-Host "    Health check  -> http://localhost:4000/api/health"
Write-Host "    Prisma Studio -> npm run db:studio"
Write-Host ""
Write-Host "  Claude Code:"
Write-Host "    Open VS Code -> open a Claude chat -> type /start"
Write-Host ""
