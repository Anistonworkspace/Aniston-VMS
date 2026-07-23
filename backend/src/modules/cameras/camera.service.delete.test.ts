import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// --- Prisma mock ------------------------------------------------------------
// The transaction client (`tx`) is a DISTINCT object from the global prisma
// client. deleteCamera must run the delete + audit-write THROUGH `tx` so they
// commit (or roll back) atomically; routing either through the global client
// would break that guarantee. Keeping the two objects separate lets the tests
// PROVE the transactional client is the one used, while the global client's
// `delete` / `auditLog.create` stay untouched.
const txMock = {
  camera: {
    delete: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

const prismaMock = {
  camera: {
    findUnique: vi.fn(), // findCameraOrThrow — server-loads the row (`before`)
    findFirst: vi.fn(), //  canAccessCamera scoped check (non-ALL callers)
    delete: vi.fn(), //     global-client delete — MUST stay uncalled
  },
  userAccessScope: {
    findMany: vi.fn(), //   getUserScope
  },
  incident: {
    count: vi.fn(), //      pre-transaction guard read
  },
  referenceImage: {
    count: vi.fn(), //      pre-transaction guard read
  },
  auditLog: {
    create: vi.fn(), //     global-client audit — MUST stay uncalled
  },
  // Invoke the callback with the SEPARATE txMock, mirroring how Prisma hands the
  // body an isolated transaction client. Assertions can then tell tx vs global.
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const { deleteCamera } = await import('./camera.service.js');
const { ConflictError, ForbiddenError, NotFoundError } =
  await import('../../middleware/errorHandler.js');

const actor = { id: 'user-1', role: 'PROJECT_ADMIN' as const, email: 'admin@example.com' };
const reqStub = { ip: '10.0.0.9' } as unknown as Request;

// Full-scope caller: canAccessCamera short-circuits `true` when scope.all.
const allScope = [{ scopeType: 'ALL', scopeId: null }];

// A Camera row including the 6 secret fields sanitizeCamera must strip from the
// audit oldValue. `siteId` is deliberately DIFFERENT from the camera id so a
// test can prove the audit siteId comes from the SERVER-LOADED row, not the id.
const cameraRow = {
  id: 'cam-1',
  siteId: 'site-1',
  routerId: 'router-1',
  cameraCode: 'CAM-001',
  name: 'Front Door',
  status: 'ONLINE',
  mainRtspUrlEncrypted: 'enc-main-url',
  subRtspUrlEncrypted: 'enc-sub-url',
  rtspUsernameEncrypted: 'enc-user',
  rtspPasswordEncrypted: 'enc-pass',
  mainRtspHash: 'hash-main',
  subRtspHash: 'hash-sub',
};

// The exact 6 encrypted/hash credential fields that must NEVER reach the audit
// trail (they are the crown jewels this whole sanitize step exists to protect).
const SECRET_FIELDS = [
  'mainRtspUrlEncrypted',
  'subRtspUrlEncrypted',
  'rtspUsernameEncrypted',
  'rtspPasswordEncrypted',
  'mainRtspHash',
  'subRtspHash',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  // Happy-path defaults; each test overrides only the one call it exercises.
  prismaMock.camera.findUnique.mockResolvedValue(cameraRow);
  prismaMock.camera.findFirst.mockResolvedValue({ id: 'cam-1' }); // in-scope
  prismaMock.userAccessScope.findMany.mockResolvedValue(allScope);
  prismaMock.incident.count.mockResolvedValue(0);
  prismaMock.referenceImage.count.mockResolvedValue(0);
  txMock.camera.delete.mockResolvedValue(cameraRow);
  txMock.auditLog.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) =>
    fn(txMock)
  );
});

describe('deleteCamera — guard rails (must never reach the delete)', () => {
  it('throws NotFoundError when the camera does not exist', async () => {
    prismaMock.camera.findUnique.mockResolvedValue(null);

    await expect(deleteCamera('missing', actor, reqStub)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.camera.delete).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when the camera is outside the caller access scope', async () => {
    prismaMock.userAccessScope.findMany.mockResolvedValue([
      { scopeType: 'SITE', scopeId: 'other-site' },
    ]);
    // Non-ALL scope → canAccessCamera runs a scoped findFirst; null = no access.
    prismaMock.camera.findFirst.mockResolvedValue(null);

    await expect(deleteCamera('cam-1', actor, reqStub)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.camera.delete).not.toHaveBeenCalled();
  });
});

describe('deleteCamera — retained history no longer blocks deletion', () => {
  // Camera FKs are now ON DELETE SET NULL, so recorded history is preserved (its
  // cameraId is nulled) instead of blocking the delete. The counts below are set
  // non-zero on purpose: deleteCamera must NOT consult them — if a history guard
  // were ever re-introduced, these tests would fail.
  it('deletes a camera that has recorded incidents (history is retained)', async () => {
    prismaMock.incident.count.mockResolvedValue(2);

    await deleteCamera('cam-1', actor, reqStub);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.camera.delete).toHaveBeenCalledWith({ where: { id: 'cam-1' } });
  });

  it('deletes a camera that has approved reference images (history is retained)', async () => {
    prismaMock.referenceImage.count.mockResolvedValue(1);

    await deleteCamera('cam-1', actor, reqStub);

    expect(txMock.camera.delete).toHaveBeenCalledWith({ where: { id: 'cam-1' } });
  });
});

describe('deleteCamera — transactional delete + audit', () => {
  it('deletes and audits through the TRANSACTION client, never the global client', async () => {
    await deleteCamera('cam-1', actor, reqStub);

    // Exactly one transaction wraps the whole unit of work.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // The delete + audit go through `tx` …
    expect(txMock.camera.delete).toHaveBeenCalledWith({ where: { id: 'cam-1' } });
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);

    // … and NEVER through the global prisma client (that would break atomicity).
    expect(prismaMock.camera.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('writes an audit row with no camera secrets and a server-loaded siteId', async () => {
    await deleteCamera('cam-1', actor, reqStub);

    const auditData = txMock.auditLog.create.mock.calls[0][0].data;
    expect(auditData).toMatchObject({
      userId: 'user-1',
      action: 'camera.delete',
      entityType: 'Camera',
      entityId: 'cam-1',
      // siteId is 'site-1' (from the findUnique row) — distinct from entityId
      // 'cam-1', proving it is taken from the SERVER-LOADED camera, not the arg.
      siteId: cameraRow.siteId,
      ipAddress: '10.0.0.9',
    });

    // oldValue is the sanitized snapshot: real, populated NON-secret fields …
    expect(auditData.oldValue).toMatchObject({
      id: 'cam-1',
      cameraCode: 'CAM-001',
      name: 'Front Door',
    });
    // … and NONE of the 6 encrypted / hash credential fields.
    for (const field of SECRET_FIELDS) {
      expect(auditData.oldValue).not.toHaveProperty(field);
    }
  });
});

describe('deleteCamera — delete failures propagate unchanged (no error mapping)', () => {
  it('propagates even a Prisma P2003 unchanged — the old FK→409 mapping is gone', async () => {
    // Camera FKs are now ON DELETE SET NULL, so a P2003 can no longer be raised
    // by the delete. But if any Prisma error ever surfaced, it must propagate
    // as-is: there is no longer a catch that relabels it as a 409 ConflictError.
    const fkError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: `camera_id`',
      { code: 'P2003', clientVersion: 'test' }
    );
    txMock.camera.delete.mockRejectedValue(fkError);

    const err = await deleteCamera('cam-1', actor, reqStub).catch((e) => e);
    expect(err).toBe(fkError); // the exact same object, unmapped
    expect(err).not.toBeInstanceOf(ConflictError);
    // A delete that never landed must not leave an audit row behind.
    expect(txMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('rethrows an unknown delete error unchanged — never as a ConflictError', async () => {
    const boom = new Error('db exploded');
    txMock.camera.delete.mockRejectedValue(boom);

    const err = await deleteCamera('cam-1', actor, reqStub).catch((e) => e);
    expect(err).toBe(boom); // the exact same object reaches the global handler
    expect(err).not.toBeInstanceOf(ConflictError);
    expect(txMock.auditLog.create).not.toHaveBeenCalled();
  });

  // The delete succeeds but the transactional audit write fails.
  //
  // With a MOCKED Prisma, `$transaction` merely runs the callback — it does NOT
  // emulate a real DB rollback, so this test cannot (and does not) assert the
  // camera row is restored. It proves only that the audit failure PROPAGATES
  // (is surfaced, not swallowed) and is NOT mislabeled as a P2003/409 "retained
  // history" error. True atomic rollback against a real database is asserted
  // SEPARATELY by the integration test (Task 6), deliberately kept out of this
  // mocked unit suite.
  it('propagates a transactional audit-write failure — not swallowed, not a 409', async () => {
    txMock.auditLog.create.mockRejectedValue(new Error('audit write failed'));

    const err = await deleteCamera('cam-1', actor, reqStub).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe('audit write failed');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
