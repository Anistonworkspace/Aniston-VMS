-- Camera registration / configuration split — introduce a commissioning
-- lifecycle so a physical camera can be added to inventory with IDENTITY ONLY
-- (DRAFT) and have its placement + stream config filled in later (CONFIGURED).
--
-- What this does:
--   1. New enum `CameraProvisioning` (DRAFT | CONFIGURED).
--   2. New column `cameras.provisioning_state` NOT NULL DEFAULT 'DRAFT'.
--   3. Relaxes the 12 stream/placement config columns from NOT NULL → nullable
--      (site_id, router_id, both RTSP URL ciphertexts + their normalized hashes,
--      RTSP username/password ciphertexts, and the four expected_* stream specs),
--      because a DRAFT camera has none of them yet. Presence is now enforced at
--      the CONFIGURED gate in camera.service.ts, NOT by the database.
--   4. Relaxes `latitude`/`longitude` from `NOT NULL DEFAULT 0` → nullable with
--      no default. The old `DEFAULT 0` silently placed unplaced cameras at Null
--      Island (0,0); DRAFT cameras must be genuinely unplaced (NULL) until the
--      map position is configured.
--
-- Backfill (safe): every row that exists PRE-migration was created under the old
-- schema, which required all 12 config columns + lat/lng to be present — i.e. it
-- is already fully configured. So all existing rows are backfilled to
-- 'CONFIGURED'. Only cameras created AFTER this migration start life as DRAFT.
-- The column default stays 'DRAFT' so new inventory rows are correct.
--
-- The FKs cameras_site_id_fkey / cameras_router_id_fkey are unchanged: a nullable
-- FK column keeps ON DELETE RESTRICT ON UPDATE CASCADE and simply skips the check
-- for NULL values, so no constraint is dropped or recreated here.
--
-- ⚠ NOT YET APPLIED. Hand-authored (no `prisma migrate` was run against any DB).
-- Apply with:
--   npx prisma migrate deploy    (prod)   /   npx prisma migrate dev   (local)

-- CreateEnum
CREATE TYPE "CameraProvisioning" AS ENUM ('DRAFT', 'CONFIGURED');

-- AlterTable: add lifecycle column (defaults DRAFT; backfilled below), and relax
-- all identity-independent config columns to nullable.
ALTER TABLE "cameras"
    ADD COLUMN     "provisioning_state" "CameraProvisioning" NOT NULL DEFAULT 'DRAFT',
    ALTER COLUMN "site_id" DROP NOT NULL,
    ALTER COLUMN "router_id" DROP NOT NULL,
    ALTER COLUMN "main_rtsp_url_enc" DROP NOT NULL,
    ALTER COLUMN "sub_rtsp_url_enc" DROP NOT NULL,
    ALTER COLUMN "main_rtsp_hash" DROP NOT NULL,
    ALTER COLUMN "sub_rtsp_hash" DROP NOT NULL,
    ALTER COLUMN "rtsp_username_enc" DROP NOT NULL,
    ALTER COLUMN "rtsp_password_enc" DROP NOT NULL,
    ALTER COLUMN "expected_codec" DROP NOT NULL,
    ALTER COLUMN "expected_resolution" DROP NOT NULL,
    ALTER COLUMN "expected_fps" DROP NOT NULL,
    ALTER COLUMN "expected_bitrate_kbps" DROP NOT NULL,
    ALTER COLUMN "latitude" DROP NOT NULL,
    ALTER COLUMN "latitude" DROP DEFAULT,
    ALTER COLUMN "longitude" DROP NOT NULL,
    ALTER COLUMN "longitude" DROP DEFAULT;

-- Backfill: all pre-existing rows were fully configured under the old schema.
UPDATE "cameras" SET "provisioning_state" = 'CONFIGURED';

-- CreateIndex
CREATE INDEX "cameras_provisioning_state_idx" ON "cameras"("provisioning_state");
