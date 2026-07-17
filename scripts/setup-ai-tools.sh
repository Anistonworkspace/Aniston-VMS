#!/bin/bash
# One-command AI-tools setup (bash / macOS / Linux / Git-Bash).
# Idempotent — skips anything already installed. Run from repo root:
#   bash scripts/setup-ai-tools.sh     (or: npm run setup:ai)
#
# Installs: npm deps, Graphify (graphifyy) + its /graphify skill, builds the graph.
# Prints pxpipe + Headroom instructions (those are per-machine / optional).

set -uo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 1

PYBIN=""; command -v python >/dev/null 2>&1 && PYBIN="python"
[ -z "$PYBIN" ] && command -v python3 >/dev/null 2>&1 && PYBIN="python3"

echo "══════════════════════════════════════════════"
echo "  AI-tools setup — $(basename "$REPO_ROOT")"
echo "══════════════════════════════════════════════"

# 1. Node check
if command -v node >/dev/null 2>&1; then echo "✅ Node $(node -v)"
else echo "⛔ Node not found — install Node 20+ from https://nodejs.org, then re-run."; exit 1; fi

# 2. npm deps
if [ -d node_modules ]; then echo "✅ npm deps already installed"
else echo "→ npm install"; npm install || { echo "⛔ npm install failed"; exit 1; }; fi

# 3. Python check
if [ -z "$PYBIN" ]; then
  echo "⛔ Python not found — install Python 3.10+ from https://python.org, then re-run."
  echo "   (Graphify needs Python. handoff/capsule/Node-graph work without it.)"
  exit 1
fi
echo "✅ $($PYBIN --version 2>&1)"

# 4. Graphify package (NOTE: the package is 'graphifyy' with double-y; 'graphify' is an unrelated lib)
if "$PYBIN" -m graphify --help >/dev/null 2>&1; then echo "✅ Graphify already installed"
else echo "→ pip install graphifyy"; "$PYBIN" -m pip install graphifyy || pip install graphifyy || { echo "⛔ pip install graphifyy failed"; exit 1; }; fi

# 5. /graphify skill
if [ -f "$HOME/.claude/skills/graphify/SKILL.md" ]; then echo "✅ /graphify skill already installed"
else echo "→ graphify install --platform claude"; "$PYBIN" -m graphify install --platform claude || echo "⚠️ skill install failed (non-fatal)"; fi

# 6. Build the graph
echo "→ python -m graphify update .  (building codebase graph — 0 API tokens)"
"$PYBIN" -m graphify update . 2>&1 | tail -2 || echo "⚠️ graph build failed"

# 7. pxpipe (per-machine env — can't be set from here persistently)
echo ""
echo "── pxpipe (token-saving proxy) — do this once per machine ──"
echo "   setx ANTHROPIC_BASE_URL http://127.0.0.1:47821    # then restart your terminal"
echo "   each session: run  npx pxpipe-proxy   (or /proxy-start in Claude Code)"

# 8. Headroom (optional)
echo ""
echo "── Headroom (optional deeper compression) ──"
echo "   pip install headroom-ai    # then see docs/upgrade-to-headroom.md"

# 9. Final doctor check
echo ""
bash "$REPO_ROOT/.claude/hooks/doctor.sh" || true
