import { Router } from 'express';
import type { PaginationInput } from '@aniston-vms/shared';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as cameraService from './camera.service.js';
import {
  cameraIdParamsSchema,
  cameraListQuerySchema,
  createCameraSchema,
  createReferenceImageSchema,
  referenceImageIdParamsSchema,
  referenceImageListQuerySchema,
  testCameraConnectionSchema,
  updateCameraSchema,
} from './camera.schemas.js';
import type {
  CameraListQuery,
  CreateCameraInput,
  CreateReferenceImageInput,
  TestCameraConnectionInput,
  UpdateCameraInput,
} from './camera.schemas.js';

// Cameras — leaf of the Region → Zone → Site → Router → Camera hierarchy.
// GET routes are open to any authenticated role (scope filtering happens in
// camera.service.ts); writes are restricted like Router's in hierarchy.router.ts
// (engineers commission/decommission cameras, only admins may delete).

const CAMERA_WRITE_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'ENGINEER'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN'] as const;

export const cameraRouter = Router();

cameraRouter.use(requireAuth);

// GET /cameras — scoped list
cameraRouter.get(
  '/',
  validateRequest({ query: cameraListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as CameraListQuery;
    const data = await cameraService.listCameras(authUser(req), filters);
    res.json({ success: true, data });
  })
);

// GET /cameras/:id — detail (403 ForbiddenError if out of scope)
cameraRouter.get(
  '/:id',
  validateRequest({ params: cameraIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: string };
    const data = await cameraService.getCameraById(params.id, authUser(req));
    res.json({ success: true, data });
  })
);

// POST /cameras — create
cameraRouter.post(
  '/',
  requireRole(...CAMERA_WRITE_ROLES),
  validateRequest({ body: createCameraSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCameraInput;
    const data = await cameraService.createCamera(body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

// POST /cameras/test-connection — CR-6 pre-registration probe (RTSP DESCRIBE +
// one ffprobe frame; sim-aware). Gated like create, but nothing is persisted
// and no audit row is written — it is a read-only network probe.
cameraRouter.post(
  '/test-connection',
  requireRole(...CAMERA_WRITE_ROLES),
  validateRequest({ body: testCameraConnectionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as TestCameraConnectionInput;
    const data = await cameraService.testCameraConnection(body);
    res.json({ success: true, data });
  })
);

// PATCH /cameras/:id — update
cameraRouter.patch(
  '/:id',
  requireRole(...CAMERA_WRITE_ROLES),
  validateRequest({ params: cameraIdParamsSchema, body: updateCameraSchema }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: string };
    const body = req.body as UpdateCameraInput;
    const data = await cameraService.updateCamera(params.id, body, authUser(req), req);
    res.json({ success: true, data });
  })
);

// DELETE /cameras/:id — delete (409 ConflictError if incidents/reference images exist)
cameraRouter.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: cameraIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: string };
    await cameraService.deleteCamera(params.id, authUser(req), req);
    res.json({ success: true, data: null });
  })
);

// GET /cameras/:id/reference-images — list (each item includes a short-lived
// signed downloadUrl — see lib/storage.ts's signStorageUrl())
cameraRouter.get(
  '/:id/reference-images',
  validateRequest({ params: cameraIdParamsSchema, query: referenceImageListQuerySchema }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: string };
    const filters = req.query as unknown as PaginationInput;
    const data = await cameraService.listReferenceImages(params.id, authUser(req), filters);
    res.json({ success: true, data });
  })
);

// POST /cameras/:id/reference-images — approve a new reference image
cameraRouter.post(
  '/:id/reference-images',
  requireRole(...CAMERA_WRITE_ROLES),
  validateRequest({ params: cameraIdParamsSchema, body: createReferenceImageSchema }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: string };
    const body = req.body as CreateReferenceImageInput;
    const data = await cameraService.approveReferenceImage(params.id, body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

// DELETE /cameras/:id/reference-images/:imageId — revoke an approved reference image
cameraRouter.delete(
  '/:id/reference-images/:imageId',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: referenceImageIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: string; imageId: string };
    await cameraService.deleteReferenceImage(params.id, params.imageId, authUser(req), req);
    res.json({ success: true, data: null });
  })
);
