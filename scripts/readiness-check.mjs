#!/usr/bin/env node
/**
 * Aniston VMS — Live Wall streaming readiness preflight.
 *
 * SAFE / read-only: performs GET-only probes. It never creates a stream session,
 * never writes to the DB, and never mutates MediaMTX — so it is safe to run against
 * a live production stack (incl. before flipping real cameras online).
 *
 * It asserts the security + streaming invariants that must hold before real cameras
 * stream in the Live Wall:
 *   1. Backend health endpoint reachable.
 *   2. Frontend (Nginx) serving the SPA.
 *   3. MediaMTX control API reachable.
 *   4. Media auth gate is CLOSED for an unauthenticated request (403 — never 200/401).
 *   5. The Nginx media-proxy redirect fix is present in the deployed artifact.
 *
 * Usage:   node scripts/readiness-check.mjs
 * Env:     FRONTEND_URL (default http://localhost:5173)
 *          BACKEND_URL  (default http://localhost:4000)
 *          MEDIAMTX_API_URL (default http://localhost:9997)
 * Exit:    0 = READY, 1 = NOT READY.
 *
 * Uses node:http(s) directly (default agent, no keep-alive) so the process drains
 * and exits cleanly with the correct code on every platform — notably avoiding the
 * libuv teardown assertion that fetch + AbortController + process.exit() can throw
 * on Windows.
 */
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:4000';
const MEDIAMTX = process.env.MEDIAMTX_API_URL ?? 'http://localhost:9997';
const HERE = dirname(fileURLToPath(import.meta.url));

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

/** GET a URL, resolve { status } (or { status: 0, error }). Never rejects. */
function probe(url) {
  return new Promise((done) => {
    let settled = false;
    const finish = (v) => {
      if (!settled) {
        settled = true;
        done(v);
      }
    };
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(u, { method: 'GET', timeout: 5000 }, (res) => {
        res.resume(); // drain + discard body so the socket closes
        finish({ status: res.statusCode });
      });
      req.on('timeout', () => {
        req.destroy();
        finish({ status: 0, error: 'timeout' });
      });
      req.on('error', (err) => finish({ status: 0, error: String(err?.message ?? err) }));
      req.end();
    } catch (err) {
      finish({ status: 0, error: String(err?.message ?? err) });
    }
  });
}

async function main() {
  console.log('Aniston VMS — Live Wall readiness preflight (read-only)\n');

  // 1. Backend health
  {
    const r = await probe(`${BACKEND}/api/health`);
    record(
      'backend /api/health reachable (200)',
      r.status === 200,
      `status=${r.status || r.error}`
    );
  }

  // 2. Frontend serving
  {
    const r = await probe(`${FRONTEND}/`);
    record('frontend Nginx serving SPA (200)', r.status === 200, `status=${r.status || r.error}`);
  }

  // 3. MediaMTX control API
  {
    const r = await probe(`${MEDIAMTX}/v3/config/global/get`);
    record(
      'MediaMTX control API reachable (200)',
      r.status === 200,
      `status=${r.status || r.error}`
    );
  }

  // 4. Media auth gate CLOSED for unauthenticated request — must be 403, never 200/401.
  //    auth_request runs before any upstream proxy, so a non-existent probe path still
  //    yields the auth verdict (403 denied) rather than leaking content.
  {
    const r = await probe(`${FRONTEND}/media/hls/__readiness_probe__/index.m3u8`);
    const pass = r.status === 403;
    let detail = `status=${r.status || r.error} (want 403)`;
    if (r.status === 200) detail += '  !! GATE OPEN — unauthenticated media served';
    if (r.status === 401) detail += '  !! 401 regression — must be 403';
    record('media auth gate closed for unauthenticated (403)', pass, detail);
  }

  // 5. Nginx media-proxy redirect fix present in the deployed artifact (frontend/nginx.conf
  //    is COPYed into the frontend image at build time, so this file IS the artifact).
  {
    let pass = false;
    let detail = '';
    try {
      const conf = readFileSync(resolve(HERE, '../frontend/nginx.conf'), 'utf8');
      const hls = /proxy_redirect\s+http:\/\/mediamtx:8888\/\s+\/media\/hls\/\s*;/.test(conf);
      const webrtc = /proxy_redirect\s+http:\/\/mediamtx:8889\/\s+\/media\/webrtc\/\s*;/.test(conf);
      pass = hls && webrtc;
      detail = `hls-rewrite=${hls} webrtc-rewrite=${webrtc}`;
    } catch (err) {
      detail = `read error: ${String(err?.message ?? err)}`;
    }
    record('nginx media-proxy redirect fix present', pass, detail);
  }

  const failed = results.filter((r) => !r.pass);
  console.log('');
  if (failed.length === 0) {
    console.log(`READINESS: READY — ${results.length}/${results.length} checks passed.`);
    process.exitCode = 0;
  } else {
    console.log(
      `READINESS: NOT READY — ${failed.length}/${results.length} failed: ${failed
        .map((f) => f.name)
        .join('; ')}`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('readiness-check crashed:', err);
  process.exitCode = 1;
});
