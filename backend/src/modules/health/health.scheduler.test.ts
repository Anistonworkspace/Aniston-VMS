import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal typed-loose Prisma stub — the DRAFT-gating path only ever reaches
// prisma.camera.findMany (it returns early when no cameras are due).
const prismaMock = {
  camera: {
    findMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// redis.ts uses lazyConnect:false, so importing it — directly, or transitively
// via platform.heartbeat.js / scheduler.queue.js — opens a live connection and
// (maxRetriesPerRequest:null) retries forever, leaking a handle. Stub it out;
// scheduler.queue.js also needs the `bullConnection` named export to resolve.
vi.mock('../../lib/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
  bullConnection: { host: 'localhost', port: 6379 },
}));

// Keep the incident engine (and its notification/realtime graph) out of this
// unit — the gating path never dispatches an outcome.
vi.mock('../incidents/incident.service.js', () => ({ onHealthOutcome: vi.fn() }));

const { healthTick } = await import('./health.scheduler.js');
const { env } = await import('../../config/env.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('healthTick — DRAFT provisioning gating', () => {
  it('probes only CONFIGURED, non-maintenance cameras — DRAFT cameras are gated out', async () => {
    prismaMock.camera.findMany.mockResolvedValue([]);

    await healthTick();

    expect(prismaMock.camera.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.camera.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    // DRAFT cameras have null RTSP fields and nothing to probe; only CONFIGURED
    // cameras that are not in maintenance are eligible for a health check.
    expect(arg.where).toMatchObject({
      provisioningState: 'CONFIGURED',
      maintenanceMode: false,
    });
  });

  it('does no work and resolves cleanly when no CONFIGURED cameras are due', async () => {
    prismaMock.camera.findMany.mockResolvedValue([]);

    await expect(healthTick()).resolves.toBeUndefined();
  });

  it('scopes the due-camera query to the interval cutoff and per-minute batch size', async () => {
    prismaMock.camera.findMany.mockResolvedValue([]);

    await healthTick();

    const arg = prismaMock.camera.findMany.mock.calls[0]![0] as {
      where: { OR: unknown[] };
      orderBy: unknown;
      take: number;
    };
    // Least-recently-updated first, capped at the per-minute budget.
    expect(arg.orderBy).toEqual({ updatedAt: 'asc' });
    expect(arg.take).toBe(env.HEALTH_CAMS_PER_MINUTE);
    // "Due" = no HealthCheck newer than the interval cutoff.
    expect(arg.where.OR).toEqual([
      { healthChecks: { none: { startedAt: { gt: expect.any(Date) } } } },
    ]);
  });

  it('resets its overlap guard in finally after a failed tick so the next tick still runs', async () => {
    // healthTick has no internal catch — the error propagates (the interval
    // caller swallows it) but the finally block must clear the `running` guard.
    prismaMock.camera.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(healthTick()).rejects.toThrow('db down');

    prismaMock.camera.findMany.mockResolvedValue([]);
    await expect(healthTick()).resolves.toBeUndefined();
    expect(prismaMock.camera.findMany).toHaveBeenCalledTimes(2);
  });
});
