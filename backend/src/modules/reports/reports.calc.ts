// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation functions for the reporting module. NO Prisma/Express
// imports here on purpose — everything operates on plain input arrays/objects
// so it is trivially unit-testable (see reports.calc.test.ts) without mocking
// anything. The service layer (reports.service.ts) is responsible for
// fetching rows from Prisma and shaping them into these plain input types.
// ─────────────────────────────────────────────────────────────────────────────

export interface UptimePeriodInput {
  /** Start of the reporting window. */
  periodStart: Date;
  /** End of the reporting window. */
  periodEnd: Date;
  /** Total seconds the camera/site was considered down within the window. */
  downtimeSeconds: number;
}

/**
 * Percent of `periodStart`..`periodEnd` that was "up" (i.e. NOT covered by
 * `downtimeSeconds`).
 *
 * - Clamped to the [0, 100] range (a bad/over-counted downtime figure can
 *   never report a negative or >100% uptime).
 * - Negative `downtimeSeconds` is treated as 0 (defensive — never inflates
 *   uptime above 100%).
 * - A zero-length (or inverted, i.e. `periodEnd <= periodStart`) period has
 *   no time for anything to have gone wrong in, so this returns 100 rather
 *   than dividing by zero (which would otherwise yield NaN/Infinity).
 */
export function calculateUptimePercent(input: UptimePeriodInput): number {
  const periodMs = input.periodEnd.getTime() - input.periodStart.getTime();
  if (periodMs <= 0) return 100;

  const periodSeconds = periodMs / 1000;
  const downtimeSeconds = Math.max(0, input.downtimeSeconds);
  const uptimePercent = (1 - downtimeSeconds / periodSeconds) * 100;

  return Math.min(100, Math.max(0, uptimePercent));
}

export interface AcknowledgeTimingInput {
  firstDetectedAt: Date;
  acknowledgedAt: Date | null;
}

/**
 * Mean Time To Acknowledge, in MINUTES, across every incident that has an
 * `acknowledgedAt` timestamp. Incidents still awaiting acknowledgement
 * (`acknowledgedAt === null`) are excluded from the average entirely (not
 * treated as 0).
 *
 * Returns `null` when no incident in the input qualifies (empty input, or
 * none acknowledged yet) so callers can render "N/A" instead of a
 * misleading 0.
 */
export function calculateMTTA(incidents: AcknowledgeTimingInput[]): number | null {
  const minutes = incidents
    .filter((i): i is { firstDetectedAt: Date; acknowledgedAt: Date } => i.acknowledgedAt !== null)
    .map((i) => (i.acknowledgedAt.getTime() - i.firstDetectedAt.getTime()) / 60_000);

  if (minutes.length === 0) return null;
  return minutes.reduce((sum, m) => sum + m, 0) / minutes.length;
}

export interface ResolveTimingInput {
  firstDetectedAt: Date;
  resolvedAt: Date | null;
}

/**
 * Mean Time To Resolve, in MINUTES, across every incident that has a
 * `resolvedAt` timestamp. Still-open incidents (`resolvedAt === null`) are
 * excluded from the average entirely.
 *
 * Returns `null` when no incident in the input qualifies.
 */
export function calculateMTTR(incidents: ResolveTimingInput[]): number | null {
  const minutes = incidents
    .filter((i): i is { firstDetectedAt: Date; resolvedAt: Date } => i.resolvedAt !== null)
    .map((i) => (i.resolvedAt.getTime() - i.firstDetectedAt.getTime()) / 60_000);

  if (minutes.length === 0) return null;
  return minutes.reduce((sum, m) => sum + m, 0) / minutes.length;
}

/**
 * Tally of incidents grouped by their `severity` string (e.g. INFO/WARNING/
 * CRITICAL). Keys are whatever severity values appear in the input — nothing
 * is pre-seeded to 0, so a severity that never occurs simply has no key.
 */
export function calculateIncidentCountsBySeverity(
  incidents: Array<{ severity: string }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const incident of incidents) {
    counts[incident.severity] = (counts[incident.severity] ?? 0) + 1;
  }
  return counts;
}

/**
 * Whether a computed uptime percent meets or exceeds the configured SLA
 * target. Uses `>=` so a camera sitting exactly on the target line counts
 * as compliant.
 */
export function calculateSlaCompliance(uptimePercent: number, targetPercent: number): boolean {
  return uptimePercent >= targetPercent;
}
