import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal typed-loose Prisma stub — only the calls this service touches.
const prismaMock = {
  incident: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  incidentReadReceipt: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
  },
};
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// Scope is exercised by lib/scope.ts' own tests; here we stub it to sentinels so
// we can assert the service threads the caller's scope into every where-clause
// and keys every write to the authenticated userId.
const SCOPE = { userId: 'user-1', zoneIds: ['z1'] };
const ZONE_WHERE = { id: { in: ['z1'] } };
const getUserScopeMock = vi.fn(async () => SCOPE);
const zoneScopeWhereMock = vi.fn(() => ZONE_WHERE);
vi.mock('../../lib/scope.js', () => ({
  getUserScope: getUserScopeMock,
  zoneScopeWhere: zoneScopeWhereMock,
}));

const OPEN_STATUS_LIST = ['OPEN', 'INVESTIGATING', 'ACKNOWLEDGED'];
vi.mock('../incidents/incident.constants.js', () => ({ OPEN_STATUS_LIST }));

const listRecentIncidentSummariesMock = vi.fn();
vi.mock('../dashboard/dashboard.widgets.js', () => ({
  listRecentIncidentSummaries: listRecentIncidentSummariesMock,
}));

const service = await import('./notification-read.service.js');
const { NotFoundError } = await import('../../middleware/errorHandler.js');

const USER = 'user-1';

function mkSummary(over: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    code: 'ANI-CAM-2026-000145',
    cameraLabel: 'CAM-042',
    title: 'Camera offline',
    zoneName: 'North Lot',
    siteName: 'HQ',
    kind: 'CAMERA_OFFLINE',
    severity: 'CRITICAL',
    status: 'OPEN',
    occurredAt: '2026-01-01T00:00:00Z',
    assignees: [],
    notifiedOverflow: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserScopeMock.mockResolvedValue(SCOPE);
  zoneScopeWhereMock.mockReturnValue(ZONE_WHERE);
});

describe('getNotificationFeed', () => {
  it('returns [] and never queries receipts when there are no summaries', async () => {
    listRecentIncidentSummariesMock.mockResolvedValue([]);

    const feed = await service.getNotificationFeed(USER);

    expect(feed).toEqual([]);
    expect(prismaMock.incidentReadReceipt.findMany).not.toHaveBeenCalled();
  });

  it('tags each summary with this user’s read state, isRead absence = unread', async () => {
    listRecentIncidentSummariesMock.mockResolvedValue([
      mkSummary({ id: 'inc-1' }),
      mkSummary({ id: 'inc-2' }),
    ]);
    prismaMock.incidentReadReceipt.findMany.mockResolvedValue([
      { incidentId: 'inc-1', readAt: new Date('2026-01-02T00:00:00Z') },
    ]);

    const feed = await service.getNotificationFeed(USER);

    // Receipts fetched only for the returned summaries, keyed to this user.
    expect(prismaMock.incidentReadReceipt.findMany).toHaveBeenCalledWith({
      where: { userId: USER, incidentId: { in: ['inc-1', 'inc-2'] } },
      select: { incidentId: true, readAt: true },
    });
    expect(feed[0]).toMatchObject({ id: 'inc-1', isRead: true, readAt: '2026-01-02T00:00:00.000Z' });
    expect(feed[1]).toMatchObject({ id: 'inc-2', isRead: false, readAt: null });
  });
});

describe('getUnreadCount', () => {
  it('counts in-scope OPEN incidents the user has not read', async () => {
    prismaMock.incident.count.mockResolvedValue(7);

    const result = await service.getUnreadCount(USER);

    expect(result).toEqual({ count: 7 });
    expect(prismaMock.incident.count).toHaveBeenCalledWith({
      where: {
        zone: ZONE_WHERE,
        status: { in: OPEN_STATUS_LIST },
        readReceipts: { none: { userId: USER } },
      },
    });
  });
});

describe('markNotificationRead', () => {
  it('throws NotFoundError for an incident outside the caller’s scope (no write)', async () => {
    prismaMock.incident.findFirst.mockResolvedValue(null);

    await expect(service.markNotificationRead(USER, 'inc-x')).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.incidentReadReceipt.upsert).not.toHaveBeenCalled();
  });

  it('creates a receipt keyed to (userId, incidentId) and reports marked=1', async () => {
    prismaMock.incident.findFirst.mockResolvedValue({ id: 'inc-1' });
    const now = new Date('2026-01-03T00:00:00Z');
    // Brand-new receipt: createdAt === readAt.
    prismaMock.incidentReadReceipt.upsert.mockResolvedValue({ createdAt: now, readAt: now });
    prismaMock.incident.count.mockResolvedValue(2);

    const result = await service.markNotificationRead(USER, 'inc-1');

    expect(prismaMock.incidentReadReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_incidentId: { userId: USER, incidentId: 'inc-1' } },
        create: { userId: USER, incidentId: 'inc-1' },
        update: {},
      })
    );
    expect(result).toEqual({ unreadCount: 2, marked: 1 });
  });

  it('is idempotent — an existing receipt reports marked=0 and keeps its readAt', async () => {
    prismaMock.incident.findFirst.mockResolvedValue({ id: 'inc-1' });
    // Existing receipt: createdAt !== readAt (readAt preserved from first mark).
    prismaMock.incidentReadReceipt.upsert.mockResolvedValue({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      readAt: new Date('2026-01-01T00:05:00Z'),
    });
    prismaMock.incident.count.mockResolvedValue(3);

    const result = await service.markNotificationRead(USER, 'inc-1');

    expect(result).toEqual({ unreadCount: 3, marked: 0 });
  });
});

describe('markAllNotificationsRead', () => {
  it('no-ops (no createMany) when nothing is unread', async () => {
    prismaMock.incident.findMany.mockResolvedValue([]);

    const result = await service.markAllNotificationsRead(USER);

    expect(prismaMock.incidentReadReceipt.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ unreadCount: 0, marked: 0 });
  });

  it('bulk-creates dup-proof receipts for every in-scope unread incident', async () => {
    prismaMock.incident.findMany.mockResolvedValue([{ id: 'inc-1' }, { id: 'inc-2' }]);
    prismaMock.incidentReadReceipt.createMany.mockResolvedValue({ count: 2 });

    const result = await service.markAllNotificationsRead(USER);

    expect(prismaMock.incident.findMany).toHaveBeenCalledWith({
      where: {
        zone: ZONE_WHERE,
        status: { in: OPEN_STATUS_LIST },
        readReceipts: { none: { userId: USER } },
      },
      select: { id: true },
    });
    expect(prismaMock.incidentReadReceipt.createMany).toHaveBeenCalledWith({
      data: [
        { userId: USER, incidentId: 'inc-1' },
        { userId: USER, incidentId: 'inc-2' },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ unreadCount: 0, marked: 2 });
  });
});
