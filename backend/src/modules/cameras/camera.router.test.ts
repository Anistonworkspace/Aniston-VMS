import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Router-layer authorization guards for the camera lifecycle -------------
// Role enforcement lives ENTIRELY in the router middleware (requireRole); the
// service only checks access *scope*, never role. So these regression guards
// MUST run at the router layer.
//
// Two gates exist, and the split is the whole point of this suite:
//   • CAMERA_WRITE_ROLES = SUPER_ADMIN, PROJECT_ADMIN, ENGINEER — commission a
//     camera: register / configure / activate / deactivate / update / approve.
//   • ADMIN_ROLES        = SUPER_ADMIN, PROJECT_ADMIN — delete only.
// ENGINEER is the trap in BOTH directions: it IS a write role (so it may drive
// the whole DRAFT→CONFIGURED lifecycle) but must NOT be able to delete. These
// tests lock the gate against a future swap of ADMIN_ROLES ↔ CAMERA_WRITE_ROLES.

const registerCamera = vi.fn();
const configureCamera = vi.fn();
const activateCamera = vi.fn();
const deactivateCamera = vi.fn();
const deleteCamera = vi.fn();

vi.mock('./camera.service.js', () => ({
  registerCamera,
  configureCamera,
  activateCamera,
  deactivateCamera,
  deleteCamera,
}));

// Decode the Bearer token AS the caller's role, so each request can assume an
// identity without minting real JWTs. verifyAccessToken is the exact seam that
// requireAuth (middleware/auth.ts) uses to populate req.user.
vi.mock('../../utils/tokens.js', () => ({
  verifyAccessToken: (token: string) => ({ sub: 'user-1', role: token, email: 'user@example.com' }),
}));

const { cameraRouter } = await import('./camera.router.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');

const app = express();
app.use(express.json());
app.use('/cameras', cameraRouter);
app.use(errorHandler);

const CAMERA_ID = '11111111-1111-4111-8111-111111111111'; // valid v4 UUID
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const ROUTER_ID = '22222222-2222-4222-8222-222222222222';

const WRITE_ALLOWED = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'ENGINEER'];
// ENGINEER is intentionally ABSENT here: it is a write role but not an admin,
// so it must be forbidden from DELETE (covered in the admin-only block below).
const WRITE_FORBIDDEN = ['OPERATOR', 'CLIENT_VIEWER', 'AUDITOR'];

// Minimal schema-valid bodies so an authorized request clears validateRequest
// and actually reaches the (mocked) service — the point is to prove the role
// gate passed, not to exercise the service.
const registerBody = { cameraCode: 'CAM-001', name: 'Front Door' };
const configureBody = {
  siteId: SITE_ID,
  routerId: ROUTER_ID,
  mainRtspUrl: 'rtsp://main.example/stream',
  subRtspUrl: 'rtsp://sub.example/stream',
  rtspUsername: 'operator',
  rtspPassword: 's3cret',
  onvifPort: 80,
  playbackAdapter: 'NONE',
  expectedCodec: 'H.264',
  expectedResolution: '1920x1080',
  expectedFps: 15,
  expectedBitrateKbps: 2048,
  latitude: 25.2,
  longitude: 55.3,
};

// Each write route: how to build a request for it, the mock it must reach, and
// the success status a valid authorized call returns.
const WRITE_ROUTES = [
  {
    name: 'POST /cameras (register)',
    getMock: () => registerCamera,
    successStatus: 201,
    build: (role?: string) => {
      const r = request(app).post('/cameras').send(registerBody);
      return role ? r.set('Authorization', `Bearer ${role}`) : r;
    },
  },
  {
    name: 'PUT /cameras/:id/configure',
    getMock: () => configureCamera,
    successStatus: 200,
    build: (role?: string) => {
      const r = request(app).put(`/cameras/${CAMERA_ID}/configure`).send(configureBody);
      return role ? r.set('Authorization', `Bearer ${role}`) : r;
    },
  },
  {
    name: 'POST /cameras/:id/activate',
    getMock: () => activateCamera,
    successStatus: 200,
    build: (role?: string) => {
      const r = request(app).post(`/cameras/${CAMERA_ID}/activate`);
      return role ? r.set('Authorization', `Bearer ${role}`) : r;
    },
  },
  {
    name: 'POST /cameras/:id/deactivate',
    getMock: () => deactivateCamera,
    successStatus: 200,
    build: (role?: string) => {
      const r = request(app).post(`/cameras/${CAMERA_ID}/deactivate`);
      return role ? r.set('Authorization', `Bearer ${role}`) : r;
    },
  },
];

beforeEach(() => {
  for (const m of [registerCamera, configureCamera, activateCamera, deactivateCamera, deleteCamera]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
});

describe.each(WRITE_ROUTES)('$name — camera-write authorization', ({ getMock, successStatus, build }) => {
  it.each(WRITE_ALLOWED)('allows %s and reaches the service', async (role) => {
    const res = await build(role);

    expect(res.status).toBe(successStatus);
    expect(res.body.success).toBe(true);
    expect(getMock()).toHaveBeenCalledTimes(1);
  });

  it.each(WRITE_FORBIDDEN)('forbids %s with 403 and never reaches the service', async (role) => {
    const res = await build(role);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(getMock()).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request with 401 (requireAuth runs first)', async () => {
    const res = await build();

    expect(res.status).toBe(401);
    expect(getMock()).not.toHaveBeenCalled();
  });
});

// --- DELETE /cameras/:id — admin-only authorization ------------------------
// Deleting a camera is an ADMIN-ONLY action (ADMIN_ROLES). The trap: an ENGINEER
// can commission a camera (write role) but must NOT be able to delete one.
const del = (role?: string) => {
  const req = request(app).delete(`/cameras/${CAMERA_ID}`);
  return role ? req.set('Authorization', `Bearer ${role}`) : req;
};

describe('DELETE /cameras/:id — admin-only authorization', () => {
  it.each(['SUPER_ADMIN', 'PROJECT_ADMIN'])('allows %s to delete', async (role) => {
    const res = await del(role);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    expect(deleteCamera).toHaveBeenCalledTimes(1);
    expect(deleteCamera).toHaveBeenCalledWith(
      CAMERA_ID,
      expect.objectContaining({ role }),
      expect.anything(),
    );
  });

  // ENGINEER is the critical case: it IS a camera-write role (register/configure/
  // activate/update/approve), which must NOT translate into delete rights.
  // OPERATOR / CLIENT_VIEWER / AUDITOR round out the non-admin roles.
  it.each(['ENGINEER', 'OPERATOR', 'CLIENT_VIEWER', 'AUDITOR'])(
    'forbids %s with 403 and never reaches the service',
    async (role) => {
      const res = await del(role);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(deleteCamera).not.toHaveBeenCalled();
    },
  );

  it('rejects an unauthenticated request with 401 (requireAuth runs first)', async () => {
    const res = await del();

    expect(res.status).toBe(401);
    expect(deleteCamera).not.toHaveBeenCalled();
  });
});
