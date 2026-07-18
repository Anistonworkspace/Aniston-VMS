import { Router } from 'express';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { storage, verifyStorageSignature } from '../../lib/storage.js';
import { signedDownloadQuerySchema } from './files.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Generic signed-URL file service (mounted at /api, PUBLIC — no requireAuth):
//   GET /files/download?key&exp&sig[&name][&type]
//
// Any module that persists a binary artifact via lib/storage.ts hands the
// caller a URL from `signStorageUrl()` instead of exposing storage keys or
// requiring a Bearer token on download (browsers can't attach one to a plain
// <a href>/<img src>). This must be mounted BEFORE any router-level
// requireAuth middleware — see app.ts comment near snapshotFileRouter.
// ─────────────────────────────────────────────────────────────────────────────

export const filesRouter = Router();

filesRouter.get(
  '/files/download',
  validateRequest({ query: signedDownloadQuerySchema }),
  asyncHandler(async (req, res) => {
    const { key, exp, sig, name, type } = req.query as unknown as {
      key: string;
      exp: number;
      sig: string;
      name?: string;
      type?: string;
    };
    if (!verifyStorageSignature(key, exp, sig)) {
      throw new ValidationError('Invalid or expired download link');
    }
    if (!(await storage.exists(key))) {
      throw new NotFoundError('File not found');
    }
    res.setHeader('Content-Type', type ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=60');
    if (name) {
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/["\\]/g, '')}"`);
    }
    const stream = await storage.getStream(key);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404);
      res.end();
    });
    stream.pipe(res);
  })
);
