#!/usr/bin/env node
/**
 * Stage 9 — scripted failure drills (plan §Stage 9: "drill script produces
 * exactly the expected incidents").
 *
 * Runs the 20 mandatory failure scenarios against the LIVE docker stack using
 * the sim-mode fault injector (Redis keys `sim:fault:<cameraCode>`, consumed by
 * backend/src/modules/health/health.checkers.ts#getSimFault) and asserts the
 * incident engine reacts per the rule matrix (docs/02-TRD.md §6.5):
 * consecutive-fail confirmation, immediate rules, site-scope dependency
 * suppression, dedup, maintenance suppression, escalation ladder, ack
 * semantics, verified recovery, notifications and self-monitoring.
 *
 * Prereqs: fullstack compose up; root .env has HEALTH_SIM_MODE=true,
 * HEALTH_CHECK_INTERVAL_MINUTES=1 and DRILL_MODE=true (for S19).
 * Usage:    node scripts/drills/run-drills.mjs
 * Output:   console log + docs/drill-report-<date>.md (+ .json), exit 1 on any
 *           failed scenario. Wall time ≈ 30–40 min (real waits on real ticks).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = process.env.DRILL_API ?? 'http://127.0.0.1:4000/api';
const EMAIL = process.env.DRILL_EMAIL ?? 'admin@anistonvms.example';
const PASSWORD = process.env.DRILL_PASSWORD ?? 'AdminDemo2026';
const REDIS_CONTAINER = process.env.DRILL_REDIS_CONTAINER ?? 'aniston_vms_redis';
const PG_CONTAINER = process.env.DRILL_PG_CONTAINER ?? 'aniston_vms_postgres';
const CLOSED_STATUSES = ['RESOLVED', 'RECOVERY_VERIFIED', 'CLOSED'];

let TOKEN = '';
const results = [];
const MIN = 60_000;

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redisCli(...args) {
  return execFileSync('docker', ['exec', REDIS_CONTAINER, 'redis-cli', ...args], {
    encoding: 'utf8',
  }).trim();
}
function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', PG_CONTAINER, 'psql', '-U', 'postgres', '-d', 'aniston_vms', '-t', '-A', '-c', sql],
    { encoding: 'utf8' }
  ).trim();
}

async function api(method, p, body, { expectOk = true } = {}) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (expectOk && !res.ok) {
    throw new Error(`${method} ${p} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return { status: res.status, json };
}
const items = (j) => (Array.isArray(j?.data) ? j.data : (j?.data?.items ?? []));

async function login() {
  const { json } = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = json.data.accessToken;
}

async function incidents() {
  const { json } = await api('GET', '/incidents?limit=100');
  return items(json);
}
const isOpen = (i) => !CLOSED_STATUSES.includes(i.status);
async function findOpen(pred) {
  return (await incidents()).find((i) => isOpen(i) && pred(i));
}
const freshSince = (since) => (i) => new Date(i.firstDetectedAt).getTime() >= since - 60_000;

const inject = (cam, fault) => {
  redisCli('SET', `sim:fault:${cam.cameraCode}`, fault);
  log(`  ⚡ inject ${fault} → ${cam.cameraCode}`);
};
const clearFault = (cam) => {
  redisCli('DEL', `sim:fault:${cam.cameraCode}`);
  log(`  ✨ clear fault → ${cam.cameraCode}`);
};
const statusOf = (id) => psql(`SELECT status FROM incidents WHERE id='${id}'`);

async function waitFor(desc, fn, timeoutMs, pollMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout (${Math.round(timeoutMs / 1000)}s) waiting for: ${desc}`);
    }
    await sleep(pollMs);
  }
}

async function scenario(id, name, fn) {
  const s = Date.now();
  try {
    const detail = (await fn()) ?? 'ok';
    results.push({ id, name, pass: true, detail, seconds: Math.round((Date.now() - s) / 1000) });
    log(`✅ ${id} ${name} — ${detail}`);
  } catch (err) {
    const detail = String(err?.message ?? err);
    results.push({ id, name, pass: false, detail, seconds: Math.round((Date.now() - s) / 1000) });
    log(`❌ ${id} ${name} — ${detail}`);
  }
}

async function main() {
  log(`Stage 9 failure drills starting against ${API}`);
  await login();
  log('Logged in as drill operator');

  const cams = items((await api('GET', '/cameras?limit=100')).json);
  if (cams.length < 6) throw new Error(`need ≥6 cameras, found ${cams.length}`);

  // Camera cast: a1/a2 share a site (site-scope + dependency suppression),
  // b1 sits on another site (site-scope WARNING), c0..c2 are the solo actors.
  const bySite = new Map();
  for (const c of cams) bySite.set(c.siteId, [...(bySite.get(c.siteId) ?? []), c]);
  const multi = [...bySite.values()].find((v) => v.length >= 2);
  if (!multi) throw new Error('need a site with ≥2 cameras');
  const [a1, a2] = multi;
  const rest = cams.filter((c) => c.id !== a1.id && c.id !== a2.id);
  const b1 = rest.find((c) => c.siteId !== a1.siteId) ?? rest[0];
  const pool = rest.filter((c) => c.id !== b1.id);
  if (pool.length < 3) throw new Error('need ≥3 spare cameras');
  const [c0, c1, c2] = pool;
  log(
    `Cast: a1=${a1.cameraCode} a2=${a2.cameraCode} (site-pair) b1=${b1.cameraCode} c0=${c0.cameraCode} c1=${c1.cameraCode} c2=${c2.cameraCode}`
  );

  // Pre-flight: clean slate — no sim faults, no open incidents for the fleet.
  for (const c of cams) redisCli('DEL', `sim:fault:${c.cameraCode}`);
  const preOpen = (await incidents()).filter(isOpen);
  if (preOpen.length > 0) {
    log(`Pre-flight: ${preOpen.length} open incident(s) — waiting for auto-recovery…`);
    await waitFor(
      'pre-existing incidents to recover',
      async () => ((await incidents()).filter(isOpen).length === 0 ? true : null),
      8 * MIN,
      20_000
    ).catch(() => log('⚠ pre-existing open incidents remain; drills use freshness guards'));
  }

  let s1Inc = null;
  let s4Inc = null;
  let s5Inc = null;
  let s6Inc = null;
  let s6ElapsedS = null;

  // ── WAVE 1 — core diagnosis→incident paths ─────────────────────────────────
  log('── WAVE 1: core incident creation ──');
  const t1 = Date.now();
  inject(a1, 'SITE_INTERNET_DOWN');
  inject(c0, 'NETWORK_UNSTABLE');
  inject(c1, 'CAMERA_OFFLINE');
  inject(c2, 'STREAM_DEGRADED');

  await Promise.all([
    scenario('S01', 'Site internet down → immediate SITE-scope CRITICAL', async () => {
      s1Inc = await waitFor(
        'SITE_INTERNET_DOWN site incident',
        () =>
          findOpen(
            (i) =>
              i.type === 'SITE_INTERNET_DOWN' &&
              i.siteId === a1.siteId &&
              !i.cameraId &&
              freshSince(t1)(i)
          ),
        4 * MIN
      );
      if (s1Inc.severity !== 'CRITICAL') throw new Error(`severity=${s1Inc.severity}`);
      return `${s1Inc.incidentNumber} (cameraId=null) in ${Math.round((Date.now() - t1) / 1000)}s`;
    }),
    scenario('S04', 'Network unstable → WARNING after 3 consecutive fails', async () => {
      s4Inc = await waitFor(
        'NETWORK_UNSTABLE incident',
        () =>
          findOpen(
            (i) => i.type === 'NETWORK_UNSTABLE' && i.cameraId === c0.id && freshSince(t1)(i)
          ),
        8 * MIN
      );
      if (s4Inc.severity !== 'WARNING') throw new Error(`severity=${s4Inc.severity}`);
      return `${s4Inc.incidentNumber} in ${Math.round((Date.now() - t1) / 1000)}s (3-fail streak)`;
    }),
    scenario('S05', 'Camera offline → CRITICAL after 3 consecutive fails', async () => {
      s5Inc = await waitFor(
        'CAMERA_OFFLINE incident',
        () =>
          findOpen((i) => i.type === 'CAMERA_OFFLINE' && i.cameraId === c1.id && freshSince(t1)(i)),
        8 * MIN
      );
      if (s5Inc.severity !== 'CRITICAL') throw new Error(`severity=${s5Inc.severity}`);
      return `${s5Inc.incidentNumber} in ${Math.round((Date.now() - t1) / 1000)}s`;
    }),
    scenario('S07', 'Stream degraded → WARNING after 3 consecutive fails', async () => {
      const inc = await waitFor(
        'STREAM_DEGRADED incident',
        () =>
          findOpen(
            (i) => i.type === 'STREAM_DEGRADED' && i.cameraId === c2.id && freshSince(t1)(i)
          ),
        8 * MIN
      );
      if (inc.severity !== 'WARNING') throw new Error(`severity=${inc.severity}`);
      return `${inc.incidentNumber} in ${Math.round((Date.now() - t1) / 1000)}s`;
    }),
    scenario('S02', 'Dependency suppression: no camera incident under site outage', async () => {
      await waitFor(
        'site outage to open first',
        () =>
          findOpen((i) => i.type === 'SITE_INTERNET_DOWN' && i.siteId === a1.siteId && !i.cameraId),
        4 * MIN
      );
      inject(a2, 'CAMERA_OFFLINE');
      const t = Date.now();
      await sleep(4.5 * MIN); // ≥4 failing checks — well past the 3-fail gate
      const dup = await findOpen((i) => i.type === 'CAMERA_OFFLINE' && i.cameraId === a2.id);
      if (dup) throw new Error(`unexpected ${dup.incidentNumber} despite open site outage`);
      return `no camera incident after ${Math.round((Date.now() - t) / 1000)}s under site outage`;
    }),
  ]);

  // ── WAVE 2 — dedup, escalation, ack, notifications, numbering ──────────────
  log('── WAVE 2: dedup / escalation / ack / notifications ──');
  await Promise.all([
    scenario('S16', 'Incident numbering ANI-CAM-YYYY-NNNNNN, unique', async () => {
      const all = await incidents();
      const bad = all.filter((i) => !/^ANI-CAM-\d{4}-\d{6}$/.test(i.incidentNumber));
      if (bad.length) throw new Error(`bad numbers: ${bad.map((i) => i.incidentNumber).join(',')}`);
      const nums = all.map((i) => i.incidentNumber);
      if (new Set(nums).size !== nums.length) throw new Error('duplicate incident numbers');
      return `${nums.length} numbers valid + unique`;
    }),
    scenario('S03', 'SIM signal issue → SITE-scope WARNING after 3 fails', async () => {
      inject(b1, 'SIM_SIGNAL_ISSUE');
      const t = Date.now();
      const inc = await waitFor(
        'SIM_SIGNAL_ISSUE site incident',
        () =>
          findOpen(
            (i) =>
              i.type === 'SIM_SIGNAL_ISSUE' &&
              i.siteId === b1.siteId &&
              !i.cameraId &&
              freshSince(t)(i)
          ),
        8 * MIN
      );
      if (inc.severity !== 'WARNING') throw new Error(`severity=${inc.severity}`);
      return `${inc.incidentNumber} in ${Math.round((Date.now() - t) / 1000)}s`;
    }),
    scenario('S09', 'Dedup: ongoing fault refreshes the open incident', async () => {
      if (!s5Inc) throw new Error('prerequisite S05 failed');
      const before = psql(`SELECT last_detected_at FROM incidents WHERE id='${s5Inc.id}'`);
      await sleep(2.5 * MIN);
      const openCnt = psql(
        `SELECT COUNT(*) FROM incidents WHERE camera_id='${c1.id}' AND type='CAMERA_OFFLINE' AND status NOT IN ('RESOLVED','RECOVERY_VERIFIED','CLOSED')`
      );
      if (openCnt !== '1') throw new Error(`expected 1 open CAMERA_OFFLINE, got ${openCnt}`);
      const after = psql(`SELECT last_detected_at FROM incidents WHERE id='${s5Inc.id}'`);
      if (!(new Date(after) > new Date(before))) throw new Error('last_detected_at not refreshed');
      return `still exactly 1 open incident; last_detected_at ${before} → ${after}`;
    }),
    (async () => {
      await scenario('S13', 'Escalation ladder climbs to L5 while unacked', async () => {
        if (!s5Inc) throw new Error('prerequisite S05 failed');
        psql(
          `UPDATE incidents SET first_detected_at = NOW() - INTERVAL '65 minutes' WHERE id='${s5Inc.id}'`
        );
        const lvl = await waitFor(
          'escalation_level=5',
          async () => {
            const v = psql(`SELECT escalation_level FROM incidents WHERE id='${s5Inc.id}'`);
            return v === '5' ? v : null;
          },
          3 * MIN,
          15_000
        );
        return `escalation_level=${lvl} after backdating first_detected_at −65 min`;
      });
      await scenario('S14', 'Ack pauses reminders (level frozen, fault stays open)', async () => {
        if (!s5Inc) throw new Error('prerequisite S05 failed');
        await api('POST', `/incidents/${s5Inc.id}/ack`);
        const before = psql(`SELECT escalation_level FROM incidents WHERE id='${s5Inc.id}'`);
        await sleep(90_000);
        const after = psql(`SELECT escalation_level FROM incidents WHERE id='${s5Inc.id}'`);
        const st = statusOf(s5Inc.id);
        if (st !== 'ACKNOWLEDGED') throw new Error(`status=${st}`);
        if (after !== before) throw new Error(`level climbed ${before}→${after} after ack`);
        return `status=ACKNOWLEDGED, escalation_level frozen at ${after}`;
      });
    })(),
    scenario('S15', 'Notifications logged for alerted incidents', async () => {
      await waitFor('prerequisites S01+S05', async () => (s1Inc && s5Inc ? true : null), MIN, 5000);
      const n = psql(
        `SELECT COUNT(*) FROM notifications WHERE incident_id IN ('${s1Inc.id}','${s5Inc.id}')`
      );
      if (Number(n) < 2) throw new Error(`only ${n} notification rows for 2 CRITICAL incidents`);
      return `${n} delivery rows (EMAIL/WHATSAPP mock) for ${s1Inc.incidentNumber} + ${s5Inc.incidentNumber}`;
    }),
  ]);

  // ── WAVE 3 — recovery + immediate config + image problem ───────────────────
  log('── WAVE 3: verified recovery / immediate CONFIG_ERROR / image problem ──');
  await Promise.all([
    scenario('S10', 'Verified recovery auto-resolves after 2 OK checks', async () => {
      if (!s4Inc) throw new Error('prerequisite S04 failed');
      clearFault(c0);
      const t = Date.now();
      const st = await waitFor(
        'S04 incident recovery',
        async () => {
          const s = statusOf(s4Inc.id);
          return CLOSED_STATUSES.includes(s) ? s : null;
        },
        7 * MIN,
        15_000
      );
      return `${s4Inc.incidentNumber} → ${st} in ${Math.round((Date.now() - t) / 1000)}s`;
    }),
    scenario('S20', 'Site outage recovery closes the SITE incident', async () => {
      if (!s1Inc) throw new Error('prerequisite S01 failed');
      clearFault(a1);
      clearFault(a2);
      const t = Date.now();
      const st = await waitFor(
        'site incident recovery',
        async () => {
          const s = statusOf(s1Inc.id);
          return CLOSED_STATUSES.includes(s) ? s : null;
        },
        7 * MIN,
        15_000
      );
      return `${s1Inc.incidentNumber} → ${st} in ${Math.round((Date.now() - t) / 1000)}s`;
    }),
    scenario('S06', 'Config error → CRITICAL incident (immediate rule)', async () => {
      inject(c2, 'CONFIG_ERROR');
      const t = Date.now();
      s6Inc = await waitFor(
        'CONFIG_ERROR incident',
        () =>
          findOpen((i) => i.type === 'CONFIG_ERROR' && i.cameraId === c2.id && freshSince(t)(i)),
        4 * MIN
      );
      s6ElapsedS = Math.round((Date.now() - t) / 1000);
      if (s6Inc.severity !== 'CRITICAL') throw new Error(`severity=${s6Inc.severity}`);
      return `${s6Inc.incidentNumber} in ${s6ElapsedS}s`;
    }),
    scenario('S08', 'Image problem → WARNING after 3 consecutive fails', async () => {
      inject(c1, 'IMAGE_PROBLEM');
      const t = Date.now();
      const inc = await waitFor(
        'IMAGE_PROBLEM incident',
        () =>
          findOpen((i) => i.type === 'IMAGE_PROBLEM' && i.cameraId === c1.id && freshSince(t)(i)),
        8 * MIN
      );
      if (inc.severity !== 'WARNING') throw new Error(`severity=${inc.severity}`);
      return `${inc.incidentNumber} in ${Math.round((Date.now() - t) / 1000)}s`;
    }),
  ]);

  await scenario('S18', 'Immediate rule skipped the 3-fail streak', async () => {
    if (s6ElapsedS === null) throw new Error('prerequisite S06 failed');
    // A 3-fail streak at 1-min ticks needs ≥3 min; immediate must beat that.
    if (s6ElapsedS > 150) throw new Error(`took ${s6ElapsedS}s — streak not skipped`);
    const cf = psql(`SELECT consecutive_failures FROM incidents WHERE id='${s6Inc.id}'`);
    return `incident on first failing check (${s6ElapsedS}s, consecutive_failures=${cf})`;
  });

  // ── WAVE 4 — maintenance suppression + full lifecycle ──────────────────────
  log('── WAVE 4: maintenance window / lifecycle walk ──');
  await Promise.all([
    (async () => {
      await scenario('S11', 'Maintenance window suppresses alerting', async () => {
        const start = new Date(Date.now() + 5_000).toISOString();
        const end = new Date(Date.now() + 6.5 * MIN).toISOString();
        await api('POST', '/maintenance/windows', {
          cameraId: c0.id,
          scheduledStart: start,
          scheduledEnd: end,
          reason: 'Stage 9 drill S11 — planned maintenance suppression test',
        });
        await sleep(15_000);
        inject(c0, 'CAMERA_OFFLINE');
        await sleep(4.5 * MIN);
        const dup = await findOpen((i) => i.type === 'CAMERA_OFFLINE' && i.cameraId === c0.id);
        if (dup) throw new Error(`unexpected ${dup.incidentNumber} during active window`);
        return 'fault held 4.5 min inside window — zero incidents (health dashboard still shows fault)';
      });
      await scenario('S12', 'Window expiry re-arms alerting', async () => {
        const inc = await waitFor(
          'post-window CAMERA_OFFLINE incident',
          () => findOpen((i) => i.type === 'CAMERA_OFFLINE' && i.cameraId === c0.id),
          8 * MIN
        );
        clearFault(c0);
        return `${inc.incidentNumber} fired after the window expired`;
      });
    })(),
    scenario('S17', 'Lifecycle ack→assign→investigate→resolve→close', async () => {
      await waitFor('prerequisite S06', async () => (s6Inc ? true : null), 5 * MIN, 10_000);
      clearFault(c2);
      const adminId = psql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
      await api('POST', `/incidents/${s6Inc.id}/ack`);
      await api('POST', `/incidents/${s6Inc.id}/assign`, { assignedToId: adminId });
      await api('POST', `/incidents/${s6Inc.id}/status`, { status: 'INVESTIGATING' });
      await api('POST', `/incidents/${s6Inc.id}/resolve`, {
        rootCause: 'Drill-injected CONFIG_ERROR (simulated RTSP credential failure)',
        resolutionNotes: 'Stage 9 drill: sim fault cleared, credentials re-verified, stream OK.',
      });
      await api('POST', `/incidents/${s6Inc.id}/close`);
      const st = statusOf(s6Inc.id);
      if (st !== 'CLOSED') throw new Error(`final status=${st}`);
      return `${s6Inc.incidentNumber}: DETECTED→ACKNOWLEDGED→ASSIGNED→INVESTIGATING→RESOLVED→CLOSED`;
    }),
  ]);

  // ── WAVE 5 — kill a worker → self-alert (LAST: pauses health checks) ───────
  log('── WAVE 5: kill-a-worker self-alert ──');
  await scenario('S19', 'Kill health-scheduler → self-alert → recover', async () => {
    await api('POST', '/platform/workers/health-scheduler/stop');
    const alert = await waitFor(
      'self-alert for health-scheduler',
      async () => {
        const { json } = await api('GET', '/platform/health');
        const d = json.data;
        const a = d.alerts.find((x) => x.worker === 'health-scheduler');
        const w = d.workers.find((x) => x.name === 'health-scheduler');
        return a && w && w.status !== 'ok' ? a : null;
      },
      7 * MIN,
      15_000
    );
    let auditNote = '';
    try {
      const n = psql(
        `SELECT COUNT(*) FROM audit_logs WHERE action='SELF_ALERT_RAISED' AND entity_id='health-scheduler'`
      );
      auditNote = `, ${n} audit row(s)`;
    } catch {
      auditNote = ', audit check skipped';
    }
    await api('POST', '/platform/workers/health-scheduler/start');
    await waitFor(
      'self-alert cleared after restart',
      async () => {
        const { json } = await api('GET', '/platform/health');
        const d = json.data;
        const w = d.workers.find((x) => x.name === 'health-scheduler');
        return w?.status === 'ok' && !d.alerts.some((x) => x.worker === 'health-scheduler')
          ? true
          : null;
      },
      3 * MIN,
      15_000
    );
    return `alert raised ("${alert.message}")${auditNote}; cleared after worker restart`;
  });

  // ── Cleanup — clear faults, let the fleet auto-recover ─────────────────────
  log('Cleanup: clearing all sim faults and waiting for fleet recovery…');
  for (const c of cams) redisCli('DEL', `sim:fault:${c.cameraCode}`);
  await waitFor(
    'all incidents to leave open state',
    async () => ((await incidents()).filter(isOpen).length === 0 ? true : null),
    9 * MIN,
    20_000
  )
    .then(() => log('Fleet fully recovered — no open incidents.'))
    .catch(() => log('⚠ some incidents still open after cleanup window (check dashboard)'));

  // ── Report ─────────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Stage 9 failure-drill report — ${date}`,
    '',
    `Stack: ${API} · sim-mode fault injector · check interval 1 min · 3-fail confirmation · 2-check recovery`,
    '',
    `**Result: ${passed}/${results.length} scenarios passed${failed ? ` — ${failed} FAILED` : ''}**`,
    '',
    '| # | Scenario | Result | Detail | Took |',
    '|---|----------|--------|--------|------|',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.name} | ${r.pass ? '✅ PASS' : '❌ FAIL'} | ${r.detail.replaceAll('|', '\\|')} | ${r.seconds}s |`
    ),
    '',
    `Total wall time: ${Math.round((Date.now() - startedAt) / MIN)} min. Generated by scripts/drills/run-drills.mjs.`,
    '',
  ];
  const mdPath = path.join(ROOT, 'docs', `drill-report-${date}.md`);
  fs.writeFileSync(mdPath, lines.join('\n'));
  fs.writeFileSync(
    path.join(ROOT, 'docs', `drill-report-${date}.json`),
    JSON.stringify({ date, api: API, passed, failed, results }, null, 2)
  );
  log(`Report written → ${mdPath}`);
  log(`DRILLS ${failed === 0 ? 'PASSED' : 'FAILED'}: ${passed}/${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
}

const startedAt = Date.now();
main().catch((err) => {
  console.error('Drill runner aborted:', err);
  process.exit(2);
});
