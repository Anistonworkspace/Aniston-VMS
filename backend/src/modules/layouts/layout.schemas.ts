import { z } from 'zod';

// Stage — request validation for the saved-layouts API (see layout.router.ts).
// LayoutKind members copied verbatim from prisma/schema.prisma (`grep -n -A 10
// "^enum LayoutKind " prisma/schema.prisma`): L1x1, L2x2, L3x2.
//
// NOTE: the wire field is `kind` (per the API sketch), but the underlying
// SavedLayout column is named `layout` (confirmed via
// `grep -n -A 15 "^model SavedLayout " prisma/schema.prisma`) — mapped in
// layout.service.ts. `cameraIds` is a Prisma `Json` column, not a scalar
// array — validated here as string[] and stored/read as JSON.

export const layoutKindEnum = z.enum(['L1x1', 'L2x2', 'L3x2']);

// Numeric bounds inferred directly from the LayoutKind naming convention
// (1x1 = 1 cell, 2x2 = up to 4 cells, 3x2 = up to 6 cells).
export const LAYOUT_MAX_CAMERAS: Record<z.infer<typeof layoutKindEnum>, number> = {
  L1x1: 1,
  L2x2: 4,
  L3x2: 6,
};

export const idParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createLayoutBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    kind: layoutKindEnum,
    cameraIds: z.array(z.string().uuid()).min(1),
  })
  .refine((b) => b.cameraIds.length <= LAYOUT_MAX_CAMERAS[b.kind], {
    message: 'Too many cameras for the selected layout kind',
    path: ['cameraIds'],
  });

// Partial update — cameraIds/kind can be changed independently; when both are
// present in the same request the bound is checked here as a fast rejection,
// but layout.service.ts always re-checks against the *effective* (possibly
// pre-existing) kind, since a client may only send one of the two fields.
export const updateLayoutBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    kind: layoutKindEnum.optional(),
    cameraIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine((b) => b.name !== undefined || b.kind !== undefined || b.cameraIds !== undefined, {
    message: 'No fields to update',
  })
  .refine((b) => !(b.kind && b.cameraIds) || b.cameraIds.length <= LAYOUT_MAX_CAMERAS[b.kind], {
    message: 'Too many cameras for the selected layout kind',
    path: ['cameraIds'],
  });
