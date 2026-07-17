---
# API Response Rules
All responses MUST use the standard envelope:
  Success: { "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
  Error:   { "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }

  Note: meta.totalPages = Math.ceil(total / limit) — always include so the frontend doesn't recompute.

HTTP status codes:
  200 — GET / PATCH success
  201 — POST (resource created)
  400 — Validation error
  401 — Not authenticated
  403 — Authenticated but not authorized (RBAC denied)
  404 — Resource not found
  409 — Conflict (duplicate, already exists)
  429 — Rate limited
  500 — Server error (never expose stack traces)

Rate limits:
  Auth routes (login, register, forgot-password): 50 requests per 15 minutes
  All other routes: 100 requests per minute

Pagination:
  All list endpoints MUST accept ?page=1&limit=20
  Always return meta.total AND meta.totalPages so the frontend can render pagination controls without recomputing
