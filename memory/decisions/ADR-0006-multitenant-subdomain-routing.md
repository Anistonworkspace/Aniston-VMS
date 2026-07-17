# ADR-0006 — Multi-Tenant Subdomain Routing Strategy

**Date:** 2026-05-20
**Status:** Accepted
**Deciders:** Aniston Technologies LLP

---

## Context

The boilerplate supports multiple organizations (tenants) sharing one deployment. Two common strategies:

1. **Subdomain routing** — `acme.app.yourdomain.com` → tenant = "acme"
2. **Path-based routing** — `app.yourdomain.com/acme/dashboard` → tenant = "acme"
3. **Header-based routing** — `X-Tenant-ID: acme` header

---

## Decision

Use **subdomain routing** as the primary strategy.

---

## Rationale

| Criterion | Subdomain | Path-based | Header-based |
|-----------|-----------|------------|-------------|
| URL clarity for users | ✅ Clear org identity | ⚠️ Mixed with routes | ❌ Not visible |
| Browser cookie isolation | ✅ Per-subdomain cookies | ❌ Shared cookies | ❌ |
| CORS setup | ✅ Wildcard `*.app.domain` | Simpler | Complex |
| DNS setup | Wildcard A/CNAME needed | None extra | None extra |
| Localhost dev experience | ⚠️ Needs hosts file | ✅ Simple | ✅ Simple |

Cookie isolation is the deciding factor. With subdomain routing, `session` and `refreshToken` httpOnly cookies are scoped to `acme.app.yourdomain.com` — they cannot be read by another org's subdomain. Path-based routing would require manual tenant scoping on every cookie, introducing risk.

---

## Implementation

- `Organization.slug` is the subdomain identifier (lowercase alphanumeric + hyphens, unique)
- `tenantResolver` middleware resolves `req.tenant` from `req.hostname` before `authenticate`
- `authenticate` middleware cross-checks `user.organizationId === req.tenant.id`
- Nginx wildcard `server_name *.app.yourdomain.com;` routes all subdomains to the same Express instance
- DNS: wildcard `*.app.yourdomain.com` A record pointing to the server IP
- Local dev: use `org1.localhost` with `/etc/hosts` entry or use `X-Tenant-Override` header (dev only)

---

## Consequences

- Every new org gets `<slug>.app.yourdomain.com` automatically (no Nginx config change needed)
- The main domain `app.yourdomain.com` serves the registration/landing page (no org context)
- Wildcard SSL certificate needed (Let's Encrypt wildcard via DNS-01 challenge)
- Cookie `domain` set to `.app.yourdomain.com` (dot prefix) for cross-subdomain if needed

## How to apply

Read `skill-multitenancy-patterns.md` before implementing any tenant-scoping logic.
The `organizationId` ALWAYS comes from `req.user.organizationId` — never from `req.body` or query params.
