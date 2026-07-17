# Shared Context

Cross-agent learnings. When one agent discovers something the next agent should also know — but it doesn't belong in a plan, change log, or ADR — record it here.

Think of this as a running scratch pad shared by every agent that works on this project. Short entries. Specific. Linkable.

## Entry format

```markdown
## YYYY-MM-DD — <topic>

**Source:** <agent-name or "user">
**Observation:** <what you learned>
**Where it matters:** <files/areas this affects>
**Action implied:** <what future agents should do differently>
```

## Entries

## 2026-05-17 — npm install hasn't been run yet

**Source:** Claude Code (Opus 4.7)
**Observation:** All scaffolded files exist, but `node_modules/` is empty. IDE diagnostics show "Cannot find module" for many imports until install runs.
**Where it matters:** Backend and frontend `*.ts` / `*.tsx` files; `backend/tsconfig.json` type-resolution.
**Action implied:** Don't try to "fix" import errors before running `npm install` at the repo root. The package.json files are correct.

## 2026-05-17 — `@boilerplate/shared` resolves via workspace symlink

**Source:** Claude Code (Opus 4.7)
**Observation:** Backend imports `@boilerplate/shared` which points to `shared/src/index.ts` directly (not a compiled artifact). This works in dev via `tsx` (which respects tsconfig paths) and in production via `tsup` (which inlines the workspace package).
**Where it matters:** `backend/src/**/*.ts`, `frontend/src/**/*.tsx`
**Action implied:** If you see "Cannot find module @boilerplate/shared" after `npm install`, run `npm install` from the repo root (not from `backend/`) so workspaces are set up. Don't add explicit `prepublish` build steps to `shared/`.

## 2026-05-17 — Refresh tokens are httpOnly cookies, not localStorage

**Source:** Claude Code (Opus 4.7)
**Observation:** `authController.login` sets refresh token as httpOnly cookie scoped to `/api/auth`. Frontend never sees it.
**Where it matters:** `backend/src/modules/auth/auth.controller.ts`, `frontend/src/app/api.ts` (refresh call body is empty — cookie carries the token).
**Action implied:** Do NOT add localStorage refresh-token storage to frontend. The 401 retry in `api.ts` POSTs to `/auth/refresh` with `credentials: 'include'` — that's the entire mechanism.
