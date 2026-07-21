import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Short-lived, path-bound HMAC tokens for browser-facing media (HLS/WebRTC).
//
// Live/playback URLs handed to the browser are same-origin `/media/*` paths (see
// modules/playback/mediamtx.adapter.buildStreamEndpoints). MediaMTX is never
// exposed directly: the reverse proxy (nginx auth_request / MediaMTX
// authHTTPAddress) authorizes every media request via GET /api/media/authorize,
// which calls verifyMediaToken() below.
//
// The signature binds the EXACT mediamtxPath + expiry, so a client cannot swap
// the camera/path identifier to reach an unauthorized stream — the HMAC fails.
// Mirrors the storage-URL signer (lib/storage.ts keySig/verifyStorageSignature).
// Never log the token, the signing key, or any camera credential.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dedicated media-signing key. Falls back to JWT_SECRET only outside production;
 * production REQUIRES MEDIA_URL_SIGNING_SECRET (enforced in config/env.ts), so a
 * media-URL key never shares a compromise domain with the JWT-signing key.
 */
function mediaKey(): string {
  return env.MEDIA_URL_SIGNING_SECRET ?? env.JWT_SECRET;
}

function pathSig(mediamtxPath: string, exp: number): string {
  return createHmac('sha256', mediaKey()).update(`${mediamtxPath}.${exp}`).digest('hex');
}

export interface MediaToken {
  /** Unix seconds at which the token expires. */
  exp: number;
  /** Hex HMAC-SHA256 over `${mediamtxPath}.${exp}`. */
  sig: string;
}

/** Sign a mediamtxPath for `ttlSeconds` (default env.PLAYBACK_URL_TTL_SECONDS). */
export function signMediaPath(
  mediamtxPath: string,
  ttlSeconds: number = env.PLAYBACK_URL_TTL_SECONDS
): MediaToken {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: pathSig(mediamtxPath, exp) };
}

/** Constant-time verify of a media token bound to `mediamtxPath` (incl. expiry). */
export function verifyMediaToken(mediamtxPath: string, exp: number, sig: string): boolean {
  if (!Number.isInteger(exp) || typeof sig !== 'string' || sig.length === 0) return false;
  const expected = pathSig(mediamtxPath, exp);
  const valid =
    sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return valid && exp * 1000 >= Date.now();
}
