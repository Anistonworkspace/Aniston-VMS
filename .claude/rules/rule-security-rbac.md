---
# Security — RBAC and Multi-Tenancy Rules

ABSOLUTE RULE — organizationId:
  Every Prisma query on org-scoped data MUST include organizationId
  The organizationId MUST come from req.user.organizationId (set by the auth middleware)
  NEVER trust organizationId from the request body — users can fake it

Route middleware order (mandatory):
  authenticate → requirePermission → validateRequest → controller
  Never skip authenticate. Never move requirePermission after validateRequest.

Self-approval prevention:
  EVERY approval endpoint MUST check: approverId !== requesterId
  If this check is missing, flag it as CRITICAL

Restricted-role scope:
  A MEMBER can only view and act on records it owns
  Always filter by ownerId (or createdById) when the requesting user is a MEMBER

Role escalation prevention:
  Only SUPER_ADMIN can create an ADMIN user
  The role field in request body MUST be ignored — role is set by the service, not the caller

IDOR prevention:
  Every findUnique, findMany, update, and delete MUST include organizationId in the where clause
  A missing organizationId filter is an IDOR vulnerability — flag as CRITICAL
