import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errorHandler.js';
import type { ResolvedScope } from '../../lib/scope.js';
import {
  canAccessSite,
  getUserScope,
  regionScopeWhere,
  siteScopeWhere,
  zoneScopeWhere,
} from '../../lib/scope.js';
import type { AuthUser } from '../../middleware/auth.js';
import type {
  CreateRegionInput,
  CreateRouterInput,
  CreateSiteInput,
  CreateZoneInput,
  RegionListQuery,
  RouterListQuery,
  SiteListQuery,
  UpdateRegionInput,
  UpdateRouterInput,
  UpdateSiteInput,
  UpdateZoneInput,
  ZoneListQuery,
} from './hierarchy.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Region → Zone → Site → Router hierarchy. Every read is filtered through the
// caller's user_access_scopes (lib/scope.ts). Two scope-check conventions are
// in play, matching existing canon:
//   - Where lib/scope.ts exposes a canAccessX() helper (Site) we use it and
//     surface a ForbiddenError on scope failure (mirrors health.service.ts).
//   - Where no such helper exists (Region, Zone, Router) we filter with the
//     matching *ScopeWhere() and surface NotFoundError (mirrors
//     modules/admin/escalation.service.ts's assertZoneInScope), which avoids
//     leaking existence of out-of-scope nodes that have no dedicated helper.
// ─────────────────────────────────────────────────────────────────────────────

function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}

// ── Regions ──────────────────────────────────────────────────────────────────

export async function listRegions(actor: AuthUser, filters: RegionListQuery) {
  const scope = await getUserScope(actor.id);
  const { page, limit, q } = filters;
  const where: Prisma.RegionWhereInput = {
    AND: [regionScopeWhere(scope), q ? { name: { contains: q, mode: 'insensitive' } } : {}],
  };
  const [items, total] = await Promise.all([
    prisma.region.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { zones: true } } },
      ...paginate(page, limit),
    }),
    prisma.region.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function findRegionOrThrow(id: string, actor: AuthUser) {
  const scope = await getUserScope(actor.id);
  const region = await prisma.region.findFirst({
    where: { AND: [{ id }, regionScopeWhere(scope)] },
    include: { _count: { select: { zones: true } } },
  });
  if (!region) throw new NotFoundError('Region not found');
  return region;
}

export async function getRegionById(id: string, actor: AuthUser) {
  return findRegionOrThrow(id, actor);
}

export async function createRegion(input: CreateRegionInput, actor: AuthUser, req: Request) {
  const region = await prisma.region.create({ data: { name: input.name, status: input.status } });
  await audit(req, {
    userId: actor.id,
    action: 'region.create',
    entityType: 'Region',
    entityId: region.id,
    newValue: region as unknown as Prisma.InputJsonValue,
  });
  return region;
}

export async function updateRegion(
  id: string,
  input: UpdateRegionInput,
  actor: AuthUser,
  req: Request
) {
  const before = await findRegionOrThrow(id, actor);

  const data: Prisma.RegionUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.region.update({ where: { id }, data });
  await audit(req, {
    userId: actor.id,
    action: 'region.update',
    entityType: 'Region',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });
  return updated;
}

export async function deleteRegion(id: string, actor: AuthUser, req: Request): Promise<void> {
  const before = await findRegionOrThrow(id, actor);

  const zoneCount = await prisma.zone.count({ where: { regionId: id } });
  if (zoneCount > 0) throw new ConflictError('Cannot delete a region that still has zones');

  await prisma.region.delete({ where: { id } });
  await audit(req, {
    userId: actor.id,
    action: 'region.delete',
    entityType: 'Region',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}

// ── Zones ────────────────────────────────────────────────────────────────────

async function assertRegionInScope(regionId: string, actor: AuthUser): Promise<void> {
  const scope = await getUserScope(actor.id);
  const region = await prisma.region.findFirst({
    where: { AND: [{ id: regionId }, regionScopeWhere(scope)] },
    select: { id: true },
  });
  if (!region) throw new NotFoundError('Region not found');
}

export async function listZones(actor: AuthUser, filters: ZoneListQuery) {
  const scope = await getUserScope(actor.id);
  const { page, limit, regionId, q } = filters;
  const where: Prisma.ZoneWhereInput = {
    AND: [
      zoneScopeWhere(scope),
      regionId ? { regionId } : {},
      q ? { name: { contains: q, mode: 'insensitive' } } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.zone.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { sites: true } },
      },
      ...paginate(page, limit),
    }),
    prisma.zone.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function findZoneOrThrow(id: string, actor: AuthUser) {
  const scope = await getUserScope(actor.id);
  const zone = await prisma.zone.findFirst({
    where: { AND: [{ id }, zoneScopeWhere(scope)] },
    include: { region: { select: { id: true, name: true } }, _count: { select: { sites: true } } },
  });
  if (!zone) throw new NotFoundError('Zone not found');
  return zone;
}

export async function getZoneById(id: string, actor: AuthUser) {
  return findZoneOrThrow(id, actor);
}

export async function createZone(input: CreateZoneInput, actor: AuthUser, req: Request) {
  await assertRegionInScope(input.regionId, actor);

  const zone = await prisma.zone.create({
    data: {
      regionId: input.regionId,
      name: input.name,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      status: input.status,
    },
  });
  await audit(req, {
    userId: actor.id,
    action: 'zone.create',
    entityType: 'Zone',
    entityId: zone.id,
    newValue: zone as unknown as Prisma.InputJsonValue,
  });
  return zone;
}

export async function updateZone(
  id: string,
  input: UpdateZoneInput,
  actor: AuthUser,
  req: Request
) {
  const before = await findZoneOrThrow(id, actor);
  if (input.regionId !== undefined) await assertRegionInScope(input.regionId, actor);

  const data: Prisma.ZoneUpdateInput = {};
  if (input.regionId !== undefined) data.region = { connect: { id: input.regionId } };
  if (input.name !== undefined) data.name = input.name;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.zone.update({ where: { id }, data });
  await audit(req, {
    userId: actor.id,
    action: 'zone.update',
    entityType: 'Zone',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });
  return updated;
}

export async function deleteZone(id: string, actor: AuthUser, req: Request): Promise<void> {
  const before = await findZoneOrThrow(id, actor);

  const siteCount = await prisma.site.count({ where: { zoneId: id } });
  if (siteCount > 0) throw new ConflictError('Cannot delete a zone that still has sites');

  await prisma.zone.delete({ where: { id } });
  await audit(req, {
    userId: actor.id,
    action: 'zone.delete',
    entityType: 'Zone',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}

// ── Sites ────────────────────────────────────────────────────────────────────

async function assertZoneInScope(zoneId: string, actor: AuthUser): Promise<void> {
  const scope = await getUserScope(actor.id);
  const zone = await prisma.zone.findFirst({
    where: { AND: [{ id: zoneId }, zoneScopeWhere(scope)] },
    select: { id: true },
  });
  if (!zone) throw new NotFoundError('Zone not found');
}

export async function listSites(actor: AuthUser, filters: SiteListQuery) {
  const scope = await getUserScope(actor.id);
  const { page, limit, zoneId, regionId, q } = filters;
  const where: Prisma.SiteWhereInput = {
    AND: [
      siteScopeWhere(scope),
      zoneId ? { zoneId } : {},
      regionId ? { zone: { regionId } } : {},
      q ? { name: { contains: q, mode: 'insensitive' } } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.site.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        zone: { select: { id: true, name: true, regionId: true } },
        _count: { select: { routers: true, cameras: true } },
      },
      ...paginate(page, limit),
    }),
    prisma.site.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function findSiteOrThrow(id: string, actor: AuthUser) {
  const scope = await getUserScope(actor.id);
  if (!(await canAccessSite(scope, id))) throw new ForbiddenError('Site outside your access scope');

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      zone: { select: { id: true, name: true, regionId: true } },
      _count: { select: { routers: true, cameras: true } },
    },
  });
  if (!site) throw new NotFoundError('Site not found');
  return site;
}

export async function getSiteById(id: string, actor: AuthUser) {
  return findSiteOrThrow(id, actor);
}

export async function createSite(input: CreateSiteInput, actor: AuthUser, req: Request) {
  await assertZoneInScope(input.zoneId, actor);

  const site = await prisma.site.create({
    data: {
      zoneId: input.zoneId,
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      clientId: input.clientId ?? null,
      status: input.status,
    },
  });
  await audit(req, {
    userId: actor.id,
    action: 'site.create',
    entityType: 'Site',
    entityId: site.id,
    newValue: site as unknown as Prisma.InputJsonValue,
  });
  return site;
}

export async function updateSite(
  id: string,
  input: UpdateSiteInput,
  actor: AuthUser,
  req: Request
) {
  const before = await findSiteOrThrow(id, actor);
  if (input.zoneId !== undefined) await assertZoneInScope(input.zoneId, actor);

  const data: Prisma.SiteUpdateInput = {};
  if (input.zoneId !== undefined) data.zone = { connect: { id: input.zoneId } };
  if (input.name !== undefined) data.name = input.name;
  if (input.address !== undefined) data.address = input.address;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.clientId !== undefined) data.clientId = input.clientId;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.site.update({ where: { id }, data });
  await audit(req, {
    userId: actor.id,
    action: 'site.update',
    entityType: 'Site',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });
  return updated;
}

export async function deleteSite(id: string, actor: AuthUser, req: Request): Promise<void> {
  const before = await findSiteOrThrow(id, actor);

  const [routerCount, cameraCount] = await Promise.all([
    prisma.router.count({ where: { siteId: id } }),
    prisma.camera.count({ where: { siteId: id } }),
  ]);
  if (routerCount > 0 || cameraCount > 0) {
    throw new ConflictError('Cannot delete a site that still has routers or cameras');
  }

  await prisma.site.delete({ where: { id } });
  await audit(req, {
    userId: actor.id,
    action: 'site.delete',
    entityType: 'Site',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}

// ── Routers ──────────────────────────────────────────────────────────────────
// No canAccessRouter() helper exists in lib/scope.ts, so — like Region/Zone —
// visibility is derived from the parent Site's scope and a miss is reported
// as NotFoundError rather than ForbiddenError.

function routerScopeWhere(scope: ResolvedScope): Prisma.RouterWhereInput {
  return { site: siteScopeWhere(scope) };
}

export async function listRouters(actor: AuthUser, filters: RouterListQuery) {
  const scope = await getUserScope(actor.id);
  const { page, limit, siteId, q } = filters;
  const where: Prisma.RouterWhereInput = {
    AND: [
      routerScopeWhere(scope),
      siteId ? { siteId } : {},
      q ? { serialNumber: { contains: q, mode: 'insensitive' } } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.router.findMany({
      where,
      orderBy: { serialNumber: 'asc' },
      include: {
        site: { select: { id: true, name: true, zoneId: true } },
        _count: { select: { cameras: true } },
      },
      ...paginate(page, limit),
    }),
    prisma.router.count({ where }),
  ]);
  return { items, total, page, limit };
}

async function findRouterOrThrow(id: string, actor: AuthUser) {
  const scope = await getUserScope(actor.id);
  const router = await prisma.router.findFirst({
    where: { AND: [{ id }, routerScopeWhere(scope)] },
    include: {
      site: { select: { id: true, name: true, zoneId: true } },
      _count: { select: { cameras: true } },
    },
  });
  if (!router) throw new NotFoundError('Router not found');
  return router;
}

export async function getRouterById(id: string, actor: AuthUser) {
  return findRouterOrThrow(id, actor);
}

export async function createRouter(input: CreateRouterInput, actor: AuthUser, req: Request) {
  const scope = await getUserScope(actor.id);
  if (!(await canAccessSite(scope, input.siteId)))
    throw new ForbiddenError('Site outside your access scope');

  const router = await prisma.router.create({
    data: {
      siteId: input.siteId,
      serialNumber: input.serialNumber,
      imei: input.imei,
      simNumber: input.simNumber,
      operator: input.operator,
      publicStaticIp: input.publicStaticIp,
      managementPort: input.managementPort,
      model: input.model,
      firmwareVersion: input.firmwareVersion,
      connectionStatus: input.connectionStatus,
      dataApiAvailable: input.dataApiAvailable,
    },
  });
  await audit(req, {
    userId: actor.id,
    action: 'router.create',
    entityType: 'Router',
    entityId: router.id,
    newValue: router as unknown as Prisma.InputJsonValue,
  });
  return router;
}

export async function updateRouter(
  id: string,
  input: UpdateRouterInput,
  actor: AuthUser,
  req: Request
) {
  const before = await findRouterOrThrow(id, actor);
  if (input.siteId !== undefined) {
    const scope = await getUserScope(actor.id);
    if (!(await canAccessSite(scope, input.siteId)))
      throw new ForbiddenError('Site outside your access scope');
  }

  const data: Prisma.RouterUpdateInput = {};
  if (input.siteId !== undefined) data.site = { connect: { id: input.siteId } };
  if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber;
  if (input.imei !== undefined) data.imei = input.imei;
  if (input.simNumber !== undefined) data.simNumber = input.simNumber;
  if (input.operator !== undefined) data.operator = input.operator;
  if (input.publicStaticIp !== undefined) data.publicStaticIp = input.publicStaticIp;
  if (input.managementPort !== undefined) data.managementPort = input.managementPort;
  if (input.model !== undefined) data.model = input.model;
  if (input.firmwareVersion !== undefined) data.firmwareVersion = input.firmwareVersion;
  if (input.connectionStatus !== undefined) data.connectionStatus = input.connectionStatus;
  if (input.dataApiAvailable !== undefined) data.dataApiAvailable = input.dataApiAvailable;

  const updated = await prisma.router.update({ where: { id }, data });
  await audit(req, {
    userId: actor.id,
    action: 'router.update',
    entityType: 'Router',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });
  return updated;
}

export async function deleteRouter(id: string, actor: AuthUser, req: Request): Promise<void> {
  const before = await findRouterOrThrow(id, actor);

  const cameraCount = await prisma.camera.count({ where: { routerId: id } });
  if (cameraCount > 0)
    throw new ConflictError('Cannot delete a router that still has cameras attached');

  await prisma.router.delete({ where: { id } });
  await audit(req, {
    userId: actor.id,
    action: 'router.delete',
    entityType: 'Router',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}
