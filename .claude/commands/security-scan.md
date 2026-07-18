---
name: security-scan
description: Run a full security vulnerability scan of Aniston VMS. Checks OWASP Top 10, zone-scoped RBAC, JWT auth, AES-256-GCM camera/router credential encryption, RTSP/ONVIF stream security, secrets policy, file uploads/clip exports, CORS, and audit logs.
---

Invokes `agent-security` to perform a full security audit.
Canon: `docs/02-TRD.md`, `memory/alignment-dictionary.md`, `skill-encryption-patterns.md`, `skill-auth-patterns.md`.

The agent will check:

1. OWASP Top 10 for `apps/api` (NestJS), `apps/workers`, `services/media`, and `services/image-analysis`
2. Authentication: JWT access + refresh (`JWT_SECRET` / `JWT_REFRESH_SECRET`), refresh token stored
   `httpOnly` + `SameSite`, `RefreshToken.revokedAt` honored on logout/rotation, MFA (TOTP) enforced for
   admin roles
3. Authorization: guard order on every route is `JwtAuthGuard → RolesGuard → ZoneScopeGuard →
   ValidationPipe`, `organizationId` scoping plus `allowedZoneIds` zone-scope enforcement
   (`SUPER_ADMIN`/`PROJECT_ADMIN`/`CLIENT_VIEWER`), IDOR prevention, self-approval check on
   acknowledge/resolve/escalate endpoints (`approverId !== requesterId`)
4. Encryption: camera/router credential fields (`rtspUsernameEncrypted`, `rtspPasswordEncrypted`,
   `mainRtspUrlEncrypted`, `subRtspUrlEncrypted`, SIM PINs, API keys) are AES-256-GCM encrypted at rest,
   `ENCRYPTION_KEY` properly sized and never logged, decryption only happens inside `apps/workers` or the
   `apps/api` stream-token issuer — never sent to the frontend
5. Secrets: no hardcoded credentials, `.env` not committed, all secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
   `ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`) via environment variables only
6. Stream/media security: RTSP/ONVIF credentials never logged or exposed in any API response DTO,
   MediaMTX on-demand WebRTC/HLS stream URLs are signed and short-TTL, snapshot/recording clip URLs are
   signed and time-limited, camera/router management ports are allow-listed
7. File uploads / clip exports: MIME + extension validation on any upload, `ffmpeg` clip export duration/size
   limits enforced, auth-gated + signed access to recordings and snapshots
8. CORS: explicit origin whitelist, not wildcard, for authenticated routes
9. CSP: `script-src` tightened, no `unsafe-eval` in production
10. Audit logs: every credential change, stream session start, and incident create/acknowledge/escalate/
    resolve/close is written to `AuditLog` with `entityId`, `actorId`, `organizationId`
11. Input validation: `class-validator` DTOs (or a Zod pipe) on every POST/PATCH/PUT endpoint, no untyped
    `any` accepted on user-controlled fields, `ValidationPipe` applied globally or per-route

Output format:
- `SEC-[NNN]` findings sorted by severity (CRITICAL first)
- Each finding: OWASP category, file + line, attack vector, fix
- Overall security score out of 10
- Top 3 most urgent fixes

After the scan, for any CRITICAL finding: do not deploy until fixed.
For HIGH findings: fix before the next release.
