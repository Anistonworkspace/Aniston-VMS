#!/bin/bash
# Stop hook — fires when the agent finishes responding.
#
# 1. COMPLETION GATE (Fable-grade persistence): if the working tree has uncommitted
#    CODE changes that contain incompleteness markers (TODO/FIXME/not-implemented/
#    stubs/backend console.log), BLOCK the stop and tell Claude to finish. Capped at
#    3 consecutive blocks; escape with /stop-anyway or ALLOW_INCOMPLETE=1.
# 2. Refreshes the context capsule (memory/sessions/compact/) if one exists.
# 3. Creates a session stub (one per 60-min window) and prints the end-of-session checklist.

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "")
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOG_DIR="$REPO_ROOT/.claude/logs"
SESSION_DIR="$REPO_ROOT/memory/sessions"
mkdir -p "$LOG_DIR" "$SESSION_DIR"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATE=$(date '+%Y-%m-%d')
TIME=$(date '+%H%M')
COUNT_FILE="$LOG_DIR/.stop-gate-count"
ANYWAY_FILE="$LOG_DIR/.stop-anyway"

echo "[${TIMESTAMP}] SESSION STOP" >> "$LOG_DIR/command-history.log"

# ── COMPLETION GATE ───────────────────────────────────────────────────────────
# Escape hatch: /stop-anyway marker or ALLOW_INCOMPLETE=1 → skip the gate once.
if [ -f "$ANYWAY_FILE" ] || [ "${ALLOW_INCOMPLETE:-0}" = "1" ]; then
  rm -f "$ANYWAY_FILE" "$COUNT_FILE"
else
  # Only gate when there are uncommitted CODE changes (not pure conversation/docs).
  CHANGED_CODE=$(git -C "$REPO_ROOT" diff --name-only -- '*.ts' '*.tsx' 2>/dev/null; \
                 git -C "$REPO_ROOT" diff --cached --name-only -- '*.ts' '*.tsx' 2>/dev/null)
  if [ -n "$CHANGED_CODE" ]; then
    # Scan ONLY added lines (git diff, lines starting with +) for incompleteness.
    DIFF=$(git -C "$REPO_ROOT" diff -- '*.ts' '*.tsx' 2>/dev/null; git -C "$REPO_ROOT" diff --cached -- '*.ts' '*.tsx' 2>/dev/null)
    ADDED=$(printf '%s\n' "$DIFF" | grep -E '^\+' | grep -vE '^\+\+\+')

    MARKERS=""
    echo "$ADDED" | grep -qiE '(^|[^a-z])(TODO|FIXME|XXX|HACK)([^a-z]|:|$)' && MARKERS="${MARKERS}- TODO/FIXME/XXX marker\n"
    echo "$ADDED" | grep -qiE "not[ _]?implemented|throw new Error\(['\"].*not implemented" && MARKERS="${MARKERS}- 'not implemented' stub\n"
    echo "$ADDED" | grep -qiE '//[[:space:]]*(stub|placeholder|fill in|implement me)' && MARKERS="${MARKERS}- stub/placeholder comment\n"
    # Backend console.log violates rule-logging-standards (no-console). Check added lines in backend files.
    BACKEND_CONSOLE=$(git -C "$REPO_ROOT" diff -- 'backend/**/*.ts' 2>/dev/null | grep -E '^\+' | grep -E 'console\.(log|error|warn|info|debug)' | head -1)
    [ -n "$BACKEND_CONSOLE" ] && MARKERS="${MARKERS}- console.* added in backend (use logger, see rule-logging-standards)\n"

    if [ -n "$MARKERS" ]; then
      COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
      COUNT=$((COUNT + 1))
      if [ "$COUNT" -ge 3 ]; then
        # Don't trap the user — after 3 blocks, allow stop with a loud warning.
        rm -f "$COUNT_FILE"
        echo "" >&2
        echo "⚠️  COMPLETION GATE: still incomplete after 3 attempts — allowing stop." >&2
        echo -e "$MARKERS" >&2
      else
        echo "$COUNT" > "$COUNT_FILE"
        # Block the stop: emit the Stop-hook control JSON so Claude keeps going.
        REASON="Work is not production-complete — finish it before stopping. Found:\n$(echo -e "$MARKERS")\nResolve every item, then run 'npm run typecheck' and 'npm run lint'. If you must stop with incomplete work, run /stop-anyway first. (attempt ${COUNT}/3)"
        printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$REASON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.stringify(d)))" 2>/dev/null || printf '"%s"' "finish incomplete work before stopping")"
        exit 0
      fi
    else
      # Clean stop — reset the counter.
      rm -f "$COUNT_FILE"
    fi
  fi
fi

# ── Refresh the context capsule if the writer exists ─────────────────────────
if [ -x "$REPO_ROOT/.claude/hooks/pre-compact.sh" ]; then
  bash "$REPO_ROOT/.claude/hooks/pre-compact.sh" "session-stop" >/dev/null 2>&1 || true
fi

# ── Dedup: only create one session stub per 60-minute window ─────────────────
RECENT=$(find "$SESSION_DIR" -maxdepth 1 -name "${DATE}-*.md" -not -name "_template.md" \
  -mmin -60 2>/dev/null | head -1 || echo "")

if [ -z "$RECENT" ]; then
  SESSION_FILE="${SESSION_DIR}/${DATE}-${TIME}.md"
  cat > "$SESSION_FILE" << SESSIONEOF
# Session Log — ${DATE} ${TIME}

**Status:** UNSAVED — run /done to complete this log
**Stopped:** ${TIMESTAMP}

---

## What was worked on

<!-- Run /done to fill this in properly -->

---

## Files changed

<!-- Run /done to fill this in properly -->

---

## Incomplete work

- (Run /done to record any incomplete tasks)

---

> Auto-created by on-stop.sh. Run /done to save a proper session log, or /handoff for a portable context capsule.
SESSIONEOF
fi

# ── End-of-session checklist ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        END-OF-SESSION CHECKLIST              ║"
echo "╠══════════════════════════════════════════════╣"
echo "║ 1. memory/project-state.md updated?         ║"
echo "║ 2. memory/changes/${DATE}-changes.md?       ║"
echo "║ 3. Locks released in locks.md?              ║"
echo "║ 4. Incomplete work? → write handoff          ║"
echo "║ 5. Done? → move plan to _archive/            ║"
echo "║ 6. Long chat? → /handoff (context capsule)   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

exit 0
