import crypto from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM with a *versioned* envelope so keys can be rotated without
// re-encrypting existing data. Ciphertext is stamped `v<n>:<base64(iv|tag|ct)>`.
// Decrypt is dual-read: it tries the stamped version first, then every other
// key in the ring. Legacy values written before versioning carried no prefix —
// those are decrypted with the primary key (backward compatible).
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

const KEYRING: Record<string, Buffer> = {
  v1: Buffer.from(env.ENCRYPTION_KEY, 'hex'),
};
if (env.ENCRYPTION_KEY_OLD) {
  KEYRING.v0 = Buffer.from(env.ENCRYPTION_KEY_OLD, 'hex');
}

const ACTIVE_VERSION = env.ENCRYPTION_KEY_ACTIVE; // stamp applied to new writes
// Pre-versioning ciphertext was produced with the single ENCRYPTION_KEY.
const LEGACY_KEY = KEYRING.v1;

const VERSION_RE = /^v\d+$/;

function keyFor(version: string): Buffer {
  const k = KEYRING[version];
  if (!k) throw new Error(`No encryption key configured for version "${version}"`);
  return k;
}

function dedupe(keys: Buffer[]): Buffer[] {
  const seen = new Set<string>();
  const out: Buffer[] = [];
  for (const k of keys) {
    const h = k.toString('base64');
    if (!seen.has(h)) {
      seen.add(h);
      out.push(k);
    }
  }
  return out;
}

export function encrypt(plaintext: string): string {
  const key = keyFor(ACTIVE_VERSION);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ACTIVE_VERSION}:${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}

export function decrypt(payload: string): string {
  let version = '';
  let body = payload;
  const sep = payload.indexOf(':');
  if (sep > 0 && VERSION_RE.test(payload.slice(0, sep))) {
    version = payload.slice(0, sep);
    body = payload.slice(sep + 1);
  }

  const buf = Buffer.from(body, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);

  // Try the stamped version first, then fall back across the whole ring so a
  // key rotation mid-flight never orphans data. GCM auth failure => wrong key.
  const candidates: Buffer[] = [];
  if (version && KEYRING[version]) candidates.push(KEYRING[version]);
  candidates.push(LEGACY_KEY, ...Object.values(KEYRING));

  let lastErr: unknown;
  for (const key of dedupe(candidates)) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('decrypt: authentication failed for all keys');
}
