import { describe, it, expect, vi, beforeEach } from 'vitest';

// Proves P1's headline guarantee: each incident lifecycle mutation writes the
// status change, the timeline event, AND the audit row inside ONE transaction,
// so a failing audit aborts the whole operation (no silent audit gaps).

const incidentUpdate = vi.fn();
const incidentEventCreate = vi.fn();
const auditLogCreate = vi.fn();
const incidentFindUnique = vi.fn();

const txStub = {
  incident: { update: incidentUpdate },
  incidentEvent: { create: incidentEventCreate },
  auditLog: { create: auditLogCreate },
};

const prismaMock = {
  incident: { findUnique: incidentFindUnique },
  $transaction: vi.fn(async (cb: (tx: typeof txStub) => unknown) => cb(txStub)),
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../../lib/redis.js', () => ({ redis: {} }));
vi.mock('../../lib/realtime.js', () => ({ emitToZone: vi.fn() }));
vi.mock('./notification.service.js', () => ({ dispatchIncidentAlerts: vi.fn() }));

const { ackIncident } = await import('./incident.service.js');
const { OPEN_STATUS_LIST } = await import('./incident.constants.js');

const openStatus = OPEN_STATUS_LIST[0];
const openInc = {
  id: 'i1',
  status: openStatus,
  siteId: 's1',
  zoneId: 'z1',
  acknowledgedAt: null,
  assignedToId: null,
  incidentNumber: 'ANI-CAM-2026-000141',
  severity: 'CRITICAL',
};
const actor = { id: 'u1', email: 'op@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txStub) => unknown) => cb(txStub));
  incidentFindUnique.mockResolvedValue(openInc);
  incidentUpdate.mockResolvedValue({ ...openInc, status: 'ACKNOWLEDGED' });
});

describe('ackIncident — atomic, scoped audit', () => {
  it('writes update + event + scoped audit in a single transaction', async () => {
    await ackIncident('i1', actor);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(incidentUpdate).toHaveBeenCalledTimes(1);
    expect(incidentEventCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate.mock.calls[0][0].data).toMatchObject({
      action: 'incident.acknowledge',
      entityType: 'incident',
      entityId: 'i1',
      userId: 'u1',
      siteId: 's1',
      zoneId: 'z1',
    });
  });

  it('aborts the whole operation if the audit write fails', async () => {
    auditLogCreate.mockRejectedValueOnce(new Error('audit insert failed'));
    await expect(ackIncident('i1', actor)).rejects.toThrow('audit insert failed');
  });
});
