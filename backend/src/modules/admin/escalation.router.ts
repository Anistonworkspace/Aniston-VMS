import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createPolicySchema,
  createRecipientSchema,
  createStepSchema,
  policyIdParamsSchema,
  policyListQuerySchema,
  recipientIdParamsSchema,
  recipientListQuerySchema,
  stepIdParamsSchema,
  updatePolicySchema,
  updateRecipientSchema,
  updateStepSchema,
} from './escalation.schemas.js';
import * as escalationService from './escalation.service.js';

// Escalation config is operationally owned by SUPER_ADMIN and PROJECT_ADMIN
// (zone-scoped) alike — unlike user/role management this isn't security
// sensitive enough to restrict writes to SUPER_ADMIN only. See report §2.
const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN'] as const;

export const escalationRouter = Router();

escalationRouter.use(requireAuth);

// ── Policies ─────────────────────────────────────────────────────────────
escalationRouter.get(
  '/escalation-policies',
  requireRole(...ADMIN_ROLES),
  validateRequest({ query: policyListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof policyListQuerySchema>;
    const data = await escalationService.listPolicies(authUser(req), filters);
    res.json({ success: true, data });
  })
);

escalationRouter.get(
  '/escalation-policies/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: policyIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.getPolicyById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

escalationRouter.post(
  '/escalation-policies',
  requireRole(...ADMIN_ROLES),
  validateRequest({ body: createPolicySchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.createPolicy(req.body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

escalationRouter.patch(
  '/escalation-policies/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: policyIdParamsSchema, body: updatePolicySchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.updatePolicy(req.params.id, req.body, authUser(req), req);
    res.json({ success: true, data });
  })
);

escalationRouter.delete(
  '/escalation-policies/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: policyIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await escalationService.deletePolicy(req.params.id, authUser(req), req);
    res.status(204).send();
  })
);

// ── Steps (children of a policy) ────────────────────────────────────────
escalationRouter.get(
  '/escalation-policies/:id/steps',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: policyIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.listSteps(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

escalationRouter.post(
  '/escalation-policies/:id/steps',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: policyIdParamsSchema, body: createStepSchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.createStep(req.params.id, req.body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

escalationRouter.patch(
  '/escalation-policies/:id/steps/:stepId',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: stepIdParamsSchema, body: updateStepSchema }),
  asyncHandler(async (req, res) => {
    const { id, stepId } = req.params as unknown as z.infer<typeof stepIdParamsSchema>;
    const data = await escalationService.updateStep(id, stepId, req.body, authUser(req), req);
    res.json({ success: true, data });
  })
);

escalationRouter.delete(
  '/escalation-policies/:id/steps/:stepId',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: stepIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const { id, stepId } = req.params as unknown as z.infer<typeof stepIdParamsSchema>;
    await escalationService.deleteStep(id, stepId, authUser(req), req);
    res.status(204).send();
  })
);

// ── Zone alert recipients ───────────────────────────────────────────────
escalationRouter.get(
  '/zone-alert-recipients',
  requireRole(...ADMIN_ROLES),
  validateRequest({ query: recipientListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof recipientListQuerySchema>;
    const data = await escalationService.listRecipients(authUser(req), filters);
    res.json({ success: true, data });
  })
);

escalationRouter.get(
  '/zone-alert-recipients/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: recipientIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.getRecipientById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

escalationRouter.post(
  '/zone-alert-recipients',
  requireRole(...ADMIN_ROLES),
  validateRequest({ body: createRecipientSchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.createRecipient(req.body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

escalationRouter.patch(
  '/zone-alert-recipients/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: recipientIdParamsSchema, body: updateRecipientSchema }),
  asyncHandler(async (req, res) => {
    const data = await escalationService.updateRecipient(
      req.params.id,
      req.body,
      authUser(req),
      req
    );
    res.json({ success: true, data });
  })
);

escalationRouter.delete(
  '/zone-alert-recipients/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: recipientIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await escalationService.deleteRecipient(req.params.id, authUser(req), req);
    res.status(204).send();
  })
);
