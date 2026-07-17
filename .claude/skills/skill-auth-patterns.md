# Skill — Authentication and RBAC Patterns

---

## JWT + HttpOnly cookie flow

```
Login → accessToken (15min, Authorization header) + refreshToken (7d, httpOnly cookie)
Request → Bearer <accessToken> in Authorization header
Expired → 401 → client calls /auth/refresh (cookie sent automatically) → new accessToken
Logout → DELETE /auth/logout → server deletes refreshToken from DB
```

## Auth middleware (what req.user looks like after authenticate)

```typescript
// Set by authenticate middleware from JWT payload
req.user = {
  id: 'user-uuid',
  email: 'user@example.com',
  role: 'MEMBER',              // UserRole enum
  organizationId: 'org-uuid',  // ALWAYS use this, never trust req.body.organizationId
  name: 'John Doe',
};
```

## requirePermission usage

```typescript
// In routes — always the 2-arg form: requirePermission(resource, action)
// The real signature lives at backend/src/middleware/auth.middleware.ts:37
router.post(
  '/',
  authenticate,
  requirePermission('items', 'create'),         // ✅ resource + action, never single SCREAMING_SNAKE
  validateRequest(...),
  controller,
);

// In service — additional granular checks if needed
if (actor.role === 'MEMBER' && record.ownerId !== actor.id) {
  throw new ForbiddenError('Members can only act on records they own');
}
```

## Permissions matrix (shared/src/permissions.ts — the single source of truth)

```typescript
// Add a ROW per module here BEFORE writing any route that uses its resource key.
// hasPermission() returns false for unknown resources → route 403s.
export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

export const PERMISSIONS: Record<string, Record<PermissionAction, UserRole[]>> = {
  items: {
    read:   [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  // ... see shared/src/permissions.ts for the full registry
};

export function hasPermission(role: UserRole, resource: string, action: PermissionAction): boolean {
  const resourcePerms = PERMISSIONS[resource];
  if (!resourcePerms) return false;
  return resourcePerms[action]?.includes(role) ?? false;
}
```

## Self-approval prevention (MANDATORY on every approval endpoint)

```typescript
// ✅ CORRECT — check in service, not controller
static async approve(id: string, actor: AuthUser) {
  const request = await this.getOne(id, actor);
  if (request.requesterId === actor.id) {
    throw new ForbiddenError('You cannot approve your own request');
  }
  // proceed with approval
}
```

## Restricted-role scope (MEMBER sees only records it owns)

```typescript
// ✅ CORRECT — filter by ownerId for MEMBER role
const where: Prisma.ItemWhereInput = {
  organizationId: actor.organizationId,
  deletedAt: null,
  ...(actor.role === UserRole.MEMBER ? { ownerId: actor.id } : {}),
};
```

## Frontend RBAC (hide admin-only UI)

```typescript
import { hasPermission } from '@boilerplate/shared';

// ✅ CORRECT — hide button if role doesn't have permission. 3-arg form: role, resource, action.
{hasPermission(user.role, 'items', 'create') && (
  <Button onClick={openCreateModal}>Add Item</Button>
)}
```

## Encryption for sensitive fields

```typescript
import { encrypt, decrypt } from '../../utils/encryption.js';

// On save — field name must end in Encrypted
const secretEncrypted = encrypt(dto.secret);

// On read
const secret = decrypt(record.secretEncrypted);
```
