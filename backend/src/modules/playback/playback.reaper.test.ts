import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  streamSession: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const teardownStreamMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./mediamtx.adapter.js', () => ({
  teardownStream: teardownStreamMock,
}));

const { reapTick } = await import('./playback.reaper.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reapTick', () => {
  it('does nothing when there are no stale sessions', async () => {
    prismaMock.streamSession.findMany.mockResolvedValue([]);

    await reapTick();

    expect(teardownStreamMock).not.toHaveBeenCalled();
    expect(prismaMock.streamSession.update).not.toHaveBeenCalled();
  });

  it('tears down and force-ends every stale session with endReason "timeout"', async () => {
    prismaMock.streamSession.findMany.mockResolvedValue([
      { id: 'sess-1', mediamtxPath: 'sim/live-sub/CAM-1/sess-1' },
      { id: 'sess-2', mediamtxPath: 'sim/live-main/CAM-2/sess-2' },
    ]);
    prismaMock.streamSession.update.mockResolvedValue({});

    await reapTick();

    expect(teardownStreamMock).toHaveBeenCalledTimes(2);
    expect(teardownStreamMock).toHaveBeenCalledWith('sim/live-sub/CAM-1/sess-1');
    expect(teardownStreamMock).toHaveBeenCalledWith('sim/live-main/CAM-2/sess-2');
    expect(prismaMock.streamSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { endedAt: expect.any(Date), endReason: 'timeout' },
    });
    expect(prismaMock.streamSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-2' },
      data: { endedAt: expect.any(Date), endReason: 'timeout' },
    });
  });

  it('queries only sessions past the STREAM_SESSION_TIMEOUT_SECONDS cutoff and still open', async () => {
    prismaMock.streamSession.findMany.mockResolvedValue([]);

    await reapTick();

    expect(prismaMock.streamSession.findMany).toHaveBeenCalledWith({
      where: { endedAt: null, lastHeartbeatAt: { lt: expect.any(Date) } },
      select: { id: true, mediamtxPath: true },
    });
  });

  it('swallows errors from prisma so a bad tick never crashes the interval timer', async () => {
    prismaMock.streamSession.findMany.mockRejectedValue(new Error('db down'));

    await expect(reapTick()).resolves.toBeUndefined();
    expect(teardownStreamMock).not.toHaveBeenCalled();
  });
});
