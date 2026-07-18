import { Router } from 'express';
import type { z } from 'zod';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createRegionSchema,
  createRouterSchema,
  createSiteSchema,
  createZoneSchema,
  regionIdParamsSchema,
  regionListQuerySchema,
  routerIdParamsSchema,
  routerListQuerySchema,
  siteIdParamsSchema,
  siteListQuerySchema,
  updateRegionSchema,
  updateRouterSchema,
  updateSiteSchema,
  updateZoneSchema,
  zoneIdParamsSchema,
  zoneListQuerySchema,
} from './hierarchy.schemas.js';
import * as hierarchyService from './hierarchy.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy API (mounted at /api) — Region → Zone → Site → Router directory.
//   GET    /regions               — scoped list (?q&page&limit)
//   GET    /regions/:id           — detail
//   POST   /regions               — create (ADMIN_ROLES)
//   PATCH  /regions/:id           — update (ADMIN_ROLES)
//   DELETE /regions/:id           — delete (ADMIN_ROLES) — 409 if zones exist
//   GET    /zones                 — scoped list (?regionId&q&page&limit)
//   GET    /zones/:id             — detail
//   POST   /zones                 — create (ADMIN_ROLES)
//   PATCH  /zones/:id             — update (ADMIN_ROLES)
//   DELETE /zones/:id             — delete (ADMIN_ROLES) — 409 if sites exist
//   GET    /sites                 — scoped list (?zoneId&regionId&q&page&limit)
//   GET    /sites/:id             — detail
//   POST   /sites                 — create (ADMIN_ROLES)
//   PATCH  /sites/:id             — update (ADMIN_ROLES)
//   DELETE /sites/:id             — delete (ADMIN_ROLES) — 409 if routers/cameras exist
//   GET    /routers                — scoped list (?siteId&q&page&limit)
//   GET    /routers/:id            — detail
//   POST   /routers                — create (ROUTER_WRITE_ROLES — admins + engineers commission gear)
//   PATCH  /routers/:id            — update (ROUTER_WRITE_ROLES)
//   DELETE /routers/:id            — delete (ADMIN_ROLES) — 409 if cameras attached
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN'] as const;
const ROUTER_WRITE_ROLES = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'ENGINEER'] as const;

export const hierarchyRouter = Router();

hierarchyRouter.use(requireAuth);

// ── Regions ──────────────────────────────────────────────────────────────────

hierarchyRouter.get(
  '/regions',
  validateRequest({ query: regionListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof regionListQuerySchema>;
    const data = await hierarchyService.listRegions(authUser(req), filters);
    res.json({ success: true, data });
  })
);

hierarchyRouter.get(
  '/regions/:id',
  validateRequest({ params: regionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await hierarchyService.getRegionById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

hierarchyRouter.post(
  '/regions',
  requireRole(...ADMIN_ROLES),
  validateRequest({ body: createRegionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createRegionSchema>;
    const data = await hierarchyService.createRegion(body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

hierarchyRouter.patch(
  '/regions/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: regionIdParamsSchema, body: updateRegionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateRegionSchema>;
    const data = await hierarchyService.updateRegion(req.params.id, body, authUser(req), req);
    res.json({ success: true, data });
  })
);

hierarchyRouter.delete(
  '/regions/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: regionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await hierarchyService.deleteRegion(req.params.id, authUser(req), req);
    res.json({ success: true, data: null });
  })
);

// ── Zones ────────────────────────────────────────────────────────────────────

hierarchyRouter.get(
  '/zones',
  validateRequest({ query: zoneListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof zoneListQuerySchema>;
    const data = await hierarchyService.listZones(authUser(req), filters);
    res.json({ success: true, data });
  })
);

hierarchyRouter.get(
  '/zones/:id',
  validateRequest({ params: zoneIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await hierarchyService.getZoneById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

hierarchyRouter.post(
  '/zones',
  requireRole(...ADMIN_ROLES),
  validateRequest({ body: createZoneSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createZoneSchema>;
    const data = await hierarchyService.createZone(body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

hierarchyRouter.patch(
  '/zones/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: zoneIdParamsSchema, body: updateZoneSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateZoneSchema>;
    const data = await hierarchyService.updateZone(req.params.id, body, authUser(req), req);
    res.json({ success: true, data });
  })
);

hierarchyRouter.delete(
  '/zones/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: zoneIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await hierarchyService.deleteZone(req.params.id, authUser(req), req);
    res.json({ success: true, data: null });
  })
);

// ── Sites ────────────────────────────────────────────────────────────────────

hierarchyRouter.get(
  '/sites',
  validateRequest({ query: siteListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof siteListQuerySchema>;
    const data = await hierarchyService.listSites(authUser(req), filters);
    res.json({ success: true, data });
  })
);

hierarchyRouter.get(
  '/sites/:id',
  validateRequest({ params: siteIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await hierarchyService.getSiteById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

hierarchyRouter.post(
  '/sites',
  requireRole(...ADMIN_ROLES),
  validateRequest({ body: createSiteSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSiteSchema>;
    const data = await hierarchyService.createSite(body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

hierarchyRouter.patch(
  '/sites/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: siteIdParamsSchema, body: updateSiteSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSiteSchema>;
    const data = await hierarchyService.updateSite(req.params.id, body, authUser(req), req);
    res.json({ success: true, data });
  })
);

hierarchyRouter.delete(
  '/sites/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: siteIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await hierarchyService.deleteSite(req.params.id, authUser(req), req);
    res.json({ success: true, data: null });
  })
);

// ── Routers ──────────────────────────────────────────────────────────────────

hierarchyRouter.get(
  '/routers',
  validateRequest({ query: routerListQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof routerListQuerySchema>;
    const data = await hierarchyService.listRouters(authUser(req), filters);
    res.json({ success: true, data });
  })
);

hierarchyRouter.get(
  '/routers/:id',
  validateRequest({ params: routerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await hierarchyService.getRouterById(req.params.id, authUser(req));
    res.json({ success: true, data });
  })
);

hierarchyRouter.post(
  '/routers',
  requireRole(...ROUTER_WRITE_ROLES),
  validateRequest({ body: createRouterSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createRouterSchema>;
    const data = await hierarchyService.createRouter(body, authUser(req), req);
    res.status(201).json({ success: true, data });
  })
);

hierarchyRouter.patch(
  '/routers/:id',
  requireRole(...ROUTER_WRITE_ROLES),
  validateRequest({ params: routerIdParamsSchema, body: updateRouterSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateRouterSchema>;
    const data = await hierarchyService.updateRouter(req.params.id, body, authUser(req), req);
    res.json({ success: true, data });
  })
);

hierarchyRouter.delete(
  '/routers/:id',
  requireRole(...ADMIN_ROLES),
  validateRequest({ params: routerIdParamsSchema }),
  asyncHandler(async (req, res) => {
    await hierarchyService.deleteRouter(req.params.id, authUser(req), req);
    res.json({ success: true, data: null });
  })
);
