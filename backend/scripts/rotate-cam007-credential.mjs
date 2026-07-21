#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-off ops script: rotate CAM-007's RTSP credential inside the VMS AFTER the
// password has been changed ON THE PHYSICAL CAMERA DEVICE.
//
// Why it touches 5 fields: the RTSP password is embedded inside the main & sub
// RTSP URLs (…admin:<pw>@… and …_password=<pw>_…), and the two url hashes are
// derived from the (password-bearing) normalized URL. So a correct rotation must
// re-encrypt rtspPassword + main/sub URLs AND recompute main/sub hashes.
//
// Crypto is a byte-for-byte port of backend/src/utils/encryption.ts
// (AES-256-GCM, versioned envelope `v<n>:<base64(iv|tag|ct)>`, IV=12, TAG=16),
// so the values it writes decrypt with the exact same keyring the app uses.
//
// SAFETY: dry-run by DEFAULT (writes nothing). Pass --apply to commit.
// The new password is read from env NEW_CAM007_PASSWORD — never hardcode it.
//
// RUN INSIDE THE BACKEND CONTAINER so ENCRYPTION_KEY + DATABASE_URL already
// match the app of record:
//
//   docker cp backend/scripts/rotate-cam007-credential.mjs \
//     aniston_vms_backend:/app/rotate-cam007-credential.mjs
//
//   # 1) dry-run — shows the plan + proves round-trip, writes nothing:
//   docker exec -e NEW_CAM007_PASSWORD='<new-device-password>' \
//     aniston_vms_backend node /app/rotate-cam007-credential.mjs
//
//   # 2) apply — commits + verifies from the DB:
//   docker exec -e NEW_CAM007_PASSWORD='<new-device-password>' \
//     aniston_vms_backend node /app/rotate-cam007-credential.mjs --apply
//
// ORDER MATTERS: change the password on the camera FIRST, then run --apply. If
// the VMS is updated before the device, streams break until the device matches.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION_RE = /^v\d+$/;

const CAMERA_CODE = process.env.CAM_CODE || 'CAM-007';
const OLD = process.env.OLD_CAM007_PASSWORD || 'tlJwpbo6'; // the exposed value
const NEW = process.env.NEW_CAM007_PASSWORD || '';
const ACTIVE = process.env.ENCRYPTION_KEY_ACTIVE || 'v1'; // app default when unset
const APPLY = process.argv.includes('--apply');
const ALLOW_SPECIAL = process.argv.includes('--allow-special-chars');

function fail(msg) {
  console.error(`\n[ABORT] ${msg}\n`);
  process.exit(1);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const mask = (s) =>
  !s ? '(empty)' : s.length <= 2 ? '**' : s[0] + '*'.repeat(Math.max(1, s.length - 2)) + s[s.length - 1];
const maskUrl = (u) => u.split(OLD).join('«OLD-PW»').split(NEW).join('«NEW-PW»');

if (!process.env.ENCRYPTION_KEY) fail('ENCRYPTION_KEY not set in this environment.');
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
if (KEY.length !== 32) fail(`ENCRYPTION_KEY must be 32 bytes of hex (got ${KEY.length} bytes).`);
const KEY_OLD = process.env.ENCRYPTION_KEY_OLD ? Buffer.from(process.env.ENCRYPTION_KEY_OLD, 'hex') : null;

if (!NEW) fail('NEW_CAM007_PASSWORD not set — set it to the password you applied on the camera device.');
if (NEW === OLD) fail('NEW password equals the OLD (exposed) password — nothing would be rotated.');
if (!ALLOW_SPECIAL && /[@:/?#&%\s]/.test(NEW)) {
  fail(
    'NEW password contains URL-reserved chars (@ : / ? # & %) or whitespace. It would need ' +
      'percent-encoding inside the RTSP URL. Use an alphanumeric password, or re-run with ' +
      '--allow-special-chars only if you have confirmed the device accepts it AND the URL form is correct.',
  );
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${ACTIVE}:${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}
function decrypt(payload) {
  let body = payload;
  const sep = payload.indexOf(':');
  if (sep > 0 && VERSION_RE.test(payload.slice(0, sep))) body = payload.slice(sep + 1);
  const buf = Buffer.from(body, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  let last;
  for (const k of KEY_OLD ? [KEY, KEY_OLD] : [KEY]) {
    try {
      const d = crypto.createDecipheriv(ALGO, k, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('decrypt: authentication failed for all keys');
}
function normalizeRtspUrl(raw) {
  try {
    const u = new URL(raw);
    return `${u.hostname.toLowerCase()}:${u.port || '554'}${u.pathname || '/'}`;
  } catch {
    return raw;
  }
}
const hashRtspUrl = (raw) => crypto.createHash('sha256').update(normalizeRtspUrl(raw)).digest('hex');

const prisma = new PrismaClient();
try {
  const cam = await prisma.camera.findUnique({ where: { cameraCode: CAMERA_CODE } });
  if (!cam) fail(`Camera ${CAMERA_CODE} not found in this database.`);

  const curMain = decrypt(cam.mainRtspUrlEncrypted);
  const curSub = decrypt(cam.subRtspUrlEncrypted);
  const curPass = decrypt(cam.rtspPasswordEncrypted);

  if (curPass !== OLD) {
    fail(
      `Stored password does not match OLD_CAM007_PASSWORD (stored looks like '${mask(curPass)}'). ` +
        `Set OLD_CAM007_PASSWORD to the value currently stored, or verify you are on the right DB.`,
    );
  }
  const nMain = curMain.split(OLD).length - 1;
  const nSub = curSub.split(OLD).length - 1;
  if (nMain === 0 || nSub === 0) {
    fail(`OLD password not found inside the stored main/sub URL — refusing to guess (main=${nMain}, sub=${nSub}).`);
  }

  const newMain = curMain.split(OLD).join(NEW);
  const newSub = curSub.split(OLD).join(NEW);
  if (newMain.includes(OLD) || newSub.includes(OLD)) fail('OLD password still present after replacement — aborting.');

  const update = {
    rtspPasswordEncrypted: encrypt(NEW),
    mainRtspUrlEncrypted: encrypt(newMain),
    subRtspUrlEncrypted: encrypt(newSub),
    mainRtspHash: hashRtspUrl(newMain),
    subRtspHash: hashRtspUrl(newSub),
  };

  console.log('\n=== CAM-007 credential rotation plan ===');
  console.log(`camera:              ${CAMERA_CODE} (id=${cam.id})`);
  console.log(`old password:        ${mask(OLD)}    new password: ${mask(NEW)}`);
  console.log(`main url (masked):   ${maskUrl(newMain)}`);
  console.log(`sub  url (masked):   ${maskUrl(newSub)}`);
  console.log(`main hash old→new:   ${cam.mainRtspHash.slice(0, 12)}… → ${update.mainRtspHash.slice(0, 12)}…`);
  console.log(`sub  hash old→new:   ${cam.subRtspHash.slice(0, 12)}… → ${update.subRtspHash.slice(0, 12)}…`);
  console.log(`password blob:       ${update.rtspPasswordEncrypted.slice(0, 16)}…`);

  if (!APPLY) {
    if (decrypt(update.rtspPasswordEncrypted) !== NEW) fail('round-trip check failed (password blob).');
    if (decrypt(update.mainRtspUrlEncrypted) !== newMain) fail('round-trip check failed (main url blob).');
    if (decrypt(update.subRtspUrlEncrypted) !== newSub) fail('round-trip check failed (sub url blob).');
    console.log('\n[DRY-RUN] freshly-encrypted values round-trip-decrypt cleanly — envelope is correct.');
    console.log('[DRY-RUN] nothing written. Re-run with --apply to commit.\n');
    process.exit(0);
  }

  await prisma.camera.update({ where: { id: cam.id }, data: update });

  const after = await prisma.camera.findUnique({ where: { id: cam.id } });
  const ok =
    decrypt(after.rtspPasswordEncrypted) === NEW &&
    decrypt(after.mainRtspUrlEncrypted) === newMain &&
    decrypt(after.subRtspUrlEncrypted) === newSub &&
    !decrypt(after.mainRtspUrlEncrypted).includes(OLD) &&
    !decrypt(after.subRtspUrlEncrypted).includes(OLD) &&
    after.mainRtspHash === hashRtspUrl(newMain) &&
    after.subRtspHash === hashRtspUrl(newSub);
  if (!ok) fail('post-write verification FAILED — inspect the cameras row before trusting playback.');

  console.log('\n[APPLIED] CAM-007 credential rotated and verified against the DB.');
  console.log('• New Live Wall / transcode sessions pick up the new creds automatically (backend reads+decrypts at publish time).');
  console.log('• To flush an already-running transcode, stop the CAM-007 mediamtx path — the next viewer republishes with fresh creds.\n');
} finally {
  await prisma.$disconnect();
}
