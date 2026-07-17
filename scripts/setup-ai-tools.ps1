# One-command AI-tools setup (Windows / PowerShell).
# Idempotent — skips anything already installed. Run from repo root:
#   .\scripts\setup-ai-tools.ps1      (or: npm run setup:ai:win)
#
# Installs: npm deps, Graphify (graphifyy) + its /graphify skill, builds the graph.
# Prints pxpipe + Headroom instructions (per-machine / optional).

$ErrorActionPreference = "Continue"
$repo = (git rev-parse --show-toplevel 2>$null); if (-not $repo) { $repo = (Get-Location).Path }
Set-Location $repo

Write-Host "══════════════════════════════════════════════"
Write-Host "  AI-tools setup — $(Split-Path $repo -Leaf)"
Write-Host "══════════════════════════════════════════════"

# 1. Node
if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "OK  Node $(node -v)" }
else { Write-Host "BLOCK  Node not found — install Node 20+ from https://nodejs.org, then re-run."; exit 1 }

# 2. npm deps
if (Test-Path "node_modules") { Write-Host "OK  npm deps already installed" }
else { Write-Host "->  npm install"; npm install; if ($LASTEXITCODE -ne 0) { Write-Host "BLOCK  npm install failed"; exit 1 } }

# 3. Python
$py = $null
foreach ($c in @("python","python3","py")) { if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break } }
if (-not $py) { Write-Host "BLOCK  Python not found — install Python 3.10+ from https://python.org, then re-run."; exit 1 }
Write-Host "OK  $(& $py --version)"

# 4. Graphify (package is 'graphifyy' with double-y; 'graphify' is an unrelated lib)
& $py -m graphify --help *> $null
if ($LASTEXITCODE -eq 0) { Write-Host "OK  Graphify already installed" }
else { Write-Host "->  pip install graphifyy"; & $py -m pip install graphifyy }

# 5. /graphify skill
if (Test-Path "$HOME\.claude\skills\graphify\SKILL.md") { Write-Host "OK  /graphify skill already installed" }
else { Write-Host "->  graphify install --platform claude"; & $py -m graphify install --platform claude }

# 6. Build the graph
Write-Host "->  python -m graphify update .  (building codebase graph — 0 API tokens)"
& $py -m graphify update .

# 7. pxpipe env (persistent)
Write-Host ""
Write-Host "── pxpipe (token-saving proxy) — do this once per machine ──"
Write-Host "   setx ANTHROPIC_BASE_URL http://127.0.0.1:47821   # then restart your terminal"
Write-Host "   each session: run  npx pxpipe-proxy   (or /proxy-start in Claude Code)"

# 8. Headroom (optional)
Write-Host ""
Write-Host "── Headroom (optional deeper compression) ──"
Write-Host "   pip install headroom-ai    # then see docs/upgrade-to-headroom.md"

# 9. Final doctor check
Write-Host ""
bash "$repo/.claude/hooks/doctor.sh"
