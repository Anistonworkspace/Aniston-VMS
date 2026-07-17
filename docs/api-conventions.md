# API Design Conventions — Aniston VMS

> Aligned with [`02-TRD.md`](02-TRD.md) and [`05-backend-schema.md`](05-backend-schema.md);
> enforced by `.claude/rules/rule-api.md`. Examples use VMS resources (`/api/cameras`, …).

## Authentication

- **JWT access + refresh** (per `02-TRD.md § Security`): short-lived access token in
  `Authorization: Bearer ...`; refresh token in an **httpOnly cookie**, hash stored in
  `refresh_tokens` (`token_hash @unique`, `expires_at`, `revoked_at?`).
- On `401` the client calls `POST /api/auth/refresh` (cookie) and retries with the new access token.
- **MFA (TOTP) for admins**, session expiry, and login rate limiting are required by the TRD.
- **Stream auth is separate**: `POST /cameras/:id/live/start` → scope + session-limit checks →
  `stream_sessions` row → short-lived **stream JWT** → MediaMTX validates it per connection via
  `POST /internal/media-auth`. Never reuse the API access token for media.
- Signed temporary URLs for snapshot/clip downloads (no public S3 objects).

## Response envelope

Every API response uses the same envelope — success and error alike.

```typescript
// Success (single resource)
{ "success": true, "data": { "id": "...", "camera_code": "CAM-042" } }

// Success (list)
{
  "success": true,
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 243 }
}

// Error
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Camera not found"
  }
}
```

**Why:** RTK Query always destructures `data` or `error` without checking shape; one pattern
across all endpoints means agents never guess the format.

## HTTP status codes

| Code | When to use |
|------|------------|
| 200 | GET / PATCH / DELETE success |
| 201 | POST — resource created |
| 400 | Validation error (Zod schema failed) |
| 401 | Not authenticated (no token, expired token) |
| 403 | Authenticated but forbidden (RBAC denied, out of scope) |
| 404 | Resource not found or soft-deleted |
| 409 | Conflict — duplicate or state machine violation |
| 429 | Rate limited |
| 503 | Downstream service unavailable (DB, Redis, MediaMTX) |
| 500 | Unexpected server error — **never expose stack traces** |

## Route naming

```
GET    /api/<resource>          list (paginated)
POST   /api/<resource>          create
GET    /api/<resource>/:id      get one
PATCH  /api/<resource>/:id      update (partial)
DELETE /api/<resource>/:id      soft delete
POST   /api/<resource>/:id/<action>  state machine transition / RPC-ish action
```

VMS examples:
```
GET    /api/cameras                     list cameras in the caller's scope
POST   /api/cameras                     create camera (encrypted RTSP credentials)
GET    /api/cameras/:id                 get one camera
PATCH  /api/cameras/:id                 update camera fields
POST   /api/cameras/:id/live/start      start live session (returns stream JWT + path)
POST   /api/incidents/:id/acknowledge   transition: ALERTED → ACKNOWLEDGED
POST   /internal/media-auth             MediaMTX connection-auth webhook (not public API)
```

## Middleware order — mandatory, never change

```
authenticate → requirePermission → validateRequest → controller
```

1. `authenticate` — verifies JWT, sets `req.user`
2. `requirePermission(X)` — RBAC (`Role`: `SUPER_ADMIN`, `PROJECT_ADMIN`, … `CLIENT_VIEWER`)
   **plus the scope guard** — VMS data access is limited by `user_access_scopes`
   (`ALL | REGION | ZONE | SITE`)
3. `validateRequest(Schema)` — Zod parses `req.body` / `req.params` / `req.query`, 400 on failure
4. controller — receives a clean, validated request with a known user + scopes

## Pagination

All list endpoints accept `?page=1&limit=20` and always return `meta.total`.

```typescript
const [data, total] = await prisma.$transaction([
  prisma.camera.findMany({ where: scopedWhere, skip: (page - 1) * limit, take: limit,
    orderBy: { created_at: 'desc' } }),
  prisma.camera.count({ where: scopedWhere }),
]);
```

## Rate limits

| Route group | Window | Max requests |
|-------------|--------|-------------|
| `/api/auth/*` (login, refresh, forgot-password) | 15 minutes | 50 |
| All other routes | 1 minute | 100 |

Login rate limiting is a hard TRD requirement.

## Scope enforcement — absolute rule

Aniston VMS is scoped by hierarchy (`region → zone → site → camera`), not by a client-supplied
tenant id. **Never** trust scope information from the request body — derive the allowed
region/zone/site set from `req.user`'s `user_access_scopes` and apply it to **every** query on
hierarchy-scoped tables. Missing scope filter = IDOR vulnerability (`rule-security-rbac.md`).
Every mutation writes an `audit_logs` row.

## Error codes (standard set)

| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Request body failed Zod schema |
| `UNAUTHORIZED` | No token or invalid token |
| `FORBIDDEN` | Valid token but insufficient permissions / out of scope |
| `NOT_FOUND` | Resource does not exist or is soft-deleted |
| `CONFLICT` | Duplicate record or invalid state transition |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Unexpected server error |

Domain error semantics (stream/config failures such as `CONFIG_ERROR` diagnoses) are **data**,
not HTTP errors — they live in `health_checks` / `incidents`, returned inside the success envelope.
