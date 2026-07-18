import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal Prisma stub — only the calls the paths under test actually touch.
const prismaMock = {
  region: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  zone: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  site: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  userAccessScope: {
    findMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const { listZones, listSites, deleteRegion } = await import('./hierarchy.service.js');
const { ConflictError } = await import('../../middleware/errorHandler.js');

const actor = { id: 'user-1', role: 'PROJECT_ADMIN' as const, email: 'admin@example.com' };
const reqStub = {} as Request;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.zone.findMany.mockResolvedValue([]);
  prismaMock.zone.count.mockResolvedValue(0);
  prismaMock.site.findMany.mockResolvedValue([]);
  prismaMock.site.count.mockResolvedValue(0);
});

describe('scope filtering (non-ALL caller)', () => {
  // A caller whose only user_access_scopes row is scoped to a single region.
  const regionScoped = [{ scopeType: 'REGION', scopeId: 'region-1' }];

  it('filters listZones through the caller’s REGION scope', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue(regionScoped);

    await listZones(actor, { page: 1, limit: 20 });

    expect(prismaMock.zone.findMany).toHaveBeenCalledTimes(1);
    const where = prismaMock.zone.findMany.mock.calls[0][0].where;
    // A caller scoped to a single region must never see zones outside it —
    // the resolved regionId has to appear somewhere in the generated where.
    expect(JSON.stringify(where)).toContain('region-1');
  });

  it('filters listSites through the caller’s REGION scope', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue(regionScoped);

    await listSites(actor, { page: 1, limit: 20 });

    expect(prismaMock.site.findMany).toHaveBeenCalledTimes(1);
    const where = prismaMock.site.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('region-1');
  });
});

describe('deleteRegion', () => {
  it('throws ConflictError instead of deleting a region that still has zones', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue([{ scopeType: 'ALL', scopeId: null }]);
    prismaMock.region.findFirst.mockResolvedValue({
      id: 'region-1',
      name: 'North',
      status: 'ACTIVE',
    });
    prismaMock.zone.count.mockResolvedValue(3);

    await expect(deleteRegion('region-1', actor, reqStub)).rejects.toThrow(ConflictError);
    expect(prismaMock.region.delete).not.toHaveBeenCalled();
  });
});
