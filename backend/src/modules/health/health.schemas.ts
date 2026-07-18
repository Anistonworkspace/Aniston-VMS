import { z } from 'zod';

export const cameraIdParamsSchema = z.object({
  id: z.string().uuid('Camera id must be a UUID'),
});

export const checksQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
  checkType: z
    .enum([
      'ROUTER_TCP',
      'RTSP_PORT',
      'RTSP_AUTH',
      'VIDEO_VALIDATION',
      'SNAPSHOT',
      'IMAGE_ANALYSIS',
      'SD_HEALTH',
    ])
    .optional(),
});

export const qualityQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
});
