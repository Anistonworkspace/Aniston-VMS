import { describe, it, expect } from 'vitest';
import { CameraProvisioning } from '@aniston-vms/shared';
import { ConflictError } from '../../middleware/errorHandler.js';
import {
  PROVISIONING_TRANSITIONS,
  canTransition,
  assertTransition,
  isStreamable,
} from './camera.provisioning.js';

// ─────────────────────────────────────────────────────────────────────────────
// The commissioning lifecycle is a tiny 2-state machine, but it is the single
// gate that decides whether a camera is ever streamed / probed. These tests pin
// down every edge (including the two rejected self-transitions) so the rule can
// never silently loosen.
//
//   register   → DRAFT                (identity only)
//   activate    DRAFT      → CONFIGURED (only after a passing connection test)
//   deactivate  CONFIGURED → DRAFT      (pulled from service; config retained)
// ─────────────────────────────────────────────────────────────────────────────

const { DRAFT, CONFIGURED } = CameraProvisioning;

describe('PROVISIONING_TRANSITIONS — the state machine is exactly the two commissioning moves', () => {
  it('DRAFT may only advance to CONFIGURED', () => {
    expect(PROVISIONING_TRANSITIONS[DRAFT]).toEqual([CONFIGURED]);
  });

  it('CONFIGURED may only fall back to DRAFT', () => {
    expect(PROVISIONING_TRANSITIONS[CONFIGURED]).toEqual([DRAFT]);
  });

  it('covers every enum member (no unreachable/undefined state)', () => {
    for (const state of Object.values(CameraProvisioning)) {
      expect(Array.isArray(PROVISIONING_TRANSITIONS[state])).toBe(true);
    }
  });
});

describe('canTransition', () => {
  it('allows the two commissioning moves', () => {
    expect(canTransition(DRAFT, CONFIGURED)).toBe(true);
    expect(canTransition(CONFIGURED, DRAFT)).toBe(true);
  });

  it('rejects both self-transitions (re-activate / re-deactivate are conflicts, not no-ops)', () => {
    expect(canTransition(DRAFT, DRAFT)).toBe(false);
    expect(canTransition(CONFIGURED, CONFIGURED)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('is a no-op for the two valid moves', () => {
    expect(() => assertTransition(DRAFT, CONFIGURED)).not.toThrow();
    expect(() => assertTransition(CONFIGURED, DRAFT)).not.toThrow();
  });

  it('throws ConflictError naming both states for an invalid move', () => {
    expect(() => assertTransition(CONFIGURED, CONFIGURED)).toThrow(ConflictError);
    expect(() => assertTransition(CONFIGURED, CONFIGURED)).toThrow(/CONFIGURED.*CONFIGURED/);
    expect(() => assertTransition(DRAFT, DRAFT)).toThrow(ConflictError);
  });
});

describe('isStreamable — DRAFT cameras are never streamed or probed', () => {
  it('only a CONFIGURED camera is streamable / probe-eligible / Live Wall eligible', () => {
    expect(isStreamable(CONFIGURED)).toBe(true);
    expect(isStreamable(DRAFT)).toBe(false);
  });
});
