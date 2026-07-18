import { z } from 'zod';
import { PaginationSchema } from '@aniston-vms/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Request validation for the hierarchy API (Region → Zone → Site → Router).
// See hierarchy.router.ts for the route table.
// ─────────────────────────────────────────────────────────────────────────────

// Prisma models store `status` as a plain String column (not a native enum),
// but the app layer only ever writes/reads these two values.
const lifecycleStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);

export const regionIdParamsSchema = z.object({
  id: z.string().uuid('Region id must be a UUID'),
});

export const zoneIdParamsSchema = z.object({
  id: z.string().uuid('Zone id must be a UUID'),
});

export const siteIdParamsSchema = z.object({
  id: z.string().uuid('Site id must be a UUID'),
});

export const routerIdParamsSchema = z.object({
  id: z.string().uuid('Router id must be a UUID'),
});

// ── Regions ──────────────────────────────────────────────────────────────────

export const regionListQuerySchema = PaginationSchema.extend({
  q: z.string().max(200).trim().optional(),
});

export const createRegionSchema = z.object({
  name: z.string().min(1).max(100),
  status: lifecycleStatusEnum.default('ACTIVE'),
});

export const updateRegionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: lifecycleStatusEnum.optional(),
});

// ── Zones ────────────────────────────────────────────────────────────────────

export const zoneListQuerySchema = PaginationSchema.extend({
  regionId: z.string().uuid().optional(),
  q: z.string().max(200).trim().optional(),
});

export const createZoneSchema = z.object({
  regionId: z.string().uuid(),
  name: z.string().min(1).max(100),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  status: lifecycleStatusEnum.default('ACTIVE'),
});

export const updateZoneSchema = z.object({
  regionId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  status: lifecycleStatusEnum.optional(),
});

// ── Sites ────────────────────────────────────────────────────────────────────

export const siteListQuerySchema = PaginationSchema.extend({
  zoneId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  q: z.string().max(200).trim().optional(),
});

export const createSiteSchema = z.object({
  zoneId: z.string().uuid(),
  name: z.string().min(1).max(150),
  address: z.string().min(1).max(500),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  clientId: z.string().max(100).optional(),
  status: lifecycleStatusEnum.default('ACTIVE'),
});

export const updateSiteSchema = z.object({
  zoneId: z.string().uuid().optional(),
  name: z.string().min(1).max(150).optional(),
  address: z.string().min(1).max(500).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  clientId: z.string().max(100).nullable().optional(),
  status: lifecycleStatusEnum.optional(),
});

// ── Routers (site network gateway devices) ──────────────────────────────────

export const routerListQuerySchema = PaginationSchema.extend({
  siteId: z.string().uuid().optional(),
  q: z.string().max(200).trim().optional(),
});

export const createRouterSchema = z.object({
  siteId: z.string().uuid(),
  serialNumber: z.string().min(1).max(100),
  imei: z.string().min(1).max(50),
  simNumber: z.string().min(1).max(50),
  operator: z.string().min(1).max(100),
  publicStaticIp: z.string().min(1).max(45),
  managementPort: z.coerce.number().int().min(1).max(65535),
  model: z.string().min(1).max(100),
  firmwareVersion: z.string().min(1).max(100),
  connectionStatus: z.string().min(1).max(50).default('UNKNOWN'),
  dataApiAvailable: z.boolean().default(false),
});

export const updateRouterSchema = z.object({
  siteId: z.string().uuid().optional(),
  serialNumber: z.string().min(1).max(100).optional(),
  imei: z.string().min(1).max(50).optional(),
  simNumber: z.string().min(1).max(50).optional(),
  operator: z.string().min(1).max(100).optional(),
  publicStaticIp: z.string().min(1).max(45).optional(),
  managementPort: z.coerce.number().int().min(1).max(65535).optional(),
  model: z.string().min(1).max(100).optional(),
  firmwareVersion: z.string().min(1).max(100).optional(),
  connectionStatus: z.string().min(1).max(50).optional(),
  dataApiAvailable: z.boolean().optional(),
});

export type RegionListQuery = z.infer<typeof regionListQuerySchema>;
export type CreateRegionInput = z.infer<typeof createRegionSchema>;
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;

export type ZoneListQuery = z.infer<typeof zoneListQuerySchema>;
export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;

export type SiteListQuery = z.infer<typeof siteListQuerySchema>;
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

export type RouterListQuery = z.infer<typeof routerListQuerySchema>;
export type CreateRouterInput = z.infer<typeof createRouterSchema>;
export type UpdateRouterInput = z.infer<typeof updateRouterSchema>;
