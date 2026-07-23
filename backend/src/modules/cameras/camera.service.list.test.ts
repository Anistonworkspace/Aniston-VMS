import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Prisma mock ------------------------------------------------------------
// listCameras is a pure query builder over the scope predicate + filters; we
// only need findMany/count to capture the `where` it hands Prisma.
const prismaMock = {
  camera: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
};
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// --- Scope mock -------------------------------------------------------------
// Scope math is exercised by lib/scope.test.ts. Here we stub it with an opaque
// sentinel so the tests can PROVE the zone filter is ANDed WITH the scope
// predicate — never substituted for it (which would widen RBAC and leak
// cameras from zones the caller cannot see).
const getUserScopeMock = vi.fn();
const cameraScopeWhereMock = vi.fn(() => ({ __cameraScope: true }));
vi.mock('../../lib/scope.js', () => ({
  getUserScope: getUserScopeMock,
  cameraScopeWhere: cameraScopeWhereMock,
  canAccessCamera: vi.fn(),
  canAccessSite: vi.fn(),
}));

const { listCameras } = await import('./camera.service.js');

const actor = { id: 'user-1', role: 'PROJECT_ADMIN' as const, email: 'admin@example.com' };

// Typed filter helper so callers only spell out the fields under test.
type Filters = Parameters<typeof listCameras>[1];
const filters = (over: Partial<Filters>): Filters => ({ page: 1, limit: 24, ...over }) as Filters;

beforeEach(() => {
  vi.clearAllMocks();
  getUserScopeMock.mockResolvedValue({ userId: 'user-1', all: true });
  cameraScopeWhereMock.mockReturnValue({ __cameraScope: true });
  prismaMock.camera.findMany.mockResolvedValue([]);
  prismaMock.camera.count.mockResolvedValue(0);
});

describe('listCameras — zone filter', () => {
  it('ANDs the selected zone with the caller scope so it can only narrow the fleet', async () => {
    await listCameras(actor, filters({ zoneId: 'zone-1' }));

    const where = prismaMock.camera.findMany.mock.calls[0]![0]!.where as { AND: unknown[] };
    // The scope predicate is ALWAYS present…
    expect(where.AND).toContainEqual({ __cameraScope: true });
    // …and the zone rides the site→zone relation, ANDed alongside it (not instead).
    expect(where.AND).toContainEqual({ site: { zoneId: 'zone-1' } });

    // Scope is loaded for the acting user and fed into the predicate builder.
    expect(getUserScopeMock).toHaveBeenCalledWith('user-1');
    expect(cameraScopeWhereMock).toHaveBeenCalledWith({ userId: 'user-1', all: true });
  });

  it('reuses the identical scope-aware where for count() so the total stays correct', async () => {
    await listCameras(actor, filters({ zoneId: 'zone-1' }));

    const listWhere = prismaMock.camera.findMany.mock.calls[0]![0]!.where;
    const countWhere = prismaMock.camera.count.mock.calls[0]![0]!.where;
    // Same object reference → pagination total can never drift from the page.
    expect(countWhere).toBe(listWhere);
  });

  it('adds no site/zone constraint when no zone is selected, but keeps the scope', async () => {
    await listCameras(actor, filters({}));

    const where = prismaMock.camera.findMany.mock.calls[0]![0]!.where as {
      AND: Array<Record<string, unknown>>;
    };
    expect(where.AND).toContainEqual({ __cameraScope: true });
    // No `{ site: { … } }` clause is appended when zoneId is absent.
    expect(where.AND.some((clause) => 'site' in clause)).toBe(false);
  });
});
