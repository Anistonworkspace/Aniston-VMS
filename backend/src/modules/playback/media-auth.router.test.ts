import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// Only streamSession.findFirst is touched by the media-authorize path.
// vi.hoisted keeps prismaMock initialized before the hoisted vi.mock factory
// runs, since the top-level router import eagerly loads the mocked prisma module.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    streamSession: {
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));

// Real signer/verifier — we exercise the actual HMAC end-to-end (only DB is mocked).
import { signMediaPath } from '../../lib/mediaToken.js';
import { mediaAuthRouter, MEDIA_AUTH_COOKIE } from './media-auth.router.js';

// cookie-parser is mounted globally in the real app; the authorizer reads
// req.cookies, so the test app must parse cookies too.
const app = express();
app.use(cookieParser());
app.use(mediaAuthRouter);

// buildMediamtxPath() shape: <env>/<kind>/<cameraCode>/<sessionId> — 4 segments.
// The token is signed over THIS prefix, never the per-request leaf, so every
// child object (variant playlist, init segment, media segments, whep) shares it.
const PREFIX = 'sim/playback/CAM-GGN-021/sess-1';
const liveSession = { id: 'ss-1' };

/** The `/media/hls/<prefix>/<leaf>` path nginx forwards as X-Original-URI. */
function hlsUri(prefix: string, leaf: string): string {
  return `/media/hls/${prefix}/${leaf}`;
}
/** The `media_auth=<exp>.<sig>` cookie value setMediaAuthCookies() emits. */
function authCookie(exp: number, sig: string): string {
  return `${MEDIA_AUTH_COOKIE}=${exp}.${sig}`;
}

beforeEach(() => {
  prismaMock.streamSession.findFirst.mockReset();
});

describe('GET /media/authorize (reverse-proxy media gate)', () => {
  it('204 for the master playlist AND every child object under one session cookie', async () => {
    // THE core fix: exact-leaf binding used to 403 every child after index.m3u8.
    prismaMock.streamSession.findFirst.mockResolvedValue(liveSession);
    const { exp, sig } = signMediaPath(PREFIX);
    const cookie = authCookie(exp, sig);

    // Master, variant playlist, fMP4 init, media segments, and a nested chunk.
    const leaves = ['index.m3u8', 'stream.m3u8', 'init.mp4', 'seg00001.m4s', 'part/seg2.m4s'];
    for (const leaf of leaves) {
      const res = await request(app)
        .get('/media/authorize')
        .set('X-Original-URI', hlsUri(PREFIX, leaf))
        .set('Cookie', cookie);
      expect(res.status).toBe(204);
    }

    // Every child resolved to the SAME 4-segment session prefix — not the leaf.
    for (const call of prismaMock.streamSession.findFirst.mock.calls) {
      expect(call[0]).toEqual({
        where: { mediamtxPath: PREFIX, endedAt: null },
        select: { id: true },
      });
    }
    expect(prismaMock.streamSession.findFirst).toHaveBeenCalledTimes(leaves.length);
  });

  it('204 for a WHEP endpoint under /media/webrtc via the same session cookie', async () => {
    // nginx auth_request always issues GET here regardless of the real WHEP verb
    // (POST/PATCH/DELETE); method-independence is an nginx-config property. The
    // authorizer only needs to bind the webrtc sub-path to the live session.
    prismaMock.streamSession.findFirst.mockResolvedValue(liveSession);
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', `/media/webrtc/${PREFIX}/whep`)
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(204);
  });

  it('204 via query-param fallback (?path&exp&sig) for direct/non-browser callers', async () => {
    prismaMock.streamSession.findFirst.mockResolvedValue(liveSession);
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .query({ path: PREFIX, exp: String(exp), sig });

    expect(res.status).toBe(204);
  });

  it('403 when a valid media path carries no token (fail-closed)', async () => {
    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(PREFIX, 'index.m3u8'));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false });
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 when the signature is tampered (same length, one flipped byte)', async () => {
    const { exp, sig } = signMediaPath(PREFIX);
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(PREFIX, 'index.m3u8'))
      .set('Cookie', authCookie(exp, tampered));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 when the token has expired', async () => {
    const { exp, sig } = signMediaPath(PREFIX, -60); // exp 60s in the past

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(PREFIX, 'seg1.m4s'))
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 when the token is presented for a different camera prefix', async () => {
    const { exp, sig } = signMediaPath(PREFIX); // signed for CAM-GGN-021
    const otherCam = 'sim/playback/CAM-OTHER-999/sess-1';

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(otherCam, 'index.m3u8'))
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 when the token is presented for a different session id', async () => {
    const { exp, sig } = signMediaPath(PREFIX); // signed for sess-1
    const otherSession = 'sim/playback/CAM-GGN-021/sess-2';

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(otherSession, 'index.m3u8'))
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 for a path-traversal segment (rejected before any DB lookup)', async () => {
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', '/media/hls/sim/playback/CAM-GGN-021/../CAM-X/sess-1/index.m3u8')
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 for an encoded-slash smuggle in a prefix segment (%2F)', async () => {
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', '/media/hls/sim/playback/CAM-GGN-021%2Fsess-1/index.m3u8')
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 when there is no leaf beyond the 4-segment prefix (malformed)', async () => {
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', `/media/hls/${PREFIX}`) // prefix only, no object
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 for a disallowed env/kind shape (prod is not live|sim)', async () => {
    const badPrefix = 'prod/playback/CAM-GGN-021/sess-1';
    const { exp, sig } = signMediaPath(badPrefix);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(badPrefix, 'index.m3u8'))
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 for a non-media original URI', async () => {
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', `/api/cameras?exp=${exp}&sig=${sig}`)
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).not.toHaveBeenCalled();
  });

  it('403 when the signed session is no longer live (findFirst → null)', async () => {
    // Ending a session sets endedAt; the next authorize call must fail-closed
    // even with a still-cryptographically-valid token.
    prismaMock.streamSession.findFirst.mockResolvedValue(null);
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(PREFIX, 'index.m3u8'))
      .set('Cookie', authCookie(exp, sig));

    expect(res.status).toBe(403);
    expect(prismaMock.streamSession.findFirst).toHaveBeenCalledWith({
      where: { mediamtxPath: PREFIX, endedAt: null },
      select: { id: true },
    });
  });

  it('never echoes the token or camera credentials in the deny body', async () => {
    const { exp, sig } = signMediaPath(PREFIX);

    const res = await request(app)
      .get('/media/authorize')
      .set('X-Original-URI', hlsUri(PREFIX, 'index.m3u8'))
      .set('Cookie', authCookie(exp, sig.slice(0, -1) + 'x'));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(sig);
  });
});
