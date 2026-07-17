#!/bin/bash
# PreToolUse hook — fires before every Bash tool call.
# Receives the tool call as JSON on stdin. Parses with `node` (project hard dep);
# falls back to grep only if node is missing AND warns once.
# Blocks dangerous operations, logs every command, reminds about side effects.

set -uo pipefail

INPUT=$(cat)
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOG_DIR="$REPO_ROOT/.claude/logs"
mkdir -p "$LOG_DIR"

# ── Extract the bash command from stdin JSON ──────────────────────────────────
# node is a hard project dep at v18+, so prefer it; python3 on Windows is the
# MS Store shim and exits 49, breaking the legacy parser.
COMMAND=""
if command -v node &>/dev/null; then
  COMMAND=$(printf '%s' "$INPUT" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const o = JSON.parse(d); console.log(o.tool_input?.command ?? ''); }
  catch { console.log(''); }
});
" 2>/dev/null || echo "")
fi

# Fallback (only used if node is missing — warn once)
if [ -z "$COMMAND" ] && ! command -v node &>/dev/null; then
  if [ ! -f "$LOG_DIR/.node-missing-warned" ]; then
    echo "WARN: node not found on PATH — .claude hooks will be degraded. Install Node 18+." >&2
    touch "$LOG_DIR/.node-missing-warned"
  fi
  COMMAND=$(printf '%s' "$INPUT" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' 2>/dev/null \
    | head -1 | sed 's/.*": "//' | sed 's/"$//' || echo "")
fi

# Log the command
echo "[$(date '+%Y-%m-%d %H:%M:%S')] CMD: $COMMAND" >> "$LOG_DIR/command-history.log"

# ── Safety blocks ─────────────────────────────────────────────────────────────

# `git commit -m`/`-F` carries arbitrary text in its message — including
# documentation of dangerous patterns ("don't run rm -rf prisma/"). Skip the
# pattern-based safety checks for the commit message itself, but KEEP every
# other guard (force-push check below applies to `git push`, not `git commit`).
IS_GIT_COMMIT=0
if echo "$COMMAND" | grep -qE "^[[:space:]]*git[[:space:]]+commit[[:space:]]+(-m|-F|--message|--file)\b"; then
  IS_GIT_COMMIT=1
fi

# Block accidental production db:push.
# Catches: db:push (npm script form) AND `prisma db push` (CLI form with space).
# Gates: literal prod/production text OR managed-DB hostname on the same line
# (amazonaws, rds, azure, gcp, supabase, neon, render, fly).
if [ "$IS_GIT_COMMIT" = "0" ] && echo "$COMMAND" | grep -qE "db:push|prisma[[:space:]]+db[[:space:]]+push"; then
  if echo "$COMMAND" | grep -qiE "prod|production|aws|amazonaws|rds|azure|gcp|supabase|neon|render\.com|fly\.io"; then
    if [ "${ALLOW_DB_PUSH:-0}" != "1" ]; then
      echo "BLOCKED: db:push against a production-shaped DATABASE_URL. Use: npx prisma migrate deploy."
      echo "  (override for staging clones: ALLOW_DB_PUSH=1 <your-command>)"
      exit 2
    fi
  fi
fi

# Block wiping critical source directories
if [ "$IS_GIT_COMMIT" = "0" ] && echo "$COMMAND" | grep -qE "rm[[:space:]]+-rf.*(prisma/|backend/src/|frontend/src/|shared/src/|\.claude/|memory/)"; then
  echo "BLOCKED: Cannot rm -rf critical source directories."
  exit 2
fi

# Block force-push to main/master (catches -f shorthand AND --force / --force-with-lease, regardless of arg order)
if [ "$IS_GIT_COMMIT" = "0" ] && echo "$COMMAND" | grep -qE "git[[:space:]]+push.*(-f([[:space:]]|$)|--force[a-z-]*).*\b(main|master)\b|git[[:space:]]+push.*\b(main|master)\b.*(-f([[:space:]]|$)|--force[a-z-]*)"; then
  echo "BLOCKED: Force-push to main/master is not allowed per rule-git-safety.md"
  exit 2
fi

# Block piped remote execution
if [ "$IS_GIT_COMMIT" = "0" ] && echo "$COMMAND" | grep -qE "(curl|wget)[[:space:]]+.*\|[[:space:]]*(ba)?sh"; then
  echo "BLOCKED: Piping remote scripts to bash is a security risk."
  exit 2
fi

# Block writing to .env files via any command — target-side check.
# Catches echo/printf/cat/tee/awk/jq — anything that redirects (>, >>, tee, tee -a)
# to a path ending in .env, .env.local, .env.production, etc.
# Also catches the shell-wrapped form `sh -c "... > .env"` and `bash -c '... > .env'`
# (where the redirect target sits inside a quoted sub-command).
if [ "$IS_GIT_COMMIT" = "0" ] && echo "$COMMAND" | grep -qE "(>>?|tee([[:space:]]+-a)?)[[:space:]]*[^|;&\"']*\.env(\.[a-zA-Z]+)?([[:space:]]*($|[|;&\"']))?"; then
  echo "BLOCKED: Do not write secrets to .env files via bash. Edit .env in your editor."
  exit 2
fi

# ── Reminders ─────────────────────────────────────────────────────────────────

# Remind about Prisma client after schema change
if echo "$COMMAND" | grep -qE "db:push|db:migrate|prisma[[:space:]]+migrate"; then
  echo "REMINDER: Run 'npm run db:generate' after this to regenerate the Prisma client."
fi

# Remind to update memory after commit
if echo "$COMMAND" | grep -qE "git[[:space:]]+commit"; then
  echo "REMINDER: Run /done to update memory/project-state.md and log this session's changes."
fi

# Warn before any push
if echo "$COMMAND" | grep -qE "git[[:space:]]+push"; then
  echo "REMINDER: rule-git-safety.md — confirm the branch and diff before pushing."
fi

exit 0
