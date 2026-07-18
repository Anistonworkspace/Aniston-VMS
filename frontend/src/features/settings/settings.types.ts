// Aniston VMS settings domain types.
// Hierarchy shapes mirror backend/src/modules/hierarchy/hierarchy.schemas.ts
// (request validation) and hierarchy.service.ts (response shapes — every
// list/detail response includes Prisma relation `select`s and `_count`s
// exactly as returned by the real API; every endpoint here is a REAL,
// implemented backend route — see settings.api.ts for the METHOD /path map).
import type { Role } from '@/features/auth/auth.types';

// Prisma stores `status` as a plain String column (not a native enum) but the
// app layer only ever writes/reads these two values (hierarchy.schemas.ts).
export type LifecycleStatus = 'ACTIVE' | 'INACTIVE';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface RegionRef {
  id: string;
  name: string;
}

export interface ZoneRef {
  id: string;
  name: string;
  regionId: string;
}

export interface SiteRef {
  id: string;
  name: string;
  zoneId: string;
}

export interface Region {
  id: string;
  name: string;
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
  _count: { zones: number };
}

export interface Zone {
  id: string;
  regionId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
  region: RegionRef;
  _count: { sites: number };
}

export interface Site {
  id: string;
  zoneId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  clientId: string | null;
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
  zone: ZoneRef;
  _count: { routers: number; cameras: number };
}

export interface Router {
  id: string;
  siteId: string;
  serialNumber: string;
  imei: string;
  simNumber: string;
  operator: string;
  publicStaticIp: string;
  managementPort: number;
  model: string;
  firmwareVersion: string;
  lastSeenAt: string | null;
  signalStrength: number | null;
  connectionStatus: string;
  dataApiAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  site: SiteRef;
  _count: { cameras: number };
}

// ── List queries — all fields optional client-side; backend zod schemas
// apply defaults (page=1, limit=20) when omitted. ─────────────────────────
export interface RegionListQuery {
  page?: number;
  limit?: number;
  q?: string;
}
export interface ZoneListQuery extends RegionListQuery {
  regionId?: string;
}
export interface SiteListQuery extends RegionListQuery {
  zoneId?: string;
  regionId?: string;
}
export interface RouterListQuery extends RegionListQuery {
  siteId?: string;
}

// ── Mutations — mirror createXSchema / updateXSchema exactly. ────────────
export interface CreateRegionInput {
  name: string;
  status?: LifecycleStatus;
}
export interface UpdateRegionInput {
  name?: string;
  status?: LifecycleStatus;
}

export interface CreateZoneInput {
  regionId: string;
  name: string;
  latitude?: number;
  longitude?: number;
  status?: LifecycleStatus;
}
export interface UpdateZoneInput {
  regionId?: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  status?: LifecycleStatus;
}

export interface CreateSiteInput {
  zoneId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  clientId?: string;
  status?: LifecycleStatus;
}
export interface UpdateSiteInput {
  zoneId?: string;
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  clientId?: string | null;
  status?: LifecycleStatus;
}

export interface CreateRouterInput {
  siteId: string;
  serialNumber: string;
  imei: string;
  simNumber: string;
  operator: string;
  publicStaticIp: string;
  managementPort: number;
  model: string;
  firmwareVersion: string;
  connectionStatus?: string;
  dataApiAvailable?: boolean;
}
export interface UpdateRouterInput {
  serialNumber?: string;
  imei?: string;
  simNumber?: string;
  operator?: string;
  publicStaticIp?: string;
  managementPort?: number;
  model?: string;
  firmwareVersion?: string;
  connectionStatus?: string;
  dataApiAvailable?: boolean;
}

// ── MFA — mirrors backend/src/modules/auth/auth.schemas.ts `mfaCodeSchema`
// and auth.service.ts `setupMfa()` return shape exactly. ──────────────────
export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
}
export interface MfaCodeInput {
  code: string;
}
export interface MfaStatusResult {
  mfaEnabled: boolean;
}

// PROJECT_ADMIN+ manage regions/zones/sites; routers can additionally be
// commissioned by ENGINEER (backend ROUTER_WRITE_ROLES). Region/Zone/Site
// deletion and Router deletion always require ADMIN_ROLES.
const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'PROJECT_ADMIN'];
const ROUTER_WRITE_ROLES: readonly Role[] = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'ENGINEER'];

export function canManageHierarchy(role: Role | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function canWriteRouters(role: Role | undefined | null): boolean {
  return !!role && ROUTER_WRITE_ROLES.includes(role);
}

export type HierarchyKind = 'region' | 'zone' | 'site' | 'router';
