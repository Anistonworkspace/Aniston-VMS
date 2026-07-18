import { z } from 'zod';
import { Role, ScopeType } from '@prisma/client';
import { PaginationSchema, UuidParamSchema } from '@aniston-vms/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Admin API — request validation for user management + access scopes.
// Field names below match prisma/schema.prisma `model User` /
// `model UserAccessScope` exactly (see users.service.ts header comment).
// ─────────────────────────────────────────────────────────────────────────────

export const userIdParamsSchema = UuidParamSchema;

export const accessScopeIdParamsSchema = z.object({
  id: z.string().uuid(), // :id → user id
  scopeId: z.string().uuid(),
});
export type AccessScopeIdParams = z.infer<typeof accessScopeIdParamsSchema>;

export const userListQuerySchema = PaginationSchema.extend({
  role: z.nativeEnum(Role).optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const createUserSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  role: z.nativeEnum(Role),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(1).max(30).optional(),
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createAccessScopeSchema = z
  .object({
    scopeType: z.nativeEnum(ScopeType),
    scopeId: z.string().uuid().optional(),
  })
  .refine((v) => v.scopeType === 'ALL' || !!v.scopeId, {
    message: 'scopeId is required unless scopeType is ALL',
    path: ['scopeId'],
  });
export type CreateAccessScopeInput = z.infer<typeof createAccessScopeSchema>;
