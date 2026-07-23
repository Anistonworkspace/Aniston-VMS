import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_STATUS_LIST } from '../incidents/incident.constants.js';
import { DIAGNOSIS_TEXT } from '../health/health.diagnosis.js';

// Minimal typed-loose Prisma stub — only the calls the widgets touch.
const prismaMock = {
  camera: { groupBy: vi.fn() },
  zone: { count: vi.fn() },
  incident: { findMany: vi.fn() },
  snapshot: { findFirst: vi.fn() },
};
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// Scope is exercised by lib/scope.test.ts; here we stub it so the widgets are
// tested in isolation. The where-clauses are opaque objects the widgets forward.
const getUserScopeMock = vi.fn();
const cameraScopeWhereMock = vi.fn(() => ({ __cameraScope: true }));
const zoneScopeWhereMock = vi.fn(() => ({ __zoneScope: true }));
vi.mock('../../lib/scope.js', () => ({
  getUserScope: getUserScopeMock,
  cameraScopeWhere: cameraScopeWhereMock,
  zoneScopeWhere: zoneScopeWhereMock,
}));

const signFileUrlMock = vi.fn(() => '/api/snapshots/snap-1/file?variant=thumb&exp=1&sig=abc');
vi.mock('../snapshots/snapshot.service.js', () => ({ signFileUrl: signFileUrlMock }));

const { getHealthSummary, listRecentIncidentSummaries, getLatestEvidence } = await import(
  './dashboard.widgets.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  getUserScopeMock.mockResolvedValue({ userId: 'u-1', all: true });
  cameraScopeWhereMock.mockReturnValue({ __cameraScope: true });
  zoneScopeWhereMock.mockReturnValue({ __zoneScope: true });
});

describe('getHealthSummary', () => {
  it('folds camera groupBy rows into donut totals with a HEALTHY-share uptime', async () => {
    prismaMock.camera.groupBy.mockResolvedValue([
      { status: 'HEALTHY', _count: { _all: 116 } },
      { status: 'WARNING', _count: { _all: 5 } },
      { status: 'CRITICAL', _count: { _all: 3 } },
      { status: 'MAINTENANCE', _count: { _all: 1 } },
    ]);
    prismaMock.zone.count.mockResolvedValue(13);

    const result = await getHealthSummary('u-1');

    expect(result).toEqual({
      totalCameras: 125,
      zoneCount: 13,
      healthy: 116,
      warning: 5,
      critical: 3,
      maintenance: 1,
      unknown: 0,
      uptimePercent: 92.8, // 116/125 → 92.8
    });
    // Both reads are scope-filtered.
    expect(getUserScopeMock).toHaveBeenCalledWith('u-1');
    expect(prismaMock.camera.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { __cameraScope: true } }),
    );
    expect(prismaMock.zone.count).toHaveBeenCalledWith({ where: { __zoneScope: true } });
  });

  it('reports 100% uptime and zero totals when the scope has no cameras', async () => {
    prismaMock.camera.groupBy.mockResolvedValue([]);
    prismaMock.zone.count.mockResolvedValue(0);

    const result = await getHealthSummary('u-1');

    expect(result.totalCameras).toBe(0);
    expect(result.uptimePercent).toBe(100);
    expect(result).toMatchObject({ healthy: 0, warning: 0, critical: 0, maintenance: 0, unknown: 0 });
  });
});

describe('listRecentIncidentSummaries', () => {
  it('maps a camera incident onto the frontend badge vocabulary', async () => {
    prismaMock.incident.findMany.mockResolvedValue([
      {
        id: 'inc-1',
        incidentNumber: 'ANI-CAM-2026-000145',
        type: 'STREAM_DEGRADED',
        severity: 'CRITICAL',
        status: 'ALERTED',
        firstDetectedAt: new Date('2026-01-01T00:00:00.000Z'),
        camera: { cameraCode: 'CAM-042' },
        site: { name: 'Rohini Zone 4' },
        zone: { name: 'Rohini' },
        assignedTo: { name: 'Vikram Joshi' },
        _count: { notifications: 4 },
      },
    ]);

    const [dto] = await listRecentIncidentSummaries('u-1');

    expect(dto).toEqual({
      id: 'inc-1',
      code: 'ANI-CAM-2026-000145',
      cameraLabel: 'CAM-042',
      title: DIAGNOSIS_TEXT.STREAM_DEGRADED,
      zoneName: 'Rohini',
      siteName: 'Rohini Zone 4',
      kind: 'STREAM',
      severity: 'CRITICAL',
      status: 'OPEN', // ALERTED → OPEN
      occurredAt: '2026-01-01T00:00:00.000Z',
      assignees: ['Vikram Joshi'],
      notifiedOverflow: 4,
    });
    // Scope-filtered + limited to the open-status set.
    expect(prismaMock.incident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { zone: { __zoneScope: true }, status: { in: OPEN_STATUS_LIST } },
        take: 5,
      }),
    );
  });

  it('handles a site-level incident with no camera or assignee', async () => {
    prismaMock.incident.findMany.mockResolvedValue([
      {
        id: 'inc-2',
        incidentNumber: 'ANI-SITE-2026-000143',
        type: 'SITE_INTERNET_DOWN',
        severity: 'INFO',
        status: 'ACKNOWLEDGED',
        firstDetectedAt: new Date('2026-01-02T00:00:00.000Z'),
        camera: null,
        site: { name: 'Rohini Gate 2' },
        zone: { name: 'Rohini' },
        assignedTo: null,
        _count: { notifications: 0 },
      },
    ]);

    const [dto] = await listRecentIncidentSummaries('u-1');

    expect(dto.cameraLabel).toBe('—');
    expect(dto.kind).toBe('SIGNAL');
    expect(dto.severity).toBe('WARNING'); // INFO folds into WARNING badge
    expect(dto.status).toBe('ACKNOWLEDGED');
    expect(dto.assignees).toEqual([]);
  });

  it('falls back to OFFLINE + raw type for an unknown diagnosis value', async () => {
    prismaMock.incident.findMany.mockResolvedValue([
      {
        id: 'inc-3',
        incidentNumber: 'X-1',
        type: 'SOMETHING_NEW',
        severity: 'WARNING',
        status: 'DETECTED',
        firstDetectedAt: new Date('2026-01-03T00:00:00.000Z'),
        camera: { cameraCode: 'CAM-9' },
        site: { name: 'S' },
        zone: { name: 'Z' },
        assignedTo: null,
        _count: { notifications: 1 },
      },
    ]);

    const [dto] = await listRecentIncidentSummaries('u-1');

    expect(dto.kind).toBe('OFFLINE');
    expect(dto.title).toBe('SOMETHING_NEW');
    expect(dto.status).toBe('OPEN');
  });
});

describe('getLatestEvidence', () => {
  it('returns the newest in-scope EVIDENCE snapshot with a signed thumbnail URL', async () => {
    prismaMock.snapshot.findFirst.mockResolvedValue({
      id: 'snap-1',
      capturedAt: new Date('2026-01-01T00:00:00.000Z'),
      camera: {
        cameraCode: 'CAM-042',
        site: { name: 'Rohini Gate 2', zone: { name: 'Rohini' } },
      },
    });

    const result = await getLatestEvidence('u-1');

    expect(result).toEqual({
      id: 'snap-1',
      cameraLabel: 'CAM-042',
      zoneName: 'Rohini',
      siteName: 'Rohini Gate 2',
      capturedAt: '2026-01-01T00:00:00.000Z',
      imageUrl: '/api/snapshots/snap-1/file?variant=thumb&exp=1&sig=abc',
    });
    expect(signFileUrlMock).toHaveBeenCalledWith('snap-1', 'thumb');
    expect(prismaMock.snapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: 'EVIDENCE',
          // Evidence is scope-filtered AND restricted to CONFIGURED cameras.
          camera: { AND: [{ __cameraScope: true }, { provisioningState: 'CONFIGURED' }] },
        },
        orderBy: { capturedAt: 'desc' },
      }),
    );
  });

  it('returns null when the scope has no evidence snapshot yet', async () => {
    prismaMock.snapshot.findFirst.mockResolvedValue(null);

    const result = await getLatestEvidence('u-1');

    expect(result).toBeNull();
    expect(signFileUrlMock).not.toHaveBeenCalled();
  });
});
