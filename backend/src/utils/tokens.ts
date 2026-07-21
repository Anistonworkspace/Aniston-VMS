import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';

// Access tokens are short-lived JWTs; refresh tokens are opaque random bytes
// stored as sha256 hashes in `refresh_tokens` (see env.ts note on JWT_REFRESH_SECRET).

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

// Pin the signing/verification algorithm to HS256 so a forged token cannot
// downgrade to `alg:none` or trick us into an RS/HS confusion attack.
const JWT_ALG = 'HS256' as const;

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;
const UNIT_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Parses "15m" / "7d" style durations into milliseconds. */
export function parseDuration(spec: string): number {
  const m = DURATION_RE.exec(spec.trim());
  if (!m) throw new Error(`Invalid duration: "${spec}" (expected e.g. 15m, 7d)`);
  return Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: JWT_ALG,
    expiresIn: Math.floor(parseDuration(env.JWT_ACCESS_TTL) / 1000),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALG] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new Error('malformed payload');
    }
    return decoded as unknown as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

/** Opaque refresh token — 48 random bytes, hex-encoded. Never stored in plaintext. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + parseDuration(env.JWT_REFRESH_TTL));
}
