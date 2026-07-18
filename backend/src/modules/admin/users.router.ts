import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  accessScopeIdParamsSchema,
  createAccessScopeSchema,
  createUserSchema,
  updateUserSchema,
  userIdParamsSchema,
  userListQuerySchema,
} from './users.schemas.js';
import * as usersService from './users.service.js';

// Read access is available to SUPER_ADMIN + PROJECT_ADMIN (the two roles that
// manage staff/rosters); mutations (create/role-change/deactivate/scopes) are
// SUPER_ADMIN-only since they can grant elevated access. See report §2 if
// this needs loosening to include PROJECT_ADMIN for mutations too.
const READ_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN'] as const;
const WRITE_ROLES = ['SUPER_ADMIN'] as const;

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  '/users',
  requireRole(...READ_ROLES),
  validateRequest({ query: userListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof userListQuerySchema>;
    const data = await usersService.listUsers(filters);
    res.json({ success: true, data });
  })
);

usersRouter.get(
  '/users/:id',
  requireRole(...READ_ROLES),
  validateRequest({ params: userIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await usersService.getUserById(req.params.id);
    res.json({ success: true, data });
  })
);

usersRouter.post(
  '/users',
  requireRole(...WRITE_ROLES),
  validateRequest({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const data = await usersService.createUser(req.body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

usersRouter.patch(
  '/users/:id',
  requireRole(...WRITE_ROLES),
  validateRequest({ params: userIdParamsSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const data = await usersService.updateUser(req.params.id, req.body, authUser(req), req);
    res.json({ success: true, data });
  })
);

// Soft-delete (deactivate) — see users.service.ts deactivateUser() doc comment
// for why this replaces a hard `prisma.user.delete`.
usersRouter.delete(
  '/users/:id',
  requireRole(...WRITE_ROLES),
  validateRequest({ params: userIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await usersService.deactivateUser(req.params.id, authUser(req), req);
    res.json({ success: true, data });
  })
);

usersRouter.get(
  '/users/:id/access-scopes',
  requireRole(...READ_ROLES),
  validateRequest({ params: userIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await usersService.listAccessScopes(req.params.id);
    res.json({ success: true, data });
  })
);

usersRouter.post(
  '/users/:id/access-scopes',
  requireRole(...WRITE_ROLES),
  validateRequest({ params: userIdParamsSchema, body: createAccessScopeSchema }),
  asyncHandler(async (req, res) => {
    const data = await usersService.createAccessScope(req.params.id, req.body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

usersRouter.delete(
  '/users/:id/access-scopes/:scopeId',
  requireRole(...WRITE_ROLES),
  validateRequest({ params: accessScopeIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await usersService.deleteAccessScope(
      req.params as unknown as z.infer<typeof accessScopeIdParamsSchema>,
      authUser(req),
      req
    );
    res.status(204).send();
  })
);
