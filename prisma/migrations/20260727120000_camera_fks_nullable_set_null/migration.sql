-- Camera hard-delete support: make every child camera_id nullable and flip its
-- foreign key from ON DELETE RESTRICT to ON DELETE SET NULL, so removing a camera
-- never fails and never deletes historical rows (incidents, recordings, snapshots,
-- health records, etc.) — the FK is simply nulled and the history is retained.
--
-- incidents and maintenance_windows are intentionally omitted: their camera_id is
-- already nullable with ON DELETE SET NULL (see the init migration).
--
-- NOTE: health_checks is PARTITION BY RANGE (started_at). ALTER COLUMN ... DROP NOT
-- NULL and DROP/ADD CONSTRAINT propagate from the partitioned parent to all
-- partitions, so no per-partition statements are required.

-- AlterTable: drop NOT NULL on camera_id
ALTER TABLE "reference_images" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "health_checks" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "connection_quality_hourly" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "snapshots" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "sd_card_status" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "recording_segments" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "maintenance_tasks" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "stream_sessions" ALTER COLUMN "camera_id" DROP NOT NULL;
ALTER TABLE "clip_exports" ALTER COLUMN "camera_id" DROP NOT NULL;

-- DropForeignKey: remove the old ON DELETE RESTRICT constraints
ALTER TABLE "reference_images" DROP CONSTRAINT "reference_images_camera_id_fkey";
ALTER TABLE "health_checks" DROP CONSTRAINT "health_checks_camera_id_fkey";
ALTER TABLE "connection_quality_hourly" DROP CONSTRAINT "connection_quality_hourly_camera_id_fkey";
ALTER TABLE "snapshots" DROP CONSTRAINT "snapshots_camera_id_fkey";
ALTER TABLE "sd_card_status" DROP CONSTRAINT "sd_card_status_camera_id_fkey";
ALTER TABLE "recording_segments" DROP CONSTRAINT "recording_segments_camera_id_fkey";
ALTER TABLE "maintenance_tasks" DROP CONSTRAINT "maintenance_tasks_camera_id_fkey";
ALTER TABLE "stream_sessions" DROP CONSTRAINT "stream_sessions_camera_id_fkey";
ALTER TABLE "clip_exports" DROP CONSTRAINT "clip_exports_camera_id_fkey";

-- AddForeignKey: re-add with ON DELETE SET NULL
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connection_quality_hourly" ADD CONSTRAINT "connection_quality_hourly_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sd_card_status" ADD CONSTRAINT "sd_card_status_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recording_segments" ADD CONSTRAINT "recording_segments_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clip_exports" ADD CONSTRAINT "clip_exports_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
