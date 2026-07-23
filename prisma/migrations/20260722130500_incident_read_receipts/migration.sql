-- CreateTable
CREATE TABLE "incident_read_receipts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_read_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_read_receipts_incident_id_idx" ON "incident_read_receipts"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_read_receipts_user_id_incident_id_key" ON "incident_read_receipts"("user_id", "incident_id");

-- AddForeignKey
ALTER TABLE "incident_read_receipts" ADD CONSTRAINT "incident_read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_read_receipts" ADD CONSTRAINT "incident_read_receipts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
