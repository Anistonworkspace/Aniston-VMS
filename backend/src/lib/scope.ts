import type { Prisma, UserAccessScope } from '@prisma/client';
import { prisma } from './prisma.js';

// Zone-scoped access (docs/06-implementation-plan.md Stage 1): every query that
// touches the Region → Zone → Site → Camera hierarchy must be filtered through
// the caller's user_access_scopes. Use these helpers in all feature modules.

export interface ResolvedScope {
  all: boolean;
  regionIds: string[];
  zoneIds: string[];
  siteIds: string[];
}

export function resolveScopes(scopes: UserAccessScope[]): ResolvedScope {
  const resolved: ResolvedScope = { all: false, regionIds: [], zoneIds: [], siteIds: [] };
  for (const s of scopes) {
    if (s.scopeType === 'ALL') resolved.all = true;
    else if (s.scopeType === 'REGION' && s.scopeId) resolved.regionIds.push(s.scopeId);
    else if (s.scopeType === 'ZONE' && s.scopeId) resolved.zoneIds.push(s.scopeId);
    else if (s.scopeType === 'SITE' && s.scopeId) resolved.siteIds.push(s.scopeId);
  }
  return resolved;
}

export async function getUserScope(userId: string): Promise<ResolvedScope> {
  const scopes = await prisma.userAccessScope.findMany({ where: { userId } });
  return resolveScopes(scopes);
}

// NOTE: empty `in: []` clauses match nothing, which is the correct fail-closed
// behavior for a user with no scopes.

export function regionScopeWhere(scope: ResolvedScope): Prisma.RegionWhereInput {
  if (scope.all) return {};
  return {
    OR: [
      { id: { in: scope.regionIds } },
      { zones: { some: { id: { in: scope.zoneIds } } } },
      { zones: { some: { sites: { some: { id: { in: scope.siteIds } } } } } },
    ],
  };
}

export function zoneScopeWhere(scope: ResolvedScope): Prisma.ZoneWhereInput {
  if (scope.all) return {};
  return {
    OR: [
      { id: { in: scope.zoneIds } },
      { regionId: { in: scope.regionIds } },
      { sites: { some: { id: { in: scope.siteIds } } } },
    ],
  };
}

export function siteScopeWhere(scope: ResolvedScope): Prisma.SiteWhereInput {
  if (scope.all) return {};
  return {
    OR: [
      { id: { in: scope.siteIds } },
      { zoneId: { in: scope.zoneIds } },
      { zone: { regionId: { in: scope.regionIds } } },
    ],
  };
}

export function cameraScopeWhere(scope: ResolvedScope): Prisma.CameraWhereInput {
  if (scope.all) return {};
  return { site: siteScopeWhere(scope) };
}

/** True when the given site is visible under the resolved scope. */
export async function canAccessSite(scope: ResolvedScope, siteId: string): Promise<boolean> {
  if (scope.all) return true;
  const site = await prisma.site.findFirst({
    where: { AND: [{ id: siteId }, siteScopeWhere(scope)] },
    select: { id: true },
  });
  return site !== null;
}

/**
 * True when the given camera is visible under the resolved scope.
 *
 * `cameraId` may be null for records whose camera was hard-deleted (history is
 * retained via ON DELETE SET NULL). Such orphaned history has no site to scope
 * against, so it is only visible to org-wide (ALL) scopes — handled first — and
 * fails closed for every zone/site-scoped caller.
 */
export async function canAccessCamera(
  scope: ResolvedScope,
  cameraId: string | null
): Promise<boolean> {
  if (scope.all) return true;
  if (cameraId === null) return false;
  const camera = await prisma.camera.findFirst({
    where: { AND: [{ id: cameraId }, cameraScopeWhere(scope)] },
    select: { id: true },
  });
  return camera !== null;
}
