import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import type { PublicUser } from '../auth/auth.service.js';
import type {
  AccessScopeIdParams,
  CreateAccessScopeInput,
  CreateUserInput,
  UpdateUserInput,
  UserListQuery,
} from './users.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin — user + access-scope management.
//
// NOTE on `publicUser`: auth.service.ts defines an identical helper (same
// name, same field list) but does not export the function itself (only the
// `PublicUser` *type* is exported), and backend/src/modules/auth/ is
// read-only for this task, so it cannot be changed to export it. `toPublicUser`
// below is intentionally kept in lockstep with that private helper — same
// fields, same order, same omissions (passwordHash, mfaSecret) — see
// auth.service.ts lines ~26-46.
//
// NOTE on actor/audit pattern: mirrors incident.service.ts's `ActorUser` +
// auth.service.ts's `audit(req, {...})` — routers pass `authUser(req)` in as
// `actor` (never read `req.user` inside the service) and the raw `req` is
// passed through only for `audit()`'s IP capture. entityType/action strings
// follow auth.service.ts's lowercase, dot-namespaced convention
// (`entityType: 'user'`, `action: 'auth.login'`).
// ─────────────────────────────────────────────────────────────────────────────

type ActorUser = { id: string; email: string };

const BCRYPT_ROUNDS = 12; // matches BCRYPT_ROUNDS in auth.service.ts

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function listUsers(filters: UserListQuery) {
  const { page, limit, role, search } = filters;
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    items: users.map(toPublicUser),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function findUserOrThrow(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function getUserById(id: string): Promise<PublicUser> {
  return toPublicUser(await findUserOrThrow(id));
}

export async function createUser(
  input: CreateUserInput,
  actor: ActorUser,
  req: Request
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('A user with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: input.role,
    },
  });

  await audit(req, {
    userId: actor.id,
    action: 'user.create',
    entityType: 'user',
    entityId: user.id,
    newValue: { email: user.email, name: user.name, role: user.role },
  });

  return toPublicUser(user);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: ActorUser,
  req: Request
): Promise<PublicUser> {
  const before = await findUserOrThrow(id);

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password !== undefined)
    data.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const updated = await prisma.user.update({ where: { id }, data });

  await audit(req, {
    userId: actor.id,
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    oldValue: {
      name: before.name,
      phone: before.phone,
      role: before.role,
      isActive: before.isActive,
    },
    newValue: {
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      isActive: updated.isActive,
    },
  });

  return toPublicUser(updated);
}

/**
 * Deactivates a user (soft delete) instead of a hard `prisma.user.delete`.
 * User rows are referenced with `onDelete: Restrict` by RefreshToken and
 * AuditLog (and referenced, non-restrict, by assignedIncidents,
 * approvedMaintenanceWindows, etc.) — a hard delete would throw on any user
 * with history and would blow away the audit trail's `user` relation.
 * Deactivating (isActive=false) also immediately blocks login (see
 * auth.service.ts `login()`, which checks `user.isActive`).
 */
export async function deactivateUser(
  id: string,
  actor: ActorUser,
  req: Request
): Promise<PublicUser> {
  const before = await findUserOrThrow(id);
  if (actor.id === id) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  const updated = await prisma.user.update({ where: { id }, data: { isActive: false } });

  await audit(req, {
    userId: actor.id,
    action: 'user.deactivate',
    entityType: 'user',
    entityId: id,
    oldValue: { isActive: before.isActive },
    newValue: { isActive: false },
  });

  return toPublicUser(updated);
}

export async function listAccessScopes(userId: string) {
  await findUserOrThrow(userId);
  return prisma.userAccessScope.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

async function scopeTargetExists(
  scopeType: 'REGION' | 'ZONE' | 'SITE' | 'CAMERA',
  scopeId: string
): Promise<boolean> {
  switch (scopeType) {
    case 'REGION':
      return (
        (await prisma.region.findUnique({ where: { id: scopeId }, select: { id: true } })) !== null
      );
    case 'ZONE':
      return (
        (await prisma.zone.findUnique({ where: { id: scopeId }, select: { id: true } })) !== null
      );
    case 'SITE':
      return (
        (await prisma.site.findUnique({ where: { id: scopeId }, select: { id: true } })) !== null
      );
    // v1.5 — camera-level access scopes (CR-3): a user may be granted a single
    // camera, e.g. a client viewer who should only ever see one feed.
    case 'CAMERA':
      return (
        (await prisma.camera.findUnique({ where: { id: scopeId }, select: { id: true } })) !== null
      );
  }
}

export async function createAccessScope(
  userId: string,
  input: CreateAccessScopeInput,
  actor: ActorUser,
  req: Request
) {
  await findUserOrThrow(userId);

  if (input.scopeType !== 'ALL') {
    const exists = await scopeTargetExists(input.scopeType, input.scopeId as string);
    if (!exists) throw new NotFoundError(`${input.scopeType} not found`);
  }

  const scope = await prisma.userAccessScope.create({
    data: {
      userId,
      scopeType: input.scopeType,
      scopeId: input.scopeType === 'ALL' ? null : (input.scopeId as string),
    },
  });

  await audit(req, {
    userId: actor.id,
    action: 'user_access_scope.create',
    entityType: 'user_access_scope',
    entityId: scope.id,
    newValue: { userId, scopeType: scope.scopeType, scopeId: scope.scopeId },
  });

  return scope;
}

export async function deleteAccessScope(
  params: AccessScopeIdParams,
  actor: ActorUser,
  req: Request
): Promise<void> {
  const { id: userId, scopeId } = params;
  const scope = await prisma.userAccessScope.findUnique({ where: { id: scopeId } });
  if (!scope || scope.userId !== userId) throw new NotFoundError('Access scope not found');

  await prisma.userAccessScope.delete({ where: { id: scopeId } });

  await audit(req, {
    userId: actor.id,
    action: 'user_access_scope.delete',
    entityType: 'user_access_scope',
    entityId: scopeId,
    oldValue: { userId, scopeType: scope.scopeType, scopeId: scope.scopeId },
  });
}
