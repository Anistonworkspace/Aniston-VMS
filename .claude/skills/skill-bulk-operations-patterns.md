# Skill — Bulk Operations Patterns

CSV import, bulk update/delete, partial failure handling, progress bar, BullMQ for large imports.

---

## CSV import — validation layer

```typescript
// backend/src/modules/item/item-import.service.ts
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

const ItemImportRowSchema = z.object({
  name:        z.string().min(1),
  sku:         z.string().min(1),
  description: z.string().optional(),
  categoryId:  z.string().uuid(),
});

interface ImportResult {
  total:    number;
  success:  number;
  failed:   number;
  errors:   { row: number; sku: string; reason: string }[];
}

export class ItemImportService {
  // For small files (<= 100 rows) — synchronous
  static async importSync(
    csvBuffer: Buffer,
    actor: AuthUser,
  ): Promise<ImportResult> {
    const rows = parse(csvBuffer, {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
    });

    const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const parsed = ItemImportRowSchema.safeParse(row);

      if (!parsed.success) {
        result.failed++;
        result.errors.push({
          row: i + 2,   // +2: header row + 0-index
          sku: row.sku ?? '(unknown)',
          reason: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const item = await tx.item.create({
            data: { ...parsed.data, organizationId: actor.organizationId },
          });
          await auditLogger.log(tx, {
            action: 'ITEM_CREATED',
            entity:  'Item',
            entityId: item.id,
            actorId: actor.id,
            organizationId: actor.organizationId,
            after:   item,
          });
        });
        result.success++;
      } catch (err: any) {
        result.failed++;
        result.errors.push({
          row:    i + 2,
          sku:    parsed.data.sku,
          reason: err.code === 'P2002' ? 'SKU already exists' : 'Database error',
        });
      }
    }

    return result;
  }

  // For large files — queue to BullMQ, return jobId
  static async importAsync(
    csvBuffer: Buffer,
    actor: AuthUser,
  ): Promise<{ jobId: string }> {
    const job = await itemImportQueue.add('import-items', {
      csvBase64:      csvBuffer.toString('base64'),
      actorId:        actor.id,
      organizationId: actor.organizationId,
    }, { attempts: 1 });    // no retry on import — partial re-run would duplicate rows

    return { jobId: job.id! };
  }
}
```

---

## BullMQ import worker with progress

```typescript
// backend/src/jobs/workers/item-import.worker.ts
import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis.js';

export const itemImportWorker = new Worker(
  'item-import',
  async (job) => {
    const { csvBase64, actorId, organizationId } = job.data;
    const csvBuffer = Buffer.from(csvBase64, 'base64');
    const rows = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });

    let success = 0;
    let failed  = 0;
    const errors: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      // Update progress every 10 rows
      if (i % 10 === 0) {
        await job.updateProgress(Math.floor((i / rows.length) * 90));
      }

      try {
        const parsed = ItemImportRowSchema.parse(rows[i]);
        await prisma.$transaction(async (tx) => {
          const item = await tx.item.create({ data: { ...parsed, organizationId } });
          await auditLogger.log(tx, { action: 'ITEM_CREATED', entity: 'Item', entityId: item.id, actorId, organizationId, after: item });
        });
        success++;
      } catch (err: any) {
        failed++;
        errors.push({ row: i + 2, reason: err.code === 'P2002' ? 'Duplicate SKU' : err.message });
      }
    }

    await job.updateProgress(100);

    // Notify via socket
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } });
    if (actor) {
      io.to(`user:${actor.id}`).emit('import:complete', {
        total: rows.length, success, failed, errors,
      });
    }

    return { total: rows.length, success, failed, errors };
  },
  { connection: redisConnection },
);
```

---

## Bulk update — service

```typescript
// Bulk approve / bulk status change
static async bulkApprove(ids: string[], actor: AuthUser) {
  // RBAC check
  if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
    throw new ForbiddenError('Not authorized to approve items');
  }

  // Verify all IDs belong to this org (IDOR prevention)
  const items = await prisma.item.findMany({
    where: {
      id: { in: ids },
      organizationId: actor.organizationId,
      status: 'SUBMITTED',      // only approve submitted items
      deletedAt: null,
    },
    select: { id: true, createdById: true },
  });

  // Self-approval check — filter out items the actor created
  const approveableIds = items
    .filter(r => r.createdById !== actor.id)
    .map(r => r.id);

  if (approveableIds.length === 0) {
    throw new ValidationError('No eligible items to approve');
  }

  // Optimistic lock: only update the ones still in SUBMITTED state
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.updateMany({
      where: {
        id:             { in: approveableIds },
        organizationId: actor.organizationId,
        status:         'SUBMITTED',           // re-check in transaction
      },
      data: { status: 'APPROVED', approverId: actor.id, approvedAt: new Date() },
    });

    // Audit one entry per record
    await tx.auditLog.createMany({
      data: approveableIds.map(id => ({
        action:         'ITEM_APPROVED',
        entity:         'Item',
        entityId:       id,
        actorId:        actor.id,
        organizationId: actor.organizationId,
        before:         { status: 'SUBMITTED' },
        after:          { status: 'APPROVED' },
      })),
    });

    return updated;
  });

  return { approved: result.count, skipped: ids.length - approveableIds.length };
}
```

---

## Bulk delete — service

```typescript
static async bulkDelete(ids: string[], actor: AuthUser) {
  // Verify org ownership of ALL ids before deleting any
  const count = await prisma.item.count({
    where: { id: { in: ids }, organizationId: actor.organizationId, deletedAt: null },
  });

  if (count !== ids.length) {
    throw new ForbiddenError('One or more records not found or do not belong to your organization');
  }

  await prisma.$transaction(async (tx) => {
    await tx.item.updateMany({
      where: { id: { in: ids }, organizationId: actor.organizationId },
      data: { deletedAt: new Date() },
    });
    await tx.auditLog.createMany({
      data: ids.map(id => ({
        action: 'ITEM_DELETED', entity: 'Item', entityId: id,
        actorId: actor.id, organizationId: actor.organizationId,
      })),
    });
  });

  return { deleted: ids.length };
}
```

---

## Frontend — CSV import modal with progress

```typescript
// frontend/src/features/items/ImportItemsModal.tsx
import { useState } from 'react';
import { useImportItemsMutation, useGetImportJobQuery } from '../api/itemApi';

export function ImportItemsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile]      = useState<File | null>(null);
  const [jobId, setJobId]    = useState<string | null>(null);
  const [doImport, { isLoading }] = useImportItemsMutation();

  // Poll job progress when jobId is set
  const { data: jobData } = useGetImportJobQuery(jobId!, {
    skip:              !jobId,
    pollingInterval:   1500,
  });

  const progress = jobData?.progress ?? 0;
  const isDone   = jobData?.status === 'completed' || jobData?.status === 'failed';

  const handleSubmit = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await doImport(formData).unwrap();
      if (res.data.jobId) {
        setJobId(res.data.jobId);       // large file — show progress bar
      } else {
        toast.success(`Imported ${res.data.success} items`);
        onClose();
      }
    } catch {
      toast.error('Import failed');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Items" size="md">
      {!jobId ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--secondary-text-color)]">
            Upload a CSV with columns: name, sku, description, categoryId
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <a href="/templates/item-import-template.csv" className="text-xs text-[var(--primary-color)]">
            Download template
          </a>
          <div className="flex justify-end gap-3">
            <button className="btn btn--secondary btn--md" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary btn--md" onClick={handleSubmit} disabled={!file || isLoading}>
              {isLoading ? '⟳ Uploading…' : 'Import'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          <p className="text-sm font-medium text-center">{isDone ? 'Import complete' : 'Importing items…'}</p>
          <div className="w-full bg-[var(--ui-bg-border-color)] rounded-full h-2">
            <div className="bg-[var(--primary-color)] h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-center text-[var(--secondary-text-color)]">{progress}%</p>
          {isDone && jobData?.result && (
            <div className="mt-3 text-sm space-y-1">
              <p className="text-[var(--positive-color)]">✓ {jobData.result.success} imported successfully</p>
              {jobData.result.failed > 0 && (
                <p className="text-[var(--negative-color)]">✗ {jobData.result.failed} failed</p>
              )}
            </div>
          )}
          {isDone && <button className="btn btn--primary btn--md w-full" onClick={onClose}>Done</button>}
        </div>
      )}
    </Modal>
  );
}
```

---

## CSV export template download

```typescript
// Serve import template from backend
app.get('/api/templates/item-import-template.csv', authenticate, (req, res) => {
  const csv = 'name,sku,description,categoryId\nWidget,WGT-001,A sample item,<uuid>';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="item-import-template.csv"');
  res.send(csv);
});
```

---

## Checklist

- [ ] File size limit enforced in Multer config (e.g. 5 MB for CSVs)
- [ ] CSV rows validated with Zod before ANY database write
- [ ] Partial failure: failed rows reported with row number + reason, successful rows still committed
- [ ] Bulk delete verifies ALL IDs belong to the org before deleting any (atomic check)
- [ ] `updateMany` used for bulk status change — never N individual updates
- [ ] Self-approval check applied in bulk approve — items the actor created filtered out silently
- [ ] Large imports (> 100 rows) queued to BullMQ — never block the HTTP request
- [ ] Import progress exposed via job status endpoint, polled by frontend
- [ ] CSV import template downloadable from the UI
- [ ] `auditLog.createMany` used for bulk operations — not one call per row
