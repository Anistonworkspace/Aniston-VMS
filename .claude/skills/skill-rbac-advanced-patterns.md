# Skill — RBAC Advanced Patterns

Dynamic permissions, resource ownership guards, owner-based scoping, multi-role edge cases.

> **Canonical permission API:** `requirePermission(resource, action)` on the backend, `hasPermission(role, resource, action)` on both sides. The single source of truth is [`shared/src/permissions.ts`](../../shared/src/permissions.ts). Resource keys are lowercase plural (`items`, `categories`); actions are exactly `'read' | 'create' | 'update' | 'delete'`.
>
> **Adding a new module?** Add a row to `PERMISSIONS` in `shared/src/permissions.ts` before using its resource key in any route — `hasPermission()` returns `false` for unknown resources and your route will 403.

---

## Permission registry — shared/src/permissions.ts (the only source)

```typescript
// shared/src/permissions.ts
import { UserRole } from './enums.js';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

export const PERMISSIONS: Record<string, Record<PermissionAction, UserRole[]>> = {
  organizations: {
    read:   [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    create: [UserRole.SUPER_ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN],
  },
  items: {
    read:   [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  // ... add a row PER MODULE you build. See shared/src/permissions.ts for the full registry.
};

export function hasPermission(role: UserRole, resource: string, action: PermissionAction): boolean {
  const resourcePerms = PERMISSIONS[resource];
  if (!resourcePerms) return false;          // unknown resource → deny
  return resourcePerms[action]?.includes(role) ?? false;
}
```

---

## Backend `requirePermission` middleware (already implemented)

```typescript
// backend/src/middleware/auth.middleware.ts — already wired
import { hasPermission, type PermissionAction } from '@boilerplate/shared';
import type { RequestHandler } from 'express';

export function requirePermission(resource: string, action: PermissionAction): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!hasPermission(req.user.role, resource, action)) {
      return next(new ForbiddenError(`Permission required: ${resource}.${action}`));
    }
    next();
  };
}
```

```typescript
// Usage in routes — always 2-arg form
router.post(
  '/',
  authenticate,
  requirePermission('items', 'create'),     // ✅ resource + action
  validateRequest({ body: CreateSchema }),
  ItemController.create,
);
```

### Any-of and all-of patterns

For routes that need composite permission checks, compose `hasPermission()` inside the service rather than chaining many middlewares:

```typescript
// backend/src/modules/report/report.service.ts
import { hasPermission } from '@boilerplate/shared';

static async exportInvoices(actor: AuthUser) {
  const canViewInvoices  = hasPermission(actor.role, 'invoices',  'read');
  const canExportReports = hasPermission(actor.role, 'reports',   'create');
  if (!canViewInvoices || !canExportReports) {
    throw new ForbiddenError('Need both invoices.read and reports.create');
  }
  // ...
}
```

---

## Resource ownership guard

```typescript
// backend/src/utils/ownershipGuard.ts

// Guard: the actor can only act on their OWN record (unless admin)
export function assertOwnerOrAdmin(
  resourceOwnerId: string,
  actor: AuthUser,
  message = 'You can only perform this action on your own record',
) {
  const isOwner = actor.id === resourceOwnerId;
  const isAdmin = [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role);

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError(message);
  }
}

// Usage in service:
static async getInvoice(id: string, actor: AuthUser) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');

  // A MEMBER can only see their own invoice
  assertOwnerOrAdmin(invoice.ownerId, actor);

  return invoice;
}
```

---

## Owner scope (restricted role)

```typescript
// backend/src/utils/ownerScope.ts

// Build the organizationId + ownership scope based on role
export function buildItemScope(
  actor: AuthUser,
  extraWhere: Prisma.ItemWhereInput = {},
): Prisma.ItemWhereInput {
  const base: Prisma.ItemWhereInput = {
    organizationId: actor.organizationId,
    deletedAt: null,
    ...extraWhere,
  };

  if (actor.role === UserRole.MEMBER) {
    // A restricted MEMBER sees only the records it owns
    base.ownerId = actor.id;
  }

  // ADMIN / SUPER_ADMIN: no extra filter — sees all
  return base;
}

// Usage in service:
static async list(query: ListItemQuery, actor: AuthUser) {
  const where = buildItemScope(actor, {
    // Additional item-specific filters applied here
  });
  // ...
}
```

---

## Self-approval prevention guard

```typescript
// CRITICAL — must exist on every approval endpoint
export function assertNotSelfApproval(requesterId: string, actor: AuthUser) {
  // The approver must not be the same user who created the request
  if (actor.id === requesterId) {
    throw new ForbiddenError('You cannot approve your own request');
  }
}

// Usage:
static async approveItem(id: string, actor: AuthUser) {
  const item = await prisma.item.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!item) throw new NotFoundError('Item not found');

  assertNotSelfApproval(item.createdById, actor);  // ← CRITICAL

  // Proceed with approval...
}
```

---

## Role escalation prevention

```typescript
// Only SUPER_ADMIN can assign ADMIN role
// Only ADMIN / SUPER_ADMIN can assign MEMBER role
export function assertCanAssignRole(targetRole: UserRole, actor: AuthUser) {
  if (targetRole === UserRole.SUPER_ADMIN) {
    throw new ForbiddenError('Cannot create SUPER_ADMIN users via API');
  }
  if (targetRole === UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenError('Only SUPER_ADMIN can create ADMIN users');
  }
  if (targetRole === UserRole.MEMBER && ![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
    throw new ForbiddenError('Only ADMIN can create MEMBER users');
  }
}

// In user creation service:
static async create(dto: CreateUserInput, actor: AuthUser) {
  assertCanAssignRole(dto.role, actor);
  // Never set role from dto directly — set it after the guard passes
  const user = await prisma.user.create({
    data: { ...dto, organizationId: actor.organizationId, role: dto.role },
  });
  return user;
}
```

---

## Frontend permission hooks

```typescript
// frontend/src/hooks/usePermission.ts
import { useSelector } from 'react-redux';
import { hasPermission, type PermissionAction } from '@boilerplate/shared';
import type { RootState } from '@/app/store';

export function usePermission(resource: string, action: PermissionAction): boolean {
  const role = useSelector((s: RootState) => s.auth.user?.role);
  if (!role) return false;
  return hasPermission(role, resource, action);
}

// Usage in component:
function ItemActions({ item }: { item: Item }) {
  const canApprove = usePermission('items', 'update');
  const canCancel  = usePermission('items', 'delete');

  return (
    <div className="flex gap-2">
      {canApprove && <button className="btn btn--positive btn--sm">Approve</button>}
      {canCancel  && <button className="btn btn--negative btn--sm">Cancel</button>}
    </div>
  );
}
```

---

## Permission guard component

```typescript
// frontend/src/components/auth/PermissionGuard.tsx
import type { PermissionAction } from '@boilerplate/shared';

interface PermissionGuardProps {
  resource: string;
  action:   PermissionAction;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({ resource, action, fallback = null, children }: PermissionGuardProps) {
  const allowed = usePermission(resource, action);
  return allowed ? <>{children}</> : <>{fallback}</>;
}

// Role guard for coarser checks (when permission matrix doesn't yet cover the case)
export function RoleGuard({ roles, children, fallback = null }: {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const role = useSelector((s: RootState) => s.auth.user?.role);
  return role && roles.includes(role) ? <>{children}</> : <>{fallback}</>;
}

// Usage:
<PermissionGuard resource="items" action="create">
  <button className="btn btn--primary">Add Item</button>
</PermissionGuard>

<RoleGuard roles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
  <AdminSettingsPanel />
</RoleGuard>
```

---

## Checklist

- [ ] All permissions defined in `shared/src/permissions.ts` — NOT scattered in service files
- [ ] Every new module added one row to `PERMISSIONS` BEFORE its routes were written
- [ ] `requirePermission(resource, action)` used on every route — always 2-arg form, never single SCREAMING_SNAKE
- [ ] `assertOwnerOrAdmin()` called on every endpoint that touches user-specific data
- [ ] `assertNotSelfApproval()` called on EVERY approval endpoint — critical
- [ ] `buildItemScope()` called in every list/search that a MEMBER can access
- [ ] Role escalation guard: no API can create ADMIN without SUPER_ADMIN actor
- [ ] Frontend `PermissionGuard resource="x" action="y"` wraps every admin-only UI element
- [ ] RBAC test matrix: every critical route tested with all 3 roles (SUPER_ADMIN, ADMIN, MEMBER) — 403 for unauthorized, 200 for authorized
