import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = { auditLog: { create: vi.fn() } };
vi.mock('./prisma.js', () => ({ prisma: prismaMock }));

const loggerMock = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
vi.mock('./logger.js', () => ({ logger: loggerMock }));

const { audit, auditWithinTx } = await import('./audit.js');

beforeEach(() => vi.clearAllMocks());

describe('auditWithinTx', () => {
  it('writes an audit row carrying site/zone scope via the caller tx', async () => {
    const create = vi.fn();
    const tx = { auditLog: { create } } as never;
    await auditWithinTx(tx, {
      userId: 'u1',
      action: 'incident.acknowledge',
      entityType: 'incident',
      entityId: 'i1',
      siteId: 's1',
      zoneId: 'z1',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      action: 'incident.acknowledge',
      entityType: 'incident',
      entityId: 'i1',
      siteId: 's1',
      zoneId: 'z1',
    });
  });
});

describe('audit (best-effort, request-scoped)', () => {
  it('never throws when the write fails, and logs instead', async () => {
    prismaMock.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    const req = { ip: '1.2.3.4' } as never;
    await expect(
      audit(req, { action: 'x', entityType: 'y', entityId: 'z' })
    ).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  it('captures req.ip when ipAddress is not provided', async () => {
    prismaMock.auditLog.create.mockResolvedValueOnce({});
    const req = { ip: '9.9.9.9' } as never;
    await audit(req, { action: 'a', entityType: 'b', entityId: 'c' });
    const data = prismaMock.auditLog.create.mock.calls.at(-1)![0].data;
    expect(data.ipAddress).toBe('9.9.9.9');
    expect(data.siteId).toBeNull();
    expect(data.zoneId).toBeNull();
  });
});
