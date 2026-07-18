---
# Security — RBAC and Zone-Scoped Multi-Tenancy Rules
Canon: docs/01-PRD.md (roles/domain), docs/05-backend-schema.md, memory/alignment-dictionary.md.

## The three roles

  SUPER_ADMIN   — Aniston platform staff. Cross-organization access, manages every client org, site, zone,
                  camera. Still logs which `organizationId` context it's acting in for every audit entry.
  PROJECT_ADMIN — Manages a single client organization's sites/zones/cameras/routers/SIMs/incidents.
                  Always scoped to `organizationId`; MAY be further narrowed to specific zones/sites via
                  `UserAccessScope` rows (e.g. a regional admin who only manages certain zones).
  CLIENT_VIEWER — Read-only. ALWAYS zone/site/camera scoped via explicit `UserAccessScope` rows — never
                  granted org-wide visibility by default, even within their own organization.

## ABSOLUTE RULE — organizationId is the tenancy floor, zone-scope is the ceiling on top of it

  Every Prisma query on org-scoped data (Camera, Zone, Site, Router, Sim, Incident, Escalation, Notification,
  Snapshot, Recording, MaintenanceTask, AuditLog) MUST include `organizationId`
  The `organizationId` MUST come from `req.user.organizationId` (set by `JwtAuthGuard`) — NEVER trust
  `organizationId` from the request body, users can fake it

  On top of `organizationId`, PROJECT_ADMIN and CLIENT_VIEWER requests MUST also be filtered by the caller's
  `UserAccessScope` rows, keyed on `ScopeType`:
    `ScopeType.ORG`    — full org access (equivalent to unrestricted PROJECT_ADMIN)
    `ScopeType.SITE`   — access to every zone/camera under that site
    `ScopeType.ZONE`   — access to every camera under that zone
    `ScopeType.CAMERA` — access to exactly that camera
  Resolve a camera's scope chain (`Camera → Zone → Site → Organization`) and check it intersects at least one
  of the caller's `UserAccessScope` rows before returning/mutating it. This is implemented by `ZoneScopeGuard`
  (`apps/api/src/common/guards/zone-scope.guard.ts`) — never re-implement this check ad hoc inside a service.

## Guard/pipe order (mandatory)

  `JwtAuthGuard` (authenticate) → `RolesGuard` + `ZoneScopeGuard` (authorize: role AND zone scope) →
  `ValidationPipe` (DTO) → Controller
  Never skip `JwtAuthGuard`. Never move `ZoneScopeGuard` after `ValidationPipe`.

## Self-approval prevention

  EVERY escalation/incident sign-off endpoint MUST check: `approverId !== requesterId` — e.g. the
  PROJECT_ADMIN who raised an Escalation cannot also be the one who marks it approved/resolved when a
  second-check is required by policy
  If this check is missing, flag it as CRITICAL

## Restricted-role scope (CLIENT_VIEWER)

  A CLIENT_VIEWER can only view records inside their assigned `UserAccessScope` (site/zone/camera) — never
  broaden a query to the full organization "for convenience"
  Always filter camera/incident/recording lists by the resolved zone-scope set, not by `createdById` — this
  isn't an ownership model, it's a physical-access-scope model

## Role escalation prevention

  Only SUPER_ADMIN can create a PROJECT_ADMIN user; only SUPER_ADMIN/PROJECT_ADMIN can create a CLIENT_VIEWER
  user (scoped to their own org)
  The `role` field in the request body MUST be ignored — role is set by the service based on the caller's own
  role, never taken verbatim from the caller

## IDOR prevention

  Every `findUnique`, `findMany`, `update`, and `delete` MUST include `organizationId` in the where clause,
  AND (for PROJECT_ADMIN/CLIENT_VIEWER) the resolved zone-scope filter
  A missing `organizationId` filter, OR a missing zone-scope filter for a scoped role, is an IDOR
  vulnerability — flag as CRITICAL (e.g. a CLIENT_VIEWER fetching `/api/cameras/:id` for a camera in a zone
  they were never granted access to)