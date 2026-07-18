import { z } from 'zod';
import { PaginationSchema } from '@aniston-vms/shared';

// Request validation for the cameras API (see camera.router.ts). Camera is the
// leaf of the Region → Zone → Site → Router → Camera hierarchy (prisma.schema.
// Camera model). RTSP fields are accepted here as plaintext and encrypted in
// camera.service.ts (lib/utils/encryption.ts) before being persisted —
// mainRtspHash/subRtspHash (normalized host+port+path, @unique) are derived
// server-side, never accepted from the client.

const cameraStatusEnum = z.enum(['HEALTHY', 'WARNING', 'CRITICAL', 'MAINTENANCE', 'UNKNOWN']);
const playbackAdapterEnum = z.enum(['ONVIF_G', 'HIKVISION', 'DAHUA', 'NONE']);

export const cameraIdParamsSchema = z.object({
  id: z.string().uuid('Camera id must be a UUID'),
});

export const referenceImageIdParamsSchema = z.object({
  id: z.string().uuid('Camera id must be a UUID'),
  imageId: z.string().uuid('Reference image id must be a UUID'),
});

export const cameraListQuerySchema = PaginationSchema.extend({
  siteId: z.string().uuid().optional(),
  routerId: z.string().uuid().optional(),
  status: cameraStatusEnum.optional(),
  q: z.string().max(200).trim().optional(),
});

export const createCameraSchema = z.object({
  siteId: z.string().uuid(),
  routerId: z.string().uuid(),
  cameraCode: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  firmware: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  // Plaintext in transit over TLS — encrypted at rest, see camera.service.ts.
  mainRtspUrl: z.string().min(1).max(500),
  subRtspUrl: z.string().min(1).max(500),
  rtspUsername: z.string().min(1).max(200),
  rtspPassword: z.string().min(1).max(200),
  onvifPort: z.coerce.number().int().min(1).max(65535).optional(),
  playbackAdapter: playbackAdapterEnum.optional(),
  expectedCodec: z.string().min(1).max(50),
  expectedResolution: z.string().min(1).max(50),
  expectedFps: z.coerce.number().int().min(1).max(240),
  expectedBitrateKbps: z.coerce.number().int().min(1).max(1_000_000),
  status: cameraStatusEnum.optional(),
});

export const updateCameraSchema = createCameraSchema.partial().extend({
  maintenanceMode: z.boolean().optional(),
});

export const createReferenceImageSchema = z.object({
  imageBase64: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png']).optional(),
});

export const referenceImageListQuerySchema = PaginationSchema;

export type CameraListQuery = z.infer<typeof cameraListQuerySchema>;
export type CreateCameraInput = z.infer<typeof createCameraSchema>;
export type UpdateCameraInput = z.infer<typeof updateCameraSchema>;
export type CreateReferenceImageInput = z.infer<typeof createReferenceImageSchema>;
export type ReferenceImageListQuery = z.infer<typeof referenceImageListQuerySchema>;
