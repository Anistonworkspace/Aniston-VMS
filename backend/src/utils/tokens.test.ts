import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken } from './tokens.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';

const payload = { sub: 'user-1', role: 'OPERATOR' as const, email: 'op@example.com' };

describe('access tokens — HS256 pinned', () => {
  it('signs and verifies a round-trip', () => {
    const out = verifyAccessToken(signAccessToken(payload));
    expect(out.sub).toBe('user-1');
    expect(out.email).toBe('op@example.com');
  });

  it('rejects an alg:none forged token', () => {
    const forged = jwt.sign(payload, '', { algorithm: 'none' });
    expect(() => verifyAccessToken(forged)).toThrow(UnauthorizedError);
  });

  it('rejects a token signed with a different secret', () => {
    const bad = jwt.sign(payload, 'not-the-real-secret-not-the-real-secret');
    expect(() => verifyAccessToken(bad)).toThrow(UnauthorizedError);
  });

  it('rejects garbage input', () => {
    expect(() => verifyAccessToken('garbage.token.here')).toThrow(UnauthorizedError);
  });
});
