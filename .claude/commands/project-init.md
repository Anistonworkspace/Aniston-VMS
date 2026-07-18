# /project-init — Re-brand this repo for a new project/deployment

Run this once when forking this repo (Aniston VMS, or its harness) into a new project.
It updates CLAUDE.md, memory/project-state.md, and creates a founding ADR.

---

## When to run

Type `/project-init` (optionally followed by the project name and description) when:
- You've cloned/forked this repo to stand up a new deployment or a sibling product
- The project is being renamed from **Aniston VMS** to its real name
- You want to record the founding architecture decisions as an ADR

Example usage:
```
/project-init GuardianView — CCTV video management for a different client fleet
/project-init FleetView — fleet/telematics monitoring reusing this monitoring harness
/project-init
```

---

## Steps the agent executes

### 1. Gather project identity (ask user if not in the prompt)

Collect:
- **Project name** — short PascalCase (e.g. `GuardianView`, `FleetView`)
- **Project slug** — kebab-case for package names and container prefixes (e.g. `guardian-view`, `fleet-view`)
- **One-line description** — what the app does and who it is for
- **Primary target platforms** — this repo currently targets Web SPA (control room) + Android APK
  (Capacitor); confirm which still apply
- **App domain** — e.g. CCTV/video management, fleet telematics, industrial IoT monitoring
- **Primary user roles** (comma-separated) — this repo ships `SUPER_ADMIN` / `PROJECT_ADMIN` /
  `CLIENT_VIEWER`; confirm whether the new project keeps this 3-role model or needs its own

### 2. Update CLAUDE.md title block

Find and replace the current heading:
```
# CLAUDE.md — Aniston VMS
```
→
```
# CLAUDE.md — <ProjectName>
```

And update the one-line description paragraph directly under it (currently describes
"a production CCTV monitoring platform for ~125 cameras across Delhi zones") with the new
project's `<ProjectDescription>`. Update the "Plan of record" line to point at the new
project's planning docs (or keep `docs/01-PRD.md`…`docs/06-implementation-plan.md` if the
new project keeps the same six-doc structure) and update the UI reference path if the
design mock changes.

### 3. Update memory/project-state.md frontmatter

The file starts with a YAML frontmatter block. Update these keys verbatim
(do NOT search for inline text — they live in the `---` block at the top):

```yaml
---
project_name:     <ProjectName>           # PascalCase
project_slug:     <project-slug>          # kebab-case
description:      <one-line description>
domain:           <cctv-video-management|fleet-telematics|...>
target_platforms:
  - <one or more of: Web SPA, Android APK, iOS IPA, Windows EXE>
primary_roles:
  - <one role per line — keep SUPER_ADMIN/PROJECT_ADMIN/CLIENT_VIEWER unless the new project
     genuinely needs a different role model>
status:           bootstrapping
started_at:       <YYYY-MM-DD today>
---
```

After updating frontmatter, also clear the "Recent Changes" section in the
body and start fresh with today's date.

### 4. Update root package.json name

Change:
```json
"name": "aniston-vms"
```
→
```json
"name": "<project-slug>"
```

### 5. Update workspace package names

Change each workspace's `name` field:
```json
"@aniston-vms/frontend"   →  "@<project-slug>/frontend"
"@aniston-vms/backend"    →  "@<project-slug>/backend"
"@aniston-vms/shared"     →  "@<project-slug>/shared"
```
**Note — target architecture:** once the NestJS migration (`docs/06-implementation-plan.md`)
lands, the workspaces move to the pnpm layout `apps/api`, `apps/web`, `apps/workers`,
`services/media`, `services/image-analysis`, `packages/shared`, scoped as
`@<project-slug>/api`, `@<project-slug>/web`, etc. If you're forking after that migration,
rename the pnpm-workspace packages instead of `frontend/backend/shared`.

### 6. Update frontend/index.html

- `<title>Aniston VMS</title>` → `<title><ProjectName></title>`
- `<meta name="description" content="Aniston VMS — multi-tenant CCTV video management">` → new one-liner
- Any `<meta name="application-name">` tag → `<ProjectName>`

### 7. Update frontend/vite.config.ts PWA manifest

```typescript
manifest: {
  name: '<ProjectName>',
  short_name: '<ShortName>',          // ≤12 chars for home screen
  description: '<one-liner>',
  theme_color: '<hex>',               // keep unless the new project has its own design ADR
  background_color: '<hex>',
  // ... rest unchanged
}
```

### 8. Update frontend/capacitor.config.ts (Android APK target)

```typescript
appId: 'com.<org-slug>.<project-slug>',   // was 'com.aniston.vms'
appName: '<ProjectName>',                 // was 'Aniston VMS'
```

### 9. Write project-init ADR

Create `memory/decisions/ADR-NNNN-project-init-<project-slug>.md` (next number after the
existing `ADR-0008-*`) with:
- Title: "Project Init — <ProjectName>"
- Status: Accepted
- Date: today
- Context: what the app does, who it is for, why this repo/harness was forked
- Decision: target platforms, primary roles, key domain, and whether the NestJS/pnpm
  target stack (`apps/api`/`apps/web`/`apps/workers`/`services/media`/`services/image-analysis`/
  `packages/shared`) still applies or the new project needs a different target architecture
- Consequences: which skills/agents are most relevant, what to build first

### 10. Confirm and summarize

Print a table showing every file changed, what changed, and the new value.
Tell the user: "Run `/new-module <first-module>` to scaffold your first feature."

---

## What this command does NOT change (do these manually if the domain changes)

- **Prisma schema** (`prisma/schema.prisma`) — the `Organization → Site → Zone → Camera`
  hierarchy, `HealthCheck`/`Incident`/`Escalation`/`MaintenanceTask` models, and the
  auth/user models are CCTV-domain-specific; if the new project isn't video-management, plan a
  real schema rewrite (and matching migration) rather than a find/replace
- **`.claude/rules/*.md`** — unlike a generic boilerplate, these are now **domain-specific**:
  `rule-database.md`, `rule-api.md`, `rule-security-rbac.md`, and `rule-frontend.md` all hardcode
  Camera/Zone/Incident/RBAC conventions and MUST be rewritten for a genuinely different domain.
  Only the process rules (`rule-memory-system.md`, `rule-completion-standards.md`,
  `rule-secrets-policy.md`, `rule-database-migrations.md`'s general safety rules) stay generic
- **`docs/01-PRD.md`…`docs/06-implementation-plan.md`, `memory/alignment-dictionary.md`** —
  these are cited as "Canon:" by nearly every rule file; if you don't rewrite them for the new
  domain, agents will keep citing stale CCTV canon
- **Docker/CI configs** (`docker/docker-compose.dev.yml`, `docker/docker-compose.fullstack.yml`,
  `github/workflows/ci.yml`) — container names/prefixes (`aniston_vms_postgres`, etc.) and the
  default `DATABASE_URL` database name update manually to match your infra
- **.env.example** — update manually to add/remove project-specific variables
