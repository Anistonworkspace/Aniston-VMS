import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// ─────────────────────────────────────────────────────────────────────────────
// Regression: GET /api/media/authorize must be reachable WITHOUT a user JWT.
//
// The Live Wall outage was an app.ts MOUNT-ORDERING bug. `mediaAuthRouter` was
// mounted AFTER a router that applies a router-level `requireAuth` (healthRouter
// onward). Router-level middleware runs for every `/api/*` request that reaches
// it, so nginx's unauthenticated `auth_request` subrequest to
// `/api/media/authorize` was rejected with 401 "Missing Bearer token" BEFORE it
// ever reached the media handler — every Live tile's <video> got a 401 from the
// auth_request gate and the player looped on it.
//
// The media authorize endpoint has its OWN auth: a signed, HttpOnly media cookie
// (no user JWT). Its contract is 204 = allow, 403 { success: false } = deny. This
// test locks the invariant at the WHOLE-APP level (real createApp() wiring): an
// unauthenticated GET /api/media/authorize must get the media router's own 403,
// NOT the global Bearer guard's 401. If mediaAuthRouter is ever remounted behind
// a router-level requireAuth again, the status flips to 401 and this test fails.
//
// NOTE: the per-scenario auth logic (valid / expired / tampered / wrong-path /
// ended-session) is covered by media-auth.router.test.ts against the router in
// isolation. This file exists solely to guard the app.ts mount ORDER, which a
// router-isolation test structurally cannot catch.
// ─────────────────────────────────────────────────────────────────────────────

// createApp() imports the entire router graph. Two leaf deps open real sockets,
// so stub them for a hermetic unit test with no infra:
//  - lib/redis.ts constructs ioredis with lazyConnect:false (connects at import),
//    and generalLimiter's RedisRateStore calls it on EVERY request — incr must
//    return a low count and pttl a positive ttl so the limiter allows the request.
//  - lib/prisma.ts is stubbed defensively; the no-cookie path 403s (fail-closed)
//    before any query runs, but createApp wires every router so keep it inert.
vi.mock('./lib/redis.js', () => ({
  redis: {
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(1),
    pttl: vi.fn().mockResolvedValue(60_000),
    decr: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(1),
  },
  bullConnection: { host: '127.0.0.1', port: 6379 },
}));

vi.mock('./lib/prisma.js', () => {
  const model = new Proxy({}, { get: () => vi.fn() });
  return { prisma: new Proxy({}, { get: () => model }) };
});

const { createApp } = await import('./app.js');
const app = createApp();

// A well-formed media path (env=sim, kind=playback, camera, session, leaf). With
// no media cookie the router fail-closes to 403 — it can NEVER 204 (that needs a
// valid cookie + active session), and it must never be the Bearer guard's 401.
const MEDIA_URI = '/media/hls/sim/playback/CAM-GGN-021/sess-1/index.m3u8';

describe('app wiring: /api/media/authorize sits in the public block (Live Wall auth_request gate)', () => {
  it('GET is served by mediaAuthRouter (403 deny), NOT the global Bearer guard (401)', async () => {
    // Exactly what nginx auth_request sends on first tile load: no Authorization
    // header, no media cookie yet.
    const res = await request(app)
      .get('/api/media/authorize')
      .set('X-Original-URI', MEDIA_URI);

    // The regression signal — must NOT be the router-level requireAuth rejection.
    expect(res.status).not.toBe(401);
    expect(res.body?.message).not.toBe('Missing Bearer token');

    // Positive proof it reached the media router's own fail-closed denial.
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false });
  });

  it('owns every GET /api/media/authorize — even a bare subrequest with no X-Original-URI stays 403, never the Bearer 401', async () => {
    // nginx issues the auth_request subrequest as a GET (the endpoint is GET-only
    // by design — method-independence for the real media verb is an nginx-config
    // property, see media-auth.router.test.ts). Even a degenerate GET with no
    // X-Original-URI must be owned by the media router's fail-closed 403, proving
    // nothing downstream (healthRouter's requireAuth) ever sees this path.
    const res = await request(app).get('/api/media/authorize');
    expect(res.status).not.toBe(401);
    expect(res.body?.message).not.toBe('Missing Bearer token');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false });
  });
});
