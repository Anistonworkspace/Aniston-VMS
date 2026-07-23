import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Prisma mock ------------------------------------------------------------
// listZoneSummaries loads the scope-visible zones, then folds the caller's
// in-scope cameras onto them via site→zone. Only these two reads are touched.
const prismaMock = {
  zone: { findMany: vi.fn() },
  camera: { findMany: vi.fn() },
};
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// --- Scope mock -------------------------------------------------------------
// Scope math lives in lib/scope.test.ts; here we stub the predicates with
// sentinels so we can PROVE the zone list is loaded THROUGH zoneScopeWhere
// (i.e. zones outside the caller's scope are excluded at the query level).
const getUserScopeMock = vi.fn();
const zoneScopeWhereMock = vi.fn(() => ({ __zoneScope: true }));
const cameraScopeWhereMock = vi.fn(() => ({ __cameraScope: true }));
vi.mock('../../lib/scope.js', () => ({
  getUserScope: getUserScopeMock,
  zoneScopeWhere: zoneScopeWhereMock,
  cameraScopeWhere: cameraScopeWhereMock,
}));

const { listZoneSummaries } = await import('./dashboard.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  getUserScopeMock.mockResolvedValue({ userId: 'u-1', all: true });
  zoneScopeWhereMock.mockReturnValue({ __zoneScope: true });
  cameraScopeWhereMock.mockReturnValue({ __cameraScope: true });
});

describe('listZoneSummaries', () => {
  it('returns EVERY scope-visible zone, including zones that contain no cameras', async () => {
    prismaMock.zone.findMany.mockResolvedValue([
      { id: 'z-1', name: 'North Yard', region: { name: 'North' } },
      { id: 'z-2', name: 'South Dock', region: { name: 'South' } },
      { id: 'z-3', name: 'East Lot (empty)', region: { name: 'East' } },
    ]);
    // Cameras only exist in z-1 and z-2; z-3 has none.
    prismaMock.camera.findMany.mockResolvedValue([
      { status: 'HEALTHY', site: { zoneId: 'z-1' } },
      { status: 'CRITICAL', site: { zoneId: 'z-1' } },
      { status: 'WARNING', site: { zoneId: 'z-2' } },
    ]);

    const result = await listZoneSummaries('u-1');

    // The empty zone (z-3) is STILL present — this is the core dropdown bug:
    // the picker must list every zone, not only zones that own cameras.
    expect(result.map((z) => z.id)).toEqual(['z-1', 'z-2', 'z-3']);

    expect(result[2]).toMatchObject({
      id: 'z-3',
      name: 'East Lot (empty)',
      cameraCount: 0,
      criticalCount: 0,
      warningCount: 0,
      maintenanceCount: 0,
      state: 'healthy',
    });
  });

  it('loads zones through zoneScopeWhere so out-of-scope zones are excluded', async () => {
    prismaMock.zone.findMany.mockResolvedValue([]);
    prismaMock.camera.findMany.mockResolvedValue([]);

    await listZoneSummaries('u-1');

    expect(getUserScopeMock).toHaveBeenCalledWith('u-1');
    expect(prismaMock.zone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { __zoneScope: true },
        orderBy: { name: 'asc' },
      }),
    );
    // Camera rollup is likewise scope-filtered AND restricted to CONFIGURED cameras.
    expect(prismaMock.camera.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ __cameraScope: true }, { provisioningState: 'CONFIGURED' }] },
      }),
    );
  });

  it('rolls each in-scope camera onto its zone and derives the zone state', async () => {
    prismaMock.zone.findMany.mockResolvedValue([
      { id: 'z-1', name: 'North Yard', region: { name: 'North' } },
    ]);
    prismaMock.camera.findMany.mockResolvedValue([
      { status: 'HEALTHY', site: { zoneId: 'z-1' } },
      { status: 'WARNING', site: { zoneId: 'z-1' } },
      { status: 'MAINTENANCE', site: { zoneId: 'z-1' } },
      { status: 'CRITICAL', site: { zoneId: 'z-1' } },
    ]);

    const [zone] = await listZoneSummaries('u-1');

    expect(zone).toMatchObject({
      id: 'z-1',
      region: 'North',
      cameraCount: 4,
      criticalCount: 1,
      warningCount: 1,
      maintenanceCount: 1,
      state: 'critical', // any critical camera dominates the zone state
    });
  });
});
