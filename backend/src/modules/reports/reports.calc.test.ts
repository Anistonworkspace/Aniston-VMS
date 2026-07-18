import {
  calculateIncidentCountsBySeverity,
  calculateMTTA,
  calculateMTTR,
  calculateSlaCompliance,
  calculateUptimePercent,
} from './reports.calc.js';

describe('calculateUptimePercent', () => {
  it('returns 100 when there is no downtime in the period', () => {
    const pct = calculateUptimePercent({
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-02T00:00:00Z'),
      downtimeSeconds: 0,
    });
    expect(pct).toBe(100);
  });

  it('computes a partial-downtime percentage correctly', () => {
    // 24h period, 2h40m40s ... let's use a clean number: 1 day = 86400s,
    // downtime = 8640s (10% of the period) => 90% uptime.
    const pct = calculateUptimePercent({
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-02T00:00:00Z'),
      downtimeSeconds: 8640,
    });
    expect(pct).toBeCloseTo(90, 5);
  });

  it('clamps to 0 when downtime exceeds the period length', () => {
    const pct = calculateUptimePercent({
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-01T01:00:00Z'), // 1h = 3600s
      downtimeSeconds: 999_999,
    });
    expect(pct).toBe(0);
  });

  it('treats negative downtimeSeconds as 0 (never exceeds 100%)', () => {
    const pct = calculateUptimePercent({
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-02T00:00:00Z'),
      downtimeSeconds: -50,
    });
    expect(pct).toBe(100);
  });

  it('handles a zero-length period without NaN/Infinity', () => {
    const sameInstant = new Date('2026-07-01T00:00:00Z');
    const pct = calculateUptimePercent({
      periodStart: sameInstant,
      periodEnd: sameInstant,
      downtimeSeconds: 10,
    });
    expect(pct).toBe(100);
    expect(Number.isNaN(pct)).toBe(false);
    expect(Number.isFinite(pct)).toBe(true);
  });

  it('handles an inverted period (end before start) without NaN/Infinity', () => {
    const pct = calculateUptimePercent({
      periodStart: new Date('2026-07-02T00:00:00Z'),
      periodEnd: new Date('2026-07-01T00:00:00Z'),
      downtimeSeconds: 10,
    });
    expect(Number.isFinite(pct)).toBe(true);
  });
});

describe('calculateMTTA', () => {
  it('averages minutes-to-acknowledge across qualifying incidents', () => {
    const mtta = calculateMTTA([
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        acknowledgedAt: new Date('2026-07-01T00:10:00Z'),
      }, // 10 min
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        acknowledgedAt: new Date('2026-07-01T00:20:00Z'),
      }, // 20 min
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        acknowledgedAt: new Date('2026-07-01T00:30:00Z'),
      }, // 30 min
    ]);
    expect(mtta).toBe(20);
  });

  it('excludes not-yet-acknowledged incidents from the average', () => {
    const mtta = calculateMTTA([
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        acknowledgedAt: new Date('2026-07-01T00:10:00Z'),
      }, // 10 min
      { firstDetectedAt: new Date('2026-07-01T00:00:00Z'), acknowledgedAt: null },
    ]);
    expect(mtta).toBe(10);
  });

  it('returns null when the list is empty', () => {
    expect(calculateMTTA([])).toBeNull();
  });

  it('returns null when no incident has been acknowledged', () => {
    const mtta = calculateMTTA([
      { firstDetectedAt: new Date('2026-07-01T00:00:00Z'), acknowledgedAt: null },
      { firstDetectedAt: new Date('2026-07-01T00:00:00Z'), acknowledgedAt: null },
    ]);
    expect(mtta).toBeNull();
  });
});

describe('calculateMTTR', () => {
  it('averages minutes-to-resolve across qualifying incidents', () => {
    const mttr = calculateMTTR([
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        resolvedAt: new Date('2026-07-01T01:00:00Z'),
      }, // 60 min
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        resolvedAt: new Date('2026-07-01T02:00:00Z'),
      }, // 120 min
    ]);
    expect(mttr).toBe(90);
  });

  it('excludes unresolved incidents from the average', () => {
    const mttr = calculateMTTR([
      {
        firstDetectedAt: new Date('2026-07-01T00:00:00Z'),
        resolvedAt: new Date('2026-07-01T01:00:00Z'),
      }, // 60 min
      { firstDetectedAt: new Date('2026-07-01T00:00:00Z'), resolvedAt: null },
    ]);
    expect(mttr).toBe(60);
  });

  it('returns null when the list is empty', () => {
    expect(calculateMTTR([])).toBeNull();
  });

  it('returns null when no incident has been resolved', () => {
    const mttr = calculateMTTR([
      { firstDetectedAt: new Date('2026-07-01T00:00:00Z'), resolvedAt: null },
    ]);
    expect(mttr).toBeNull();
  });
});

describe('calculateIncidentCountsBySeverity', () => {
  it('tallies incidents per severity value', () => {
    const counts = calculateIncidentCountsBySeverity([
      { severity: 'CRITICAL' },
      { severity: 'WARNING' },
      { severity: 'CRITICAL' },
      { severity: 'INFO' },
      { severity: 'CRITICAL' },
    ]);
    expect(counts).toEqual({ CRITICAL: 3, WARNING: 1, INFO: 1 });
  });

  it('returns an empty object for an empty list', () => {
    expect(calculateIncidentCountsBySeverity([])).toEqual({});
  });
});

describe('calculateSlaCompliance', () => {
  it('is compliant when uptime is exactly at the target (boundary, inclusive)', () => {
    expect(calculateSlaCompliance(99.5, 99.5)).toBe(true);
  });

  it('is not compliant when uptime is just below the target', () => {
    expect(calculateSlaCompliance(99.49, 99.5)).toBe(false);
  });

  it('is compliant when uptime is just above the target', () => {
    expect(calculateSlaCompliance(99.51, 99.5)).toBe(true);
  });
});
