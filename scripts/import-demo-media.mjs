// ---------------------------------------------------------------------------
// Aniston VMS — demo media importer (hybrid: open-source downloads + offline
// fallback). Populates the local storage driver's UPLOAD_DIR with the exact
// storage keys referenced by prisma/seed.ts (snapshots, thumbnails, reference
// images, one exported clip) so every media surface in the app renders locally.
//
//   node scripts/import-demo-media.mjs
//
// Sources (all free / open licensed):
//   - Images: Lorem Picsum (https://picsum.photos, Unsplash-derived, free to use)
//   - Video:  Big Buck Bunny (c) Blender Foundation, CC-BY 3.0 — 10s/1MB cut
// Offline fallback: a tiny embedded valid JPEG is written instead of downloads
// so signed-URL endpoints still return renderable images without a network.
// No third-party dependencies; Node >= 18 (global fetch).
// ---------------------------------------------------------------------------
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Mirrors backend/src/lib/storage.ts: UPLOAD_DIR defaults to ./uploads relative
// to the backend workspace cwd.
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(repoRoot, 'backend', 'uploads');

// Minimal valid 1x1 baseline JPEG (offline fallback so <img> tags still render).
const FALLBACK_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
    'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
    'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
    'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
    'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEB' +
    'AAA/APn+v//Z',
  'base64'
);

// Snapshot rows seeded in prisma/seed.ts — (cameraNumber, snapshotNumber) pairs.
const SNAPSHOTS = [
  [1, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [4, 6],
  [5, 7],
  [5, 8],
];
const CAMERA_COUNT = 6;
const CLIP_KEY = 'clips/seed-clip-0001.mp4';

const camCode = (n) => `CAM-${String(n).padStart(3, '0')}`;

/** Download → Buffer, or null on any failure (offline-tolerant). */
async function fetchBuffer(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeKey(key, buffer) {
  const abs = path.join(uploadDir, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
}

async function exists(key) {
  try {
    await access(path.join(uploadDir, key));
    return true;
  } catch {
    return false;
  }
}

async function importImage(key, seed, w, h, stats) {
  if (await exists(key)) {
    stats.skipped += 1;
    return;
  }
  const buf = await fetchBuffer(`https://picsum.photos/seed/${seed}/${w}/${h}.jpg`);
  if (buf) {
    await writeKey(key, buf);
    stats.downloaded += 1;
  } else {
    await writeKey(key, FALLBACK_JPEG);
    stats.fallback += 1;
  }
}

async function main() {
  console.info(`[demo-media] target: ${uploadDir}`);
  const stats = { downloaded: 0, fallback: 0, skipped: 0 };

  // 1. Snapshot originals + thumbnails (keys must match prisma/seed.ts).
  for (const [cam, n] of SNAPSHOTS) {
    const dir = `snapshots/${camCode(cam)}`;
    await importImage(`${dir}/seed-${n}.jpg`, `aniston-snap-${n}`, 1280, 720, stats);
    await importImage(`${dir}/seed-${n}-thumb.jpg`, `aniston-snap-${n}`, 320, 180, stats);
  }

  // 2. Approved reference images, one per camera.
  for (let cam = 1; cam <= CAMERA_COUNT; cam += 1) {
    await importImage(
      `reference-images/${camCode(cam)}/seed-ref.jpg`,
      `aniston-ref-${cam}`,
      1280,
      720,
      stats
    );
  }

  // 3. One completed clip export (open-source Big Buck Bunny, 10s H.264 cut).
  if (await exists(CLIP_KEY)) {
    stats.skipped += 1;
  } else {
    const video =
      (await fetchBuffer(
        'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4'
      )) ??
      (await fetchBuffer(
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
      ));
    if (video) {
      await writeKey(CLIP_KEY, video);
      stats.downloaded += 1;
    } else {
      console.warn(
        '[demo-media] WARNING: could not download demo clip (offline?). ' +
          `The DONE clip export will 404 on download until ${CLIP_KEY} exists. ` +
          'Re-run this script with network access to fix.'
      );
    }
  }

  console.info(
    `[demo-media] done — downloaded ${stats.downloaded}, ` +
      `fallback ${stats.fallback}, already present ${stats.skipped}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
