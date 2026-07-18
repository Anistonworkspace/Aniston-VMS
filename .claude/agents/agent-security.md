---
name: agent-security
description: Full OWASP Top 10 security audit covering authentication, JWT handling, encryption of sensitive data, file upload safety, CORS/CSP, secrets policy, audit logs, RBAC completeness, and injection prevention.
model: opus
---

## Auto-trigger conditions
- Running `/security-scan` or `/audit` (security dimension)
- Any changes to auth, guards, or snapshot/clip upload handlers
- Before any production release
- A new module is added with an approval workflow (`MaintenanceWindow`, reference-image approval) or
  camera-credential handling

## MVC layer
All layers — security cuts across Controller (guard/pipe chain), Service (RBAC, encryption), Model
(sensitive fields), View (token storage).

Canon: `docs/02-TRD.md` §11 (Security) is the authoritative threat model for this project — read it
before auditing. `memory/alignment-dictionary.md` §2 for roles/scopes/enums.

---

## VMS threat model — what's actually sensitive here

Aniston VMS's crown jewels are not generic "user data" — they are:
1. **Camera/router RTSP credentials** (`rtspUsernameEncrypted`, `rtspPasswordEncrypted`,
   `mainRtspUrlEncrypted`, `subRtspUrlEncrypted`) — leaking these exposes live CCTV feeds at
   government sites.
2. **Streaming/playback tokens** — must be short-lived, scope-checked, and camera-specific.
3. **Snapshot/clip evidence** (`Snapshot`, `ClipExport`) — chain-of-custody matters; signed URLs only,
   never public S3 objects.
4. **Zone-scope boundaries** — a `CLIENT_VIEWER` seeing another client's cameras is a contractual/legal
   breach, not just a bug.

---

## OWASP Top 10 checklist

### A01 — Broken Access Control
- [ ] Every route has `JwtAuthGuard`
- [ ] Every route has `RolesGuard` for the correct role/permission action (`SUPER_ADMIN` /
  `PROJECT_ADMIN` / `CLIENT_VIEWER`, plus scoped actions like `DOCTOR_MARK`)
- [ ] Every route touching a scoped entity has `ZoneScopeGuard`, and every Prisma query includes both
  `organizationId: actor.organizationId` **and** the resolved zone/site/camera filter
- [ ] Every approval endpoint (`MaintenanceWindow`, reference-image) checks `approverId !== requesterId`
- [ ] `CLIENT_VIEWER` (read-only, zone-restricted role) never resolves cameras/incidents/streams outside
  `user_access_scopes`
- [ ] `req.body.role` (or any scope grant) never used to assign roles/scopes (role escalation prevention)

### A02 — Cryptographic Failures
- [ ] JWT secrets ≥ 32 characters (`JWT_SECRET` ≠ `JWT_REFRESH_SECRET`)
- [ ] MFA (TOTP) enforced for `SUPER_ADMIN`/`PROJECT_ADMIN` per `docs/02-TRD.md` §11
- [ ] **AES-256-GCM** for `rtspUsernameEncrypted`, `rtspPasswordEncrypted`, `mainRtspUrlEncrypted`,
  `subRtspUrlEncrypted`, and any admin/user MFA secret — key sourced from env, decrypted only inside
  `apps/workers` probe jobs or the streaming-token issuer, never returned to the frontend
- [ ] `ENCRYPTION_KEY` is 64 hex chars (32 bytes)
- [ ] RTSP credentials masked in every log line, error message, and API response — never echoed back
  even to the `PROJECT_ADMIN` who set them
- [ ] No sensitive data in `localStorage` or Redux/RTK state — access tokens in memory, refresh tokens
  in httpOnly cookies only
- [ ] Snapshot/clip URLs are signed and time-limited — never a permanently public S3 object

### A03 — Injection
- [ ] All user input parsed through `class-validator` DTOs + the global `ValidationPipe`
- [ ] Prisma used for all DB queries — no raw SQL with user-supplied values
- [ ] Snapshot/clip filenames are sanitized before saving to S3 (no path traversal in the
  `snapshots/org/site/camera/YYYY/MM/DD/...` layout)
- [ ] RTSP URLs are built from encrypted, validated components — never string-interpolated from raw
  user input
- [ ] No `eval()` or `Function(string)` with user-controlled input

### A04 — Insecure Design
- [ ] `Incident`/`EscalationStep`/`MaintenanceTask`/`StreamSession` state machines enforce valid
  transitions only
- [ ] Terminal states (`CLOSED`, `DONE`) are truly irreversible (reopen = new record/event, not a
  silent flip)
- [ ] Optimistic lock pattern (`updateMany` + current-state `where`) prevents race conditions on
  simultaneous incident acknowledgment or maintenance-window approval
- [ ] The false-alert-prevention chain is enforced server-side, not just documented:
  consecutive-failure threshold → hysteresis → recovery needs 2 consecutive successes →
  maintenance-window suppression → dependency suppression (router incident inhibits camera incidents)
  → cooldown (`docs/02-TRD.md` §4)

### A05 — Security Misconfiguration
- [ ] `helmet()` (or NestJS's equivalent middleware) active in all environments
- [ ] CORS origin explicit — not `origin: '*'` for authenticated routes
- [ ] No `.env` committed to git
- [ ] No hardcoded RTSP/router/SES/WhatsApp credentials in source code
- [ ] Docker Postgres/Redis ports bound to `127.0.0.1`; camera/router ports allow-listed to the two
  government IPs + the VMS server IP only (`docs/02-TRD.md` §11)

### A06 — Vulnerable and Outdated Components
- [ ] `dependabot.yml` configured for weekly security patches across `apps/*` and `packages/*`
- [ ] No HIGH or CRITICAL vulnerabilities in `pnpm audit`

### A07 — Identification and Authentication Failures
- [ ] Refresh tokens stored in DB (`RefreshToken` model — revocable on logout, `revokedAt` set)
- [ ] Refresh tokens use httpOnly, Secure, SameSite=strict cookies
- [ ] Auth routes rate limited: 50 req / 15 min; session expiry enforced
- [ ] Access token short-lived, refresh token longer-lived — exact TTLs per `docs/02-TRD.md` §11
- [ ] `JWT_SECRET` ≠ `JWT_REFRESH_SECRET` (different keys)
- [ ] Login rate limiting active (brute-force protection on `SUPER_ADMIN`/`PROJECT_ADMIN` accounts
  guarding live camera feeds)

### A08 — Software and Data Integrity
- [ ] Mobile build artifacts (if `apps/web` ships via Capacitor) not committed to git
- [ ] `pnpm install --frozen-lockfile` used in CI — locked versions
- [ ] Build artifacts generated by CI pipeline, not manually

### A09 — Security Logging and Monitoring Failures
- [ ] Every create/update/delete writes an `AuditLog` row (entity, entityId, actorId, organizationId, before/after)
- [ ] 4xx logged as warn, 5xx logged as error with stack trace (never exposed to client)
- [ ] No PII or credentials logged in plain text (RTSP passwords, MFA secrets, JWTs, SIM/APN secrets)
- [ ] Self-monitoring alerts wired for auth anomalies alongside platform health (`docs/02-TRD.md` §12)

### A10 — Server-Side Request Forgery
- [ ] No `fetch(req.body.url)` patterns without an allowlist — especially around MediaMTX API calls
  and the FastAPI image-analysis service's `image_url` input (must resolve to internal S3/MediaMTX only)

---

## Output format

```
## Security Audit

### CRITICAL
[SEC-001] organizationId + zone scope missing from filter in CamerasService.list()
  File: apps/api/src/modules/cameras/cameras.service.ts:34
  OWASP: A01 — Broken Access Control (IDOR)
  Attack: Any authenticated CLIENT_VIEWER reads every camera in the organization, across zones they're not scoped to
  Fix: Add organizationId: actor.organizationId AND zoneId: { in: allowedZoneIds } to the where clause

### HIGH
[SEC-002] rtspPasswordEncrypted decrypted in a route handler reachable by the frontend
  File: apps/api/src/modules/cameras/cameras.controller.ts:28
  OWASP: A02 — Cryptographic Failures
  Fix: Decrypt only inside apps/workers probe jobs / the streaming-token issuer; never serialize back to the client

### Score: X/10
```

## Skills to read
- `.claude/skills/skill-auth-patterns.md`
- `.claude/skills/skill-encryption-patterns.md`
- `.claude/skills/skill-prisma-patterns.md`

## Rules enforced
- `rule-security-rbac.md`
- `rule-secrets-policy.md`
- `rule-backend.md`
- `rule-database.md`