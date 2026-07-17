# Plan: `.claude/GUIDE.md` handbook + reusability improvements

**Created:** 2026-07-09
**Owner agent:** claude (main loop)
**Status:** active — AWAITING USER APPROVAL (do not implement yet)

---

## What you asked for
1. A single reference file **in `.claude/`** documenting: the working tree, the pipeline/flow,
   what happens when you give a prompt, **every command + its purpose**, what you can check by
   command, and **how to use the repo after clone**.
2. **What more to improve** so this boilerplate can build *any* project — as a prioritized list.
3. Make it a plan, wait for approval.

---

## Deliverable A — `.claude/GUIDE.md` (the handbook)

One comprehensive, always-in-repo file. Proposed sections (your headings):

1. **What this boilerplate is** — 3 lines: agent layer + memory + build tooling, ships no app code.
2. **Working tree** — annotated folder map (`.claude/`, `memory/`, `backend/`, `frontend/`, `shared/`,
   `agent-desktop/`, `docs/`, `scripts/`) with one line on each — so you see the structure at a glance.
3. **How the pipeline & flow works** — the layers: pxpipe (token compression) → on-prompt hook
   (doctor + dispatch) → me (Claude) → edits → on-stop gate + capsule. A diagram.
4. **What happens when you give a prompt** — the step-by-step flow diagram (pxpipe → hook injects
   skills/rules → I decide → graph if needed → edit → Stop-gate), incl. the Graphify-first toggle.
5. **Command reference** — a table of EVERY slash command (`/start`, `/design-first`, `/build-loop`,
   `/graph`, `/graphify`, `/doctor`, `/handoff`, `/resume`, `/graph-always`, `/proxy-start`, … all of
   them) + its purpose + when to use.
6. **Check/verify by command** — how to inspect each part yourself:
   - `bash .claude/hooks/doctor.sh` — setup health
   - `python -m graphify update .` / `explain` / `path` — the graph
   - `cat ~/.pxpipe/events.jsonl` / dashboard — pxpipe savings
   - `/graph-always status`, `cat .claude/graph-mode` — the toggle
   - `git status`, `npm run typecheck` — repo state
7. **After clone — use this repo on a new machine** — the exact steps (Node/Python → `npm install` →
   `npm run setup:ai` → `/doctor` → `/design-first` → `/build-loop`), cross-linked to
   `docs/NEW-MACHINE-SETUP.md`.
8. **The token-saving stack** — pxpipe vs Headroom (use one), graph queries, top-3 dispatch, capsule.
9. **Toggles & knobs** — `.claude/graph-mode` (graph-first), `ALLOW_INCOMPLETE`/`/stop-anyway`
   (completion gate), `BUILD_LOOP_MAX_*` (loop caps).

**Note:** this overlaps a little with `docs/NEW-MACHINE-SETUP.md` and `docs/reference-index.md`;
GUIDE.md will *link* to them rather than duplicate, and be the single entry point.

---

## Deliverable B — Reusability improvements (prioritized; each its own approve-later step)

To make this reliably build **any** project:

| # | Improvement | Why it matters | Effort |
|---|---|---|---|
| **1** | **Foundation layer** (auth middleware + permissions + enums + `AuthUser` + auditLogger + the 4 infra Prisma models) — OR a `/bootstrap` command that scaffolds them | **The #1 blocker.** Skills/rules require these; without them, `/build-loop <feature>` generates code that imports deleted files and won't compile. You deferred this — it's the biggest lever for "open a chat and build." | med |
| **2** | **Refresh stale docs** — `docs/{database-erd,architecture,api-conventions}.md` + `SOP-Fresher-Guide.md` still describe the old 7-model HR schema | They now contradict the empty skeleton and mislead the agents | med |
| **3** | **Rewrite `memory/project-state.md`** — still lists old models/auth/39-skills/opus-4-7 | `/start` reads it; stale state misguides every session | small |
| **4** | **Archive the finished plans** (v2, agent-power, setup-doctor, this one) to `_archive/` | Keeps `_active/` truthful | small |
| **5** | **Verify the 4 core MCP servers** actually connect (`filesystem/postgres/github/memory`) | Documented but never tested; may not work on a fresh clone | small |
| **6** | **Add 1–2 smoke tests** (backend health, home page) so `npm test`/CI isn't empty | CI + `/release-check` expect tests | small |
| **7** | **Decide `.agents/`** (old Codex-format dir) — keep or delete | Redundant with `.claude/`; clutters the repo | trivial |
| **8** | **Commit + push everything** — nothing this session is on GitHub yet | Until pushed, none of this reaches a new laptop | trivial |
| **9** | **Headroom switch doc** — one-command pxpipe→Headroom (optional) | For when you want deeper compression | trivial |

I'll implement these as separate, individually-approved steps after you pick which ones (and in what order).

---

## Files this plan will add / change
- **New:** `.claude/GUIDE.md`
- **Later (per your picks in B):** foundation files OR `/bootstrap` command; refreshed docs;
  `project-state.md`; archived plans; smoke tests; MCP verification; etc.

## Verification
- GUIDE.md: every command listed resolves to a real `.claude/commands/*.md`; every check-command runs.
- Improvements: each step has its own verification when we do it.

## Rollback
- GUIDE.md is additive (`git rm` to undo). Improvement steps each reversible via `git restore`.

---

## Decisions I need
1. **GUIDE.md scope:** one comprehensive file (recommended) vs split into `COMMANDS.md` + `FLOW.md`.
2. **Which improvements to green-light now** (all of B, or a subset — e.g., docs + project-state +
   commit first, foundation later).
3. **Foundation (#1):** ship a thin foundation, add a `/bootstrap` command, or keep deferred.
