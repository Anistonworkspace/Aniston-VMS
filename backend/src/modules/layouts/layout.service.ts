import type { LayoutKind, SavedLayout } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { cameraScopeWhere, getUserScope } from '../../lib/scope.js';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { LAYOUT_MAX_CAMERAS } from './layout.schemas.js';
import type { createLayoutBodySchema, updateLayoutBodySchema } from './layout.schemas.js';

type CreateLayoutInput = z.infer<typeof createLayoutBodySchema>;
type UpdateLayoutInput = z.infer<typeof updateLayoutBodySchema>;

export interface LayoutDto {
  id: string;
  userId: string;
  name: string;
  kind: LayoutKind;
  cameraIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toLayoutDto(l: SavedLayout): LayoutDto {
  return {
    id: l.id,
    userId: l.userId,
    name: l.name,
    kind: l.layout,
    // Always written by this module as string[] (see create/updateLayout below).
    cameraIds: l.cameraIds as string[],
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

// Every referenced camera must exist and be visible under the caller's scope —
// prevents saving a layout that silently points at cameras the user can't see.
async function validateCameraIds(userId: string, cameraIds: string[]): Promise<void> {
  const scope = await getUserScope(userId);
  const unique = new Set(cameraIds);
  const count = await prisma.camera.count({
    where: { id: { in: [...unique] }, ...cameraScopeWhere(scope) },
  });
  if (count !== unique.size) {
    throw new ValidationError('One or more cameraIds are invalid or not accessible');
  }
}

export async function listLayouts(userId: string): Promise<LayoutDto[]> {
  const layouts = await prisma.savedLayout.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return layouts.map(toLayoutDto);
}

async function requireLayout(userId: string, id: string): Promise<SavedLayout> {
  const layout = await prisma.savedLayout.findFirst({ where: { id, userId } });
  if (!layout) throw new NotFoundError('Saved layout not found');
  return layout;
}

export async function getLayout(userId: string, id: string): Promise<LayoutDto> {
  return toLayoutDto(await requireLayout(userId, id));
}

export async function createLayout(userId: string, input: CreateLayoutInput): Promise<LayoutDto> {
  await validateCameraIds(userId, input.cameraIds);
  try {
    const layout = await prisma.savedLayout.create({
      data: {
        userId,
        name: input.name,
        layout: input.kind,
        cameraIds: input.cameraIds,
      },
    });
    return toLayoutDto(layout);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A layout with this name already exists');
    throw err;
  }
}

export async function updateLayout(
  userId: string,
  id: string,
  input: UpdateLayoutInput
): Promise<LayoutDto> {
  const existing = await requireLayout(userId, id);

  const effectiveKind = input.kind ?? existing.layout;
  const effectiveCameraIds = input.cameraIds ?? (existing.cameraIds as string[]);
  if (effectiveCameraIds.length > LAYOUT_MAX_CAMERAS[effectiveKind]) {
    throw new ValidationError('Too many cameras for the selected layout kind');
  }
  if (input.cameraIds) await validateCameraIds(userId, input.cameraIds);

  try {
    const updated = await prisma.savedLayout.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { layout: input.kind } : {}),
        ...(input.cameraIds !== undefined ? { cameraIds: input.cameraIds } : {}),
      },
    });
    return toLayoutDto(updated);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('A layout with this name already exists');
    throw err;
  }
}

export async function deleteLayout(userId: string, id: string): Promise<void> {
  await requireLayout(userId, id);
  await prisma.savedLayout.delete({ where: { id } });
}
