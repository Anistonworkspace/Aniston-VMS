# Plan: Fix `.claude/` boilerplate gaps surfaced by 8-dimension ultracode audit

**Created:** 2026-06-19
**Owner agent:** claude (main loop)
**Status:** complete — archived 2026-06-19
**Outcome:** Score lifted **5.9 → 8.53 / 10** (+2.63). 4 batches committed: 66f0ac9 (CRITICAL+quick wins), 52a08bb (HIGH safety+deps), 765de75 (architectural), 9f40188 (re-audit polish).
**Re-audit:** workflow `w1t3wyaw5` confirmed the lift across all 8 dimensions.

## Decisions (locked in by user 2026-06-19)

1. **Run order:** All 3 batches in one pass. Commit per batch so rollback is per-batch; no manual approval gates between batches.
2. **Logger:** Build the `requestId.ts` + AsyncLocalStorage `log()` helper that `rule-logging-standards.md` already documents. Matches docs, adds runtime infra.
3. **MSW:** Drop MSW from `/add-tests`. Document `vi.mock(RTK Query api slice)` pattern instead. No new runtime dep.
4. **Missing UI skills (dashboard/wizard/drag-drop/color-picker/date-picker):** Defer to a separate plan after Batch 3 ships. Keep this plan focused on fixing what's broken.
**Linked to:** [project-state.md](../../project-state.md)
**Audit source:** Workflow `w7eukyrl6` — 118 sub-agents, 89 verified findings, score **5.9/10**

---

## Goal

Raise `.claude/` from **5.9/10 → 8.5+/10** so a new employee can open the project and build UI features **without their copy-pasted code breaking, without missing dispatch on common UI vocabulary, and without doc/code drift wasting their first day**.

"Done" = (1) every quick-win + critical fix applied, (2) every example in skills/rules compiles against the real codebase, (3) every command in `CLAUDE.md` actually exists, (4) hooks safely block what they claim to block on Windows.

---

## Context

Audit found:
- **5 CRITICAL** bugs: copy-paste examples break TS compile (`requirePermission` arity in 7 skills + 1 rule), MVC template has 4 errors, logger helper that doesn't exist is mandated, CLAUDE.md advertises 2 commands that don't exist, force-push `-f` shorthand bypasses the safety hook.
- **10 HIGH** bugs: hook payload parser silently no-ops on Windows freshers (python3 = MS Store shim), `.env` write block misses printf/awk/jq, `db:push` guard misses `prisma db push` (space form), logger path wrong in 1 rule + 3 skills, `/release-check` runs a missing npm script, `/add-tests` recommends uninstalled `msw`, `/project-init` updates non-existent YAML keys, deny-list missing 6 dangerous commands, `skill-keyboard-shortcuts` imports nonexistent slice, `agent-electron` points to nonexistent `electron/` dir.
- **~30 MEDIUM/LOW** issues: dispatch coverage gaps (popup/drawer/widget/tooltip), redundant agent firing (testing+test-writer), missing `## Output format` sections, etc.
- **5 STRUCTURAL** improvements: standardize permission API, separate rules-as-policy from skills-as-HOW, expand UI vocabulary with sub-branching, wire COMMANDS array into hook output, implement-or-remove the missing logger infrastructure.

Full findings list: read `C:\Users\ANISTO~1\AppData\Local\Temp\claude\...\tasks\w7eukyrl6.output`.

---

## Strategy — 3 sequential batches, each approvable

```
Batch 1  → CRITICAL + Quick Wins        →  ~25 small edits  ·  ~30 min  ·  highest impact/effort
Batch 2  → HIGH safety + missing deps   →  ~10 edits + 2 npm installs  ·  ~45 min
Batch 3  → Structural (architectural)   →  4 sub-tasks  ·  ~2-4 hrs  ·  changes file shapes
```

Each batch is independently shippable. Stop after any batch and we're still strictly better than today.

---

## Batch 1 — CRITICAL + Quick Wins

**Goal:** Every copy-pasted snippet compiles. Every documented command exists. Every hook reminder fires for the right keyword.

### Step 1.1 — Fix permission API in 7 skills + 1 rule (SK-001, RULE-002)
- Files: `skill-auth-patterns.md`, `skill-mvc-patterns.md`, `skill-state-machine-patterns.md`, `skill-file-upload-patterns.md`, `skill-search-filter-patterns.md`, `skill-workflow-orchestration-patterns.md`, `skill-rbac-advanced-patterns.md`, `rule-mvc-architecture.md` (5 occurrences L283/291/299/307/315)
- Action: rewrite `requirePermission('FLAT_STRING')` → `requirePermission('resource', 'action')` matching `shared/src/permissions.ts`
- Verification: `grep -rE "requirePermission\('[A-Z_]+'\)" .claude/skills/ .claude/rules/` returns zero matches

### Step 1.2 — Fix MVC routes template (RULE-002, full)
- File: `.claude/rules/rule-mvc-architecture.md` lines 268–318
- Action: collapse duplicate import, fix `auth.js` → `auth.middleware.js`, add `import { z } from 'zod';`
- Verification: visually diff against an existing real routes file in `backend/src/modules/`

### Step 1.3 — Fix CLAUDE.md command names (CMD-001)
- File: `CLAUDE.md`
- Action: L118 `/build <module>` → `/new-module <name>` · L128 `/fix <description>` → `/fix-critical` · add missing rows for `/health`, `/deploy`, `/project-init`
- Verification: for every `/foo` in the table, `ls .claude/commands/foo.md` succeeds

### Step 1.4 — Fix force-push shorthand bypass (HK-001)
- Files: `.claude/hooks/pre-command.sh:49`, `.claude/settings.json:63`
- Action: replace regex with one catching `-f`, `--force`, `--force-with-lease` before/after branch; add `Bash(git push *-f *)` to deny-list
- Verification: `echo '{"tool_input":{"command":"git push -f origin main"}}' | bash .claude/hooks/pre-command.sh` exits 2 with BLOCKED message

### Step 1.5 — Expand `on-prompt.sh` UI vocabulary (AG-008)
- File: `.claude/hooks/on-prompt.sh:68`
- Action: append to UI regex: `popup|dialog|drawer|sheet|tooltip|toast|popover|dropdown|accordion|tab|tabs|wizard|stepper|avatar|badge|breadcrumb|snackbar|banner`
- Verification: `echo '{"prompt":"add a confirmation popup"}' | bash .claude/hooks/on-prompt.sh` outputs `agent-ui-ux` + `skill-modal-patterns.md`

### Step 1.6 — Fix wrong-skill dispatches in `on-prompt.sh` (AG-002, misc)
- File: `.claude/hooks/on-prompt.sh`
- Actions:
  - L178: add `agent-electron` to Electron block (currently only `agent-devops`)
  - L210: rate-limit branch loads `skill-rate-limiting-patterns.md` (not `skill-auth-patterns.md`)
  - Add new branch: `filter|search|sort|debounce` → `skill-search-filter-patterns.md`
  - L58: lower 15-word minimum to 5 (filters out short fresher prompts today)

### Step 1.7 — Settings.json polish
- Files: `.claude/settings.json`, `.claude/settings.local.json`
- Actions:
  - `settings.local.json:3` — delete nonsensical `Bash(2>&1)` entry
  - `settings.json:39-50` — add allows: `npm install`, `npm install *`, `npm ci`, `npm test`, `npm test *`, `git fetch *`, `git merge *`, `git stash *`, `git show *`, `which *`, `pwd`, `env`, `date`
  - `settings.json:63` — add denies: `npx prisma migrate reset*`, `npm publish*`, `docker system prune*`, `docker volume prune*`, `git reset --hard*`, `git clean -fd*`, `git push --mirror*`

### Step 1.8 — Electron path correction (AG-001)
- Files: `.claude/agents/agent-electron.md` (L18, 35, 36, 38), `.claude/skills/skill-electron-patterns.md` (L10, 74, 112, 162, 188, 253)
- Action: replace `electron/` with `agent-desktop/src/`

### Step 1.9 — Misc small skill/rule fixes
- `skill-rtk-query-patterns.md:19` — add missing `RootState` import
- `skill-search-filter-patterns.md:181,235` — expose `setSearchParams` from hook
- `skill-mvc-patterns.md:54` + `rule-api.md:4` — add `totalPages: Math.ceil(total/limit)` to pagination meta
- `rule-testing-standards.md:27-28` + `agent-code-review.md:68` — `7 roles` → `4 roles (SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE)`
- `rule-git-safety.md` — add force-push exception for secret-leak (resolves contradiction with `rule-secrets-policy.md`)

**Batch 1 verification:**
- `npm run lint` (no new errors)
- `grep -rE "requirePermission\('[A-Z_]+'\)" .claude/` returns empty
- All hook smoke tests pass

---

## Batch 2 — High-severity safety + missing deps

**Goal:** Make hooks actually block dangerous ops on Windows. Make `/release-check` and `/add-tests` actually runnable.

### Step 2.1 — Hook payload parser hardening (HK-004) — biggest single safety win
- Files: `.claude/hooks/pre-command.sh`, `lint-on-save.sh`, `on-prompt.sh`
- Action: replace `python3` first / grep fallback with `node -e` JSON.parse one-liner (node is hard project dep, present on every fresher laptop)
- Verification: test the same `{"command":"echo \\"safe\\" && rm -rf prisma/"}` payload — must exit 2

### Step 2.2 — `.env` write block hardening (HK-002)
- File: `.claude/hooks/pre-command.sh:61`
- Action: regex `(>>?|tee( -a)?)\s+\S*\.env(\.|\b)` — target-side, catches printf/awk/jq/python -c
- Verification: `printf 'X=1' > .env` blocked; legitimate `cat .env.example > .env.local` blocked too

### Step 2.3 — `db:push` production guard (HK-003)
- File: `.claude/hooks/pre-command.sh:37`
- Action: match `db:push|prisma[[:space:]]+db[[:space:]]+push`; gate on `DATABASE_URL=` on same line OR managed-DB hostnames (`amazonaws|rds|azure|gcp|supabase|neon`) OR absence of `ALLOW_DB_PUSH=1`
- Verification: `DATABASE_URL=postgres://x.aws-rds.com/app npx prisma db push` blocked even without `prod` literal

### Step 2.4 — Hook path anchoring
- All 3 hooks: add `REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"` and use for `LOG_DIR` and `SESSION_DIR`
- Verification: run a hook from inside `frontend/src/` — still logs to correct repo-root location

### Step 2.5 — Logger path realignment (REF-002)
- Files: `rule-logging-standards.md:7`, `skill-monitoring-patterns.md:10`, `skill-background-jobs-patterns.md:130,175`, `skill-caching-patterns.md:12`
- Action: replace `backend/src/utils/logger` → `backend/src/lib/logger`
- Decision needed: see **Open question 2** below

### Step 2.6 — Install missing test deps (CMD-004, CMD-005)
- Actions:
  - `npm i -D @playwright/test` at root + `npx playwright install`
  - Add `"test:e2e": "playwright test"` to root `package.json` scripts
  - Either `npm i -D msw` at frontend + set up `frontend/src/test/setupServer.ts`, OR rewrite `add-tests.md` L43 to use `vi.mock(RTK Query api slice)` pattern (cheaper) — see **Open question 3**
- Verification: `npm run test:e2e` returns non-error, lists existing `e2e/auth.spec.ts`

### Step 2.7 — `/project-init` YAML fix (CMD-006)
- Files: `memory/project-state.md`, `.claude/commands/project-init.md`
- Action: add YAML frontmatter block to `project-state.md` with the 6 keys (`project_name`, `project_slug`, `target_platforms`, etc.); update `/project-init` step 3 to update the frontmatter
- Verification: `/project-init` dry-run on a copy of `project-state.md` updates expected keys

**Batch 2 verification:**
- `npm run test:e2e -- --list` (works)
- Every `pre-command.sh` malicious sample blocked (test fixture)
- Hooks work from any CWD inside the repo

---

## Batch 3 — Structural improvements (architectural)

**Goal:** Eliminate the drift sources so Batch 1+2 don't have to be re-done in 6 months.

### Step 3.1 — Standardize the permission API source-of-truth
- Single permission table lives in `shared/src/permissions.ts`
- Add ESLint rule (custom or grep-based) banning single-arg `requirePermission('SCREAMING')` form
- Every skill/rule snippet auto-checked by CI
- Effort: medium (1 hr)

### Step 3.2 — Separate POLICY (rules) from HOW (skills)
- `rule-mvc-architecture.md`: keep the 4-layer doctrine + middleware order + 5-10 binary checklist items; **move 250 lines of code templates** into `skill-mvc-patterns.md` (which already has overlapping content — merge intelligently, don't duplicate)
- Same pass for: any other rule that contains > 30% code blocks
- After this pass: rules ≤ 80 lines, skills hold all code
- Effort: medium (1.5 hr)

### Step 3.3 — Expand `on-prompt.sh` with sub-branching + COMMANDS array
- Restructure into: (a) broad UI catch with ONE primary skill per intent, (b) `skill-ui-ux-checklist.md` always included as design-system constant, (c) **new COMMANDS array** populated per branch
- Emit "Suggested slash command" section below existing AGENTS/SKILLS/RULES
- Add new `/help` command that prints frontmatter from `.claude/commands/*.md`
- Effort: small-medium (1 hr)

### Step 3.4 — Logger infrastructure decision (RULE-001)
- **Two options** — see **Open question 2** below — needs your call before this step
- Either: build the requestId middleware + `log()` helper that the rule mandates
- Or: rewrite the rule to document the realistic existing pattern (pass `req.id` explicitly to `logger.info()`)

**Batch 3 verification:**
- Run `/start` then a UI prompt then a backend prompt — confirm correct one-skill-per-intent dispatch
- `grep -rE "requirePermission\('[A-Z_]+'\)" backend/ shared/` zero matches
- All rules ≤ 80 lines

---

## Open questions (need your call before kickoff)

1. **Run order:** Batch 1 → 2 → 3 sequentially with approval gates between each? Or full pipeline if Batch 1 looks good?
2. **Logger decision (Step 2.5 + 3.4):** Build the `requestId.ts` + AsyncLocalStorage `log()` helper that the rule mandates **(matches docs, adds runtime infra)**, OR rewrite the rule to document the existing simpler pattern **(less code, less power)**?
3. **MSW (Step 2.6):** Install MSW + set up `setupServer.ts`, OR drop MSW from `/add-tests` and document the cheaper `vi.mock` pattern instead?
4. **Scope of "missing UI patterns":** audit also flagged we have **no skill** for dashboard widgets, multi-step wizards, drag-and-drop, color pickers, date pickers — should we add `skill-dashboard-patterns.md`, `skill-wizard-patterns.md` etc. in Batch 3, or defer to a separate plan?

---

## Migration / data impact

**None.** All edits are to `.claude/` config + `CLAUDE.md` + (Batch 2.6) `package.json` deps + (Batch 2.7) `memory/project-state.md` shape.

No DB migration. No production deploy.

---

## Rollback plan

Every change is in git. Per-batch rollback:
- Batch 1: `git restore .claude/ CLAUDE.md`
- Batch 2: `git restore .claude/hooks/ package.json package-lock.json memory/project-state.md` + `npm install` to undo dep changes
- Batch 3: `git restore .claude/rules/ .claude/skills/ .claude/hooks/on-prompt.sh .claude/commands/`

No data at risk.

---

## Test plan

After each batch:
- Unit-test the changed hook scripts via the documented manual command (`echo '{...}' | bash .claude/hooks/<script>.sh`)
- Smoke-test 5 fresher-style prompts: "add a confirmation popup", "build new employee module", "the deploy is broken", "add unit tests for leave service", "build a dashboard widget" — confirm correct agents/skills/rules dispatched
- `npm run lint && npm run typecheck` clean (assuming they pass today)
- Manual: open `CLAUDE.md` and click through every `/<command>` link — every file exists

---

## Acceptance criteria

- [ ] Batch 1 — all 9 steps complete, verifications green
- [ ] Batch 2 — all 7 steps complete, verifications green
- [ ] Batch 3 — all 4 sub-tasks complete, verifications green
- [ ] Re-run the same audit workflow — overall score **≥ 8.5 / 10**
- [ ] Zero `requirePermission('SCREAMING_SNAKE')` in `.claude/`
- [ ] Zero broken cross-refs from `.claude/**/*.md` to project paths
- [ ] Every slash command in `CLAUDE.md` has a matching `.claude/commands/*.md`
- [ ] `pre-command.sh` blocks: `git push -f origin main`, `printf 'X=1' > .env`, `DATABASE_URL=postgres://x.rds.com/app npx prisma db push`
- [ ] `on-prompt.sh` dispatches correctly on: popup, drawer, tooltip, dashboard, wizard
- [ ] Updated [project-state.md](../../project-state.md) — note Boilerplate v1.1 quality bump
- [ ] Logged in today's [changes](../../changes/2026-06-19-changes.md) file
- [ ] Moved this file to `plans/_archive/2026-06-19-claude-dir-improvements-DONE.md`

---

## Notes / handoff

This plan supersedes the in-flight `.claude/` audit (workflow `w7eukyrl6`). If a future agent picks this up mid-batch:
1. Read this file first
2. Read `memory/changes/2026-06-19-changes.md` for what's already done
3. Resume from the first unchecked `- [ ]` step
4. Do NOT skip the verification step of any step — the verifications are the test plan

Reference: full raw audit findings at `C:\Users\ANISTO~1\AppData\Local\Temp\claude\...\tasks\w7eukyrl6.output` (28k tokens, 89 findings).
