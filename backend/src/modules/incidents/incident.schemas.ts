import { z } from 'zod';

// Stage 4 — request validation for the incident API (see incident.router.ts).

export const incidentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const incidentListQuerySchema = z.object({
  status: z
    .enum([
      'DETECTED',
      'CONFIRMED',
      'ALERTED',
      'ACKNOWLEDGED',
      'ASSIGNED',
      'INVESTIGATING',
      'RESOLVED',
      'RECOVERY_VERIFIED',
      'CLOSED',
    ])
    .optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  zoneId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  // CR-7 — date-range filter for the dense list view. Interpreted against
  // lastDetectedAt: `from` is inclusive start-of-instant, `to` exclusive end.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const assignBodySchema = z.object({
  assignedToId: z.string().uuid(),
});

export const statusBodySchema = z.object({
  status: z.literal('INVESTIGATING'),
});

export const resolveBodySchema = z.object({
  rootCause: z.string().min(3).max(2000),
  resolutionNotes: z.string().min(3).max(4000),
  correctiveAction: z.string().max(2000).optional(),
  spareParts: z.string().max(1000).optional(),
});

export const deliveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
