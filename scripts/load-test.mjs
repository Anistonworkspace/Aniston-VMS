#!/usr/bin/env node
/**
 * Aniston VMS — capacity load test (CR-11).
 *
 * Dependency-free (Node 18+ global fetch). Simulates a 125-camera fleet's
 * read-heavy operator workload: dashboard aggregates, incident queues,
 * camera lists/health, hierarchy browsing and snapshot listings, driven by
 * N concurrent "viewer" workers for a fixed duration.
 *
 * Usage:
 *   node scripts/load-test.mjs
 * Env overrides:
 *   BASE_URL      (default http://127.0.0.1:4000)
 *   DURATION_S    (default 45)
 *   CONCURRENCY   (default 20)
 *   LOGIN_EMAIL   (default admin@anistonvms.example)
 *   LOGIN_PASSWORD (default AdminDemo2026!)
 *   OUT_JSON      (default docs/load-test-results.json)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4000';
const DURATION_S = Number(process.env.DURATION_S ?? 45);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const LOGIN_EMAIL = process.env.LOGIN_EMAIL ?? 'admin@anistonvms.example';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD ?? 'AdminDemo2026!';
const OUT_JSON = process.env.OUT_JSON ?? 'docs/load-test-results.json';

/** Weighted endpoint mix (weights roughly mirror real operator screens). */
const MIX = [
  { name: 'dashboard-overview', weight: 20, path: () => '/api/dashboard/overview' },
  { name: 'dashboard-zones', weight: 10, path: () => '/api/dashboard/zones' },
  { name: 'incidents-list', weight: 15, path: () => '/api/incidents?limit=50' },
  { name: 'incidents-summary', weight: 10, path: () => '/api/incidents/summary' },
  { name: 'incidents-recent', weight: 5, path: () => '/api/incidents/recent' },
  { name: 'cameras-list', weight: 15, path: () => '/api/cameras?limit=100' },
  {
    name: 'camera-health',
    weight: 10,
    path: (ctx) => `/api/cameras/${pick(ctx.cameraIds)}/health`,
  },
  {
    name: 'camera-snapshots',
    weight: 5,
    path: (ctx) => `/api/cameras/${pick(ctx.cameraIds)}/snapshots?limit=10`,
  },
  { name: 'hierarchy-zones', weight: 5, path: () => '/api/zones' },
  { name: 'hierarchy-sites', weight: 5, path: () => '/api/sites' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function weightedPick(entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  const token = body?.data?.accessToken ?? body?.accessToken;
  if (!token) throw new Error('login ok but no accessToken in response');
  return token;
}

async function fetchCameraIds(token) {
  const res = await fetch(`${BASE_URL}/api/cameras?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`camera list failed: HTTP ${res.status}`);
  const body = await res.json();
  const items = body?.data?.items ?? body?.items ?? [];
  const ids = items.map((c) => c.id).filter(Boolean);
  if (ids.length === 0) throw new Error('no cameras in fleet — seed first');
  return ids;
}

async function main() {
  console.log(`Aniston VMS load test — ${BASE_URL}`);
  console.log(`duration=${DURATION_S}s concurrency=${CONCURRENCY}`);

  const token = await login();
  const cameraIds = await fetchCameraIds(token);
  console.log(`fleet size: ${cameraIds.length} cameras`);

  const ctx = { cameraIds };
  const stats = new Map(); // name -> { latencies: [], codes: Map }
  for (const e of MIX) stats.set(e.name, { latencies: [], codes: new Map() });
  let inFlightErrors = 0;

  const deadline = Date.now() + DURATION_S * 1000;
  const headers = { Authorization: `Bearer ${token}` };

  async function worker() {
    while (Date.now() < deadline) {
      const entry = weightedPick(MIX);
      const rec = stats.get(entry.name);
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE_URL}${entry.path(ctx)}`, { headers });
        // Drain body so keep-alive sockets are reusable.
        await res.arrayBuffer();
        const dt = performance.now() - t0;
        rec.latencies.push(dt);
        rec.codes.set(res.status, (rec.codes.get(res.status) ?? 0) + 1);
      } catch {
        inFlightErrors += 1;
      }
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedS = (Date.now() - started) / 1000;

  // ---- Aggregate ----
  const rows = [];
  const all = [];
  let total = 0;
  let non2xx = 0;
  let rateLimited = 0;
  for (const [name, rec] of stats) {
    const sorted = [...rec.latencies].sort((a, b) => a - b);
    all.push(...sorted);
    const count = sorted.length;
    total += count;
    let bad = 0;
    for (const [code, n] of rec.codes) {
      if (code === 429) rateLimited += n;
      if (code < 200 || code >= 300) bad += n;
    }
    non2xx += bad;
    rows.push({
      endpoint: name,
      count,
      p50: +percentile(sorted, 50).toFixed(1),
      p95: +percentile(sorted, 95).toFixed(1),
      p99: +percentile(sorted, 99).toFixed(1),
      max: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
      non2xx: bad,
      codes: Object.fromEntries(rec.codes),
    });
  }
  all.sort((a, b) => a - b);
  const summary = {
    baseUrl: BASE_URL,
    startedAt: new Date(started).toISOString(),
    durationS: +elapsedS.toFixed(1),
    concurrency: CONCURRENCY,
    fleetSize: cameraIds.length,
    totalRequests: total,
    rps: +(total / elapsedS).toFixed(1),
    overall: {
      p50: +percentile(all, 50).toFixed(1),
      p95: +percentile(all, 95).toFixed(1),
      p99: +percentile(all, 99).toFixed(1),
    },
    non2xx,
    rateLimited429: rateLimited,
    transportErrors: inFlightErrors,
    endpoints: rows.sort((a, b) => b.count - a.count),
  };

  // ---- Report ----
  console.log('\nendpoint                 count   p50ms   p95ms   p99ms   maxms  non2xx');
  for (const r of summary.endpoints) {
    console.log(
      `${r.endpoint.padEnd(24)}${String(r.count).padStart(6)}${String(r.p50).padStart(8)}${String(r.p95).padStart(8)}${String(r.p99).padStart(8)}${String(r.max).padStart(8)}${String(r.non2xx).padStart(8)}`
    );
  }
  console.log(
    `\nTOTAL ${total} req in ${elapsedS.toFixed(1)}s → ${summary.rps} req/s | overall p50=${summary.overall.p50}ms p95=${summary.overall.p95}ms p99=${summary.overall.p99}ms | non-2xx=${non2xx} (429s=${rateLimited}) transport-errors=${inFlightErrors}`
  );

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`\nresults written to ${OUT_JSON}`);

  const pass = non2xx === 0 && inFlightErrors === 0 && summary.overall.p95 < 500;
  console.log(`VERDICT: ${pass ? 'PASS' : 'REVIEW'} (target: 0 errors, overall p95 < 500ms)`);
  process.exitCode = pass ? 0 : 2;
}

main().catch((err) => {
  console.error('load test aborted:', err.message);
  process.exitCode = 1;
});
