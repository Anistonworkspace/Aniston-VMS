import type { Request } from 'express';
import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal typed-loose Prisma stub — only the calls createUser() touches.
const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

const auditMock = vi.fn();
vi.mock('../../lib/audit.js', () => ({ audit: auditMock }));

const { createUser } = await import('./users.service.js');

const actor = { id: 'actor-1', email: 'admin@example.com' };
const reqStub = {} as Request;

const input = {
  email: 'new.user@example.com',
  password: 'correct horse battery staple',
  name: 'New User',
  phone: '+1-555-0100',
  role: Role.OPERATOR,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(null); // no existing user with this email
});

describe('createUser', () => {
  it('hashes the password before calling prisma.user.create (never stores plaintext)', async () => {
    prismaMock.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'user-1',
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      phone: data.phone,
      role: data.role,
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await createUser(input, actor, reqStub);

    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.user.create.mock.calls[0][0];
    expect(createArgs.data.passwordHash).toBeDefined();
    expect(createArgs.data.passwordHash).not.toBe(input.password);
    // bcrypt hash format sanity check ("$2a$"/"$2b$" + cost + salt/hash)
    expect(createArgs.data.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    // Plaintext must never be forwarded as a raw field either.
    expect(createArgs.data.password).toBeUndefined();
  });

  it('returns a public user shape that never contains passwordHash (or mfaSecret)', async () => {
    prismaMock.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'user-1',
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      phone: data.phone,
      role: data.role,
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await createUser(input, actor, reqStub);

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('mfaSecret');
    expect(result).toMatchObject({
      id: 'user-1',
      email: input.email,
      name: input.name,
      phone: input.phone,
      role: input.role,
    });
  });

  it('audits the creation with the actor id and the new user id, never the password', async () => {
    prismaMock.user.create.mockResolvedValue({
      id: 'user-1',
      email: input.email,
      passwordHash: '$2b$12$stubstubstubstubstubstubstub',
      name: input.name,
      phone: input.phone,
      role: input.role,
      isActive: true,
      mfaEnabled: false,
      mfaSecret: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createUser(input, actor, reqStub);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const auditCall = auditMock.mock.calls[0][1] as Record<string, unknown>;
    expect(auditCall.userId).toBe(actor.id);
    expect(auditCall.entityType).toBe('user');
    expect(auditCall.entityId).toBe('user-1');
    expect(JSON.stringify(auditCall)).not.toContain(input.password);
  });
});
