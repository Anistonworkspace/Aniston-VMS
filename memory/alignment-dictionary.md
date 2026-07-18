# Aniston VMS — Alignment Dictionary (single source of truth for the .claude tooling rewrite)

> Purpose: every agent, skill, rule, command, and config `.md` in this repo must describe **Aniston VMS**
> (the project defined by `docs/`), not the generic SaaS boilerplate it was forked from. This file is the
> shared contract for that rewrite. When a detail is not covered here, **open the canon doc and quote it —
> never invent**.

---

## 0. Canonical sources (the "docs of record")

Every rewritten file must point readers at these, and must never contradict them:

| Doc | Owns |
| --- | --- |
| `docs/01-PRD.md` | Product scope, personas, roles, domain vocabulary |
| `docs/02-TRD.md` | Technical architecture, services, health/diagnostic pipeline, error codes |
| `docs/03-app-flow.md` | Screen-by-screen user flows |
| `docs/04-uiux-brief.md` | Design language, palette, components (the **soft-SaaS** look) |
| `docs/05-backend-schema.md` | Data model, entities, enums, RBAC scope model, ID formats |
| `docs/06-implementation-plan.md` | Monorepo layout, build phases, module boundaries |
| `docs/claude-code-master-prompt.md` | House rules / working conventions |
| `docs/actual-design.png` | **Canonical visual reference** (supersedes the old `design-reference.jpeg`) |

Secondary/derived docs that must stay consistent with the above: `docs/tech-stack-targets.md`,
`docs/reference-index.md`, `docs/README.md`, root `CLAUDE.md`, `AGENTS.md`, `.claude/GUIDE.md`.

---

## 1. Stack decision (RESOLVED with the user)

- **Source of truth for code patterns = the plan docs (NestJS), not the current Express scaffold.**
- Therefore agents/skills/rules describe **NestJS + pnpm multi-service**, and `tech-stack-targets.md` +
  `CLAUDE.md` are flipped to declare that stack as canonical.
- ⚠️ Consequence to preserve in wording: the live `backend/` is still an Express+Prisma scaffold and is
  **out of sync until migrated**. Where a rule previously said "follow the actual codebase (Express)",
  replace with "follow the target architecture in `docs/02-TRD.md` + `docs/06-implementation-plan.md` (NestJS)".

### Stack (target)
- **Frontend:** React 18 + TypeScript + Vite (dev port `5173`) + TanStack Query + Redux Toolkit / RTK Query +
  Tailwind (soft-SaaS tokens). PWA + Electron + Capacitor shells.
- **API:** **NestJS** (`apps/api`) — modules/providers/controllers/guards/pipes/interceptors, `class-validator`
  DTOs, scope-guarded RBAC.
- **Workers:** `apps/workers` — **BullMQ** queues (health-probe, snapshot, image-analysis, notifications).
- **Media:** `services/media` — **MediaMTX** (on-demand RTSP → WebRTC/HLS), ONVIF (Onvif-G) + Router API.
- **Image analysis:** `services/image-analysis` — **FastAPI + OpenCV** (Python microservice).
- **DB:** PostgreSQL via Prisma (`prisma/schema.prisma`, `prisma/seed.ts`).
- **Storage:** MinIO / S3 — recording key layout `/{org}/{site}/{camera}/{YYYY}/{MM}/{DD}/{HH-mm-ss}-...`.
- **Realtime:** WebSocket gateway + MediaMTX WebRTC/HLS.
- **Notifications:** WhatsApp + Email (SES) + in-app/DB.
- **Crypto:** AES-256-GCM (encrypt camera/router credentials at rest), SHA-256 hashing.
- **Auth:** JWT (access + refresh), `JWT_SECRET` / `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`.

### Monorepo layout (per `06-implementation-plan.md`)
```
apps/api            # NestJS API                (@aniston-vms/api)
apps/web            # React + Vite frontend     (@aniston-vms/web)
apps/workers        # BullMQ workers            (@aniston-vms/workers)
services/media      # MediaMTX config/adapter
services/image-analysis  # FastAPI + OpenCV
packages/shared     # shared types/enums/permissions (@aniston-vms/shared)
prisma/             # schema.prisma + seed.ts
docs/               # canon
```
> NOTE: the current on-disk scaffold uses `backend/ frontend/ shared/` with npm workspaces; the plan uses
> `apps/* services/* packages/shared` with **pnpm**. Follow the **plan layout** in the tooling, and keep the
> **`@aniston-vms/*`** package scope (already real). Reference `06-implementation-plan.md` for exact paths.

---

## 2. Domain model (from `05-backend-schema.md`)

Core entities: **Organization, Site, Zone, Camera, Router, SIM, User, Role, Scope, HealthCheck, Incident,
Escalation, Notification, Snapshot, Recording/Clip, Stream, Layout, Task, MaintenanceTask, Report, AuditLog.**

Key enums / value objects:
- `Role`: `SUPER_ADMIN`, `PROJECT_ADMIN`, `CLIENT_VIEWER` (+ scoped permission actions; e.g. `DOCTOR_MARK`).
- `ScopeType`: org / site / zone / camera (zone-scoped RBAC).
- `CheckType`, `CameraStatus`, `IncidentStatus`, `NotificationStatus`, `ClipStatus`, `TaskType`,
  `TaskSource`, `TaskStatus`, `StreamKind` (`LIVE_MAIN` / `LIVE_SUB`), `LayoutKind`.
- ID formats: camera code `CAM-042`; incident ref `ANI-CAM-2026-000145`; recording keys as above.

### Health / diagnostic status codes (catalog — use these, not invented ones)
`CAMERA_OFFLINE, CAMERA_TIMEOUT, CAMERA_REACHABLE, CAMERA_PORT_CLOSED, ROUTER_OFFLINE, ROUTER_ONLINE,
ROUTER_REBOOTED, ROUTER_TCP, SITE_INTERNET_DOWN, NETWORK_UNSTABLE, SIM_DISCONNECTED, SIM_SIGNAL_ISSUE,
WEAK_SIGNAL, RTSP_PROTOCOL_FAILURE, RTSP_AUTHENTICATED, RTSP_AUTH, RTSP_PORT, INVALID_CREDENTIALS,
INVALID_STREAM_PATH, PORT_FORWARDING_FAILURE, WRONG_RESOLUTION, WRONG_CODEC, LOW_BITRATE, LOW_FPS,
STREAM_DEGRADED, UNSTABLE_STREAM, VIDEO_HEALTHY, VIDEO_VALIDATION, IMAGE_PROBLEM, IMAGE_ANALYSIS,
CONFIG_ERROR, LENS_CLEANING, RECOVERY_VERIFIED`.

### Example domain to use in code samples (replace the old `notes` / `Item` / `John Doe`)
Prefer real VMS scenarios: a **Camera** goes `CAMERA_OFFLINE` → a **HealthCheck** opens an **Incident**
(`ANI-CAM-2026-000145`) → **Escalation** timeline fires **Notifications** (WhatsApp/email) → operator marks
**RECOVERY_VERIFIED**. Lists = cameras/zones/incidents; detail = camera health; users = SUPER_ADMIN /
PROJECT_ADMIN / CLIENT_VIEWER.

---

## 3. Design language (soft-SaaS — from `04-uiux-brief.md` + `docs/actual-design.png`)

**Canonical token reference for all UI rewrites = the already-aligned `.claude/agents/agent-vms-uiux.md`
plus `docs/04-uiux-brief.md`.** Pull exact hex/token values from there; do not paste values from memory.

Look & feel: **slate sidebar, cream canvas (`#F6F5F1`), white rounded cards, soft shadows, sage / indigo /
coral / sand accents.** Token names in use: `--primary-color`, `--primary-hover-color`,
`--primary-selected-color`, `--base-tint`, `--card-radius`, `--radius-big`.

Component inventory (VMS-specific — use these names in UI skills/agents):
`PlayerShell, LiveWallGrid, HealthScoreRing, PlatformHealthTile, ConnectionQualityChart, IncidentKanban,
DiagnosisBanner, EscalationTimeline, SnapshotCompare, ClipRangeSelector, TimelineScrubber, EvidencePhotoCard,
ActivityListCard, MaintenanceTaskCard, ReportExportBar, FilterChips, SidebarZoneItem, StatusBadge,
SearchInput, AvatarStack, VideoTile`.

**DELETE the old Boilerplate Design System entirely:** Monday.com blue `#0073ea`, `Figtree` font,
`.floating-card`, generic `.btn`, board/group statuses, "Boilerplate Design System" wording.

---

## 4. Global find → replace (apply everywhere except historical `memory/sessions/**` capsules)

| OLD (boilerplate) | NEW (Aniston VMS) |
| --- | --- |
| `@boilerplate/shared` | `@aniston-vms/shared` |
| `@boilerplate/*` | `@aniston-vms/*` |
| "Boilerplate App" / "the boilerplate" | "Aniston VMS" |
| "Boilerplate Design System" | soft-SaaS design language (`docs/04-uiux-brief.md`) |
| `design-reference.jpeg` | `docs/actual-design.png` |
| `#0073ea`, `Figtree`, `.floating-card` | soft-SaaS tokens (see §3) |
| example domain `notes` / `Item` / `John Doe` | VMS entities (cameras / zones / incidents) — see §2 |
| generic `organizationId` multi-tenant only | zone-scoped RBAC (`ScopeType`) + org tenancy (see §2) |
| Express controllers/services/middleware | NestJS modules/controllers/providers/guards/pipes/interceptors |
| `boilerplate_postgres_data` (volume) | `aniston_vms_postgres_data` |
| `com.aniston.boilerplate` (electron/capacitor id) | `com.aniston.vms` |
| `/var/www/boilerplate` (ci/cd path) | `/var/www/aniston-vms` |
| `smtp.example.com`, "Enterprise HR Management" | Aniston VMS mail config + product description |
| "Project: Boilerplate App" (AGENTS.md identity) | "Project: Aniston VMS — CCTV monitoring platform" |
| "how this boilerplate works" (GUIDE title) | "How the Aniston VMS toolkit works" |

Product one-liner (reuse verbatim where a description is needed):
> **Aniston VMS — a CCTV monitoring platform for ~125 cameras across Delhi zones: 5-stage camera health
> monitoring, RTSP/ONVIF probing, incident management with escalation, live view, snapshots + recordings,
> and image-analysis, with WhatsApp/email alerts.**

---

## 5. Rewrite rules by file type

- **Keep the frontmatter shape** (`name`, `description`, `when_to_use`, etc.) valid; only change values.
- **Do not delete a skill/agent's genuine mechanics** — re-express them in the target stack and re-skin every
  example to the VMS domain (§2). "Deep rewrite" = examples, imports, entity names, tokens, and prose all VMS.
- **Every file** should reference the relevant canon doc(s) so readers can go deeper.
- **Preserve headings/structure** where sound; change content, not the file's role.
- Backend skills/agents → NestJS idioms + Prisma + BullMQ + the services in §1.
- UI skills/agents → soft-SaaS tokens + component inventory in §3.
- Never touch `memory/sessions/**` capsules or `memory/plans/**` history.

---

## 6. Reference: file inventory to align

- **Config (6):** `CLAUDE.md`, `AGENTS.md`, `.claude/GUIDE.md`, `docs/README.md`, `docs/reference-index.md`,
  `docs/tech-stack-targets.md`.
- **Rules (18):** `.claude/rules/rule-*.md`.
- **Agents (21):** `.claude/agents/agent-*.md` (`agent-vms-uiux.md` already aligned — verify only).
- **Skills (51):** `.claude/skills/skill-*.md`.
- **Commands (29):** `.claude/commands/*.md`.
