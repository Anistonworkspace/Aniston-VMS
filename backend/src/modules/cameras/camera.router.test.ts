import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Authorization guard for DELETE /cameras/:id ---------------------------
// Deleting a camera is an ADMIN-ONLY action: the approved design limits it to
// exactly SUPER_ADMIN and PROJECT_ADMIN (camera.router.ts's ADMIN_ROLES).
// Note the trap this test defends against: create/update/test/approve are gated
// by the WIDER CAMERA_WRITE_ROLES, which also includes ENGINEER — so an ENGINEER
// can commission a camera but must NOT be able to delete one. Role enforcement
// lives entirely in the router middleware (requireRole); the service only checks
// access *scope*, never role. That means this regression guard MUST run at the
// router layer. It locks the gate against a future swap of ADMIN_ROLES →
// CAMERA_WRITE_ROLES, which would silently hand ENGINEERs delete rights.

const deleteCamera = vi.fn();

// Only deleteCamera is exercised here; no other route handler is reached.
vi.mock('./camera.service.js', () => ({ deleteCamera }));

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

const del = (role?: string) => {
  const req = request(app).delete(`/cameras/${CAMERA_ID}`);
  return role ? req.set('Authorization', `Bearer ${role}`) : req;
};

beforeEach(() => {
  deleteCamera.mockReset();
  deleteCamera.mockResolvedValue(undefined);
});

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

  // ENGINEER is the critical case: it IS a camera-write role (create/update/
  // approve), which must NOT translate into delete rights. OPERATOR / CLIENT_VIEWER
  // / AUDITOR round out the non-admin roles.
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
