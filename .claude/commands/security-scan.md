---
name: security-scan
description: Run a full security vulnerability scan. Checks OWASP Top 10, authentication, JWT handling, encryption, secrets policy, file uploads, CORS, and audit logs.
---

Invokes agent-security to perform a full security audit.

The agent will check:

1. OWASP Top 10 for the current codebase
2. Authentication: JWT storage, token rotation, session management
3. Authorization: RBAC middleware on every route, organizationId scoping, IDOR prevention
4. Encryption: sensitive fields AES-256-GCM encrypted, ENCRYPTION_KEY properly sized
5. Secrets: no hardcoded credentials, .env not committed, all secrets via environment variables
6. File uploads: MIME + extension validation, auth-gated access, size limits
7. CORS: explicit origin whitelist, not wildcard for authenticated routes
8. CSP: script-src tightened, no unsafe-eval in production
9. Audit logs: every create/update/delete has an audit trail
10. Input validation: Zod schemas on all POST/PATCH endpoints, no z.any() on user fields

Output format:
- SEC-[NNN] findings sorted by severity (CRITICAL first)
- Each finding: OWASP category, file+line, attack vector, fix
- Overall security score out of 10
- Top 3 most urgent fixes

After the scan, for any CRITICAL finding: do not deploy until fixed.
For HIGH findings: fix before the next release.
