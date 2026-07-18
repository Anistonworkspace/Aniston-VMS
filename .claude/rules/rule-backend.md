---
# Backend Coding Rules — NestJS (apps/api)
Canon: docs/02-TRD.md, docs/05-backend-schema.md, memory/alignment-dictionary.md.
Full DI/module templates live in `skill-mvc-patterns.md` — this file is policy.

Controllers — keep them thin:
  `@Controller('cameras')` classes only parse the request (via DTOs/pipes), call the injected service,
  and return the result — the global `TransformInterceptor` wraps it in the response envelope
  NEVER catch errors here — let them bubble to the global `AllExceptionsFilter`
  Never put business logic (health-check evaluation, RBAC/zone-scope resolution, escalation policy) in a controller

Services (providers) — all business logic lives here:
  `@Injectable()` services throw `AppError` subclasses for known failures (`NotFoundError`, `ConflictError`,
  `ForbiddenError`) — never raw `Error`
  Always include `organizationId` in every Prisma query on org-scoped models (Camera, Zone, Site, Incident,
  Router, Sim, Recording, MaintenanceTask, Notification), AND the caller's zone-scope filter for
  PROJECT_ADMIN/CLIENT_VIEWER (see rule-security-rbac.md)
  Use `prisma.$transaction` for any write that touches more than one table (e.g. creating an Incident AND
  its first Escalation, or acknowledging an Incident AND writing the AuditLog row)
  Call `auditLogger.log()` on every create, update, and delete — especially camera credential changes and
  incident status transitions

Guard/pipe/interceptor order (MANDATORY — never change this order):
  `JwtAuthGuard` (authenticate) → `RolesGuard` + `ZoneScopeGuard` (authorize) → `ValidationPipe` (DTO) →
  Controller → Service

Security requirements:
  bcrypt/argon2 with a cost equivalent to a minimum of 12 bcrypt rounds for all user passwords
  AES-256-GCM for sensitive fields (camera RTSP/ONVIF credentials, SIM PINs, third-party API keys) — field
  name must end in `Encrypted` (e.g. `rtspPasswordEncrypted`)
  Never expose raw Prisma errors or stack traces to API consumers
  Validate camera snapshot/recording uploads by both MIME type AND file extension before handing off to
  `services/media` (MediaMTX) or `services/image-analysis` (FastAPI + OpenCV)
  Sanitize all user input before using in queries, logs, or responses