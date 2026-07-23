import { z } from 'zod';
import { PaginationSchema } from '@aniston-vms/shared';
import { normalizeRtspUrl, InvalidRtspUrlError } from '../../lib/rtsp-url.js';

// Request validation for the cameras API (see camera.router.ts). Camera is the
// leaf of the Region → Zone → Site → Router → Camera hierarchy (prisma.schema.
// Camera model). RTSP fields are accepted here as plaintext and encrypted in
// camera.service.ts (lib/utils/encryption.ts) before being persisted —
// mainRtspHash/subRtspHash (normalized host+port+path, @unique) are derived
// server-side, never accepted from the client.

const cameraStatusEnum = z.enum(['HEALTHY', 'WARNING', 'CRITICAL', 'MAINTENANCE', 'UNKNOWN']);
const playbackAdapterEnum = z.enum(['ONVIF_G', 'HIKVISION', 'DAHUA', 'NONE']);

// An RTSP URL field, validated AND normalized at the trust boundary by the
// canonical lib/rtsp-url so a given URL is stored in exactly one canonical form
// (scheme lowercased, &amp; entity decoded, byte-exact vendor path/query) and
// every downstream consumer — encryption, the @unique dedup hash, MediaMTX
// source resolution, health DESCRIBE — treats it identically. A malformed URL
// is rejected here with a fixed reason that never echoes the URL or its
// credentials back to the client (see InvalidRtspUrlError).
const rtspUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .transform((val, ctx) => {
    try {
      return normalizeRtspUrl(val);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          err instanceof InvalidRtspUrlError
            ? `Not a valid RTSP URL (${err.reason}) — must start with rtsp:// or rtsps://`
            : 'Not a valid RTSP URL',
      });
      return z.NEVER;
    }
  });

export const cameraIdParamsSchema = z.object({
  id: z.string().uuid('Camera id must be a UUID'),
});

export const referenceImageIdParamsSchema = z.object({
  id: z.string().uuid('Camera id must be a UUID'),
  imageId: z.string().uuid('Reference image id must be a UUID'),
});

export const cameraListQuerySchema = PaginationSchema.extend({
  siteId: z.string().uuid().optional(),
  // Filter by the owning zone (camera → site → zone). Lets dashboard zone cards
  // deep-link into a pre-filtered fleet grid via "/cameras?zone=<id>".
  zoneId: z.string().uuid().optional(),
  routerId: z.string().uuid().optional(),
  status: cameraStatusEnum.optional(),
  q: z.string().max(200).trim().optional(),
});

// ── Registration: identity ONLY ──────────────────────────────────────────────
// What you need to add a physical camera to inventory as DRAFT: identity fields
// only. No site/router, no RTSP, no map position — those arrive later via
// configureCameraSchema. This split is the heart of the commissioning redesign.
export const registerCameraSchema = z.object({
  cameraCode: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  firmware: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
});

// ── Configuration: placement + stream config, ALL required ───────────────────
// Saved in a separate step (ConfigureCameraModal). Every field is required so a
// saved config is always complete enough to run a connection test and activate
// (DRAFT → CONFIGURED). RTSP plaintext is TLS-only + encrypted at rest
// (camera.service.ts); mainRtspHash/subRtspHash are derived server-side.
export const configureCameraSchema = z.object({
  siteId: z.string().uuid(),
  routerId: z.string().uuid(),
  // Plaintext in transit over TLS — encrypted at rest, see camera.service.ts.
  // Validated + canonicalized by rtspUrlSchema at the trust boundary.
  mainRtspUrl: rtspUrlSchema,
  subRtspUrl: rtspUrlSchema,
  rtspUsername: z.string().min(1).max(200),
  rtspPassword: z.string().min(1).max(200),
  onvifPort: z.coerce.number().int().min(1).max(65535).optional(),
  playbackAdapter: playbackAdapterEnum.optional(),
  expectedCodec: z.string().min(1).max(50),
  expectedResolution: z.string().min(1).max(50),
  expectedFps: z.coerce.number().int().min(1).max(240),
  expectedBitrateKbps: z.coerce.number().int().min(1).max(1_000_000),
  // CR-6 — the configure step sets the camera's map position (MapLibre pin);
  // Delhi NCR in practice, but any valid WGS-84 pair is fine. Nullable in the DB
  // until placed (DRAFT); required here so a CONFIGURED camera is always placed.
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

// Edit an existing camera — identity and/or config, every field optional. A
// DRAFT camera can be edited freely; editing config does NOT auto-activate
// (that stays an explicit, test-gated action — see camera.service activate).
export const updateCameraSchema = registerCameraSchema
  .merge(configureCameraSchema)
  .partial()
  .extend({
    status: cameraStatusEnum.optional(),
    maintenanceMode: z.boolean().optional(),
    // CR-4 — per-camera snapshot cadence, editable 1–60 min (frontend pairs
    // this with a projected-storage calculator and warns below 15 min).
    snapshotIntervalMinutes: z.coerce.number().int().min(1).max(60).optional(),
  });

export const createReferenceImageSchema = z.object({
  imageBase64: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png']).optional(),
});

export const referenceImageListQuerySchema = PaginationSchema;

// CR-6 — pre-registration "Test connection" from the add-camera modal: an RTSP
// DESCRIBE plus a one-frame ffprobe against the candidate URL. Sim-aware —
// under HEALTH_SIM_MODE the result is synthesized from the injected sim fault
// (health.checkers.ts) so the modal works against the simulated fleet.
export const testCameraConnectionSchema = z.object({
  mainRtspUrl: rtspUrlSchema,
  rtspUsername: z.string().min(1).max(200),
  rtspPassword: z.string().min(1).max(200),
  // Optional — lets the sim path look up an injected fault for this code.
  cameraCode: z.string().min(1).max(50).optional(),
  expectedCodec: z.string().min(1).max(50).optional(),
  expectedResolution: z.string().min(1).max(50).optional(),
  expectedFps: z.coerce.number().int().min(1).max(240).optional(),
  expectedBitrateKbps: z.coerce.number().int().min(1).max(1_000_000).optional(),
});

export type CameraListQuery = z.infer<typeof cameraListQuerySchema>;
export type RegisterCameraInput = z.infer<typeof registerCameraSchema>;
export type ConfigureCameraInput = z.infer<typeof configureCameraSchema>;
export type UpdateCameraInput = z.infer<typeof updateCameraSchema>;
export type CreateReferenceImageInput = z.infer<typeof createReferenceImageSchema>;
export type ReferenceImageListQuery = z.infer<typeof referenceImageListQuerySchema>;
export type TestCameraConnectionInput = z.infer<typeof testCameraConnectionSchema>;
