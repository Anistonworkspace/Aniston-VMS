import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Generic storage adapter. Every module that persists binary artifacts
// (snapshots, clip exports, reference images, report exports) should go through
// `storage` instead of touching `fs`/S3 directly, so STORAGE_DRIVER=s3 can be
// flipped on in prod without any module changes.
//
// Keys are POSIX-style relative paths (e.g. "clips/CAM-001/2026-07-17.mp4") —
// portable between the local disk driver (keys become paths under UPLOAD_DIR)
// and the S3 driver (keys become object keys in S3_BUCKET).
//
// Signed URLs: there is no presigner package installed for the S3 driver, so
// both drivers share one HMAC-signed download route (see modules/files) —
// `signedUrl()` always returns a same-origin `/api/files/download` URL; the
// files router validates the signature then streams bytes through whichever
// driver is active. This mirrors the pattern already used by
// modules/snapshots/snapshot.service.ts (signFileUrl/fileSig).
// ─────────────────────────────────────────────────────────────────────────────

export interface StorageDriver {
  put(key: string, buffer: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function assertSafeKey(key: string): void {
  if (key.includes('..') || path.isAbsolute(key)) {
    throw new Error(`Unsafe storage key: "${key}"`);
  }
}

class LocalStorageDriver implements StorageDriver {
  private absPath(key: string): string {
    assertSafeKey(key);
    return path.resolve(env.UPLOAD_DIR, key);
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const abs = this.absPath(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.absPath(key));
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.absPath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.absPath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.absPath(key));
      return true;
    } catch {
      return false;
    }
  }
}

class S3StorageDriver implements StorageDriver {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, buffer: Buffer, contentType?: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const out = await this.client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!out.Body) return Buffer.alloc(0);
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    assertSafeKey(key);
    const out = await this.client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return out.Body as unknown as NodeJS.ReadableStream;
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.get(key);
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 's3' ? new S3StorageDriver() : new LocalStorageDriver();

logger.info('Storage driver initialized', { driver: env.STORAGE_DRIVER });

// ── Shared HMAC signing for `/api/files/download` (and reused by any module
// that wants a signed link without duplicating crypto code) ───────────────────

function keySig(key: string, exp: number): string {
  return createHmac('sha256', env.JWT_SECRET).update(`${key}.${exp}`).digest('hex');
}

export interface SignedUrlOptions {
  ttlSeconds?: number;
  filename?: string;
  contentType?: string;
}

export function signStorageUrl(key: string, opts: SignedUrlOptions = {}): string {
  const ttl = opts.ttlSeconds ?? env.FILE_SIGNED_URL_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = keySig(key, exp);
  const params = new URLSearchParams({ key, exp: String(exp), sig });
  if (opts.filename) params.set('name', opts.filename);
  if (opts.contentType) params.set('type', opts.contentType);
  return `/api/files/download?${params.toString()}`;
}

export function verifyStorageSignature(key: string, exp: number, sig: string): boolean {
  const expected = keySig(key, exp);
  const valid =
    sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return valid && exp * 1000 >= Date.now();
}
