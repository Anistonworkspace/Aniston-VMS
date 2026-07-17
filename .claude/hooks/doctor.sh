#!/bin/bash
# Setup Doctor — checks the AI-tool setup (Node, Python, Graphify, handoff wiring,
# pxpipe, Headroom) both in the system and in the repo. Works the same from the
# VS Code extension and the terminal.
#
# Modes:
#   doctor.sh            check + human report; exit 0 if all REQUIRED pass, else 1
#   doctor.sh --fix      run the safe auto-installs, then re-check
#   doctor.sh --quiet    minimal output, just the exit code (for build-command gating)
#
# REQUIRED (blocks building): Node>=20, Python>=3.10, npm deps, graphifyy,
#   /graphify skill, fresh graph, handoff/capsule wiring.
# RECOMMENDED (warn only): pxpipe env+running, Headroom.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 1
LOG_DIR="$REPO_ROOT/.claude/logs"; mkdir -p "$LOG_DIR"
GREEN_MARKER="$LOG_DIR/.doctor-green"
MODE="${1:-check}"

PYBIN=""
command -v python  >/dev/null 2>&1 && PYBIN="python"
[ -z "$PYBIN" ] && command -v python3 >/dev/null 2>&1 && PYBIN="python3"

# Collect results: each is "TIER|STATUS|LABEL|FIX"
RESULTS=()
REQUIRED_FAIL=0
FIX_CMDS=()      # safe auto-fix commands (for --fix)
USER_STEPS=()    # steps only the user can do

add() { RESULTS+=("$1|$2|$3|$4"); }

# ── 1. Node ──────────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/v//; s/\..*//')
  if [ "${NODE_MAJOR:-0}" -ge 20 ]; then add REQUIRED OK "Node $(node -v)" ""
  else add REQUIRED FAIL "Node too old ($(node -v), need >=20)" "USER: install Node 20+ from nodejs.org"; REQUIRED_FAIL=1; USER_STEPS+=("Install Node 20+ from https://nodejs.org"); fi
else add REQUIRED FAIL "Node not installed" "USER"; REQUIRED_FAIL=1; USER_STEPS+=("Install Node 20+ from https://nodejs.org"); fi

# ── 2. Python ────────────────────────────────────────────────────────────────
if [ -n "$PYBIN" ]; then
  PYV=$("$PYBIN" -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
  PYMAJ=${PYV%%.*}; PYMIN=${PYV##*.}
  if [ "${PYMAJ:-0}" -ge 4 ] || { [ "${PYMAJ:-0}" -eq 3 ] && [ "${PYMIN:-0}" -ge 10 ]; }; then add REQUIRED OK "Python $PYV" ""
  else add REQUIRED FAIL "Python too old ($PYV, need >=3.10)" "USER"; REQUIRED_FAIL=1; USER_STEPS+=("Install Python 3.10+ from https://python.org"); fi
else add REQUIRED FAIL "Python not installed" "USER"; REQUIRED_FAIL=1; USER_STEPS+=("Install Python 3.10+ from https://python.org (needed for Graphify)"); fi

# ── 3. npm deps ──────────────────────────────────────────────────────────────
if [ -d "$REPO_ROOT/node_modules" ]; then add REQUIRED OK "npm deps installed" ""
else add REQUIRED FIX "npm deps missing" "npm install"; REQUIRED_FAIL=1; FIX_CMDS+=("npm install"); fi

# ── 4. Graphify package ──────────────────────────────────────────────────────
if [ -n "$PYBIN" ] && "$PYBIN" -m graphify --help >/dev/null 2>&1; then add REQUIRED OK "Graphify (python -m graphify)" ""
elif [ -n "$PYBIN" ]; then add REQUIRED FIX "Graphify not installed" "pip install graphifyy"; REQUIRED_FAIL=1; FIX_CMDS+=("pip install graphifyy"); fi

# ── 5. /graphify skill (global) ──────────────────────────────────────────────
GRAPHIFY_SKILL="$HOME/.claude/skills/graphify/SKILL.md"
if [ -f "$GRAPHIFY_SKILL" ]; then add REQUIRED OK "/graphify skill installed" ""
elif [ -n "$PYBIN" ]; then add REQUIRED FIX "/graphify skill not installed" "$PYBIN -m graphify install --platform claude"; REQUIRED_FAIL=1; FIX_CMDS+=("$PYBIN -m graphify install --platform claude"); fi

# ── 6. Graph generated + fresh ───────────────────────────────────────────────
GRAPH_JSON="$REPO_ROOT/graphify-out/graph.json"
if [ -f "$GRAPH_JSON" ]; then
  BUILT_AT=$(grep -o '"built_at_commit"[^,}]*' "$GRAPH_JSON" 2>/dev/null | grep -oE '[0-9a-f]{7,40}' | head -1)
  HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
  if [ -n "$BUILT_AT" ] && [ "${BUILT_AT:0:7}" != "${HEAD_SHA:0:7}" ]; then
    add REQUIRED FIX "graph stale (built@${BUILT_AT:0:7}, HEAD ${HEAD_SHA})" "$PYBIN -m graphify update ."; REQUIRED_FAIL=1; FIX_CMDS+=("$PYBIN -m graphify update .")
  else add REQUIRED OK "graph generated (graphify-out/)" ""; fi
elif [ -n "$PYBIN" ]; then add REQUIRED FIX "graph not generated" "$PYBIN -m graphify update ."; REQUIRED_FAIL=1; FIX_CMDS+=("$PYBIN -m graphify update ."); fi

# ── 7. handoff / capsule wiring (ships in repo) ──────────────────────────────
if [ -f "$REPO_ROOT/.claude/hooks/pre-compact.sh" ] && [ -f "$REPO_ROOT/.claude/commands/handoff.md" ] \
   && grep -q '"PreCompact"' "$REPO_ROOT/.claude/settings.json" 2>/dev/null; then
  add REQUIRED OK "handoff / capsule wiring" ""
else add REQUIRED FAIL "handoff wiring missing (repo not fully cloned?)" "USER: re-clone / git pull"; REQUIRED_FAIL=1; USER_STEPS+=("handoff files missing — run 'git pull' / re-clone the repo"); fi

# ── 8. pxpipe (RECOMMENDED) ──────────────────────────────────────────────────
if [ -n "${ANTHROPIC_BASE_URL:-}" ]; then add RECOMMENDED OK "pxpipe env set (ANTHROPIC_BASE_URL)" ""
else add RECOMMENDED WARN "pxpipe env not set (paying full token price)" "setx ANTHROPIC_BASE_URL http://127.0.0.1:47821  (then restart terminal)"; USER_STEPS+=("Optional token-saver: setx ANTHROPIC_BASE_URL http://127.0.0.1:47821 then restart terminal, and run /proxy-start"); fi

# ── 9. Headroom (OPTIONAL) ───────────────────────────────────────────────────
if [ -n "$PYBIN" ] && "$PYBIN" -m headroom --help >/dev/null 2>&1; then add OPTIONAL OK "Headroom installed" ""
else add OPTIONAL INFO "Headroom not installed (optional deeper compression)" "pip install headroom-ai"; fi

# ── AUTO-FIX MODE ────────────────────────────────────────────────────────────
if [ "$MODE" = "--fix" ]; then
  echo "🔧 Setup Doctor — running safe auto-fixes…"
  if [ ${#FIX_CMDS[@]} -eq 0 ]; then echo "   (nothing to auto-fix)"; else
    for c in "${FIX_CMDS[@]}"; do echo "   → $c"; eval "$c" 2>&1 | tail -3 || echo "   ⚠️ failed: $c"; done
  fi
  echo "Re-checking…"; exec bash "$REPO_ROOT/.claude/hooks/doctor.sh" check
fi

# ── Write/remove the green marker (drives the hard gate) ─────────────────────
if [ "$REQUIRED_FAIL" -eq 0 ]; then date '+%Y-%m-%d %H:%M:%S' > "$GREEN_MARKER"; else rm -f "$GREEN_MARKER"; fi

# ── QUIET MODE (for build-command gating) ────────────────────────────────────
if [ "$MODE" = "--quiet" ]; then exit "$REQUIRED_FAIL"; fi

# ── REPORT ───────────────────────────────────────────────────────────────────
echo "## Setup Doctor"
echo ""
for r in "${RESULTS[@]}"; do
  IFS='|' read -r tier status label fix <<< "$r"
  case "$status" in
    OK)   icon="✅";; FIX) icon="🔧";; FAIL) icon="⛔";; WARN) icon="⚠️";; *) icon="ℹ️";; esac
  line="$icon [$tier] $label"
  { [ "$status" = "FIX" ] || [ "$status" = "FAIL" ] || [ "$status" = "WARN" ]; } && [ -n "$fix" ] && line="$line  →  $fix"
  echo "$line"
done
echo ""
if [ "$REQUIRED_FAIL" -ne 0 ]; then
  echo "⛔ SETUP INCOMPLETE — required tools are missing."
  if [ ${#FIX_CMDS[@]} -gt 0 ]; then
    echo ""
    echo "Auto-fixable now (Claude may run these): $(printf '%s; ' "${FIX_CMDS[@]}")"
  fi
  if [ ${#USER_STEPS[@]} -gt 0 ]; then
    echo ""
    echo "You must do these (Claude can't):"
    for s in "${USER_STEPS[@]}"; do echo "  - $s"; done
  fi
  echo ""
  echo "HARD GATE: do NOT scaffold/build/modify project code until this is green."
  echo "Run 'bash .claude/hooks/doctor.sh --fix' (or /doctor --fix) to auto-fix, then finish any user steps."
else
  echo "✅ All required AI tools are set up — you can build."
  [ ${#USER_STEPS[@]} -gt 0 ] && { echo ""; echo "Optional token-savers still available:"; for s in "${USER_STEPS[@]}"; do echo "  - $s"; done; }
fi

exit "$REQUIRED_FAIL"
