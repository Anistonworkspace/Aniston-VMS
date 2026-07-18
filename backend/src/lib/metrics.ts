import { Router, type RequestHandler } from 'express';
import { Registry, collectDefaultMetrics, Histogram, Counter } from 'prom-client';
import { asyncHandler } from '../utils/asyncHandler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Prometheus metrics (prom-client). Mounted PUBLIC at GET /api/metrics in
// app.ts (no requireAuth — Prometheus scrapers don't carry a Bearer token;
// restrict network access to this path at the reverse-proxy/firewall level in
// production the same way you would for any /metrics endpoint).
// ─────────────────────────────────────────────────────────────────────────────

export const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    // req.route is only set once express matches a route; fall back to path so
    // 404s still get recorded without creating unbounded label cardinality from
    // random ids (best-effort — good enough for a metrics endpoint, not a perfect
    // route-template resolver).
    const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestDuration.observe(labels, seconds);
    httpRequestsTotal.inc(labels);
  });
  next();
};

// GET /api/metrics — PUBLIC (no requireAuth, see header comment above).
export const metricsRouter = Router();

metricsRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  })
);
