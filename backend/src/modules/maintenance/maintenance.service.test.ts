import { SnapshotKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal typed-loose Prisma stub — only the calls this test path touches.
const prismaMock = {
  maintenanceTask: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  camera: {
    findUnique: vi.fn(),
  },
  userAccessScope: {
    findMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const captureSnapshotMock = vi.fn();
vi.mock('../snapshots/snapshot.service.js', () => ({ captureSnapshot: captureSnapshotMock }));

const { transitionTaskStatus } = await import('./maintenance.service.js');
const { ConflictError } = await import('../../middleware/errorHandler.js');

const actor = { id: 'user-1', role: 'OPERATOR' as const, email: 'operator@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  // scopeType: 'ALL' short-circuits every canAccess* check in lib/scope.ts to
  // true without any further prisma calls, so tests don't need to also stub
  // camera/site scope lookups.
  prismaMock.userAccessScope.findMany.mockResolvedValue([{ scopeType: 'ALL', scopeId: null }]);
});

describe('transitionTaskStatus', () => {
  it('throws on an invalid status transition', async () => {
    prismaMock.maintenanceTask.findUnique.mockResolvedValue({
      id: 'task-1',
      cameraId: 'cam-1',
      status: 'DONE',
      beforeSnapshotId: null,
      afterSnapshotId: null,
    });

    await expect(transitionTaskStatus(actor, 'task-1', 'IN_PROGRESS')).rejects.toThrow(
      ConflictError
    );
    expect(prismaMock.maintenanceTask.update).not.toHaveBeenCalled();
    expect(captureSnapshotMock).not.toHaveBeenCalled();
  });

  it('captures a before-snapshot for the task camera with SnapshotKind.SUB when starting work', async () => {
    const camera = { id: 'cam-1', cameraCode: 'CAM-1', diagnosis: null };

    prismaMock.maintenanceTask.findUnique.mockResolvedValue({
      id: 'task-1',
      cameraId: 'cam-1',
      status: 'OPEN',
      beforeSnapshotId: null,
      afterSnapshotId: null,
    });
    prismaMock.camera.findUnique.mockResolvedValue(camera);
    captureSnapshotMock.mockResolvedValue({ id: 'snap-1' });
    prismaMock.maintenanceTask.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'task-1',
        cameraId: 'cam-1',
        type: 'INSPECTION',
        source: 'MANUAL',
        status: 'IN_PROGRESS',
        assignedToId: null,
        beforeSnapshotId: 'snap-1',
        afterSnapshotId: null,
        notes: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })
    );

    await transitionTaskStatus(actor, 'task-1', 'IN_PROGRESS');

    expect(captureSnapshotMock).toHaveBeenCalledTimes(1);
    expect(captureSnapshotMock).toHaveBeenCalledWith(camera, SnapshotKind.SUB, expect.any(Date));
    expect(prismaMock.maintenanceTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'IN_PROGRESS',
        beforeSnapshot: { connect: { id: 'snap-1' } },
      }),
    });
  });
});
