# Skill — Bulk Operations Patterns

Bulk camera import (streamed CSV → `class-validator` row DTOs → BullMQ), bulk health re-check across a zone,
and bulk incident acknowledge — each with Prisma `$transaction` chunking, per-row partial-failure reporting,
zone-scoped RBAC, and audit logging. Bulk writes are the highest-blast-radius endpoints in Aniston VMS: a
single call can touch every camera in a zone, so scope and validation are non-negotiable.

See `docs/05-backend-schema.md` (`Camera` / `HealthCheck` / `Incident` / `AuditLog` models, `ScopeType`),
`docs/02-TRD.md` (the health-probe pipeline these flows feed), `.claude/rules/rule-security-rbac.md`
(org tenancy + zone scope) and `memory/alignment-dictionary.md` (diagnostic status-code catalog, ID formats)
before changing any bulk flow.

> Scope helpers (`buildScopeWhere`, `ZonesService.assertZonesInScope`, `zoneScopeFilter`) resolve the caller's
> `UserAccessScope` rows (`ScopeType` ORG/SITE/ZONE/CAMERA) into a Prisma `where` — defined in
> `skill-rbac-advanced-patterns.md`. Bulk endpoints reuse them and never re-implement scope checks ad hoc.
> Request-scoped code logs through the injected `LoggerService`; workers use the shared `logger` from
> `@aniston-vms/shared` (`.claude/rules/rule-logging-standards.md`).

---

## Golden rules for every bulk endpoint

1. **Scope first, act second.** Resolve `organizationId` from the JWT + narrow by the caller's zone scope, and
   prove *every* target id is in-scope BEFORE mutating anything (the IDOR floor — `rule-security-rbac.md`).
2. **`CLIENT_VIEWER` never bulk-writes.** Guard with `@Roles(UserRole.PROJECT_ADMIN, UserRole.SUPER_ADMIN)`.
3. **Chunk large writes.** Never open one `$transaction` over 10k rows; batch in chunks of ~500 so you don't
   hold a long-lived Postgres lock or exhaust the connection pool.
4. **Report per-row for imports.** Return `{ total, success, failed, errors[] }` so one bad CSV row never
   rejects the 124 good cameras alongside it.
5. **Offload big jobs to `apps/workers`.** Anything over ~100 rows goes to a BullMQ queue and the request
   returns a `jobId` immediately.
6. **Audit one entry per affected record**, inside the same transaction as the write.

---

## Bulk camera import — row DTO (`class-validator`)

```typescript
// packages/shared/src/dto/camera-import-row.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsIP, IsInt, Min, Max, Matches, MaxLength } from 'class-validator';

const RTSP_URL_PATTERN = /^rtsp:\/\/[a-zA-Z0-9.\-]+(:\d{1,5})?\/[\w\-./]*$/;

// One row of the import CSV. A batch import must NEVER be a softer validation path than POST /cameras —
// reuse the exact same validators the single-create DTO uses.
export class CameraImportRowDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;                       // human label, e.g. "Gate 3 — East ANPR"

  @IsString() @Matches(/^CAM-\d{3,}$/) // camera code format, e.g. CAM-042
  cameraCode!: string;

  @IsString() @Matches(RTSP_URL_PATTERN, { message: 'INVALID_STREAM_PATH' })
  rtspUrl!: string;                    // encrypted at rest before persistence — never stored or logged raw

  @IsOptional() @IsIP()
  onvifHost?: string;

  @IsOptional() @IsInt() @Min(1) @Max(65535)
  onvifPort?: number;

  @IsString() @IsNotEmpty()
  zoneId!: string;                     // resolved + scope-checked server-side; never trusted as sent
}
```

---

## Bulk camera import — controller (small = inline, large = queued)

```typescript
// apps/api/src/modules/cameras/camera-import.controller.ts
import { Controller, Post, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { JwtAuthGuard, RolesGuard, ZoneScopeGuard, Roles, CurrentUser } from '../../common/auth';
import { QUEUE_CAMERA_IMPORT } from '@aniston-vms/shared/queues/queue-names';
import type { CameraImportJobData } from '@aniston-vms/shared/queues/job-types';
import type { AuthUser } from '@aniston-vms/shared/auth';
import { UserRole } from '@aniston-vms/shared';

// Mandatory guard order (rule-security-rbac.md): JwtAuthGuard → RolesGuard + ZoneScopeGuard → ValidationPipe.
@Controller('cameras/import')
@UseGuards(JwtAuthGuard, RolesGuard, ZoneScopeGuard)
@Roles(UserRole.PROJECT_ADMIN, UserRole.SUPER_ADMIN)
export class CameraImportController {
  constructor(
    private readonly importer: CameraImportService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_CAMERA_IMPORT) private readonly importQueue: Queue,
  ) {}

  // Multipart `FileInterceptor` + the `MulterFile` shape are wired per skill-file-upload-patterns.md.
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: MulterFile, @CurrentUser() actor: AuthUser) {
    const rowCount = countCsvRows(file.buffer);

    // Small file → run inline and return per-row results immediately.
    if (rowCount <= 100) {
      return this.importer.importInline(Readable.from(file.buffer), actor);
    }

    // Large file → stash in MinIO/S3 and hand the worker only a key. Never base64 a big CSV through Redis.
    const storageKey = `${actor.organizationId}/imports/${randomUUID()}.csv`;
    await this.storage.putObject(storageKey, file.buffer, 'text/csv');
    const job = await this.importQueue.add(
      'import-cameras',
      { organizationId: actor.organizationId, actorId: actor.id, storageKey } satisfies CameraImportJobData,
      { attempts: 1 },   // no auto-retry — a partial re-run would duplicate cameras
    );
    return { jobId: job.id, mode: 'async' };
  }
}
```

---

## Bulk camera import — inline service (streamed, per-row transactions)

```typescript
// apps/api/src/modules/cameras/camera-import.service.ts
import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { parse } from 'csv-parse';                 // streaming parser — never buffer a whole CSV into memory
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogger } from '../../common/audit/audit-logger.service';
import { encryptSecret } from '../../common/crypto';   // AES-256-GCM at rest
import { CameraImportRowDto } from '@aniston-vms/shared/dto/camera-import-row.dto';
import type { AuthUser } from '@aniston-vms/shared/auth';

interface ImportResult {
  total:   number;
  success: number;
  failed:  number;
  errors:  { row: number; cameraCode: string; reason: string }[];
}

@Injectable()
export class CameraImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly zones: ZonesService,
  ) {}

  async importInline(csv: Readable, actor: AuthUser): Promise<ImportResult> {
    const result: ImportResult = { total: 0, success: 0, failed: 0, errors: [] };
    const valid: { row: number; dto: CameraImportRowDto }[] = [];

    let rowNum = 1;   // header is row 1
    const parser = csv.pipe(parse({ columns: true, trim: true, skip_empty_lines: true }));
    for await (const raw of parser) {
      rowNum++;
      result.total++;
      const dto = plainToInstance(CameraImportRowDto, raw);
      try {
        await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
        valid.push({ row: rowNum, dto });
      } catch (errs: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          cameraCode: raw.cameraCode ?? '(unknown)',
          reason: Array.isArray(errs)
            ? errs.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')
            : 'Row failed validation',
        });
      }
    }

    // Scope floor: every target zone must sit inside the caller's UserAccessScope — resolved once, not per row.
    const zoneIds = [...new Set(valid.map((v) => v.dto.zoneId))];
    await this.zones.assertZonesInScope(zoneIds, actor);   // throws ForbiddenException on any out-of-scope zone

    // Each row's create + audit is its own small transaction, so one duplicate cameraCode never rolls back
    // its neighbours — that is what yields honest per-row partial-failure reporting.
    for (const { row, dto } of valid) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const camera = await tx.camera.create({
            data: {
              organizationId:   actor.organizationId,     // tenancy floor — from JWT, never from the CSV
              zoneId:           dto.zoneId,
              name:             dto.name,
              cameraCode:       dto.cameraCode,
              rtspUrlEncrypted: encryptSecret(dto.rtspUrl),
              onvifHost:        dto.onvifHost,
              onvifPort:        dto.onvifPort,
              status:           'CAMERA_REACHABLE',
            },
          });
          await this.audit.log(tx, {
            action: 'CAMERA_IMPORTED', entityType: 'Camera', entityId: camera.id,
            actorId: actor.id, organizationId: actor.organizationId,
            newValue: { cameraCode: dto.cameraCode, zoneId: dto.zoneId },
          });
        });
        result.success++;
      } catch (err: any) {
        result.failed++;
        result.errors.push({
          row, cameraCode: dto.cameraCode,
          reason: err.code === 'P2002' ? 'cameraCode already exists' : 'Database error',
        });
      }
    }

    return result;
  }
}
```

---

## Bulk camera import — BullMQ worker (chunked, with progress)

```typescript
// apps/workers/src/processors/camera-import.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { parse } from 'csv-parse';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { logger } from '@aniston-vms/shared';
import { QUEUE_CAMERA_IMPORT } from '@aniston-vms/shared/queues/queue-names';
import { CameraImportRowDto } from '@aniston-vms/shared/dto/camera-import-row.dto';
import type { CameraImportJobData } from '@aniston-vms/shared/queues/job-types';

const CHUNK_SIZE = 500;

@Processor(QUEUE_CAMERA_IMPORT)
export class CameraImportProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditLogger,
    private readonly gateway: RealtimeGateway,
  ) { super(); }

  async process(job: Job<CameraImportJobData>) {
    const { organizationId, actorId, storageKey } = job.data;
    const stream = await this.storage.getObjectStream(storageKey);   // stream from MinIO/S3, never load whole
    const parser = stream.pipe(parse({ columns: true, trim: true, skip_empty_lines: true }));

    let total = 0, success = 0, failed = 0, rowNum = 1;
    const errors: { row: number; cameraCode: string; reason: string }[] = [];
    let batch: { row: number; dto: CameraImportRowDto }[] = [];

    // Process in chunks of 500 to bound memory and report progress; each row stays its own transaction.
    const flush = async () => {
      for (const { row, dto } of batch) {
        try {
          await this.prisma.$transaction(async (tx) => {
            const camera = await tx.camera.create({ data: toCameraCreate(dto, organizationId) });
            await this.audit.log(tx, {
              action: 'CAMERA_IMPORTED', entityType: 'Camera', entityId: camera.id,
              actorId, organizationId, newValue: { cameraCode: dto.cameraCode },
            });
          });
          success++;
        } catch (err: any) {
          failed++;
          errors.push({ row, cameraCode: dto.cameraCode, reason: err.code === 'P2002' ? 'cameraCode already exists' : 'Database error' });
        }
      }
      batch = [];
    };

    for await (const raw of parser) {
      rowNum++; total++;
      const dto = plainToInstance(CameraImportRowDto, raw);
      try {
        await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
        batch.push({ row: rowNum, dto });
      } catch {
        failed++;
        errors.push({ row: rowNum, cameraCode: raw.cameraCode ?? '(unknown)', reason: 'Row failed validation' });
      }
      if (batch.length >= CHUNK_SIZE) {
        await flush();
        await job.updateProgress(Math.min(95, Math.floor(((success + failed) / (total + 1)) * 90)));
      }
    }
    await flush();
    await job.updateProgress(100);

    logger.info('Camera import finished', { jobId: job.id, queue: job.queueName, organizationId, total, success, failed });
    return { total, success, failed, errors } satisfies ImportResult;
  }

  @OnWorkerEvent('completed')
  onComplete(job: Job) {
    // Push per-row results back to the initiating admin so the import modal can render them.
    this.gateway.toUser(job.data.actorId, 'camera-import:complete', job.returnvalue);
  }
}
```

---

## Bulk health re-check across a zone

Re-probe every camera in a zone in one action — used by the "Re-check zone" button on the `LiveWallGrid`.
The work itself is fanned out to the `health-probe` queue; the endpoint just enqueues and audits.

```typescript
// apps/api/src/modules/health-check/health-recheck.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogger } from '../../common/audit/audit-logger.service';
import { QUEUE_HEALTH_PROBE } from '@aniston-vms/shared/queues/queue-names';
import type { HealthProbeJobData } from '@aniston-vms/shared/queues/job-types';
import type { AuthUser } from '@aniston-vms/shared/auth';

@Injectable()
export class HealthRecheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly zones: ZonesService,
    @InjectQueue(QUEUE_HEALTH_PROBE) private readonly probeQueue: Queue,
  ) {}

  async recheckZone(zoneId: string, actor: AuthUser) {
    // Zone must be inside the caller's scope — throws ForbiddenException/NotFoundException otherwise.
    await this.zones.assertZonesInScope([zoneId], actor);

    // organizationId is the tenancy floor; deletedAt excludes retired cameras.
    const cameras = await this.prisma.camera.findMany({
      where: { zoneId, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, cameraCode: true },
    });
    if (cameras.length === 0) return { queued: 0 };

    // One bulk enqueue — a health-probe job per camera. The pipeline chains RTSP → ONVIF → ROUTER → SIM.
    await this.probeQueue.addBulk(
      cameras.map((c) => ({
        name: 'probe-camera',
        data: { organizationId: actor.organizationId, cameraId: c.id, checkType: 'RTSP' } satisfies HealthProbeJobData,
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 },
      })),
    );

    // Single audit entry for the bulk action; the per-camera HealthCheck rows are written by the worker.
    await this.audit.log({
      action: 'ZONE_HEALTH_RECHECK', entityType: 'Zone', entityId: zoneId,
      actorId: actor.id, organizationId: actor.organizationId,
      newValue: { cameras: cameras.length },
    });

    return { queued: cameras.length };
  }
}
```

---

## Bulk incident acknowledge

Acknowledge many incidents at once from the `IncidentKanban`. This is a status transition, so it uses the
optimistic-lock `updateMany` pattern (`skill-prisma-patterns.md`) plus self-approval prevention.

```typescript
// packages/shared/src/dto/bulk-incident-ack.dto.ts
import { IsArray, ArrayMaxSize, IsUUID } from 'class-validator';

export class BulkIncidentAckDto {
  @IsArray() @ArrayMaxSize(500)          // cap — a bulk endpoint must bound how much one call can touch
  @IsUUID('4', { each: true })
  incidentIds!: string[];
}
```

```typescript
// apps/api/src/modules/incidents/incidents.service.ts
async bulkAcknowledge(incidentIds: string[], actor: AuthUser) {
  // Fetch only in-scope, still-open incidents. zoneScopeFilter() applies the caller's zone narrowing;
  // organizationId is always enforced on top of it.
  const eligible = await this.prisma.incident.findMany({
    where: {
      id: { in: incidentIds },
      organizationId: actor.organizationId,
      ...zoneScopeFilter(actor),
      status: { in: ['OPEN', 'ALERTED', 'CONFIRMED'] },
      deletedAt: null,
    },
    select: { id: true, reportedById: true, incidentNumber: true },
  });

  // Self-approval prevention — you cannot acknowledge an incident you reported (rule-security-rbac.md),
  // unless you are SUPER_ADMIN.
  const ackable = eligible.filter((i) => actor.role === UserRole.SUPER_ADMIN || i.reportedById !== actor.id);
  const ackableIds = ackable.map((i) => i.id);
  if (ackableIds.length === 0) throw new ConflictException('No eligible incidents to acknowledge');

  const acknowledged = await this.prisma.$transaction(async (tx) => {
    // Optimistic lock: re-assert status in the where — a racing acknowledge matches zero rows and is skipped.
    const updated = await tx.incident.updateMany({
      where: { id: { in: ackableIds }, organizationId: actor.organizationId, status: { in: ['OPEN', 'ALERTED', 'CONFIRMED'] } },
      data:  { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: actor.id },
    });

    // One audit row + one incident-timeline event per incident, atomic with the update.
    await tx.auditLog.createMany({
      data: ackable.map((i) => ({
        entityType: 'Incident', entityId: i.id, action: 'ACKNOWLEDGE',
        actorId: actor.id, organizationId: actor.organizationId,
        oldValue: { status: 'OPEN' }, newValue: { status: 'ACKNOWLEDGED' },
      })),
    });
    await tx.incidentEvent.createMany({
      data: ackable.map((i) => ({ incidentId: i.id, type: 'ACKNOWLEDGED', actorId: actor.id })),
    });

    return updated.count;
  });

  // Partial-success report: skipped = out-of-scope, already-transitioned, or self-reported.
  return { acknowledged, skipped: incidentIds.length - acknowledged };
}
```

---

## Checklist

- [ ] Every bulk endpoint takes `organizationId` from the JWT and applies zone scope — all target ids proven in-scope BEFORE any write (IDOR floor)
- [ ] `CLIENT_VIEWER` can never reach a bulk-write endpoint (`@Roles(PROJECT_ADMIN, SUPER_ADMIN)`)
- [ ] Bulk incident acknowledge enforces self-approval prevention (`reportedById !== actor.id`, except `SUPER_ADMIN`)
- [ ] Imports report per-row `{ total, success, failed, errors[] }` — one bad row never rejects the whole file
- [ ] CSV is stream-parsed with `csv-parse` and validated by the same `class-validator` DTO as single-create
- [ ] Files over ~100 rows offload to the `camera-import` BullMQ queue in `apps/workers`; the request returns a `jobId`
- [ ] Large CSVs are stored in MinIO/S3 and the worker gets a `storageKey` — never base64'd through Redis
- [ ] Writes are chunked (~500); each row's create + audit is its own transaction so no single lock spans the file
- [ ] Bulk status changes use `updateMany` with the expected status re-asserted in `where` (optimistic lock)
- [ ] One `AuditLog` entry per affected record, inside the same `$transaction` as the write
- [ ] Camera credentials are encrypted (AES-256-GCM) on import and never logged
- [ ] Import/ack DTOs live in `@aniston-vms/shared` and cap array/row sizes (`@ArrayMaxSize`)
