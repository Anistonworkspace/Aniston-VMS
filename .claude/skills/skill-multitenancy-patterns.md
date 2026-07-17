# Skill — Multi-Tenancy Patterns

Org onboarding flow, subdomain routing, per-tenant config, tenant isolation checklist.

---

## Organization model (already in boilerplate)

```prisma
model Organization {
  id           String    @id @default(uuid())
  name         String
  slug         String    @unique    // used for subdomain routing
  plan         OrgPlan   @default(FREE)
  settings     Json?               // per-tenant config blob
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  users        User[]
  items        Item[]
  // ... all other org-scoped models

  @@index([slug])
}

enum OrgPlan {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}
```

---

## Org onboarding — service

```typescript
// backend/src/modules/auth/auth.service.ts

static async register(dto: RegisterInput) {
  // 1. Check slug uniqueness
  const slugExists = await prisma.organization.findUnique({ where: { slug: dto.orgSlug } });
  if (slugExists) throw new ConflictError('Organization slug already taken');

  // Check user email uniqueness globally
  const emailExists = await prisma.user.findUnique({ where: { email: dto.email } });
  if (emailExists) throw new ConflictError('Email already registered');

  return prisma.$transaction(async (tx) => {
    // 2. Create org
    const org = await tx.organization.create({
      data: {
        name: dto.orgName,
        slug: dto.orgSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        plan: OrgPlan.FREE,
        settings: {
          timezone:   dto.timezone ?? 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
          locale:     'en-IN',
          currency:   'INR',
        },
      },
    });

    // 3. Create first user as SUPER_ADMIN of the org
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await tx.user.create({
      data: {
        email:          dto.email,
        passwordHash,
        role:           UserRole.SUPER_ADMIN,
        organizationId: org.id,
        isVerified:     false,
      },
    });

    // 4. Create email verification token
    const token = await tx.emailVerificationToken.create({
      data: { userId: user.id, token: uuid(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    // 5. Queue welcome email
    await emailQueue.add('org-welcome', { orgId: org.id, userId: user.id, token: token.token });

    await auditLogger.log(tx, {
      action: 'ORG_REGISTERED', entity: 'Organization', entityId: org.id,
      actorId: user.id, organizationId: org.id,
    });

    return { orgId: org.id, userId: user.id };
  });
}
```

---

## Subdomain resolution middleware

```typescript
// backend/src/middleware/tenantResolver.ts
// Resolves org from subdomain: acme.app.yourdomain.com → orgSlug = "acme"

export async function tenantResolver(req: Request, res: Response, next: NextFunction) {
  const host = req.hostname;   // e.g. "acme.app.yourdomain.com"
  const BASE_DOMAIN = process.env.BASE_DOMAIN ?? 'app.yourdomain.com';

  // Strip the base domain to get the subdomain
  const subdomain = host.replace(`.${BASE_DOMAIN}`, '').split('.')[0];

  if (!subdomain || subdomain === 'www' || host === BASE_DOMAIN) {
    // Main domain — no tenant context (login / landing page)
    return next();
  }

  const org = await prisma.organization.findFirst({
    where: { slug: subdomain, isActive: true, deletedAt: null },
    select: { id: true, slug: true, name: true, plan: true },
  });

  if (!org) {
    return res.status(404).json({ success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Organization not found' } });
  }

  // Attach tenant context to request
  req.tenant = org;
  next();
}

// In authenticate middleware — verify user belongs to resolved tenant:
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  // ... JWT verification ...

  // Cross-tenant access prevention
  if (req.tenant && user.organizationId !== req.tenant.id) {
    return next(new ForbiddenError('Access denied to this organization'));
  }

  req.user = user;
  next();
}
```

---

## Per-tenant settings service

```typescript
// backend/src/modules/org/org-settings.service.ts
export class OrgSettingsService {
  static async getSettings(actor: AuthUser): Promise<OrgSettings> {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { settings: true, plan: true },
    });
    return org.settings as OrgSettings;
  }

  static async updateSettings(dto: UpdateOrgSettingsInput, actor: AuthUser) {
    if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Only SUPER_ADMIN can update org settings');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: actor.organizationId },
        data:  { settings: dto },
      });
      await auditLogger.log(tx, {
        action: 'ORG_SETTINGS_UPDATED', entity: 'Organization', entityId: actor.organizationId,
        actorId: actor.id, organizationId: actor.organizationId,
        after: dto,
      });
      return updated.settings;
    });
  }
}

// Access settings anywhere in a service:
const settings = await OrgSettingsService.getSettings(actor);
const currency = settings.currency;   // "INR" or "USD"
```

---

## Plan-based feature gating

```typescript
// shared/src/plans.ts
export const PLAN_FEATURES: Record<OrgPlan, Set<string>> = {
  FREE:         new Set(['ITEM_MODULE', 'CATEGORY_MODULE']),
  STARTER:      new Set(['ITEM_MODULE', 'CATEGORY_MODULE', 'REPORT_MODULE']),
  PROFESSIONAL: new Set(['ITEM_MODULE', 'CATEGORY_MODULE', 'REPORT_MODULE', 'EXPORT_MODULE', 'ANALYTICS_MODULE']),
  ENTERPRISE:   new Set(['ITEM_MODULE', 'CATEGORY_MODULE', 'REPORT_MODULE', 'EXPORT_MODULE', 'ANALYTICS_MODULE', 'API_ACCESS', 'SSO', 'AUDIT_LOGS']),
};

export function planAllows(plan: OrgPlan, feature: string): boolean {
  return PLAN_FEATURES[plan]?.has(feature) ?? false;
}

// Backend middleware:
export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: { plan: true },
    });
    if (!org || !planAllows(org.plan, feature)) {
      return next(new ForbiddenError(`Your plan does not include ${feature}`));
    }
    next();
  };
}

// Frontend:
function PremiumFeatureGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const plan = useSelector((s: RootState) => s.auth.org?.plan);
  if (!plan || !planAllows(plan, feature)) {
    return <UpgradePrompt feature={feature} />;
  }
  return <>{children}</>;
}
```

---

## Tenant data isolation — audit checklist

```typescript
// Every query on ANY model MUST include organizationId — no exceptions
// Run this check before deploying any new service:

// ✅ Correct
await prisma.item.findMany({
  where: { organizationId: actor.organizationId, deletedAt: null },
});

// ❌ CRITICAL IDOR — missing organizationId
await prisma.item.findMany({ where: { categoryId: catId } });

// ✅ Correct update — includes organizationId to prevent cross-tenant update
await prisma.item.update({
  where: { id: dto.id, organizationId: actor.organizationId },
  data:  dto,
});
```

---

## Checklist

- [ ] Every Prisma model has `organizationId` field with `@@index`
- [ ] `organizationId` ALWAYS comes from `req.user.organizationId` — never from `req.body`
- [ ] Subdomain resolved to org before auth — org context attached to `req.tenant`
- [ ] Auth middleware cross-checks `user.organizationId === req.tenant.id`
- [ ] Org onboarding creates org + SUPER_ADMIN user in a single transaction
- [ ] Email verification token sent on registration
- [ ] Per-tenant settings stored as JSON blob — not as individual columns
- [ ] Plan-based feature gating at both API middleware and frontend component level
- [ ] Admin cannot see/modify other orgs' data (enforced by organizationId in every query)
- [ ] Org slug is unique, URL-safe (lowercase alphanumeric + hyphens)
