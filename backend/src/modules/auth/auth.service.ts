import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { env } from '../../config/env.js';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { encrypt, decrypt } from '../../utils/encryption.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../utils/totp.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../../utils/tokens.js';
import type { ChangePasswordInput, LoginInput } from './auth.schemas.js';

const BCRYPT_ROUNDS = 12;

// Matches prisma/seed.ts PASSWORD_HASH_PLACEHOLDER — a bcrypt-shaped sentinel
// that is not a valid credential. In non-production the first login against a
// sentinel user sets that password (dev demo provisioning); in production the
// login is rejected outright.
const SEED_PASSWORD_SENTINEL = '$2b$12$seedplaceholderseedplaceholderseedplaceholderseedplac';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: User['role'];
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
}

function publicUser(user: User): PublicUser {
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

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export async function login(input: LoginInput, req: Request): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }

  if (user.passwordHash === SEED_PASSWORD_SENTINEL) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }
    // Dev-only demo provisioning: first login sets this user's password.
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    console.warn(`[auth] dev provisioning: password set for ${user.email} on first login`);
    await audit(req, {
      userId: user.id,
      action: 'auth.dev_password_provisioned',
      entityType: 'user',
      entityId: user.id,
    });
  } else if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }

  if (user.mfaEnabled && user.mfaSecret) {
    if (!input.mfaCode) {
      throw new AppError('MFA_REQUIRED', 401, 'MFA code required for this account');
    }
    if (!verifyTotp(decrypt(user.mfaSecret), input.mfaCode)) {
      throw new AppError('MFA_INVALID', 401, 'Invalid MFA code');
    }
  }

  const refreshToken = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiry(),
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);
  await audit(req, {
    userId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
  });

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, email: user.email }),
    refreshToken,
    user: publicUser(user),
  };
}

export async function refresh(
  presentedToken: string | undefined,
  req: Request
): Promise<AuthResult> {
  if (!presentedToken) throw new UnauthorizedError('Missing refresh token');

  const tokenHash = hashRefreshToken(presentedToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored) throw new UnauthorizedError('Invalid refresh token');

  if (stored.revokedAt) {
    // Rotation reuse — someone replayed an already-rotated token. Revoke every
    // active session for this user (fail closed).
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(req, {
      userId: stored.userId,
      action: 'auth.refresh_reuse_detected',
      entityType: 'user',
      entityId: stored.userId,
    });
    throw new UnauthorizedError('Refresh token reuse detected — all sessions revoked');
  }
  if (stored.expiresAt < new Date()) throw new UnauthorizedError('Refresh token expired');
  if (!stored.user.isActive) throw new UnauthorizedError('Account is deactivated');

  const nextToken = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashRefreshToken(nextToken),
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  return {
    accessToken: signAccessToken({
      sub: stored.user.id,
      role: stored.user.role,
      email: stored.user.email,
    }),
    refreshToken: nextToken,
    user: publicUser(stored.user),
  };
}

export async function logout(
  presentedToken: string | undefined,
  userId: string | null,
  req: Request
): Promise<void> {
  if (presentedToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(presentedToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  if (userId) {
    await audit(req, { userId, action: 'auth.logout', entityType: 'user', entityId: userId });
  }
}

export async function me(userId: string): Promise<PublicUser & { accessScopes: unknown[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accessScopes: { select: { scopeType: true, scopeId: true } } },
  });
  if (!user || !user.isActive) throw new NotFoundError('User not found');
  return { ...publicUser(user), accessScopes: user.accessScopes };
}

export async function setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new NotFoundError('User not found');
  if (user.mfaEnabled) throw new AppError('MFA_ALREADY_ENABLED', 409, 'MFA is already enabled');

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: encrypt(secret), mfaEnabled: false },
  });
  return { secret, otpauthUrl: otpauthUrl(user.email, secret) };
}

export async function verifyMfa(userId: string, code: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.mfaSecret) throw new ValidationError('MFA setup has not been started');
  if (!verifyTotp(decrypt(user.mfaSecret), code)) {
    throw new AppError('MFA_INVALID', 401, 'Invalid MFA code');
  }
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await audit(req, { userId, action: 'auth.mfa_enabled', entityType: 'user', entityId: userId });
}

export async function disableMfa(userId: string, code: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.mfaEnabled || !user.mfaSecret) throw new ValidationError('MFA is not enabled');
  if (!verifyTotp(decrypt(user.mfaSecret), code)) {
    throw new AppError('MFA_INVALID', 401, 'Invalid MFA code');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null },
  });
  await audit(req, { userId, action: 'auth.mfa_disabled', entityType: 'user', entityId: userId });
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  req: Request
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new NotFoundError('User not found');
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect');
  }
  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Changing the password invalidates every session.
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await audit(req, {
    userId,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
  });
}
