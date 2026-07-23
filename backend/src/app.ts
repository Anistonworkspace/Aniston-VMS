import express, { type Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { requestIdContext } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authRouter } from './modules/auth/auth.router.js';
import { healthRouter } from './modules/health/health.router.js';
import { snapshotFileRouter, snapshotRouter } from './modules/snapshots/snapshot.router.js';
import { incidentRouter } from './modules/incidents/incident.router.js';
import { filesRouter } from './modules/files/files.router.js';
import { hierarchyRouter } from './modules/hierarchy/hierarchy.router.js';
import { cameraRouter } from './modules/cameras/camera.router.js';
import { clipRouter } from './modules/clips/clip.router.js';
import { playbackRouter } from './modules/playback/playback.router.js';
import { mediaAuthRouter } from './modules/playback/media-auth.router.js';
import { layoutRouter } from './modules/layouts/layout.router.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.router.js';
import { reportRouter } from './modules/reports/reports.router.js';
import { auditLogRouter } from './modules/admin/audit-log.router.js';
import { escalationRouter } from './modules/admin/escalation.router.js';
import { notificationsRouter } from './modules/admin/notifications.router.js';
import { notificationReadRouter } from './modules/notifications/notification-read.router.js';
import { usersRouter } from './modules/admin/users.router.js';
import { platformRouter } from './modules/health/platform.router.js';
import { dashboardRouter } from './modules/dashboard/dashboard.router.js';
import { settingsRouter } from './modules/settings/settings.router.js';
import { metricsRouter, metricsMiddleware } from './lib/metrics.js';

// ─────────────────────────────────────────────────────────────────────────────
// Generic skeleton app. Ships the cross-cutting middleware stack and a health
// check only. Register your feature routers where marked below — each router is
// built with `/new-module <name>` or `/build-loop`, following the 4-layer MVC
// pattern in .claude/skills/skill-mvc-patterns.md.
// ─────────────────────────────────────────────────────────────────────────────

export function createApp(): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false }));
  app.use(compression());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestIdContext); // sets req.id + AsyncLocalStorage scope so log() injects requestId
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use(generalLimiter);

  app.get('/api/health', async (_req, res) => {
    const checks = { database: 'unknown', redis: 'unknown' };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'down';
    }
    const allOk = Object.values(checks).every((v) => v === 'ok');
    res.status(allOk ? 200 : 503).json({ success: allOk, data: checks });
  });

  // ── Register feature routers here ──────────────────────────────────────────
  app.use('/api/auth', authRouter);
  // Public (no requireAuth) routes MUST come before routers that apply a
  // router-level requireAuth (they run for every /api/* request they see).
  app.use('/api', snapshotFileRouter);
  app.use('/api', filesRouter);
  app.use('/api', metricsRouter);
  // mediaAuthRouter is public (token-gated via signed media cookie, no user JWT).
  // It MUST be mounted before any router that applies a router-level requireAuth
  // (healthRouter onward), otherwise that middleware runs first for every /api/*
  // request and 401s GET /api/media/authorize with "Missing Bearer token" before
  // the reverse-proxy media gate can authorize it.
  app.use('/api', mediaAuthRouter); // public: reverse-proxy media authorization (token-gated, no user JWT)
  app.use('/api', healthRouter);
  app.use('/api', snapshotRouter);
  app.use('/api', incidentRouter);
  app.use('/api', hierarchyRouter);
  app.use('/api/cameras', cameraRouter);
  app.use('/api', clipRouter);
  app.use('/api', playbackRouter);
  app.use('/api', layoutRouter);
  app.use('/api', maintenanceRouter);
  app.use('/api', reportRouter);
  app.use('/api', auditLogRouter);
  app.use('/api', escalationRouter);
  // notificationReadRouter MUST precede notificationsRouter so `/notifications/me`
  // is matched here rather than by the admin router's `/notifications/:id`.
  app.use('/api', notificationReadRouter);
  app.use('/api', notificationsRouter);
  app.use('/api', usersRouter);
  app.use('/api', platformRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', settingsRouter);
  // ───────────────────────────────────────────────────────────────────────────

  app.use((req, _res, next) =>
    next(new NotFoundError(`Route not found: ${req.method} ${req.path}`))
  );
  app.use(errorHandler);

  return app;
}
