# Aniston VMS — Backups & Operations Runbook (CR-12)

> Companion docs: `SOP-Fresher-Guide.md` (root), `docs/architecture.md`,
> `docs/02-TRD.md` §6 (incident rule matrix), `scripts/drills/run-drills.mjs`
> (20-scenario failure drills). This runbook covers **backups/restore,
> observability, worker operations and disaster recovery** for the Docker
> fullstack deployment (`docker/docker-compose.fullstack.yml`).

Container names: `aniston_vms_postgres`, `aniston_vms_redis`,
`aniston_vms_backend`, `aniston_vms_frontend`, `aniston_vms_mediamtx`.

---

## 1. What holds state

| Store | What lives there | Backing |
| --- | --- | --- |
| PostgreSQL (`postgres_data` volume) | All relational data — hierarchy, cameras, incidents, snapshots metadata, users/RBAC, settings, audit log | `pg_dump` (below) |
| Uploads dir / S3 bucket | Snapshot JPEGs, evidence frames, clip exports, backup ZIPs, report outbox | `STORAGE_DRIVER=local` → backend `./uploads`; `s3` → bucket `aniston-vms` |
| Redis (`redis_data` volume) | Ephemeral: BullMQ queues, heartbeats, sim-fault keys | **Not backed up** — safe to lose; workers re-register on boot |

## 2. Database backup / restore

Nightly logical backup (run from repo root; keep ≥ 30 dailies + 12 monthlies):

```powershell
# Backup → backups/db/aniston_vms-<date>.sql.gz
docker exec aniston_vms_postgres pg_dump -U postgres -d aniston_vms |
  gzip > "backups/db/aniston_vms-$(Get-Date -Format yyyy-MM-dd).sql.gz"
```

Restore (stack stopped except postgres; **destructive**):

```powershell
docker exec -i aniston_vms_postgres psql -U postgres -c "DROP DATABASE IF EXISTS aniston_vms WITH (FORCE); CREATE DATABASE aniston_vms;"
gzip -dc backups/db/aniston_vms-<date>.sql.gz | docker exec -i aniston_vms_postgres psql -U postgres -d aniston_vms
docker compose -f docker/docker-compose.fullstack.yml restart backend
```

Schema is migration-driven (`prisma/migrations/` — real migrations, no
`db push` drift). After a restore onto newer code:
`cd backend && npx prisma migrate deploy`.

## 3. Media/uploads backup

- `STORAGE_DRIVER=local` (default): back up the backend `uploads/` bind/volume
  with any file-level tool; snapshots are content-addressed under
  `uploads/snapshots/`, clip exports under `uploads/clips/`,
  scheduled-report emails (mock transport) under `uploads/reports-outbox/`.
- `STORAGE_DRIVER=s3`: use bucket versioning + lifecycle rules on the
  `aniston-vms` bucket; the app never deletes outside its retention sweeps.

Retention is enforced in-app (TRD §5): snapshots
`SNAPSHOT_RETENTION_DAYS=90`, thumbs 365, incident evidence 1095, clip
exports `CLIP_EXPORT_RETENTION_DAYS=30`.

## 4. Snapshot ZIP backups (in-app, audited)

The Settings → Storage & Backup panel drives the `Backup` model
(status `QUEUED → RUNNING → DONE | FAILED`):

- `POST /api/settings/backups` — build a snapshot ZIP for a scope
  (zone/site/camera) + date range. SUPER_ADMIN/PROJECT_ADMIN only; audited.
- `GET /api/settings/backups` — recent jobs + signed download URLs
  (`FILE_SIGNED_URL_TTL_SECONDS=900`).

These ZIPs are for evidence hand-off, not DR — DR is §2 + §3.

## 5. Observability (Grafana + Prometheus overlay)

```powershell
docker compose -f docker/docker-compose.fullstack.yml -f docker/docker-compose.observability.yml up -d
```

- Grafana `http://localhost:3001` (admin/admin) — provisioned dashboards
  **Aniston VMS — API & Fleet Health** and **Aniston VMS — Workers &
  Self-Monitoring** (`docker/grafana/dashboards/`).
- Prometheus `http://localhost:9090` — scrapes `backend:4000/api/metrics`.
- Red flags: worker heartbeat age > 300 s (Stage-9 self-monitor also raises a
  SELF-ALERT incident), 5xx rate > 5 %, event-loop lag p99 > 0.5 s.

## 6. Worker operations

Background loops (BullMQ repeatable ticks, restart-safe):
`health-scheduler`, `snapshot-scheduler`, `escalation-worker`,
`clip-export-worker`, `report-scheduler` (daily ops email, mock transport →
`uploads/reports-outbox/`), stream reaper + self-monitor.

- Status: `GET /api/platform/health` (worker heartbeats + queue depth).
- Drill-only stop/start: `POST /api/platform/workers/:name/:action`
  (requires `DRILL_MODE=true`; never enable in production).
- All schedulers tolerate restarts — a `docker restart aniston_vms_backend`
  re-registers every repeatable tick idempotently.

## 7. Failure drills (Stage 9 / CR-12)

```powershell
node scripts/drills/run-drills.mjs   # ≈30–40 min, writes docs/drill-report-<date>.md
```

Prereqs: fullstack compose up; root `.env` has `HEALTH_SIM_MODE=true`,
`HEALTH_CHECK_INTERVAL_MINUTES=1`, `DRILL_MODE=true`. The script injects the
20 mandatory failure scenarios through `simulator/fault-inject.(sh|ps1)`
(Redis `sim:fault:<cameraCode>` keys) and asserts the incident engine's
responses against the TRD §6.5 rule matrix.

## 8. Disaster recovery order

1. Provision Docker host → clone repo → restore `.env` (secrets vault).
2. `docker compose -f docker/docker-compose.fullstack.yml up -d postgres redis`
3. Restore DB (§2), then media (§3).
4. `npx prisma migrate deploy` (backend container or host).
5. Start the rest of the stack; verify `GET /api/health`,
   `GET /api/platform/health`, one camera's live view and one clip export.
6. Optional: overlay (§5) + a smoke drill subset before declaring healthy.
