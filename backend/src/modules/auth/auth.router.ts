import { Router, type CookieOptions } from 'express';
import { env } from '../../config/env.js';
import { authLimiter } from '../../middleware/rateLimiter.js';
import { validateRequest } from '../../middleware/validation.js';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parseDuration } from '../../utils/tokens.js';
import { changePasswordSchema, loginSchema, mfaCodeSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

// Refresh token travels only in an httpOnly cookie scoped to /api/auth —
// never in the JSON body. On 401 the client calls POST /api/auth/refresh and
// retries (docs/api-conventions.md).
const REFRESH_COOKIE = 'vms_refresh';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
};

function readRefreshCookie(cookies: unknown): string | undefined {
  const value = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

export const authRouter = Router();

authRouter.post(
  '/login',
  authLimiter,
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await authService.login(req.body, req);
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: parseDuration(env.JWT_REFRESH_TTL),
    });
    res.json({ success: true, data: { accessToken, user } });
  })
);

authRouter.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const presented = readRefreshCookie(req.cookies);
    const { accessToken, refreshToken, user } = await authService.refresh(presented, req);
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: parseDuration(env.JWT_REFRESH_TTL),
    });
    res.json({ success: true, data: { accessToken, user } });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const presented = readRefreshCookie(req.cookies);
    const userId = (req as { user?: { id: string } }).user?.id ?? null;
    await authService.logout(presented, userId, req);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.json({ success: true, data: null });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await authService.me(authUser(req).id);
    res.json({ success: true, data });
  })
);

authRouter.post(
  '/mfa/setup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await authService.setupMfa(authUser(req).id);
    res.json({ success: true, data });
  })
);

authRouter.post(
  '/mfa/verify',
  requireAuth,
  validateRequest({ body: mfaCodeSchema }),
  asyncHandler(async (req, res) => {
    await authService.verifyMfa(authUser(req).id, (req.body as { code: string }).code, req);
    res.json({ success: true, data: { mfaEnabled: true } });
  })
);

authRouter.post(
  '/mfa/disable',
  requireAuth,
  validateRequest({ body: mfaCodeSchema }),
  asyncHandler(async (req, res) => {
    await authService.disableMfa(authUser(req).id, (req.body as { code: string }).code, req);
    res.json({ success: true, data: { mfaEnabled: false } });
  })
);

authRouter.patch(
  '/password',
  requireAuth,
  authLimiter,
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await authService.changePassword(authUser(req).id, req.body, req);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.json({ success: true, data: null });
  })
);
