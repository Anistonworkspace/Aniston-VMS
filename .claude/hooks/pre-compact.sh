#!/bin/bash
# PreCompact hook + Stop-hook helper — writes a MECHANICAL context capsule so a
# chat's work survives compaction and can be resumed cheaply in a new chat.
#
# The capsule records: goal (from active plan), status (git), FILES IN PLAY with
# their paths (so a new chat reads them directly, no search), open next-steps, and
# recent activity. For a richer, human-authored capsule run /handoff.
#
# Arg $1 = trigger reason (e.g. "pre-compact", "session-stop"). Optional.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CAPSULE_DIR="$REPO_ROOT/memory/sessions/compact"
mkdir -p "$CAPSULE_DIR"

TRIGGER="${1:-manual}"
TS=$(date '+%Y-%m-%d %H:%M:%S')
LATEST="$CAPSULE_DIR/LATEST-capsule.md"

cd "$REPO_ROOT" || exit 0

# ── Gather mechanical state ──────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
CHANGED=$(git status --short 2>/dev/null | head -60)
DIFFSTAT=$(git diff --stat 2>/dev/null | tail -25)
# Most-recently-modified active plan (newest wins when several are active)
ACTIVE_PLAN=$(ls -t memory/plans/_active/*.md 2>/dev/null | head -1)
LATEST_CHANGES=$(ls -t memory/changes/*-changes.md 2>/dev/null | head -1)

# Goal + next-steps from the active plan (if any)
GOAL="(no active plan — see git status below)"
NEXT_STEPS="(none recorded — check the active plan / git status)"
if [ -n "$ACTIVE_PLAN" ]; then
  GOAL=$(grep -m1 -A2 '^## Goal' "$ACTIVE_PLAN" 2>/dev/null | tail -n +2 | head -3 | sed 's/^/  /')
  [ -z "$GOAL" ] && GOAL="  (see $ACTIVE_PLAN)"
  # unchecked todo items
  NEXT_STEPS=$(grep -nE '^\s*-\s*\[ \]' "$ACTIVE_PLAN" 2>/dev/null | head -12 | sed 's/^/  /')
  [ -z "$NEXT_STEPS" ] && NEXT_STEPS="  (no open [ ] items in $ACTIVE_PLAN)"
fi

# Files in play — changed files with a one-line purpose guess from the path
FILES_IN_PLAY=$(git status --short 2>/dev/null | awk '{print $2}' | grep -vE '^$' | head -40 | while read -r f; do
  case "$f" in
    *.service.ts)     role="backend service (business logic)";;
    *.controller.ts)  role="backend controller (thin)";;
    *.routes.ts)      role="backend routes (middleware chain)";;
    *.validation.ts)  role="Zod request schemas";;
    *Api.ts|*.api.ts) role="RTK Query API slice";;
    *Slice.ts)        role="Redux slice";;
    *Page.tsx)        role="page component";;
    *.tsx)            role="React component";;
    prisma/schema.prisma) role="Prisma schema (data model)";;
    *.md)             role="doc";;
    .claude/hooks/*)  role="Claude Code hook";;
    .claude/commands/*) role="slash command";;
    .claude/*)        role="Claude config";;
    *)                role="";;
  esac
  echo "  - \`$f\` — $role"
done)
[ -z "$FILES_IN_PLAY" ] && FILES_IN_PLAY="  (working tree clean)"

# ── Write the capsule ────────────────────────────────────────────────────────
cat > "$LATEST" << CAPSULE
# Context Capsule (auto) — ${TS}

> Auto-written by \`pre-compact.sh\` (trigger: ${TRIGGER}). This is the MECHANICAL
> snapshot so work survives compaction. For a richer, human-authored capsule run
> **/handoff**. To resume in a new chat: paste this file, or run **/resume**.

**Branch:** ${BRANCH}
**Active plan:** ${ACTIVE_PLAN:-none}
**Latest changes log:** ${LATEST_CHANGES:-none}

## Goal
${GOAL}

## Open next steps
${NEXT_STEPS}

## Files in play (read these directly — no search needed)
${FILES_IN_PLAY}

## Working-tree status
\`\`\`
${CHANGED:-clean}
\`\`\`

## Diff stat
\`\`\`
${DIFFSTAT:-none}
\`\`\`

## ── PASTE-TO-RESUME ──
Resume the work above. Read the "Files in play" directly (do not re-search the repo).
Read the active plan (${ACTIVE_PLAN:-none}) and the latest changes log for full context,
then continue from "Open next steps". Follow rule-completion-standards.md (finish to production).
CAPSULE

# Timestamped copy too (so history is kept)
STAMP=$(date '+%Y-%m-%d-%H%M')
cp "$LATEST" "$CAPSULE_DIR/${STAMP}-capsule.md" 2>/dev/null || true

echo "Context capsule refreshed → memory/sessions/compact/LATEST-capsule.md (trigger: ${TRIGGER})"
exit 0
