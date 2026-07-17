## Summary
<!-- 1–3 bullet points: what this PR does and why -->
- 

## Type of change
- [ ] Bug fix (P0 / P1 / P2 / P3)
- [ ] New feature (`/new-module` used)
- [ ] Refactor (behavior unchanged, tests still pass)
- [ ] Database migration included
- [ ] Docs / config only

## Test plan
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Unit tests added / updated — `npm test --workspace=backend`
- [ ] Component tests added / updated — `npm test --workspace=frontend`
- [ ] Manual test steps: [describe what you clicked / called]
- [ ] Tested at 375px mobile viewport (if UI changed)

## Security checklist
- [ ] No `.env`, secrets, or API keys committed
- [ ] `organizationId` always from `req.user` — never from request body
- [ ] Every Prisma query includes `organizationId` and `{ deletedAt: null }`
- [ ] Middleware order: `authenticate → requirePermission → validateRequest → controller`
- [ ] `auditLogger.log()` called for every create / update / delete

## Frontend checklist (if UI changed)
- [ ] RTK Query endpoints have `providesTags` / `invalidatesTags`
- [ ] Loading state shown (Skeleton / Loader2 spinner)
- [ ] Error state shown (toast on mutation failure)
- [ ] Role-based UI: admin-only elements hidden from EMPLOYEE

## Database checklist (if migration included)
- [ ] Migration file committed in `prisma/migrations/`
- [ ] New model has `id`, `organizationId`, `createdAt`, `updatedAt`, `deletedAt`
- [ ] `@@index([organizationId])` added
- [ ] New enums added to both `schema.prisma` AND `shared/src/enums.ts`
- [ ] Migration is safe to run on existing data (no breaking changes)

## Screenshots (if UI changed)
<!-- Before / After -->
