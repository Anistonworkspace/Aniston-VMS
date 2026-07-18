import { z } from 'zod';

export const cameraIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const snapshotIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const snapshotListQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(336).default(24),
  kind: z.enum(['SUB', 'EVIDENCE']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const snapshotGridQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
});

export const snapshotFileQuerySchema = z.object({
  v: z.enum(['orig', 'thumb']).default('thumb'),
  exp: z.coerce.number().int().positive(),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});
