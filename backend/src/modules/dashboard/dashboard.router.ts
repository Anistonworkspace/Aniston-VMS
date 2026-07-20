import { Router } from 'express';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as dashboardService from './dashboard.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// CR-2 dashboard API (mounted at /api):
//   GET /dashboard/overview   — scope-aware KPI counts + worst-connections and
//                               missing-snapshots widget rows for the landing page.
// CR-8 zone drill-down:
//   GET /dashboard/zones      — scope-aware zone cards (sidebar + dashboard grid).
//   GET /dashboard/zones/:id  — populated single-zone overview page.
// ─────────────────────────────────────────────────────────────────────────────

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/dashboard/overview',
  asyncHandler(async (req, res) => {
    const data = await dashboardService.getDashboardOverview(authUser(req).id);
    res.json({ success: true, data });
  })
);

dashboardRouter.get(
  '/dashboard/zones',
  asyncHandler(async (req, res) => {
    const data = await dashboardService.listZoneSummaries(authUser(req).id);
    res.json({ success: true, data });
  })
);

dashboardRouter.get(
  '/dashboard/zones/:id',
  asyncHandler(async (req, res) => {
    const data = await dashboardService.getZoneOverview(req.params.id, authUser(req).id);
    res.json({ success: true, data });
  })
);
