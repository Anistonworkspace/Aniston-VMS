import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Request validation for the playback/live-view session API (see
// playback.router.ts). Mirrors the params/query/body split used by
// incidents/incident.schemas.ts and snapshots/snapshot.schemas.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const cameraIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const startSessionBodySchema = z
  .object({
    cameraId: z.string().uuid(),
    kind: z.enum(['LIVE_SUB', 'LIVE_MAIN', 'PLAYBACK']),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
  })
  .refine((v) => v.kind !== 'PLAYBACK' || (v.startAt !== undefined && v.endAt !== undefined), {
    message: 'startAt and endAt are required when kind is PLAYBACK',
    path: ['startAt'],
  })
  .refine(
    (v) => !v.startAt || !v.endAt || new Date(v.startAt).getTime() < new Date(v.endAt).getTime(),
    {
      message: 'startAt must be before endAt',
      path: ['endAt'],
    }
  );

export const heartbeatBodySchema = z.object({
  bytesEstimate: z.number().int().min(0).optional(),
});

export const endSessionBodySchema = z.object({
  reason: z.string().max(200).optional(),
});

export const sessionListQuerySchema = z.object({
  cameraId: z.string().uuid().optional(),
});

export const segmentsQuerySchema = z
  .object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    track: z.enum(['MAIN', 'SUB']).optional(),
  })
  .refine((v) => new Date(v.startAt).getTime() < new Date(v.endAt).getTime(), {
    message: 'startAt must be before endAt',
    path: ['endAt'],
  });

export type StartSessionInput = z.infer<typeof startSessionBodySchema>;
export type HeartbeatInput = z.infer<typeof heartbeatBodySchema>;
export type EndSessionInput = z.infer<typeof endSessionBodySchema>;
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;
export type SegmentsQuery = z.infer<typeof segmentsQuerySchema>;
