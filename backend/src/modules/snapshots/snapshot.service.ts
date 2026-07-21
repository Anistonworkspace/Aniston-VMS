import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Camera, Prisma, Snapshot, SnapshotKind } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { canAccessCamera, getUserScope } from '../../lib/scope.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { captureFrameFromCamera, generateSyntheticFrame } from './frame-capture.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 snapshot engine (docs/06-implementation-plan.md):
//   • 15-min SUB + hourly EVIDENCE captures → S3-style key layout on local disk
//     (UPLOAD_DIR stands in for the bucket in dev; keys stay portable to S3).
//   • Metadata row per capture with image-quality scores (sim analysis v1;
//     Stage 5 swaps in the OpenCV service under the same analysisResult shape).
//   • Retention: originals 90 d → thumbs 1 y → incident-linked 3 y (short TTLs
//     via SNAPSHOT_*_RETENTION_DAYS in dev).
//   • Files are served through HMAC-signed URLs only — no public paths.
// ─────────────────────────────────────────────────────────────────────────────

// Analysis-scores version tag. The image-quality scores below are still a
// simulated analytics layer (Stage 5 swaps in OpenCV); the IMAGE itself is now
// captured for real via ./frame-capture.
const ANALYSIS_VERSION = 'sim-1.0';

/** Deterministic [0,1) pseudo-random from a seed string (stable across runs). */
function rand(seed: string): number {
  return createHash('sha256').update(seed).digest().readUInt32BE(0) / 0xffffffff;
}

export interface SimScores {
  brightnessScore: number;
  blurScore: number;
  freezeScore: number;
  obstructionScore: number;
  sceneShiftScore: number;
  dustScore: number;
  noiseScore: number;
  colorCastScore: number;
}

// Sim analysis: plausible baseline scores with per-capture jitter, a slowly
// rising per-camera dust cycle (~30 days, offset per camera) so Stage 5
// analytics have a trend to show, and degraded values when the health engine
// has already diagnosed an image/stream problem.
function computeScores(camera: Camera, at: Date): SimScores {
  const j = (salt: string): number => rand(`${camera.id}:${at.toISOString()}:${salt}`);
  const dayIndex = Math.floor(at.getTime() / 86_400_000);
  const dustOffset = rand(`${camera.id}:dust-offset`);
  const dustPhase = ((dayIndex % 30) / 30 + dustOffset) % 1;
  const scores: SimScores = {
    brightnessScore: 0.45 + (j('bright') - 0.5) * 0.2,
    blurScore: 0.05 + j('blur') * 0.1,
    freezeScore: 0,
    obstructionScore: j('obstruction') * 0.03,
    sceneShiftScore: j('scene') * 0.04,
    dustScore: Math.min(1, 0.03 + dustPhase * 0.8 + j('dust') * 0.05),
    noiseScore: 0.05 + j('noise') * 0.1,
    colorCastScore: j('cast') * 0.06,
  };
  if (camera.diagnosis === 'IMAGE_PROBLEM') {
    scores.brightnessScore = 0.04; // black frame
    scores.noiseScore = Math.min(1, scores.noiseScore + 0.3);
  } else if (camera.diagnosis === 'STREAM_DEGRADED') {
    scores.blurScore = Math.min(1, scores.blurScore + 0.45);
    scores.freezeScore = 0.3 + j('freeze') * 0.2;
  }
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return Object.fromEntries(
    Object.entries(scores).map(([k, v]) => [k, round(v)])
  ) as unknown as SimScores;
}

// Cameras the health engine currently sees as unreachable produce no snapshot —
// the grid gap is the honest signal (and what the accept criteria expect).
const UNREACHABLE = new Set(['SITE_INTERNET_DOWN', 'SIM_SIGNAL_ISSUE', 'CAMERA_OFFLINE']);

function keyFor(cameraId: string, at: Date, kind: SnapshotKind, thumb: boolean): string {
  const iso = at.toISOString();
  const day = iso.slice(0, 10);
  const hms = iso.slice(11, 19).replaceAll(':', '');
  return `snapshots/${cameraId}/${day}/${kind.toLowerCase()}/${hms}${thumb ? '_thumb' : ''}.jpg`;
}

function absPath(key: string): string {
  return path.resolve(env.UPLOAD_DIR, key);
}

async function removeFile(key: string): Promise<boolean> {
  try {
    await fs.rm(absPath(key));
    return true;
  } catch {
    return false; // already gone — retention is idempotent
  }
}

// ── Capture ──────────────────────────────────────────────────────────────────

export async function captureSnapshot(
  camera: Camera,
  kind: SnapshotKind,
  at: Date = new Date()
): Promise<Snapshot | null> {
  if (camera.diagnosis !== null && UNREACHABLE.has(camera.diagnosis)) return null;

  const scores = computeScores(camera, at);
  const originalKey = keyFor(camera.id, at, kind, false);
  const thumbnailKey = keyFor(camera.id, at, kind, true);

  // Produce the actual image FIRST. captureFrameFromCamera throws
  // SnapshotCaptureError on any capture/validation failure — before any file or
  // DB write — so a failed grab surfaces as an honest error and leaves NO
  // snapshot row and NO lastSnapshotAt update behind (no fake-success record).
  const frame = env.SNAPSHOT_SIM_MODE
    ? generateSyntheticFrame(camera, kind, at)
    : await captureFrameFromCamera(camera);

  await fs.mkdir(path.dirname(absPath(originalKey)), { recursive: true });
  await fs.writeFile(absPath(originalKey), frame.original);
  await fs.writeFile(absPath(thumbnailKey), frame.thumbnail);

  const snapshot = await prisma.snapshot.create({
    data: {
      cameraId: camera.id,
      capturedAt: at,
      kind,
      originalKey,
      thumbnailKey,
      ...scores,
      analysisResult: { ...scores, simulated: true } as Prisma.InputJsonObject,
      analysisVersion: ANALYSIS_VERSION,
    },
  });
  await prisma.camera.update({ where: { id: camera.id }, data: { lastSnapshotAt: at } });
  return snapshot;
}

export interface CaptureSweepResult {
  kind: SnapshotKind;
  captured: number;
  skipped: number;
  failed: number;
}

export async function captureAll(
  kind: SnapshotKind,
  at: Date = new Date()
): Promise<CaptureSweepResult> {
  const cameras = await prisma.camera.findMany({ where: { maintenanceMode: false } });
  const result: CaptureSweepResult = { kind, captured: 0, skipped: 0, failed: 0 };
  for (const camera of cameras) {
    try {
      const snap = await captureSnapshot(camera, kind, at);
      if (snap) result.captured += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      logger.error('Snapshot capture failed', { cameraId: camera.id, error: String(err) });
    }
  }
  return result;
}

// ── Signed URLs (plan: snapshot strip uses signed URLs only) ────────────────

function fileSig(snapshotId: string, variant: string, exp: number): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(`${snapshotId}.${variant}.${exp}`)
    .digest('hex');
}

export function signFileUrl(snapshotId: string, variant: 'orig' | 'thumb'): string {
  const exp = Math.floor(Date.now() / 1000) + env.SNAPSHOT_URL_TTL_SECONDS;
  return `/api/snapshots/${snapshotId}/file?v=${variant}&exp=${exp}&sig=${fileSig(snapshotId, variant, exp)}`;
}

export async function getSnapshotFile(
  snapshotId: string,
  variant: 'orig' | 'thumb',
  exp: number,
  sig: string
): Promise<string> {
  const expected = fileSig(snapshotId, variant, exp);
  const valid =
    sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid || exp * 1000 < Date.now()) {
    throw new ForbiddenError('Invalid or expired snapshot link');
  }
  const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new NotFoundError('Snapshot not found');
  const file = absPath(variant === 'orig' ? snapshot.originalKey : snapshot.thumbnailKey);
  try {
    await fs.access(file);
  } catch {
    throw new NotFoundError('Snapshot file has been pruned by retention');
  }
  return file;
}

// ── Read APIs ────────────────────────────────────────────────────────────────

export interface SnapshotDto extends SimScores {
  id: string;
  cameraId: string;
  capturedAt: Date;
  kind: SnapshotKind;
  thumbUrl: string;
  originalUrl: string;
}

function toDto(s: Snapshot): SnapshotDto {
  return {
    id: s.id,
    cameraId: s.cameraId,
    capturedAt: s.capturedAt,
    kind: s.kind,
    brightnessScore: s.brightnessScore,
    blurScore: s.blurScore,
    freezeScore: s.freezeScore,
    obstructionScore: s.obstructionScore,
    sceneShiftScore: s.sceneShiftScore,
    dustScore: s.dustScore,
    noiseScore: s.noiseScore,
    colorCastScore: s.colorCastScore,
    thumbUrl: signFileUrl(s.id, 'thumb'),
    originalUrl: signFileUrl(s.id, 'orig'),
  };
}

async function requireCamera(userId: string, cameraId: string): Promise<Camera> {
  const scope = await getUserScope(userId);
  if (!(await canAccessCamera(scope, cameraId))) throw new NotFoundError('Camera not found');
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new NotFoundError('Camera not found');
  return camera;
}

export async function listSnapshots(
  userId: string,
  cameraId: string,
  hours: number,
  kind: SnapshotKind | undefined,
  limit: number
): Promise<SnapshotDto[]> {
  await requireCamera(userId, cameraId);
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.snapshot.findMany({
    where: { cameraId, capturedAt: { gte: since }, ...(kind ? { kind } : {}) },
    orderBy: { capturedAt: 'desc' },
    take: limit,
  });
  return rows.map(toDto);
}

export interface SnapshotGridSlot {
  hour: number;
  snapshot: SnapshotDto | null;
}

export interface SnapshotGrid {
  date: string;
  cameraId: string;
  filled: number;
  slots: SnapshotGridSlot[];
}

/** Hourly evidence grid for one UTC day (accept: "hourly grid fills"). */
export async function getSnapshotGrid(
  userId: string,
  cameraId: string,
  date?: string
): Promise<SnapshotGrid> {
  await requireCamera(userId, cameraId);
  const day = date ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new ValidationError('Invalid date');
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await prisma.snapshot.findMany({
    where: { cameraId, capturedAt: { gte: start, lt: end } },
    orderBy: { capturedAt: 'asc' },
  });
  const slots: SnapshotGridSlot[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    snapshot: null,
  }));
  for (const row of rows) {
    const slot = slots[row.capturedAt.getUTCHours()];
    if (!slot) continue;
    // Prefer the hourly EVIDENCE frame; fall back to the first SUB capture.
    if (slot.snapshot === null || (slot.snapshot.kind !== 'EVIDENCE' && row.kind === 'EVIDENCE')) {
      slot.snapshot = toDto(row);
    }
  }
  return {
    date: day,
    cameraId,
    filled: slots.filter((s) => s.snapshot !== null).length,
    slots,
  };
}

export async function captureNow(userId: string, cameraId: string): Promise<SnapshotDto> {
  const camera = await requireCamera(userId, cameraId);
  const snapshot = await captureSnapshot(camera, 'SUB');
  if (!snapshot) {
    throw new ValidationError('Camera is unreachable — snapshot skipped');
  }
  return toDto(snapshot);
}

// ── Retention (originals 90 d / thumbs 1 y / incident-linked 3 y) ───────────

export interface PruneResult {
  deletedRows: number;
  prunedOriginals: number;
}

export async function pruneSnapshots(now: Date = new Date()): Promise<PruneResult> {
  const dayMs = 86_400_000;
  const originalCutoff = new Date(now.getTime() - env.SNAPSHOT_RETENTION_DAYS * dayMs);
  const thumbCutoff = new Date(now.getTime() - env.SNAPSHOT_THUMB_RETENTION_DAYS * dayMs);
  const incidentCutoff = new Date(now.getTime() - env.SNAPSHOT_INCIDENT_RETENTION_DAYS * dayMs);

  // Incident evidence and maintenance before/after frames are protected.
  const unlinked: Prisma.SnapshotWhereInput = {
    incidentsAsPrevious: { none: {} },
    incidentsAsFault: { none: {} },
    maintenanceTasksAsBefore: { none: {} },
    maintenanceTasksAsAfter: { none: {} },
  };

  // 1) Rows past thumb retention (or past incident retention even when linked):
  //    remove rows and both files.
  const dead = await prisma.snapshot.findMany({
    where: {
      OR: [
        { AND: [{ capturedAt: { lt: thumbCutoff } }, unlinked] },
        { capturedAt: { lt: incidentCutoff } },
      ],
    },
    select: { id: true, originalKey: true, thumbnailKey: true },
  });
  for (const s of dead) {
    await removeFile(s.originalKey);
    await removeFile(s.thumbnailKey);
  }
  if (dead.length > 0) {
    await prisma.snapshot.deleteMany({ where: { id: { in: dead.map((s) => s.id) } } });
  }

  // 2) Unlinked originals past original retention: drop the full-res file only;
  //    the row + thumbnail survive until thumb retention.
  const stale = await prisma.snapshot.findMany({
    where: { AND: [{ capturedAt: { lt: originalCutoff, gte: thumbCutoff } }, unlinked] },
    select: { originalKey: true },
  });
  let prunedOriginals = 0;
  for (const s of stale) {
    if (await removeFile(s.originalKey)) prunedOriginals += 1;
  }

  const result = { deletedRows: dead.length, prunedOriginals };
  logger.info('Snapshot retention pass complete', { ...result });
  return result;
}
