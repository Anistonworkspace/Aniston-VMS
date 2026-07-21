import { describe, it, expect, vi } from 'vitest';
import { Role, type PrismaClient } from '@prisma/client';
import { applyAdminUpdate, type AdminConfig } from './seed-admin';

function makeCfg(overrides: Partial<AdminConfig> = {}): AdminConfig {
  return {
    email: 'admin@anistonvms.example',
    name: 'Aniston Super Admin',
    phone: '+91-9800000001',
    password: 'S3cretRotation!',
    passwordExplicit: true,
    ...overrides,
  };
}

/**
 * A Prisma test double whose `user` delegate spies on EVERY mutating method,
 * so tests can assert that forbidden operations are never invoked. `create`,
 * `createMany` and `upsert` deliberately throw if ever called.
 */
function makeDb(existing: unknown) {
  const boom = (name: string) =>
    vi.fn(() => {
      throw new Error(`forbidden Prisma call: user.${name}`);
    });
  const user = {
    findUnique: vi.fn().mockResolvedValue(existing),
    update: vi.fn().mockResolvedValue({ id: 'u_updated' }),
    create: boom('create'),
    createMany: boom('createMany'),
    upsert: boom('upsert'),
    delete: boom('delete'),
    deleteMany: boom('deleteMany'),
  };
  const userAccessScope = {
    create: boom('scope.create'),
    createMany: boom('scope.createMany'),
    upsert: boom('scope.upsert'),
    findFirst: vi.fn(),
  };
  const db = { user, userAccessScope } as unknown as PrismaClient;
  return { db, user, userAccessScope };
}

const superAdmin = {
  id: 'u_super',
  email: 'admin@anistonvms.example',
  role: Role.SUPER_ADMIN,
  name: 'Old Name',
  phone: '+91-0000000000',
  isActive: false,
  passwordHash: 'old-hash',
};

describe('applyAdminUpdate — update-only safety contract', () => {
  it('writes NOTHING when the account does not exist', async () => {
    const { db, user, userAccessScope } = makeDb(null);

    const outcome = await applyAdminUpdate(db, makeCfg());

    expect(outcome).toEqual({ status: 'skipped', reason: 'not-found' });
    expect(user.findUnique).toHaveBeenCalledTimes(1);
    expect(user.update).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
    expect(user.createMany).not.toHaveBeenCalled();
    expect(user.upsert).not.toHaveBeenCalled();
    expect(userAccessScope.create).not.toHaveBeenCalled();
  });

  it('writes NOTHING when the account is not a SUPER_ADMIN (no promotion)', async () => {
    const { db, user, userAccessScope } = makeDb({ ...superAdmin, role: Role.OPERATOR });

    const outcome = await applyAdminUpdate(db, makeCfg());

    expect(outcome).toEqual({ status: 'skipped', reason: 'not-super-admin' });
    expect(user.update).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
    expect(user.upsert).not.toHaveBeenCalled();
    expect(userAccessScope.create).not.toHaveBeenCalled();
  });

  it('updates an existing SUPER_ADMIN without create/upsert and without touching role or scope', async () => {
    const { db, user, userAccessScope } = makeDb(superAdmin);

    const outcome = await applyAdminUpdate(db, makeCfg({ password: 'NewRotated#1', passwordExplicit: true }));

    expect(outcome.status).toBe('updated');
    expect(user.update).toHaveBeenCalledTimes(1);
    expect(user.create).not.toHaveBeenCalled();
    expect(user.createMany).not.toHaveBeenCalled();
    expect(user.upsert).not.toHaveBeenCalled();
    expect(userAccessScope.create).not.toHaveBeenCalled();

    const updateArg = user.update.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    // Targets the existing row by id, never re-keys by email/role.
    expect(updateArg.where).toEqual({ id: superAdmin.id });
    // The update payload must NEVER carry a role (no escalation).
    expect('role' in updateArg.data).toBe(false);
    // Password was supplied explicitly, so a fresh hash is written.
    expect(updateArg.data.passwordHash).toBeDefined();
  });

  it('does not write a password when none was supplied explicitly', async () => {
    const { db, user } = makeDb(superAdmin);

    const outcome = await applyAdminUpdate(db, makeCfg({ passwordExplicit: false }));

    expect(outcome).toEqual({ status: 'updated', userId: superAdmin.id, passwordChanged: false });
    expect(user.update).toHaveBeenCalledTimes(1);
    const updateArg = user.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect('passwordHash' in updateArg.data).toBe(false);
    expect('role' in updateArg.data).toBe(false);
  });
});
