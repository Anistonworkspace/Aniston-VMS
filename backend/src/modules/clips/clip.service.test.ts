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
  incident: {
    findUnique: vi.fn(),
  },
  site: {
    findUnique: vi.fn(),
  },
  storagePolicy: {
    findMany: vi.fn(),
  },
  clipExport: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const storageMock = {
  put: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
};
const signStorageUrlMock = vi.fn(() => 'https://signed.example/clip.mp4');
vi.mock('../../lib/storage.js', () => ({
  storage: storageMock,
  signStorageUrl: signStorageUrlMock,
}));

const enqueueClipExportMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./clip.queue.js', () => ({
  enqueueClipExport: enqueueClipExportMock,
}));

const { env } = await import('../../config/env.js');
const clipService = await import('./clip.service.js');
const { ForbiddenError, NotFoundError, ValidationError } =
  await import('../../middleware/errorHandler.js');

const operator = { id: 'user-1', role: 'OPERATOR' as const, email: 'operator@example.com' };
// A CONFIGURED camera (non-null siteId): createClipExport rejects DRAFT
// cameras (no site → no footage) before any export path, so tests that
// exercise export behaviour need a placed camera.
const camera = { id: 'cam-1', cameraCode: 'CAM-1', siteId: 'site-1' };

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.exists.mockResolvedValue(true);
  // CR-9/CR-10 storage-policy gate — default to "no policies" so the existing
  // tests keep exercising their own concern.
  prismaMock.site.findUnique.mockResolvedValue({ zoneId: 'zone-1' });
  prismaMock.storagePolicy.findMany.mockResolvedValue([]);
  // scopeType: 'ALL' short-circuits every canAccess* check in lib/scope.ts to
  // true without any further prisma calls (see maintenance.service.test.ts).
  prismaMock.userAccessScope.findMany.mockResolvedValue([{ scopeType: 'ALL', scopeId: null }]);
});

describe('createClipExport', () => {
  it('throws ForbiddenError when the camera is outside the caller access scope', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue([
      { scopeType: 'SITE', scopeId: 'site-9' },
    ]);
    prismaMock.camera.findFirst.mockResolvedValue(null);

    await expect(
      clipService.createClipExport(operator, 'cam-1', {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-01T00:10:00.000Z',
      })
    ).rejects.toThrow(ForbiddenError);
    expect(prismaMock.clipExport.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the camera row does not exist', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(null);

    await expect(
      clipService.createClipExport(operator, 'cam-1', {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-01T00:10:00.000Z',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError once the range exceeds CLIP_EXPORT_MAX_DURATION_MINUTES', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    const startAt = new Date('2026-07-01T00:00:00.000Z');
    const endAt = new Date(startAt.getTime() + (env.CLIP_EXPORT_MAX_DURATION_MINUTES + 1) * 60_000);

    await expect(
      clipService.createClipExport(operator, 'cam-1', {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      })
    ).rejects.toThrow(ValidationError);
    expect(prismaMock.clipExport.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when an incidentId is given but the incident does not exist', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.incident.findUnique.mockResolvedValue(null);

    await expect(
      clipService.createClipExport(operator, 'cam-1', {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-01T00:10:00.000Z',
        incidentId: '11111111-1111-1111-1111-111111111111',
      })
    ).rejects.toThrow(NotFoundError);
    expect(prismaMock.clipExport.create).not.toHaveBeenCalled();
  });

  it('creates a QUEUED row and enqueues the BullMQ export job', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.clipExport.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'clip-1',
        requestedById: operator.id,
        status: 'QUEUED',
        sizeBytes: null,
        error: null,
        s3Key: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })
    );

    const result = await clipService.createClipExport(operator, 'cam-1', {
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-01T00:10:00.000Z',
    });

    expect(prismaMock.clipExport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cameraId: 'cam-1',
        requestedById: 'user-1',
        status: 'QUEUED',
        incidentId: null,
      }),
    });
    expect(enqueueClipExportMock).toHaveBeenCalledWith('clip-1');
    expect(result).toMatchObject({ id: 'clip-1', status: 'QUEUED', downloadUrl: null });
  });

  it('throws ValidationError when a storage policy disables clips for the scope', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    prismaMock.storagePolicy.findMany.mockResolvedValue([{ scopeType: 'SITE', storeClips: false }]);

    await expect(
      clipService.createClipExport(operator, 'cam-1', {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-01T00:10:00.000Z',
      })
    ).rejects.toThrow(ValidationError);
    expect(prismaMock.clipExport.create).not.toHaveBeenCalled();
  });
});

describe('getClipExport', () => {
  it('throws NotFoundError when the clip row is missing', async () => {
    prismaMock.clipExport.findUnique.mockResolvedValue(null);
    await expect(clipService.getClipExport(operator, 'clip-1')).rejects.toThrow(NotFoundError);
  });

  it('returns a signed downloadUrl once the clip is DONE', async () => {
    prismaMock.clipExport.findUnique.mockResolvedValue({
      id: 'clip-1',
      cameraId: 'cam-1',
      requestedById: 'user-1',
      startAt: new Date(),
      endAt: new Date(),
      status: 'DONE',
      sizeBytes: 4096n,
      error: null,
      s3Key: 'clips/cam-1/clip-1.mp4',
      incidentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await clipService.getClipExport(operator, 'clip-1');

    expect(signStorageUrlMock).toHaveBeenCalledWith(
      'clips/cam-1/clip-1.mp4',
      expect.objectContaining({ contentType: 'video/mp4' })
    );
    expect(result.downloadUrl).toBe('https://signed.example/clip.mp4');
    expect(result.sizeBytes).toBe(4096);
  });

  it('does not sign a download URL while the clip is still QUEUED', async () => {
    prismaMock.clipExport.findUnique.mockResolvedValue({
      id: 'clip-1',
      cameraId: 'cam-1',
      requestedById: 'user-1',
      startAt: new Date(),
      endAt: new Date(),
      status: 'QUEUED',
      sizeBytes: null,
      error: null,
      s3Key: null,
      incidentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await clipService.getClipExport(operator, 'clip-1');

    expect(signStorageUrlMock).not.toHaveBeenCalled();
    expect(result.downloadUrl).toBeNull();
  });
});

describe('runClipExportJob', () => {
  const baseClip = {
    id: 'clip-1',
    cameraId: 'cam-1',
    camera: { cameraCode: 'CAM-1' },
    startAt: new Date('2026-07-01T00:00:00.000Z'),
    endAt: new Date('2026-07-01T00:01:00.000Z'),
    status: 'QUEUED',
  };

  it('logs and returns without throwing when the row no longer exists', async () => {
    prismaMock.clipExport.findUnique.mockResolvedValue(null);

    await expect(clipService.runClipExportJob('missing-clip')).resolves.toBeUndefined();
    expect(prismaMock.clipExport.update).not.toHaveBeenCalled();
    expect(storageMock.put).not.toHaveBeenCalled();
  });

  it('marks PROCESSING, uploads a deterministic buffer, then marks DONE with sizeBytes', async () => {
    prismaMock.clipExport.findUnique.mockResolvedValue(baseClip);
    prismaMock.clipExport.update.mockResolvedValue({});

    await clipService.runClipExportJob('clip-1');

    expect(prismaMock.clipExport.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'clip-1' },
      data: { status: 'PROCESSING', error: null },
    });
    expect(storageMock.put).toHaveBeenCalledTimes(1);
    const [key, buffer, contentType] = storageMock.put.mock.calls[0];
    expect(key).toBe('clips/cam-1/clip-1.mp4');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(contentType).toBe('video/mp4');
    expect(prismaMock.clipExport.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'clip-1' },
      data: { status: 'DONE', s3Key: 'clips/cam-1/clip-1.mp4', sizeBytes: BigInt(buffer.length) },
    });
  });

  it('marks FAILED with the error message when storage.put throws', async () => {
    prismaMock.clipExport.findUnique.mockResolvedValue(baseClip);
    prismaMock.clipExport.update.mockResolvedValue({});
    storageMock.put.mockRejectedValueOnce(new Error('disk full'));

    await clipService.runClipExportJob('clip-1');

    expect(prismaMock.clipExport.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'clip-1' },
      data: { status: 'FAILED', error: 'disk full' },
    });
  });
});

describe('pruneClipExports', () => {
  it('deletes storage objects and rows older than CLIP_EXPORT_RETENTION_DAYS', async () => {
    prismaMock.clipExport.findMany.mockResolvedValue([
      { id: 'clip-old-1', s3Key: 'clips/cam-1/clip-old-1.mp4' },
      { id: 'clip-old-2', s3Key: null },
    ]);
    prismaMock.clipExport.deleteMany.mockResolvedValue({ count: 2 });
    storageMock.exists.mockResolvedValue(true);

    const result = await clipService.pruneClipExports(new Date('2026-08-01T00:00:00.000Z'));

    expect(storageMock.delete).toHaveBeenCalledWith('clips/cam-1/clip-old-1.mp4');
    expect(storageMock.delete).toHaveBeenCalledTimes(1);
    expect(prismaMock.clipExport.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['clip-old-1', 'clip-old-2'] } },
    });
    expect(result).toEqual({ deletedRows: 2 });
  });

  it('is a no-op when nothing is past the retention cutoff', async () => {
    prismaMock.clipExport.findMany.mockResolvedValue([]);

    const result = await clipService.pruneClipExports(new Date('2026-08-01T00:00:00.000Z'));

    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.clipExport.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedRows: 0 });
  });
});
