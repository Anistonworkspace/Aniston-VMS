import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Request validation for the clip export API (see clip.router.ts). Mirrors the
// params/query/body split used by incidents/incident.schemas.ts and
// snapshots/snapshot.schemas.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const cameraIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const clipIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createClipBodySchema = z
  .object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    incidentId: z.string().uuid().optional(),
  })
  .refine((v) => new Date(v.startAt).getTime() < new Date(v.endAt).getTime(), {
    message: 'startAt must be before endAt',
    path: ['endAt'],
  });

export const clipListQuerySchema = z.object({
  cameraId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'PROCESSING', 'DONE', 'FAILED']).optional(),
  incidentId: z.string().uuid().optional(),
  // CR-9 — site/zone filters for the clips table.
  siteId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateClipInput = z.infer<typeof createClipBodySchema>;
export type ClipListQuery = z.infer<typeof clipListQuerySchema>;
