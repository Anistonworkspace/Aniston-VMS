import { z } from 'zod';

// Query params for the generic signed-URL download route. `sig` only ever
// covers `key`+`exp` (see lib/storage.ts signStorageUrl/verifyStorageSignature);
// `name`/`type` are cosmetic response headers, not part of the trust boundary.
export const signedDownloadQuerySchema = z.object({
  key: z.string().min(1),
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(32),
  name: z.string().optional(),
  type: z.string().optional(),
});

export type SignedDownloadQuery = z.infer<typeof signedDownloadQuerySchema>;
