-- Live Wall HEVC fix — record the ffprobe-measured sub-stream codec so the
-- MediaMTX adapter can make a DETECTION-AUTHORITATIVE transcode decision instead
-- of trusting the operator-declared `expected_codec` (routinely wrong for HEVC).
--
-- Additive + backfill-safe: the column is nullable, so existing rows get NULL.
-- NULL is intentional and fail-safe — `isBrowserPlayableCodec(null)` returns
-- false, so any camera the health probe has not measured yet transcodes to H.264
-- (and plays) rather than shipping a dead HEVC tile. Rows self-heal on the next
-- health run, which writes the detected codec. No data migration required.
--
-- ⚠ NOT YET APPLIED. Hand-authored (no `prisma migrate` was run against any DB).
-- Apply with:
--   npx prisma migrate deploy    (prod)   /   npx prisma migrate dev   (local)

-- AlterTable
ALTER TABLE "cameras" ADD COLUMN "detected_sub_codec" TEXT;
