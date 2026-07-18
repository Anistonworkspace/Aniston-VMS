import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal typed-loose Prisma stub — only the calls this test path touches.
const prismaMock = {
  camera: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  userAccessScope: {
    findMany: vi.fn(),
  },
  streamSession: {
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  recordingSegment: {
    findMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const buildMediamtxPathMock = vi.fn(
  (cameraCode: string, kind: string, sessionId: string) => `sim/${kind}/${cameraCode}/${sessionId}`
);
const buildStreamEndpointsMock = vi.fn((mediamtxPath: string) => ({
  mediamtxPath,
  hlsUrl: `http://hls.example/${mediamtxPath}/index.m3u8`,
  webrtcUrl: `http://webrtc.example/${mediamtxPath}/whep`,
  rtspUrl: `rtsp://rtsp.example/${mediamtxPath}`,
}));
const publishStreamMock = vi.fn().mockResolvedValue(undefined);
const teardownStreamMock = vi.fn().mockResolvedValue(undefined);

vi.mock('./mediamtx.adapter.js', () => ({
  buildMediamtxPath: buildMediamtxPathMock,
  buildStreamEndpoints: buildStreamEndpointsMock,
  publishStream: publishStreamMock,
  teardownStream: teardownStreamMock,
}));

const { env } = await import('../../config/env.js');
const playbackService = await import('./playback.service.js');
const { ConflictError, ForbiddenError, NotFoundError } =
  await import('../../middleware/errorHandler.js');

const operator = { id: 'user-1', role: 'OPERATOR' as const, email: 'operator@example.com' };
const admin = { id: 'admin-1', role: 'SUPER_ADMIN' as const, email: 'admin@example.com' };

const camera = { id: 'cam-1', cameraCode: 'CAM-1', name: 'Front Gate' };

beforeEach(() => {
  vi.clearAllMocks();
  // scopeType: 'ALL' short-circuits every canAccess* check in lib/scope.ts to
  // true without any further prisma calls (see maintenance.service.test.ts).
  prismaMock.userAccessScope.findMany.mockResolvedValue([{ scopeType: 'ALL', scopeId: null }]);
});

describe('startSession', () => {
  it('throws ForbiddenError when the camera is outside the caller access scope', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue([
      { scopeType: 'SITE', scopeId: 'site-9' },
    ]);
    prismaMock.camera.findFirst.mockResolvedValue(null);

    await expect(
      playbackService.startSession(operator, { cameraId: 'cam-1', kind: 'LIVE_SUB' }, '10.0.0.1')
    ).rejects.toThrow(ForbiddenError);
    expect(prismaMock.streamSession.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the camera row does not exist', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(null);

    await expect(
      playbackService.startSession(operator, { cameraId: 'cam-1', kind: 'LIVE_SUB' }, '10.0.0.1')
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError once the camera is at STREAM_MAX_CONCURRENT_PER_CAMERA', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.streamSession.count.mockResolvedValue(env.STREAM_MAX_CONCURRENT_PER_CAMERA);

    await expect(
      playbackService.startSession(operator, { cameraId: 'cam-1', kind: 'LIVE_SUB' }, '10.0.0.1')
    ).rejects.toThrow(ConflictError);
    expect(publishStreamMock).not.toHaveBeenCalled();
    expect(prismaMock.streamSession.create).not.toHaveBeenCalled();
  });

  it('publishes the stream, persists the session, and returns public shape with sim endpoints', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.streamSession.count.mockResolvedValue(0);
    prismaMock.streamSession.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        endedAt: null,
        endReason: null,
        bytesEstimate: null,
      })
    );

    const result = await playbackService.startSession(
      operator,
      { cameraId: 'cam-1', kind: 'LIVE_SUB' },
      '10.0.0.1'
    );

    expect(publishStreamMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.streamSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cameraId: 'cam-1',
        userId: 'user-1',
        kind: 'LIVE_SUB',
        clientIp: '10.0.0.1',
        mediamtxPath: expect.stringContaining('CAM-1'),
      }),
    });
    expect(result).toMatchObject({
      cameraId: 'cam-1',
      userId: 'user-1',
      kind: 'LIVE_SUB',
      simMode: env.PLAYBACK_SIM_MODE,
      hlsUrl: expect.stringContaining('index.m3u8'),
    });
  });

  it('appends the VOD range query params for a PLAYBACK session', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.streamSession.count.mockResolvedValue(0);
    prismaMock.streamSession.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        endedAt: null,
        endReason: null,
        bytesEstimate: null,
      })
    );

    const result = await playbackService.startSession(
      operator,
      {
        cameraId: 'cam-1',
        kind: 'PLAYBACK',
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-01T01:00:00.000Z',
      },
      '10.0.0.1'
    );

    expect(result.hlsUrl).toContain('start=2026-07-01T00%3A00%3A00.000Z');
    expect(result.hlsUrl).toContain('end=2026-07-01T01%3A00%3A00.000Z');
  });
});

describe('heartbeat', () => {
  const activeSession = {
    id: 'sess-1',
    cameraId: 'cam-1',
    userId: 'user-1',
    kind: 'LIVE_SUB',
    mediamtxPath: 'sim/live-sub/CAM-1/sess-1',
    startedAt: new Date(),
    lastHeartbeatAt: new Date(),
    endedAt: null,
    endReason: null,
    clientIp: '10.0.0.1',
    bytesEstimate: null,
  };

  it('throws ForbiddenError when the caller is neither the owner nor an admin', async () => {
    prismaMock.streamSession.findUnique.mockResolvedValue(activeSession);
    const otherUser = { id: 'user-2', role: 'OPERATOR' as const, email: 'other@example.com' };

    await expect(playbackService.heartbeat(otherUser, 'sess-1', {})).rejects.toThrow(
      ForbiddenError
    );
    expect(prismaMock.streamSession.update).not.toHaveBeenCalled();
  });

  it('throws ConflictError once the session has already ended', async () => {
    prismaMock.streamSession.findUnique.mockResolvedValue({
      ...activeSession,
      endedAt: new Date(),
    });

    await expect(playbackService.heartbeat(operator, 'sess-1', {})).rejects.toThrow(ConflictError);
  });

  it('bumps lastHeartbeatAt and stores bytesEstimate as a BigInt', async () => {
    prismaMock.streamSession.findUnique.mockResolvedValue(activeSession);
    prismaMock.streamSession.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...activeSession,
        ...data,
      })
    );

    const result = await playbackService.heartbeat(operator, 'sess-1', { bytesEstimate: 2048 });

    expect(prismaMock.streamSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: expect.objectContaining({ bytesEstimate: 2048n }),
    });
    expect(result.bytesEstimate).toBe(2048);
  });

  it('allows an admin to heartbeat a session they do not own', async () => {
    prismaMock.streamSession.findUnique.mockResolvedValue(activeSession);
    prismaMock.streamSession.update.mockResolvedValue(activeSession);

    await expect(playbackService.heartbeat(admin, 'sess-1', {})).resolves.toBeDefined();
  });
});

describe('endSession', () => {
  const activeSession = {
    id: 'sess-1',
    cameraId: 'cam-1',
    userId: 'user-1',
    kind: 'LIVE_SUB',
    mediamtxPath: 'sim/live-sub/CAM-1/sess-1',
    startedAt: new Date(),
    lastHeartbeatAt: new Date(),
    endedAt: null,
    endReason: null,
    clientIp: '10.0.0.1',
    bytesEstimate: null,
  };

  it('tears down the MediaMTX path and marks the session ended', async () => {
    prismaMock.streamSession.findUnique.mockResolvedValue(activeSession);
    prismaMock.streamSession.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...activeSession,
        ...data,
      })
    );

    const result = await playbackService.endSession(operator, 'sess-1', {
      reason: 'user_closed_tab',
    });

    expect(teardownStreamMock).toHaveBeenCalledWith(activeSession.mediamtxPath);
    expect(result.endReason).toBe('user_closed_tab');
    expect(result.endedAt).toBeInstanceOf(Date);
  });

  it('is idempotent — ending an already-ended session does not call teardown again', async () => {
    const endedSession = { ...activeSession, endedAt: new Date(), endReason: 'timeout' };
    prismaMock.streamSession.findUnique.mockResolvedValue(endedSession);

    const result = await playbackService.endSession(operator, 'sess-1', {});

    expect(teardownStreamMock).not.toHaveBeenCalled();
    expect(prismaMock.streamSession.update).not.toHaveBeenCalled();
    expect(result.endReason).toBe('timeout');
  });
});

describe('listSegments', () => {
  it('scopes segments to the camera window and forwards the track filter', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.recordingSegment.findMany.mockResolvedValue([]);

    await playbackService.listSegments(operator, 'cam-1', {
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-01T01:00:00.000Z',
      track: 'MAIN',
    });

    expect(prismaMock.recordingSegment.findMany).toHaveBeenCalledWith({
      where: {
        cameraId: 'cam-1',
        startAt: { lt: new Date('2026-07-01T01:00:00.000Z') },
        endAt: { gt: new Date('2026-07-01T00:00:00.000Z') },
        track: 'MAIN',
      },
      orderBy: { startAt: 'asc' },
    });
  });
});
