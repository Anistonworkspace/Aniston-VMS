import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { getUserScope, zoneScopeWhere } from '../../lib/scope.js';
import { ConflictError, NotFoundError } from '../../middleware/errorHandler.js';
import type { AuthUser as ActorUser } from '../../middleware/auth.js';
import type {
  CreatePolicyInput,
  CreateRecipientInput,
  CreateStepInput,
  PolicyListQuery,
  RecipientListQuery,
  UpdatePolicyInput,
  UpdateRecipientInput,
  UpdateStepInput,
} from './escalation.schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin API — EscalationPolicy / EscalationStep / ZoneAlertRecipient CRUD.
//
// IMPORTANT (read before editing): backend/src/modules/incidents/escalation.worker.ts
// (read-only reference) does NOT currently read EscalationPolicy or
// EscalationStep at all — it climbs a hardcoded ESCALATION_LADDER constant
// from incident.constants.ts. The only one of these three tables the runtime
// alert path actually reads is ZoneAlertRecipient, via
// notification.service.ts#dispatchIncidentAlerts (zoneId + severity +
// escalationLevel <= fired level). So this module's Policy/Step endpoints are
// forward-compatible config scaffolding with no live runtime effect yet;
// ZoneAlertRecipient endpoints are the ones that immediately affect alert
// delivery. See final report §5 for more detail.
//
// Scope: EscalationPolicy.zoneId is nullable (null = default/fallback policy,
// always visible). ZoneAlertRecipient.zoneId is required. Both are filtered
// through the caller's UserAccessScope via lib/scope.ts, same as every other
// zone-relation query in the codebase.
// ─────────────────────────────────────────────────────────────────────────────

async function policyScopeWhere(actor: ActorUser): Promise<Prisma.EscalationPolicyWhereInput> {
  const scope = await getUserScope(actor.id);
  return { OR: [{ zoneId: null }, { zone: zoneScopeWhere(scope) }] };
}

async function findPolicyOrThrow(id: string, actor: ActorUser) {
  const policy = await prisma.escalationPolicy.findFirst({
    where: { AND: [{ id }, await policyScopeWhere(actor)] },
    include: {
      zone: { select: { id: true, name: true } },
      steps: { orderBy: { afterMinutes: 'asc' } },
    },
  });
  if (!policy) throw new NotFoundError('Escalation policy not found');
  return policy;
}

async function findRecipientOrThrow(id: string, actor: ActorUser) {
  const scope = await getUserScope(actor.id);
  const recipient = await prisma.zoneAlertRecipient.findFirst({
    where: { AND: [{ id }, { zone: zoneScopeWhere(scope) }] },
    include: { zone: { select: { id: true, name: true } } },
  });
  if (!recipient) throw new NotFoundError('Zone alert recipient not found');
  return recipient;
}

async function assertZoneInScope(zoneId: string, actor: ActorUser): Promise<void> {
  const scope = await getUserScope(actor.id);
  const zone = await prisma.zone.findFirst({
    where: { AND: [{ id: zoneId }, zoneScopeWhere(scope)] },
    select: { id: true },
  });
  if (!zone) throw new NotFoundError('Zone not found');
}

// ── Policies ────────────────────────────────────────────────────────────────

export async function listPolicies(actor: ActorUser, filters: PolicyListQuery) {
  const { page, limit, zoneId } = filters;
  const scopeWhere = await policyScopeWhere(actor);
  const where: Prisma.EscalationPolicyWhereInput = zoneId
    ? { AND: [scopeWhere, { zoneId }] }
    : scopeWhere;

  const [items, total] = await Promise.all([
    prisma.escalationPolicy.findMany({
      where,
      include: {
        zone: { select: { id: true, name: true } },
        steps: { orderBy: { afterMinutes: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.escalationPolicy.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getPolicyById(id: string, actor: ActorUser) {
  return findPolicyOrThrow(id, actor);
}

export async function createPolicy(input: CreatePolicyInput, actor: ActorUser, req: Request) {
  if (input.zoneId) await assertZoneInScope(input.zoneId, actor);

  const policy = await prisma.escalationPolicy.create({
    data: { name: input.name, zoneId: input.zoneId ?? null },
    include: { zone: { select: { id: true, name: true } }, steps: true },
  });

  await audit(req, {
    userId: actor.id,
    action: 'escalation_policy.create',
    entityType: 'EscalationPolicy',
    entityId: policy.id,
    newValue: policy as unknown as Prisma.InputJsonValue,
  });

  return policy;
}

export async function updatePolicy(
  id: string,
  input: UpdatePolicyInput,
  actor: ActorUser,
  req: Request
) {
  const before = await findPolicyOrThrow(id, actor);

  if (input.zoneId) await assertZoneInScope(input.zoneId, actor);

  const data: Prisma.EscalationPolicyUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.zoneId !== undefined) {
    data.zone = input.zoneId === null ? { disconnect: true } : { connect: { id: input.zoneId } };
  }

  const updated = await prisma.escalationPolicy.update({
    where: { id },
    data,
    include: {
      zone: { select: { id: true, name: true } },
      steps: { orderBy: { afterMinutes: 'asc' } },
    },
  });

  await audit(req, {
    userId: actor.id,
    action: 'escalation_policy.update',
    entityType: 'EscalationPolicy',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

export async function deletePolicy(id: string, actor: ActorUser, req: Request): Promise<void> {
  const before = await findPolicyOrThrow(id, actor);

  try {
    await prisma.$transaction([
      prisma.escalationStep.deleteMany({ where: { policyId: id } }),
      prisma.escalationPolicy.delete({ where: { id } }),
    ]);
  } catch (err) {
    // P2003 = FK constraint still references this policy (e.g. an AlertRule) —
    // AlertRule is out of scope for this module (read-only elsewhere), so we
    // surface a clear conflict instead of a raw 500.
    if ((err as Prisma.PrismaClientKnownRequestError)?.code === 'P2003') {
      throw new ConflictError(
        'Escalation policy is still referenced by other records (e.g. alert rules)'
      );
    }
    throw err;
  }

  await audit(req, {
    userId: actor.id,
    action: 'escalation_policy.delete',
    entityType: 'EscalationPolicy',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}

// ── Steps (children of a policy) ─────────────────────────────────────────────

export async function listSteps(policyId: string, actor: ActorUser) {
  const policy = await findPolicyOrThrow(policyId, actor);
  return policy.steps;
}

export async function createStep(
  policyId: string,
  input: CreateStepInput,
  actor: ActorUser,
  req: Request
) {
  await findPolicyOrThrow(policyId, actor);

  const step = await prisma.escalationStep.create({
    data: {
      policyId,
      afterMinutes: input.afterMinutes,
      recipientLevel: input.recipientLevel,
      channels: input.channels,
    },
  });

  await audit(req, {
    userId: actor.id,
    action: 'escalation_step.create',
    entityType: 'EscalationStep',
    entityId: step.id,
    newValue: step as unknown as Prisma.InputJsonValue,
  });

  return step;
}

async function findStepOrThrow(policyId: string, stepId: string, actor: ActorUser) {
  await findPolicyOrThrow(policyId, actor);
  const step = await prisma.escalationStep.findFirst({ where: { id: stepId, policyId } });
  if (!step) throw new NotFoundError('Escalation step not found');
  return step;
}

export async function updateStep(
  policyId: string,
  stepId: string,
  input: UpdateStepInput,
  actor: ActorUser,
  req: Request
) {
  const before = await findStepOrThrow(policyId, stepId, actor);

  const data: Prisma.EscalationStepUpdateInput = {};
  if (input.afterMinutes !== undefined) data.afterMinutes = input.afterMinutes;
  if (input.recipientLevel !== undefined) data.recipientLevel = input.recipientLevel;
  if (input.channels !== undefined) data.channels = input.channels;

  const updated = await prisma.escalationStep.update({ where: { id: stepId }, data });

  await audit(req, {
    userId: actor.id,
    action: 'escalation_step.update',
    entityType: 'EscalationStep',
    entityId: stepId,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

export async function deleteStep(
  policyId: string,
  stepId: string,
  actor: ActorUser,
  req: Request
): Promise<void> {
  const before = await findStepOrThrow(policyId, stepId, actor);

  await prisma.escalationStep.delete({ where: { id: stepId } });

  await audit(req, {
    userId: actor.id,
    action: 'escalation_step.delete',
    entityType: 'EscalationStep',
    entityId: stepId,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}

// ── Zone alert recipients ────────────────────────────────────────────────────

export async function listRecipients(actor: ActorUser, filters: RecipientListQuery) {
  const { page, limit, zoneId, severity, channel } = filters;
  const scope = await getUserScope(actor.id);

  const where: Prisma.ZoneAlertRecipientWhereInput = {
    zone: zoneScopeWhere(scope),
    ...(zoneId ? { zoneId } : {}),
    ...(severity ? { severity } : {}),
    ...(channel ? { channel } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.zoneAlertRecipient.findMany({
      where,
      include: { zone: { select: { id: true, name: true } } },
      orderBy: [{ zoneId: 'asc' }, { escalationLevel: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.zoneAlertRecipient.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getRecipientById(id: string, actor: ActorUser) {
  return findRecipientOrThrow(id, actor);
}

export async function createRecipient(input: CreateRecipientInput, actor: ActorUser, req: Request) {
  await assertZoneInScope(input.zoneId, actor);

  const recipient = await prisma.zoneAlertRecipient.create({
    data: {
      zoneId: input.zoneId,
      severity: input.severity,
      channel: input.channel,
      recipient: input.recipient,
      escalationLevel: input.escalationLevel,
    },
    include: { zone: { select: { id: true, name: true } } },
  });

  await audit(req, {
    userId: actor.id,
    action: 'zone_alert_recipient.create',
    entityType: 'ZoneAlertRecipient',
    entityId: recipient.id,
    newValue: recipient as unknown as Prisma.InputJsonValue,
  });

  return recipient;
}

export async function updateRecipient(
  id: string,
  input: UpdateRecipientInput,
  actor: ActorUser,
  req: Request
) {
  const before = await findRecipientOrThrow(id, actor);

  const data: Prisma.ZoneAlertRecipientUpdateInput = {};
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.channel !== undefined) data.channel = input.channel;
  if (input.recipient !== undefined) data.recipient = input.recipient;
  if (input.escalationLevel !== undefined) data.escalationLevel = input.escalationLevel;

  const updated = await prisma.zoneAlertRecipient.update({
    where: { id },
    data,
    include: { zone: { select: { id: true, name: true } } },
  });

  await audit(req, {
    userId: actor.id,
    action: 'zone_alert_recipient.update',
    entityType: 'ZoneAlertRecipient',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
    newValue: updated as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

export async function deleteRecipient(id: string, actor: ActorUser, req: Request): Promise<void> {
  const before = await findRecipientOrThrow(id, actor);

  await prisma.zoneAlertRecipient.delete({ where: { id } });

  await audit(req, {
    userId: actor.id,
    action: 'zone_alert_recipient.delete',
    entityType: 'ZoneAlertRecipient',
    entityId: id,
    oldValue: before as unknown as Prisma.InputJsonValue,
  });
}
