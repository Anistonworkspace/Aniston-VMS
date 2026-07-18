import { z } from 'zod';

// Stage — request validation for the maintenance API (see maintenance.router.ts).
// Enum members copied verbatim from prisma/schema.prisma (TaskType, TaskSource,
// TaskStatus) — confirmed via `grep -n -A 10 "^enum Task... " prisma/schema.prisma`.
// Do not add/rename members here without a schema change.

export const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const taskTypeEnum = z.enum(['LENS_CLEANING', 'REPAIR', 'INSPECTION']);
const taskSourceEnum = z.enum(['AUTO', 'MANUAL']);
const taskStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']);

// MaintenanceWindow has no persisted "status"/approval-state column — approval
// is implicit (approvedById is a required FK set to the creating actor, there
// is no pending state). "windowState" below is a derived, not stored, temporal
// classification computed from startAt/endAt vs. now — see maintenance.service.ts.
const windowStateEnum = z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']);

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance windows
// ─────────────────────────────────────────────────────────────────────────────

export const windowListQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  state: windowStateEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Wire field names (scheduledStart/scheduledEnd) intentionally differ from the
// underlying Prisma columns (startAt/endAt) — mapped in maintenance.service.ts.
// At least one of siteId/cameraId is required (MaintenanceWindow.siteId and
// .cameraId are both nullable in the schema — a window scopes to a site, a
// single camera, or both).
export const createWindowBodySchema = z
  .object({
    siteId: z.string().uuid().optional(),
    cameraId: z.string().uuid().optional(),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    reason: z.string().min(3).max(2000),
  })
  .refine((b) => Boolean(b.siteId) || Boolean(b.cameraId), {
    message: 'At least one of siteId or cameraId is required',
    path: ['siteId'],
  })
  .refine((b) => b.scheduledEnd > b.scheduledStart, {
    message: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  });

// siteId/cameraId are immutable after creation (re-scoping would require
// re-running access checks against a different actor context) — only the
// schedule and reason can be edited, and only before the window has started.
export const updateWindowBodySchema = z
  .object({
    scheduledStart: z.coerce.date().optional(),
    scheduledEnd: z.coerce.date().optional(),
    reason: z.string().min(3).max(2000).optional(),
  })
  .refine(
    (b) => b.scheduledStart !== undefined || b.scheduledEnd !== undefined || b.reason !== undefined,
    {
      message: 'No fields to update',
    }
  )
  .refine((b) => !(b.scheduledStart && b.scheduledEnd) || b.scheduledEnd > b.scheduledStart, {
    message: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  });

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance tasks
// ─────────────────────────────────────────────────────────────────────────────

export const taskListQuerySchema = z.object({
  cameraId: z.string().uuid().optional(),
  status: taskStatusEnum.optional(),
  type: taskTypeEnum.optional(),
  assignedToId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// NOTE: MaintenanceTask has no maintenanceWindowId column/relation in
// prisma/schema.prisma (confirmed via grep) — a task is not linked to a
// window, so no such field is accepted here.
export const createTaskBodySchema = z.object({
  cameraId: z.string().uuid(),
  type: taskTypeEnum,
  source: taskSourceEnum.default('MANUAL'),
  assignedToId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

// General field patch — status transitions go through the dedicated
// /status endpoint below so the state machine + snapshot side-effects always run.
export const updateTaskBodySchema = z
  .object({
    assignedToId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((b) => b.assignedToId !== undefined || b.notes !== undefined, {
    message: 'No fields to update',
  });

export const assignTaskBodySchema = z.object({
  assignedToId: z.string().uuid(),
});

export const taskStatusBodySchema = z.object({
  status: taskStatusEnum,
});
