import { SnapshotKind } from '@prisma/client';
import type {
  Camera,
  MaintenanceTask,
  MaintenanceWindow,
  Prisma,
  TaskSource,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import type { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  canAccessCamera,
  canAccessSite,
  cameraScopeWhere,
  getUserScope,
  siteScopeWhere,
} from '../../lib/scope.js';
import type { ResolvedScope } from '../../lib/scope.js';
import type { AuthUser } from '../../middleware/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { captureSnapshot } from '../snapshots/snapshot.service.js';
import type {
  createTaskBodySchema,
  createWindowBodySchema,
  taskListQuerySchema,
  updateTaskBodySchema,
  updateWindowBodySchema,
  windowListQuerySchema,
} from './maintenance.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance windows + tasks. Field names verified against prisma/schema.prisma
// (`grep -n -A 30 "^model MaintenanceWindow "` / `"^model MaintenanceTask "`):
//   MaintenanceWindow: siteId?, cameraId?, startAt, endAt, reason, approvedById
//     (required — set to the creating actor, there is no separate approval
//     workflow/status column), createdAt, updatedAt.
//   MaintenanceTask: cameraId, type, source, status, assignedToId?,
//     beforeSnapshotId?, afterSnapshotId?, notes?, completedAt?, createdAt,
//     updatedAt. No maintenanceWindowId — tasks are not linked to a window.
// ─────────────────────────────────────────────────────────────────────────────

type CreateWindowInput = z.infer<typeof createWindowBodySchema>;
type UpdateWindowInput = z.infer<typeof updateWindowBodySchema>;
type WindowListFilters = z.infer<typeof windowListQuerySchema>;
type CreateTaskInput = z.infer<typeof createTaskBodySchema>;
type UpdateTaskInput = z.infer<typeof updateTaskBodySchema>;
type TaskListFilters = z.infer<typeof taskListQuerySchema>;

export interface PagedResult<T> {
  items: T[];
  page: number;
  limit: number;
  totalPages: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance windows
// ─────────────────────────────────────────────────────────────────────────────

export type WindowState = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';

export interface WindowDto {
  id: string;
  siteId: string | null;
  cameraId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  reason: string;
  approvedById: string;
  state: WindowState;
  createdAt: Date;
  updatedAt: Date;
}

function computeWindowState(startAt: Date, endAt: Date, now: Date = new Date()): WindowState {
  if (now < startAt) return 'UPCOMING';
  if (now > endAt) return 'COMPLETED';
  return 'ACTIVE';
}

function toWindowDto(w: MaintenanceWindow): WindowDto {
  return {
    id: w.id,
    siteId: w.siteId,
    cameraId: w.cameraId,
    scheduledStart: w.startAt,
    scheduledEnd: w.endAt,
    reason: w.reason,
    approvedById: w.approvedById,
    state: computeWindowState(w.startAt, w.endAt),
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

// A window is visible if either the camera it targets, or the site it
// targets, resolves within the caller's scope (mirrors the OR used by
// incident.service.ts's inMaintenanceWindow lookup).
function windowScopeWhere(scope: ResolvedScope): Prisma.MaintenanceWindowWhereInput {
  if (scope.all) return {};
  return { OR: [{ camera: cameraScopeWhere(scope) }, { site: siteScopeWhere(scope) }] };
}

async function requireWindow(userId: string, id: string): Promise<MaintenanceWindow> {
  const scope = await getUserScope(userId);
  const window = await prisma.maintenanceWindow.findFirst({
    where: { AND: [{ id }, windowScopeWhere(scope)] },
  });
  if (!window) throw new NotFoundError('Maintenance window not found');
  return window;
}

export async function listWindows(
  userId: string,
  filters: WindowListFilters
): Promise<PagedResult<WindowDto>> {
  const scope = await getUserScope(userId);
  const { siteId, cameraId, state, page, limit } = filters;
  const now = new Date();
  const stateWhere: Prisma.MaintenanceWindowWhereInput =
    state === 'UPCOMING'
      ? { startAt: { gt: now } }
      : state === 'ACTIVE'
        ? { startAt: { lte: now }, endAt: { gte: now } }
        : state === 'COMPLETED'
          ? { endAt: { lt: now } }
          : {};

  const where: Prisma.MaintenanceWindowWhereInput = {
    AND: [
      windowScopeWhere(scope),
      stateWhere,
      ...(siteId ? [{ siteId }] : []),
      ...(cameraId ? [{ cameraId }] : []),
    ],
  };

  const [total, windows] = await Promise.all([
    prisma.maintenanceWindow.count({ where }),
    prisma.maintenanceWindow.findMany({
      where,
      orderBy: { startAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: windows.map(toWindowDto),
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getWindow(userId: string, id: string): Promise<WindowDto> {
  return toWindowDto(await requireWindow(userId, id));
}

export async function createWindow(actor: AuthUser, input: CreateWindowInput): Promise<WindowDto> {
  const scope = await getUserScope(actor.id);
  if (input.siteId && !(await canAccessSite(scope, input.siteId))) {
    throw new NotFoundError('Site not found');
  }
  if (input.cameraId && !(await canAccessCamera(scope, input.cameraId))) {
    throw new NotFoundError('Camera not found');
  }

  const window = await prisma.maintenanceWindow.create({
    data: {
      siteId: input.siteId ?? null,
      cameraId: input.cameraId ?? null,
      startAt: input.scheduledStart,
      endAt: input.scheduledEnd,
      reason: input.reason,
      // The creating actor is recorded as the approver — MaintenanceWindow has
      // no separate pending/approved state, so creation IS approval.
      approvedById: actor.id,
    },
  });
  return toWindowDto(window);
}

export async function updateWindow(
  actor: AuthUser,
  id: string,
  input: UpdateWindowInput
): Promise<WindowDto> {
  const existing = await requireWindow(actor.id, id);
  if (existing.startAt <= new Date()) {
    throw new ConflictError('Cannot edit a maintenance window that has already started');
  }
  const nextStart = input.scheduledStart ?? existing.startAt;
  const nextEnd = input.scheduledEnd ?? existing.endAt;
  if (nextEnd <= nextStart) {
    throw new ValidationError('scheduledEnd must be after scheduledStart');
  }

  const updated = await prisma.maintenanceWindow.update({
    where: { id },
    data: {
      ...(input.scheduledStart ? { startAt: input.scheduledStart } : {}),
      ...(input.scheduledEnd ? { endAt: input.scheduledEnd } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  });
  return toWindowDto(updated);
}

export async function deleteWindow(actor: AuthUser, id: string): Promise<void> {
  const existing = await requireWindow(actor.id, id);
  if (existing.startAt <= new Date()) {
    throw new ConflictError('Cannot delete a maintenance window that has already started');
  }
  await prisma.maintenanceWindow.delete({ where: { id } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance tasks
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskDto {
  id: string;
  cameraId: string | null;
  type: TaskType;
  source: TaskSource;
  status: TaskStatus;
  assignedToId: string | null;
  beforeSnapshotId: string | null;
  afterSnapshotId: string | null;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toTaskDto(t: MaintenanceTask): TaskDto {
  return {
    id: t.id,
    cameraId: t.cameraId,
    type: t.type,
    source: t.source,
    status: t.status,
    assignedToId: t.assignedToId,
    beforeSnapshotId: t.beforeSnapshotId,
    afterSnapshotId: t.afterSnapshotId,
    notes: t.notes,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

async function requireCamera(userId: string, cameraId: string): Promise<Camera> {
  const scope = await getUserScope(userId);
  if (!(await canAccessCamera(scope, cameraId))) throw new NotFoundError('Camera not found');
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new NotFoundError('Camera not found');
  return camera;
}

async function requireTask(userId: string, id: string): Promise<MaintenanceTask> {
  const task = await prisma.maintenanceTask.findUnique({ where: { id } });
  if (!task) throw new NotFoundError('Maintenance task not found');
  const scope = await getUserScope(userId);
  if (!(await canAccessCamera(scope, task.cameraId)))
    throw new NotFoundError('Maintenance task not found');
  return task;
}

async function requireAssignee(assignedToId: string): Promise<void> {
  const assignee = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true },
  });
  if (!assignee) throw new ValidationError('Assignee not found');
}

export async function listTasks(
  userId: string,
  filters: TaskListFilters
): Promise<PagedResult<TaskDto>> {
  const scope = await getUserScope(userId);
  const { cameraId, status, type, assignedToId, page, limit } = filters;
  const where: Prisma.MaintenanceTaskWhereInput = {
    camera: cameraScopeWhere(scope),
    ...(cameraId ? { cameraId } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(assignedToId ? { assignedToId } : {}),
  };

  const [total, tasks] = await Promise.all([
    prisma.maintenanceTask.count({ where }),
    prisma.maintenanceTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items: tasks.map(toTaskDto), page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

export async function getTask(userId: string, id: string): Promise<TaskDto> {
  return toTaskDto(await requireTask(userId, id));
}

export async function createTask(actor: AuthUser, input: CreateTaskInput): Promise<TaskDto> {
  await requireCamera(actor.id, input.cameraId);
  if (input.assignedToId) await requireAssignee(input.assignedToId);

  const task = await prisma.maintenanceTask.create({
    data: {
      cameraId: input.cameraId,
      type: input.type,
      source: input.source,
      status: 'OPEN',
      assignedToId: input.assignedToId ?? null,
      notes: input.notes ?? null,
    },
  });
  return toTaskDto(task);
}

export async function updateTask(
  actor: AuthUser,
  id: string,
  input: UpdateTaskInput
): Promise<TaskDto> {
  const task = await requireTask(actor.id, id);
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    throw new ConflictError(`Cannot edit a maintenance task that is ${task.status}`);
  }
  if (input.assignedToId) await requireAssignee(input.assignedToId);

  const updated = await prisma.maintenanceTask.update({
    where: { id },
    data: {
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  return toTaskDto(updated);
}

export async function assignTask(
  actor: AuthUser,
  id: string,
  assignedToId: string
): Promise<TaskDto> {
  const task = await requireTask(actor.id, id);
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    throw new ConflictError(`Cannot assign a maintenance task that is ${task.status}`);
  }
  await requireAssignee(assignedToId);

  const updated = await prisma.maintenanceTask.update({ where: { id }, data: { assignedToId } });
  return toTaskDto(updated);
}

// Task state machine — DONE/CANCELLED are terminal.
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

/**
 * Validated status transition. Entering IN_PROGRESS captures a "before"
 * snapshot (if one hasn't already been captured); entering DONE captures an
 * "after" snapshot and stamps completedAt. Both reuse
 * snapshot.service.ts#captureSnapshot instead of duplicating capture logic —
 * per its signature `captureSnapshot(camera, kind, at?)` returns the created
 * Snapshot row, or null when the camera is currently unreachable (capture is
 * then skipped, not failed — logged via logger.warn).
 */
export async function transitionTaskStatus(
  actor: AuthUser,
  id: string,
  next: TaskStatus
): Promise<TaskDto> {
  const task = await requireTask(actor.id, id);
  const allowed = ALLOWED_TRANSITIONS[task.status];
  if (!allowed.includes(next)) {
    throw new ConflictError(`Cannot transition maintenance task from ${task.status} to ${next}`);
  }

  const data: Prisma.MaintenanceTaskUpdateInput = { status: next };

  if (next === 'IN_PROGRESS' && !task.beforeSnapshotId) {
    const camera = task.cameraId
      ? await prisma.camera.findUnique({ where: { id: task.cameraId } })
      : null;
    if (camera) {
      const snapshot = await captureSnapshot(camera, SnapshotKind.SUB, new Date());
      if (snapshot) {
        data.beforeSnapshot = { connect: { id: snapshot.id } };
      } else {
        logger.warn('Maintenance before-snapshot skipped (camera unreachable)', {
          taskId: id,
          cameraId: task.cameraId,
        });
      }
    }
  }

  if (next === 'DONE') {
    data.completedAt = new Date();
    if (!task.afterSnapshotId) {
      const camera = task.cameraId
        ? await prisma.camera.findUnique({ where: { id: task.cameraId } })
        : null;
      if (camera) {
        const snapshot = await captureSnapshot(camera, SnapshotKind.SUB, new Date());
        if (snapshot) {
          data.afterSnapshot = { connect: { id: snapshot.id } };
        } else {
          logger.warn('Maintenance after-snapshot skipped (camera unreachable)', {
            taskId: id,
            cameraId: task.cameraId,
          });
        }
      }
    }
  }

  const updated = await prisma.maintenanceTask.update({ where: { id }, data });
  return toTaskDto(updated);
}
