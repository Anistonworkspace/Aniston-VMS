---
# Naming Conventions — Binding for ALL code in this project
Canon: memory/alignment-dictionary.md, docs/05-backend-schema.md.

## TypeScript / JavaScript

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables | camelCase | `totalCameras`, `isLoading` |
| Functions | camelCase | `formatDate()`, `buildWhereClause()` |
| React components | PascalCase | `CameraCard`, `IncidentModal` |
| Types / Interfaces | PascalCase | `CreateCameraInput`, `AuthUser` |
| Enums | PascalCase (type) + SCREAMING_SNAKE (values) | `enum UserRole { SUPER_ADMIN = 'SUPER_ADMIN' }` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE`, `DEFAULT_PAGE_LIMIT` |
| NestJS classes | PascalCase + role suffix | `CameraService`, `CameraController`, `ZoneScopeGuard`, `AuditLogger` |
| Files — backend | kebab-case | `camera.service.ts`, `auth.controller.ts`, `zone-scope.guard.ts` |
| Files — frontend | PascalCase for components | `CameraList.tsx`, `IncidentModal.tsx` |
| Files — frontend utilities | camelCase | `formatDate.ts`, `useAuth.ts` |

## Prisma / Database

| Thing | Convention | Example |
|-------|-----------|---------|
| Model names | PascalCase singular | `Camera`, `Incident`, `AuditLog` |
| Field names | camelCase | `cameraCode`, `organizationId` |
| Encrypted fields | camelCase + `Encrypted` suffix | `rtspPasswordEncrypted`, `apiKeyEncrypted` |
| Enum names | PascalCase | `UserRole`, `CameraStatus`, `IncidentStatus`, `ScopeType` |
| Enum values | SCREAMING_SNAKE_CASE | `SUPER_ADMIN`, `CAMERA_OFFLINE`, `RECOVERY_VERIFIED` |
| Table names (auto) | snake_case plural (Prisma default) | `cameras`, `audit_logs` |
| Index names | auto from `@@index` fields | handled by Prisma |

## API Routes

| Pattern | Convention | Example |
|---------|-----------|---------|
| Collection | plural noun | `/api/cameras` |
| Single resource | plural noun + ID param | `/api/cameras/:id` |
| Sub-resource | nested plural | `/api/incidents/:id/escalations` |
| Action route | noun + verb (avoid) → prefer status update | `/api/incidents/:id` PATCH with `{ status: 'ACKNOWLEDGED' }` |
| Query params | camelCase | `?sortBy=createdAt&sortDir=desc` |
| Always lowercase, hyphenated | | `/api/health-checks`, `/api/audit-logs`, NOT `/api/healthChecks` |

## React / Frontend

| Thing | Convention | Example |
|-------|-----------|---------|
| RTK Query API file | camelCase + `Api` | `cameraApi.ts`, `incidentApi.ts`, `auditLogApi.ts` |
| RTK Query endpoint | camelCase verb + noun | `getCameras`, `createIncident`, `acknowledgeIncident` |
| Redux slice | camelCase + `Slice` | `authSlice.ts` |
| Custom hook | `use` prefix + PascalCase | `useCameraList`, `useZoneFilters` |
| Feature folder | camelCase | `features/cameras/`, `features/incidents/` |
| CSS class names | kebab-case (Tailwind utility only) | `floating-card`, `status-badge--offline` |
| CSS custom properties | kebab-case with `--` prefix | `--primary-color`, `--canvas-color` |

## Files and Folders

| Location | Convention | Example |
|----------|-----------|---------|
| Backend module folder | camelCase | `apps/api/src/modules/camera/` |
| Frontend feature folder | camelCase | `frontend/src/features/cameras/` |
| Shared schema files | camelCase + `.schema.ts` | `auth.schema.ts`, `common.schema.ts` |
| Test files | same name + `__tests__/` + `.spec.ts` | `camera.service.spec.ts` |
| Prisma migrations | auto-generated | handled by Prisma |

## Domain identifiers (VMS-specific — never invent a different format)

- **Camera code:** `CAM-###` zero-padded sequence, e.g. `CAM-042` — human-facing, shown next to the UUID
  `id` everywhere in the UI, never used as a lookup key on its own in a Prisma query (query by `id`, display
  by `cameraCode`)
- **Incident number:** `ANI-CAM-<year>-<6-digit sequence>`, e.g. `ANI-CAM-2026-000145` — generated once on
  Incident creation, immutable, unique per organization
- **Recording/clip storage key:** `{organizationId}/{siteId}/{cameraId}/YYYY/MM/DD/HH-mm-ss.mp4` — always
  this order, always UTC, never reorder the path segments (breaks retention-cleanup jobs that glob by date)
- **BullMQ queue names:** SCREAMING_SNAKE from the `JobQueueName` enum, e.g. `HEALTH_CHECK_QUEUE`,
  `SNAPSHOT_QUEUE`, `NOTIFICATION_QUEUE`, `ESCALATION_QUEUE`
- **Socket room names:** `org:<orgId>` (org-wide feed) or `zone:<zoneId>` (scoped live-wall/incident feed)

## NEVER do these

- NEVER abbreviate field names: `usrId` → `userId`, `orgId` is OK (established prefix)
- NEVER use `data`, `item`, `obj`, `temp` as variable names in production code
- NEVER use plural for Prisma model names (`Cameras` → `Camera`)
- NEVER mix conventions in the same file
- NEVER use numbered suffixes: `Component2`, `helper3` — rename to describe purpose