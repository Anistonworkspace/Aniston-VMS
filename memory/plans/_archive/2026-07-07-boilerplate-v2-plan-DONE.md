# Plan: Boilerplate v2 — automation, cost efficiency, modern UI, generic starter

**Created:** 2026-07-07
**Owner agent:** claude (main loop)
**Status:** active — IN PROGRESS (Phase 1 started 2026-07-07)

## Decisions locked in by user 2026-07-07

1. **Run order:** Full pipeline, per-phase commits. Explicit re-confirm gate before Phase 6 (breaking migration).
2. **Proxy (Phase 1):** pxpipe wired + Headroom documented as upgrade path.
3. **MCP catalog (Phase 2):** 12 servers documented, 4 core auto-wired (filesystem, postgres, github, memory).
4. **Modern UI skills (Phase 3):** all 7 new skills.
5. **Design-first depth (Phase 4):** 8 questions, thorough.
6. **Build-loop guardrails (Phase 5):** 5 iterations / 200k tokens, env-configurable.
7. **HR cleanup aggression (Phase 6):** Moderate — delete Employee/Department/Designation, rewrite dashboard as neutral placeholder.
8. **Aniston brand:** Rename to "Boilerplate Design System".
**Depends on:** completed [2026-06-19 .claude/ audit plan](../_archive/2026-06-19-claude-dir-improvements-DONE.md)

---

## Goal

Turn the current project from a **"HR-flavored fullstack PWA with a great Claude Code integration"** into a **"generic v2 boilerplate that automates the full delivery cycle for any web app"**:

1. **Cheaper** — pxpipe / Headroom lower Claude Code token bill by 60–95 %.
2. **Smarter about the codebase** — Graphify + MCP servers give the model semantic memory instead of grep-only search.
3. **Modern UI on par with reactbits.dev** — new skills covering hero/landing, bento, marquee, 3D bg, command palette, animated data grid, drag-drop, motion-heavy dashboards.
4. **Design-first** — every new project starts with `/design-first`: user stories → data model → state machines → API contract → screens → THEN code.
5. **Test-driven with a completion loop** — `/build-loop <module>` writes tests first, implements, runs, and self-corrects until every test passes (bounded by cost cap).
6. **Wire-completeness** — no half-built features. Every scaffolded module goes through a `/verify-wired` pass (UI → mutation → route → controller → service → DB → socket → cache invalidation → UI re-render) before it can be marked done.
7. **Generic** — strip HR-specific models (Employee, Department, Designation, aadhaar/pan/bank fields), the leave/payroll examples in skills, and Aniston-brand naming. Ship a real starter, not an HR app.

"Done" = a fresher can clone this repo, run `npm run setup`, run `/project-init MyApp "…"`, run `/design-first`, then `/build-loop <module>`, and the agent delivers a fully-wired, tested feature at ~30 % of the current token cost — with zero HR-domain remnants in their new project.

---

## Context

### What's good today (from re-audit, 8.53 / 10)
- Auto-dispatch keyword hook, 39 skills, 17 rules, 19 agents, 18 slash commands
- Memory system with plans/decisions/changes/sessions
- Solid MVC + RTK Query + Prisma patterns
- Hardened hooks (node-based parser, REPO_ROOT anchoring, IS_GIT_COMMIT guard)
- ESLint permission-API guard

### What's not good enough yet
1. **Token cost** — no compression layer, every session pays full price for CLAUDE.md + skill loads
2. **No codebase graph** — grep-only, no semantic understanding of what depends on what
3. **UI skills are utilitarian** — form/table/modal/chart patterns are solid but nothing "modern" (no hero/landing/bento/marquee/3D/drag-drop/command-palette-as-skill)
4. **No system-design step** — freshers jump straight to code, no user-story → data-model → state-machine → API-contract chain
5. **No completion loop** — features can land in a "controller works, RTK invalidatesTags forgotten, UI stale" state and no automated check catches it
6. **Domain-specific code shipped as boilerplate** — Prisma has `Employee`, `Department`, `Designation`, `aadhaar/pan/bank` encrypted fields. `shared/permissions.ts` has `employees`, `departments`, `designations`. Skills reference `Leave`, `Payroll`, `LeaveRequest`. Freshers building a fitness app get HR scaffolding
7. **MCP catalog is thin** — `.claude/mcp-recommended.md` documents 4 servers (postgres, filesystem, github, memory). Missing: playwright, browserbase, context7, shadcn-mcp, sequential-thinking, linear, figma, perplexity, neon
8. **`agent-desktop/` + design-system files are Aniston-branded** — `Monday Aniston design system`, `com.aniston.boilerplate`, product names
9. **Dashboard example module** — dashboardApi + DashboardPage exist as examples but they render HR-flavored stats

---

## Phased execution

Each phase is independently commit-able and independently rollback-able.
User can stop after any phase and repo is strictly better than today.

```
Phase 1  →  Cost efficiency  (pxpipe + Headroom)                ~1 hr
Phase 2  →  Codebase intelligence  (10-server MCP + Graphify)    ~2 hr
Phase 3  →  Modern UI skill layer  (7 new reactbits-tier skills) ~3 hr
Phase 4  →  Design-first workflow  (/design-first command)       ~1.5 hr
Phase 5  →  Build-loop + wire-completeness                       ~4 hr
Phase 6  →  Generic-starter cleanup  (strip HR)                  ~3 hr
Total  ~14–15 hr, ~35–40 files touched
```

---

## Phase 1 — Cost efficiency (pxpipe + Headroom)

**Goal:** Cut Claude Code token bill 60–70 % with zero project-code impact.

### Steps

1.1 **Add `Bash(pip *)` and `Bash(python *)` and `Bash(headroom *)` to `settings.json` allow**
1.2 **Create `.claude/proxy-recommended.md`** — documents pxpipe (default) vs Headroom (upgrade path), with the exact `ANTHROPIC_BASE_URL` recipe for PowerShell + Bash + persistent Windows env var
1.3 **Add a `/proxy-start` command** that runs `npx pxpipe-proxy` in a detached process and prints the export line to run in the current shell
1.4 **Add a `/proxy-status` command** that curls `http://127.0.0.1:47821/` and prints tokens-saved summary
1.5 **Add a row to CLAUDE.md's Slash Commands table** for both
1.6 **Add an `on-prompt.sh` branch** on prompts matching `token cost|cheaper|proxy|compression|reduce token` → suggests `/proxy-start` and points at proxy-recommended.md
1.7 **Optional Headroom path** — separate `docs/upgrade-to-headroom.md` with the pip install + MCP-server wiring recipe (leave off by default, document as the upgrade)

### Files added / touched
`.claude/proxy-recommended.md` (new), `.claude/commands/proxy-start.md` (new), `.claude/commands/proxy-status.md` (new), `.claude/settings.json` (allow additions), `.claude/hooks/on-prompt.sh` (new branch), `CLAUDE.md` (2 rows), `docs/upgrade-to-headroom.md` (new, optional)

### Verification
- Type "how do I cut Claude Code cost" → auto-dispatch surfaces `/proxy-start` and `proxy-recommended.md`
- Run `/proxy-start` → proxy starts, dashboard at 127.0.0.1:47821 is reachable

---

## Phase 2 — Codebase intelligence (MCP catalog + Graphify)

**Goal:** Give the LLM more than grep. Every agent gets structured tools instead of ad-hoc bash.

### Steps

2.1 **Expand `.claude/mcp-recommended.md`** from 4 servers to a curated 12:
   - **Core (always-on):** `filesystem`, `postgres`, `github`, `memory`
   - **Web/testing:** `playwright` (headless browser automation for E2E + verification), `browserbase` (cloud browsers as fallback)
   - **Docs/research:** `context7` (fetches versioned library docs), `perplexity` (web research with citations), `fetch` (generic URL scrape)
   - **UI/design:** `shadcn-ui-mcp` (fetches shadcn/ui + Aceternity + Magic UI + reactbits components on demand), `figma-mcp` (design import if user has Figma)
   - **Planning:** `sequential-thinking` (structured multi-step reasoning for `/design-first`)
   - **Infra:** `neon` OR `supabase` (managed pg, alternative to local docker)
   Each entry gets: what it does, when to use, install command, config JSON, security caveats.
2.2 **Add `.claude/mcp.json`** with the always-on servers pre-configured (freshers auto-load them). Optional servers stay documented but not wired.
2.3 **Add `Bash(graphify *)` to settings allow-list**
2.4 **New skill file `skill-codebase-graph-patterns.md`** — how to build, when to rebuild, how to query the graph.json in Claude sessions
2.5 **New slash command `/graph`** — subcommands: `build`, `deps <symbol>`, `explain <path>`
2.6 **Wire `lint-on-save.sh`** — on `.service.ts` or `schema.prisma` edits, remind to run `/graph build`
2.7 **`.gitignore`** — ignore `.claude/graph/` (regenerable, don't commit binary artifacts)
2.8 **Update `CLAUDE.md`** — add `/graph` row, link mcp-recommended.md prominently

### Files added / touched
`.claude/mcp-recommended.md` (major rewrite), `.claude/mcp.json` (new), `.claude/skills/skill-codebase-graph-patterns.md` (new), `.claude/commands/graph.md` (new), `.claude/hooks/lint-on-save.sh` (new reminder), `.claude/settings.json` (allow), `.gitignore` (add graph dir), `CLAUDE.md`

### Verification
- `claude mcp list` shows the 4 core servers active
- `/graph build` produces `.claude/graph/graph.json` + `.claude/graph/graph.html`
- Editing a `.service.ts` file → hook emits "Run /graph build" reminder

---

## Phase 3 — Modern UI skill layer (reactbits-tier)

**Goal:** Freshers get skills that produce *modern-looking* UI, not just correct UI. Match reactbits.dev / Aceternity / Magic UI aesthetic while keeping the existing design-system checklist authoritative.

### Steps

3.1 **New `skill-modern-hero-patterns.md`** — landing-page hero variants: split with device mockup, gradient text, spotlight/light-cone, blurred backdrop, animated grid background. Copy-pasteable with Framer Motion + Tailwind.
3.2 **New `skill-modern-layout-patterns.md`** — bento grid, marquee (logo carousel), sticky-scroll storytelling, pinned sections, parallax with `useScroll`, magnetic buttons.
3.3 **New `skill-modern-motion-patterns.md`** — advanced Framer Motion: shared layout transitions, gesture-driven cards, stagger children, spring physics preset table, reveal-on-scroll variants, `useMotionValue` + `useTransform` patterns.
3.4 **New `skill-command-palette-patterns.md`** — Cmd+K palette (already have keyboard-shortcuts skill, this is the UI + fuzzy search + recent-action-based ordering + async command loading via MCP).
3.5 **New `skill-drag-drop-patterns.md`** — dnd-kit patterns: sortable list, kanban board, file drop zone with progress ring, multi-select drag, persist order via optimistic RTK Query.
3.6 **New `skill-empty-state-patterns.md`** — modern empty states: animated illustration slot, primary CTA, secondary "learn more", contextual first-run tips, undo-after-clear pattern.
3.7 **New `skill-onboarding-flow-patterns.md`** — multi-step signup, progress dots, back-friendly form persistence (URL-synced), Framer Motion between-step transitions, tour tooltips.
3.8 **Update `skill-ui-ux-checklist.md`** — new §25 "Modern UI patterns" — lists each of the 7 new skills, when to reach for them, and a "do not over-motion" warning (respect `prefers-reduced-motion`).
3.9 **`on-prompt.sh` — expand UI dispatch** — add keywords: `landing|hero|marquee|bento|carousel|scroll|parallax|command palette|drag|drop|kanban|onboarding|welcome flow|multi-step|wizard` (already have some — additive).
3.10 **`agent-ui-ux.md`** — add a "Modern-mode" section pointing at the 7 new skills.
3.11 **`CLAUDE.md` Skills Reference** — new group "Modern UI & Motion" with the 7 new files.

### Files added / touched
7 new `skill-*.md` files, `skill-ui-ux-checklist.md`, `on-prompt.sh`, `agent-ui-ux.md`, `CLAUDE.md`. **All patterns must:** use Framer Motion primitives you already declare, respect the existing color/spacing/radii tokens from `skill-ui-ux-checklist.md`, provide a `@media (prefers-reduced-motion)` short-circuit.

### Verification
- Type "build a hero section with a bento grid below" → auto-dispatch loads `skill-modern-hero-patterns.md` + `skill-modern-layout-patterns.md` + `skill-modern-motion-patterns.md`
- Every new skill has: prerequisites section, complete paste-able snippet, checklist at bottom, reduced-motion note

---

## Phase 4 — Design-first workflow

**Goal:** Before a fresher writes code they produce a system-design document.

### Steps

4.1 **New agent `agent-system-designer.md`** — role: turn a project prompt into a design doc (user stories, actors, data model outline, state machines, API surface, screen list, non-functional requirements). Uses `sequential-thinking` MCP if available.
4.2 **New skill `skill-system-design-patterns.md`** — templates for: PRD, ERD (Mermaid), state-machine diagram (Mermaid), API contract table, screen inventory, RBAC matrix table, NFR checklist (latency/scale/uptime/compliance).
4.3 **New skill `skill-ddd-bounded-contexts-patterns.md`** — when to split a domain, ubiquitous language, aggregate boundaries. Complements existing `skill-domain-modeling-patterns.md`.
4.4 **New command `/design-first <project-name>`** — walks the user through 8 questions (via `AskUserQuestion`), then writes `memory/decisions/ADR-NNNN-system-design-<slug>.md` + `docs/prd-<slug>.md` + `docs/erd-<slug>.md`. Blocks module scaffolding until the design ADR exists.
4.5 **New command `/design-review`** — reads the latest design ADR, runs an adversarial review (agent-code-review + agent-logic-analyzer + agent-security), reports gaps.
4.6 **Update `agent-planner.md`** — first check: does an active system-design ADR exist for this project? If not, propose `/design-first`. Prevents cargo-cult module scaffolding.
4.7 **`on-prompt.sh` new branch** — matches `start a new project|new app|from scratch|greenfield|design the system|user stories` → suggests `/design-first`.
4.8 **`CLAUDE.md`** — add `/design-first` and `/design-review` rows, add "Fresher Quick Start" step 9 "run /design-first before /new-module".

### Files added / touched
`.claude/agents/agent-system-designer.md` (new), `.claude/skills/skill-system-design-patterns.md` (new), `.claude/skills/skill-ddd-bounded-contexts-patterns.md` (new), `.claude/commands/design-first.md` (new), `.claude/commands/design-review.md` (new), `.claude/agents/agent-planner.md`, `.claude/hooks/on-prompt.sh`, `CLAUDE.md`.

### Verification
- Type "I want to start a new fitness tracking app" → auto-dispatch surfaces `/design-first`, agent-system-designer, skill-system-design-patterns
- `/design-first Fitly "workout tracker for gyms"` → walks 8 questions, writes ADR + PRD + ERD

---

## Phase 5 — Build-loop + wire-completeness (the "no half-built features" phase)

**Goal:** `/build-loop <module>` produces a **fully wired, test-passing feature every time** — or reports a clear stopping point.

### Steps

5.1 **New skill `skill-tdd-loop-patterns.md`** — how to write failing tests first, expected → actual comparison, when to `git stash` a partial attempt and retry.
5.2 **New command `/build-loop <module-spec>`** — implemented as a self-orchestrating workflow (`Workflow` tool):
   - **Phase 1 — Design gate:** ensure a system-design ADR exists (else route to `/design-first`).
   - **Phase 2 — Plan:** write a plan file under `_active/`.
   - **Phase 3 — Test-first:** generate `__tests__/<name>.service.test.ts` + `__tests__/<Name>.test.tsx` + `e2e/<name>.spec.ts` covering happy path + 3 error paths + RBAC matrix. Verify they run (they'll all fail — that's expected).
   - **Phase 4 — Implement backend:** prisma model → service → controller → routes → validation. Middleware chain checked.
   - **Phase 5 — Implement frontend:** RTK Query API file → hooks → page component → wire into Sidebar/router.
   - **Phase 6 — Loop-until-green:** run `npm test -- --run <name>` + `npm run test:e2e -- <name>`. Any failure → parse output, hand to agent-debugger, apply fix, re-run. **Cost cap:** stop after N iterations (default 5) or M tokens (default 200k) — configurable. Report last-mile diff if capped.
   - **Phase 7 — Wire-completeness pass:** run `/verify-wired` (see 5.4). Any red → back to Phase 6.
   - **Phase 8 — Documentation:** run `/document <module>` to write Swagger JSDoc + README.
   - **Phase 9 — Final review:** run `/audit --scope <module>`. Any CRITICAL → block completion; HIGH → warn.
5.3 **New skill `skill-wire-completeness-patterns.md`** — end-to-end trace: for every mutation, verify (UI button → onClick → RTK mutation → route → middleware chain → controller → service → prisma+transaction → auditLogger → socket emit → RTK invalidatesTags → UI cache refresh → toast → optimistic rollback on error).
5.4 **New command `/verify-wired <module>`** — mechanical checklist that greps for each layer's marker (`.mutation`, `invalidatesTags`, `authenticate`, `requirePermission`, `$transaction`, `auditLogger.log`, `io.to(...).emit(...)`). Reports missing layers with file:line pointers.
5.5 **New agent `agent-completion-loop.md`** — the orchestrator that runs the loop, has explicit stop conditions, reports token spend per iteration.
5.6 **Update `agent-code-review.md`** — new mandatory check: does the current module pass `/verify-wired`? If not, block merge.
5.7 **`on-prompt.sh` new branches** — `build a feature|end-to-end|complete feature|make sure it works` → surfaces `/build-loop` and `/verify-wired`.
5.8 **CLAUDE.md** — add rows, add "Recommended: use `/build-loop` instead of `/new-module` when you want the loop-until-green behavior".

### Files added / touched
2 new skills, 2 new commands, 1 new agent, edit agent-code-review + on-prompt + CLAUDE.md. **New rule `rule-completion-standards.md`:** every module ships wired end-to-end; verify-wired is mandatory before `/done`.

### Verification
- `/build-loop notes "user can create, edit, tag, search notes"` → produces prisma+service+controller+routes+api+page+tests, iterates until green, reports wire-completeness pass
- Deliberately break `invalidatesTags` on a mutation → `/verify-wired` reports it with file:line

### Guardrails
- **Cost cap:** default max 5 loop iterations, max 200k output tokens. Configurable via `BUILD_LOOP_MAX_ITERATIONS` and `BUILD_LOOP_MAX_TOKENS` env vars.
- **Deletion-safe:** the loop only edits files under `backend/src/modules/<name>/`, `frontend/src/features/<name>/`, `prisma/schema.prisma` (append-only), tests. Never edits anything outside its own module without a plan bump.
- **Watermark logging:** every iteration writes to `memory/coordination/build-loop-log.md` — resumable if crashed.

---

## Phase 6 — Generic-starter cleanup (strip HR from the boilerplate)

**Goal:** A fresher building a fitness app doesn't get `aadhaarEncrypted`, `panEncrypted`, `bankAccountEncrypted`, `Department`, `Designation`, `Employee`, `LEAVE_APPROVED` scaffolding leaking into their scaffold.

### 6a — Prisma schema slim-down (breaking, needs migration)

- **Remove:** `Employee`, `Department`, `Designation` models. `EmploymentType` enum. `aadhaar/pan/bank` encrypted fields.
- **Keep:** `User`, `Organization`, `RefreshToken`, `Notification`, `AuditLog`. These are truly universal.
- **Simplify `UserRole`:** `SUPER_ADMIN | ADMIN | MEMBER` (drop `MANAGER`/`EMPLOYEE` — HR terms).
- **Simplify `ApprovalStatus`:** move to a new example module (or delete — most apps don't need generic approval).
- Update `shared/src/enums.ts` in lockstep.
- Regenerate migrations.
- Seed data → only Org + Admin user + Member user. Drop employee/department seeds.

### 6b — Permissions registry slim-down

- Drop `employees`, `departments`, `designations` from `PERMISSIONS`.
- Keep `organizations`, `users`, `settings`, `dashboard`, `auditLogs`.
- Update dependent tests.

### 6c — Skill-file example rewrite

- Every skill mentioning `Leave`, `LeaveRequest`, `Employee`, `Payroll` gets replaced with a generic `Thing` / `Post` / `Project` example — matches what a fresher would build first.
- ~15 files affected. Do it in one grep-driven pass.

### 6d — Aniston debranding (optional — user decision)

- `Monday Aniston design system` → `Boilerplate Design System` (or keep — user's call, it's their company).
- `com.aniston.boilerplate` → `com.<yourcompany>.<yourproject>` (handled by `/project-init` — already parameterised).
- ADR-0008 rename or archive.
- `agent-desktop/package.json` productName field → configurable.
- Swagger config title.

### 6e — Dashboard example strip

- `dashboardApi` + `DashboardPage` currently render HR stats. Rewrite to render 4 neutral KPIs: total users, active sessions, total requests, uptime — as a "delete-me-when-ready" placeholder with a banner "This is a demo dashboard. Remove or replace when starting your project."
- Alternatively delete entirely (safer for a v2 boilerplate).

### 6f — Docs / README cleanup

- `README.md`, `SOP-Fresher-Guide.md`, `docs/architecture.md`, `docs/database-erd.md` — sweep HR examples out.
- Update `CLAUDE.md` "Tech Stack" table (already generic — nothing needed) but strip HR examples from the "Fresher Quick Start".

### Files added / touched
Prisma schema + migrations (1), `shared/src/enums.ts`, `shared/src/permissions.ts`, `prisma/seed.ts`, 15 skill files (grep-driven Leave/Employee → Thing/Post rename), dashboard module (rewrite or delete), README / SOP / docs. Optional Aniston debrand (~10 files).

### Verification
- Fresh `npm run db:generate && npm run db:push && npm run db:seed` on an empty DB works
- `npm test` still passes
- `grep -riE "employee|department|designation|payroll|aadhaar|leave request" backend/ frontend/ shared/ prisma/` returns near-zero
- `/new-module notes` scaffolds a `notes` module using neutral `Thing`/`Post` templates

### Migration / rollback
- **Breaking migration.** Any existing dev DB gets wiped. Warn user before running.
- Rollback: `git restore` the schema + seed + shared + skill files. Migration file can be reverted with `git rm` then re-generating.

---

## Cross-cutting concerns

### Naming
- Every new command uses kebab-case: `/proxy-start`, `/build-loop`, `/verify-wired`, `/design-first`, `/design-review`, `/graph`.
- New skills use `skill-<domain>-patterns.md`: `skill-modern-hero-patterns.md`, `skill-tdd-loop-patterns.md`, etc.
- One new rule: `rule-completion-standards.md`.
- One new agent: `agent-system-designer.md`, `agent-completion-loop.md`.

### Backward compatibility
- **All existing commands stay.** No renames of `/new-module`, `/audit`, etc.
- The old `/new-module` remains as the "quick scaffold, no loop" option; `/build-loop` is the new "complete-a-feature" option.
- Old skills that get generic renamed (Phase 6c) keep their filename — only the code examples change.

### Test plan
- After **Phase 1:** hook smoke test — `/proxy-start` boots, dashboard reachable.
- After **Phase 2:** `claude mcp list` shows configured servers, `/graph build` produces a graph.
- After **Phase 3:** dispatch smoke — "add a hero with bento" loads the 3 new skills.
- After **Phase 4:** `/design-first Test "example app"` writes an ADR + PRD.
- After **Phase 5:** `/build-loop notes "…"` on a scratch branch produces a passing test suite. Deliberately break `invalidatesTags` → `/verify-wired` catches it.
- After **Phase 6:** fresh DB seed works, generic zero-hits on HR grep, `/new-module` still scaffolds.
- After **all phases:** re-run the ultracode audit → confirm no regression, target ≥ 8.5 overall.

### Acceptance criteria
- [ ] All 6 phases green on their verification steps
- [ ] Re-audit workflow score ≥ 8.5 / 10 overall
- [ ] Zero HR-domain grep hits outside `memory/decisions/` (historical ADRs OK)
- [ ] `/design-first` → `/build-loop <module>` end-to-end demo passes on a scratch branch
- [ ] pxpipe proxy running + measurable token savings in `~/.pxpipe/events.jsonl`
- [ ] `memory/project-state.md` updated with new phase status
- [ ] This plan moved from `_active/` to `_archive/` with `-DONE` suffix

---

## Open questions (need answers before I start)

1. **Order of execution** — sequential with approval gates between phases, or full pipeline (5 auto-commits, one per phase, no manual gates)?
2. **Proxy choice for Phase 1** — pxpipe (simpler, 1 dep) or Headroom (deeper, needs Python + ML model)? Can install both docs but only one wired at a time.
3. **MCP catalog scope for Phase 2** — the 12 servers proposed, or a leaner "essential 6" (postgres, filesystem, github, memory, playwright, context7)?
4. **Modern UI skill count for Phase 3** — 7 new skills as proposed, or fewer to start (3–4 highest-value: hero, layout, motion, command-palette)?
5. **Design-first workflow depth for Phase 4** — 8 questions (thorough), 4 questions (fast), or fully AI-driven (agent asks whatever it needs)?
6. **Build-loop guardrails for Phase 5** — cost cap: 5 iterations / 200k tokens (recommended)? higher? lower?
7. **HR cleanup aggression for Phase 6** — nuclear (delete Employee/Department/Designation + dashboard entirely), moderate (delete Employee tables + rewrite dashboard as neutral placeholder), or minimal (rename Employee → Member, leave scaffolding)?
8. **Aniston debranding** — keep "Monday Aniston" design-system naming (it's your company brand — could be a feature), or rename to generic "Boilerplate Design System"? Doesn't affect any code — pure naming.

---

## Migration / data impact

**Phase 6a is the only breaking change.** Everything else is additive (new files) or purely editorial (grep-and-replace in skills / docs).

**Backups:** before Phase 6a I will run `pg_dump` on the local dev DB to `memory/backups/pre-v2-<timestamp>.sql`. Not committed. User can `psql < backup.sql` to restore if they change their mind.

**Production impact:** none. This is a boilerplate — there's no production database that ships with the repo.

---

## Rollback plan

Per-phase `git restore` works for phases 1–5 (additive edits). Phase 6a needs the backup restore path documented above. Phase 6b–f are recoverable via `git restore`.

---

## Estimated effort

- Phase 1: ~1 hr
- Phase 2: ~2 hr
- Phase 3: ~3 hr (7 new skill files, each ~200 lines of paste-able patterns)
- Phase 4: ~1.5 hr
- Phase 5: ~4 hr (biggest — new command orchestrator, new agent, new skill, new rule)
- Phase 6: ~3 hr

**Total: 14–15 hrs.** Sequential single-pass with per-phase commits.

---

## Notes / handoff

If a future agent picks this up mid-phase:
1. Read this file first
2. Read `memory/changes/2026-07-07-changes.md` for what's already done
3. Resume from first unchecked step in the current phase
4. Do NOT skip the verification step — those are the acceptance signal

Reference: prior audit at `C:\Users\ANISTO~1\AppData\Local\Temp\claude\...\tasks\w1t3wyaw5.output` (post-Batch-4 baseline, 8.53/10).
