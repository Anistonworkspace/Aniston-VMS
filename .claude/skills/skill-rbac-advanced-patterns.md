# Skill — RBAC Advanced Patterns (zone-scoped, NestJS guards)

---

Dynamic permissions, resource-scope guards, zone-scoped visibility, multi-role edge cases. Canonical
permission API: `hasPermission(role, resource, action)` on the frontend, `RequirePermission(resource, action)`
+ `ZoneScopeGuard` on the backend. The single source of truth is `packages/shared/src/permissions.ts`
(`@aniston-vms/shared`).

## The three roles + ScopeType

```typescript
// packages/shared/src/enums.ts
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',      // platform ops — every org, every site/zone/camera, user + role management
  PROJECT_ADMIN = 'PROJECT_ADMIN',  // customer-side admin — full CRUD within their organization
  CLIENT_VIEWER = 'CLIENT_VIEWER',  // read-only, and only within their assigned scope
}

export enum ScopeType {
  ORG = 'ORG',       // no restriction beyond organizationId
  SITE = 'SITE',      // restricted to one site (and every zone/camera under it)
  ZONE = 'ZONE',      // restricted to one zone (and every camera under it)
  CAMERA = 'CAMERA',  // restricted to a single camera — narrowest grant
}
```

`scopeType`/`scopeId` live on the `User` row (nullable — `SUPER_ADMIN` and org-wide `PROJECT_ADMIN`s have
both `null`). A scoped `CLIENT_VIEWER` has e.g. `scopeType: ZONE, scopeId: '<zone-uuid>'` and must never see
cameras, incidents, clips or health data outside that zone, even by guessing an id in the URL.

## Permission matrix (packages/shared/src/permissions.ts — the single source of truth)

```typescript
// Add a ROW per module here BEFORE writing any controller route that uses its resource key.
// hasPermission() returns false for unknown resources → guard 403s closed, not open.
export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

export const PERMISSIONS: Record<string, Record<PermissionAction, UserRole[]>> = {
  cameras: {
    read:   [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN, UserRole.CLIENT_VIEWER],
    create: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],
  },
  cameraCredentials: {
    read:   [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],   // CLIENT_VIEWER never decrypts RTSP/ONVIF creds
    create: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],
    delete: [UserRole.SUPER_ADMIN],
  },
  incidents: {
    read:   [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN, UserRole.CLIENT_VIEWER],
    create: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN],   // acknowledge/resolve
    delete: [UserRole.SUPER_ADMIN],
  },
  // ... see packages/shared/src/permissions.ts for the full registry (zones, sites, routers, users, reports)
};

export function hasPermission(role: UserRole, resource: string, action: PermissionAction): boolean {
  const resourcePerms = PERMISSIONS[resource];
  if (!resourcePerms) return false;
  return resourcePerms[action]?.includes(role) ?? false;
}
```

## Backend: RequirePermission decorator + RolesGuard

```typescript
// apps/api/src/common/decorators/require-permission.decorator.ts
export const RequirePermission = (resource: string, action: PermissionAction) =>
  SetMetadata('permission', { resource, action });

// apps/api/src/modules/cameras/cameras.controller.ts
@Post()
@RequirePermission('cameras', 'create')          // ✅ resource + action, never a single SCREAMING_SNAKE string
create(@CurrentUser() actor: AuthUser, @Body() dto: CreateCameraDto) {
  return this.camerasService.create(actor, dto);
}
```

```typescript
// apps/api/src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = this.reflector.get<{ resource: string; action: PermissionAction }>('permission', ctx.getHandler());
    if (!meta) return true; // no @RequirePermission on this route — public within the auth boundary
    const { user } = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!hasPermission(user.role, meta.resource, meta.action)) {
      throw new ForbiddenException(`Role ${user.role} cannot ${meta.action} ${meta.resource}`);
    }
    return true;
  }
}
```

## ZoneScopeGuard — enforce scoped visibility for CLIENT_VIEWER / scoped PROJECT_ADMIN

```typescript
// apps/api/src/common/guards/zone-scope.guard.ts
@Injectable()
export class ZoneScopeGuard implements CanActivate {
  constructor(private zonesService: ZonesService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser; params: { id?: string } }>();
    const { user } = req;
    if (!user.scopeType || user.scopeType === ScopeType.ORG) return true; // unscoped — org-wide access

    const cameraId = req.params.id;
    if (!cameraId) return true; // list endpoints filter via buildScopeWhere() instead, see below
    const inScope = await this.zonesService.isCameraInScope(cameraId, user.scopeType, user.scopeId!);
    if (!inScope) {
      // 404, not 403 — never confirm a resource exists outside the caller's scope
      throw new NotFoundException('Camera not found');
    }
    return true;
  }
}
```

```typescript
// ✅ CORRECT — scope-aware WHERE clause for list endpoints, always combined with organizationId
function buildScopeWhere(actor: AuthUser): Prisma.CameraWhereInput {
  const base: Prisma.CameraWhereInput = { organizationId: actor.organizationId, deletedAt: null };
  switch (actor.scopeType) {
    case ScopeType.SITE:   return { ...base, zone: { siteId: actor.scopeId! } };
    case ScopeType.ZONE:   return { ...base, zoneId: actor.scopeId! };
    case ScopeType.CAMERA: return { ...base, id: actor.scopeId! };
    default:               return base; // ORG / null — every camera in the organization
  }
}
```

## Self-approval prevention (MANDATORY on every approval/acknowledgement endpoint)

```typescript
// ✅ CORRECT — check in the service, not the controller
async acknowledgeIncident(id: string, actor: AuthUser) {
  const incident = await this.getOne(id, actor);
  if (incident.reportedById === actor.id && actor.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('You cannot acknowledge an incident you reported yourself');
  }
  // proceed with acknowledgement
}
```

## Role-escalation guard (only SUPER_ADMIN can mint SUPER_ADMIN / reassign roles)

```typescript
function assertCanAssignRole(actor: AuthUser, targetRole: UserRole) {
  if (targetRole === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only SUPER_ADMIN can create or promote SUPER_ADMIN users');
  }
}
```

## Frontend RBAC (hide admin-only UI)

```typescript
import { hasPermission } from '@aniston-vms/shared';

// ✅ CORRECT — hide button if role/scope doesn't have permission. 3-arg form: role, resource, action.
{hasPermission(user.role, 'cameras', 'create') && (
  <Button onClick={openAddCameraModal}>Add Camera</Button>
)}

// PermissionGuard wraps whole sections (e.g. hide the credentials panel entirely from CLIENT_VIEWER)
<PermissionGuard resource="cameraCredentials" action="read">
  <CameraCredentialsPanel cameraId={camera.id} />
</PermissionGuard>
```

## Testing checklist for every new RBAC-guarded endpoint

1. `SUPER_ADMIN` — allowed on every path.
2. `PROJECT_ADMIN` (unscoped) — allowed within their organization, 404 across organizations.
3. `CLIENT_VIEWER` scoped to a `ZONE` — allowed for cameras/incidents inside the zone, 404 outside it,
   `403` on any write action, never receives decrypted credentials.
4. Role escalation — no role can create/assign a `SUPER_ADMIN` account except `SUPER_ADMIN`.
5. No endpoint returns `200`/`204` for a write with a missing `@RequirePermission` guard — CI's route-audit
   script flags any registered route without one.