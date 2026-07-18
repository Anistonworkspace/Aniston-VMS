# Skill — Multi-Tenancy Patterns (org tenancy + zone scope)

---

Org onboarding, per-tenant plan limits, tenant isolation checklist. Aniston VMS is multi-tenant at the
**organization** level (each customer is one `Organization`) and additionally scoped inside an org by
**site → zone → camera** (see `skill-rbac-advanced-patterns.md` for `ScopeType`). Both layers must be
enforced together — `organizationId`-only filtering is NOT sufficient once a `CLIENT_VIEWER` is scoped
to a single zone.

## Organization model (already in `docs/05-backend-schema.md`)

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  plan      OrgPlan  @default(STARTER)
  createdAt DateTime @default(now())
  sites     Site[]
  users     User[]
  cameras   Camera[]
}

enum OrgPlan {
  STARTER
  PROFESSIONAL
  ENTERPRISE
}
```

## Registration flow (creates the org + first PROJECT_ADMIN)

```typescript
// apps/api/src/modules/auth/auth.service.ts
async register(dto: RegisterInput) {
  const slugExists = await this.prisma.organization.findUnique({ where: { slug: dto.orgSlug } });
  if (slugExists) throw new ConflictException('ORG_SLUG_TAKEN');

  return this.prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: dto.orgName, slug: dto.orgSlug, plan: OrgPlan.STARTER },
    });
    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        role: UserRole.PROJECT_ADMIN,   // first user of a new org is always PROJECT_ADMIN, never SUPER_ADMIN
        scopeType: null,                // unscoped within their own org
      },
    });
    await this.auditLogger.log(tx, { action: 'ORG_REGISTERED', organizationId: org.id, actorId: user.id });
    return { org, user };
  });
}
```

## Tenant resolution — organizationId always comes from the JWT, never from the request body

```typescript
// apps/api/src/common/interceptors/tenant.interceptor.ts
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser; body: Record<string, unknown> }>();
    // ❌ NEVER: const organizationId = req.body.organizationId
    // ✅ ALWAYS: derive it from the verified actor attached by JwtStrategy
    if ('organizationId' in req.body) delete req.body.organizationId; // strip any client-supplied override
    return next.handle();
  }
}
```

```typescript
// ✅ CORRECT — every service query scopes by organizationId first, scope-narrowing second
async findAll(actor: AuthUser, query: ListCameraQuery) {
  const where: Prisma.CameraWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...buildScopeWhere(actor), // site/zone/camera narrowing — see skill-rbac-advanced-patterns.md
  };
  return this.prisma.camera.findMany({ where, skip: query.skip, take: query.take });
}
```

## SUPER_ADMIN cross-org access (explicit + audited, never implicit)

```typescript
// SUPER_ADMIN is the one role allowed to bypass the organizationId filter — only via a dedicated
// platform-ops endpoint, and every cross-org read/write is logged with the target organizationId.
@Get('platform/organizations/:orgId/cameras')
@Roles(UserRole.SUPER_ADMIN)
async platformListCameras(@Param('orgId') orgId: string, @CurrentUser() actor: AuthUser) {
  await this.auditLogger.log({ action: 'PLATFORM_CROSS_ORG_READ', actorId: actor.id, organizationId: orgId });
  return this.prisma.camera.findMany({ where: { organizationId: orgId, deletedAt: null } });
}
```

## Plan-gated features (camera count, retention days, integrations)

```typescript
// packages/shared/src/plans.ts
export const PLAN_FEATURES: Record<OrgPlan, { maxCameras: number; clipRetentionDays: number; whatsappAlerts: boolean }> = {
  STARTER:      { maxCameras: 10,  clipRetentionDays: 7,  whatsappAlerts: false },
  PROFESSIONAL: { maxCameras: 50,  clipRetentionDays: 30, whatsappAlerts: true },
  ENTERPRISE:   { maxCameras: 500, clipRetentionDays: 90, whatsappAlerts: true },
};

async assertCanAddCamera(organizationId: string) {
  const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const cameraCount = await this.prisma.camera.count({ where: { organizationId, deletedAt: null } });
  if (cameraCount >= PLAN_FEATURES[org.plan].maxCameras) {
    throw new ForbiddenException('PLAN_CAMERA_LIMIT_REACHED');
  }
}
```

## Org settings service (org-scoped config, e.g. notification thresholds, WhatsApp number)

```typescript
// apps/api/src/modules/org-settings/org-settings.service.ts
async updateSettings(actor: AuthUser, dto: UpdateOrgSettingsInput) {
  if (actor.role !== UserRole.PROJECT_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only PROJECT_ADMIN or SUPER_ADMIN can update organization settings');
  }
  const settings = await this.prisma.orgSettings.update({
    where: { organizationId: actor.organizationId }, // never accepts an organizationId from the DTO
    data: dto,
  });
  await this.auditLogger.log({ action: 'ORG_SETTINGS_UPDATED', actorId: actor.id, organizationId: actor.organizationId });
  return settings;
}
```

If the target org doesn't exist at all (e.g. a stale JWT after an org was deleted), throw
`TENANT_NOT_FOUND` — distinct from `NOT_FOUND` on a single resource — so the frontend can force a
full re-login instead of showing an empty list.

## Tenant isolation testing checklist

1. Every Prisma query that touches an org-scoped model includes `organizationId` in its `where` — a repo
   grep for `prisma.<model>.find` without `organizationId` nearby should come back empty for tenant models.
2. Cross-tenant read attempt (org A's `PROJECT_ADMIN` requesting org B's camera id) → `404`, not `403`
   (never confirm the resource exists in another tenant).
3. `organizationId` in the request body/query is always ignored — the interceptor strips it before the
   controller runs.
4. Zone/site/camera scope narrowing (`ScopeType`) is applied **in addition to** `organizationId`, not
   instead of it — a `CLIENT_VIEWER`'s zone scope is meaningless if the org filter is missing.
5. `SUPER_ADMIN` cross-org access only happens through the dedicated `platform/*` routes, and each call is
   audit-logged with the target `organizationId`.