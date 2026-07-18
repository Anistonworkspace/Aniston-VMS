import type { Request, RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from './errorHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

/** Returns the authenticated user or throws — use inside handlers after requireAuth. */
export function authUser(req: Request): AuthUser {
  const user = (req as AuthedRequest).user;
  if (!user) throw new UnauthorizedError();
  return user;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing Bearer token'));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    (req as AuthedRequest).user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(user.role)) {
      next(new ForbiddenError('Insufficient role for this action'));
      return;
    }
    next();
  };
}
