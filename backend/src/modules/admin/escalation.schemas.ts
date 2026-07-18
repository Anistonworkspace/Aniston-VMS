import { z } from 'zod';
import { Channel, Severity } from '@prisma/client';
import { PaginationSchema, UuidParamSchema } from '@aniston-vms/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Admin API — request validation for EscalationPolicy / EscalationStep /
// ZoneAlertRecipient management. Field names match prisma/schema.prisma
// `model EscalationPolicy` / `model EscalationStep` / `model ZoneAlertRecipient`
// exactly (see escalation.service.ts header comment) — these are the same
// tables backend/src/modules/incidents/escalation.worker.ts and
// notification.service.ts already read from, so field usage here (e.g.
// `afterMinutes`, `recipientLevel`, `escalationLevel`) must stay in lockstep.
// ─────────────────────────────────────────────────────────────────────────────

export const policyIdParamsSchema = UuidParamSchema;

export const stepIdParamsSchema = z.object({
  id: z.string().uuid(), // :id → policy id
  stepId: z.string().uuid(),
});
export type StepIdParams = z.infer<typeof stepIdParamsSchema>;

export const recipientIdParamsSchema = UuidParamSchema; // :id → zone alert recipient id

export const policyListQuerySchema = PaginationSchema.extend({
  zoneId: z.string().uuid().optional(),
});
export type PolicyListQuery = z.infer<typeof policyListQuerySchema>;

export const createPolicySchema = z.object({
  name: z.string().min(1).max(200),
  // null/omitted = default (fallback) policy, matching EscalationPolicy.zoneId nullable
  zoneId: z.string().uuid().optional(),
});
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    // explicit null clears zoneId back to "default policy"
    zoneId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;

export const createStepSchema = z.object({
  afterMinutes: z.number().int().min(0).max(10_080), // up to 7 days
  recipientLevel: z.string().min(1).max(100),
  channels: z.array(z.nativeEnum(Channel)).min(1),
});
export type CreateStepInput = z.infer<typeof createStepSchema>;

export const updateStepSchema = z
  .object({
    afterMinutes: z.number().int().min(0).max(10_080).optional(),
    recipientLevel: z.string().min(1).max(100).optional(),
    channels: z.array(z.nativeEnum(Channel)).min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateStepInput = z.infer<typeof updateStepSchema>;

export const recipientListQuerySchema = PaginationSchema.extend({
  zoneId: z.string().uuid().optional(),
  severity: z.nativeEnum(Severity).optional(),
  channel: z.nativeEnum(Channel).optional(),
});
export type RecipientListQuery = z.infer<typeof recipientListQuerySchema>;

export const createRecipientSchema = z.object({
  zoneId: z.string().uuid(),
  severity: z.nativeEnum(Severity),
  channel: z.nativeEnum(Channel),
  recipient: z.string().min(1).max(320), // email address or E.164 phone/WhatsApp id
  escalationLevel: z.number().int().min(1).max(10),
});
export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;

export const updateRecipientSchema = z
  .object({
    severity: z.nativeEnum(Severity).optional(),
    channel: z.nativeEnum(Channel).optional(),
    recipient: z.string().min(1).max(320).optional(),
    escalationLevel: z.number().int().min(1).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateRecipientInput = z.infer<typeof updateRecipientSchema>;
