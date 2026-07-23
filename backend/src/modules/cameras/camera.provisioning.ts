import { CameraProvisioning } from '@aniston-vms/shared';
import { ConflictError } from '../../middleware/errorHandler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Camera commissioning lifecycle — a pure state machine (no I/O). This is the
// single place the DRAFT → CONFIGURED rule lives; camera.service.ts calls into
// it and the health scheduler / playback service gate on isStreamable().
//
//   register    creates a camera in DRAFT (identity only — name/code/vendor).
//   configure   saves placement + stream config. It does NOT change state: a
//               camera stays DRAFT until a real connection test passes.
//   activate    DRAFT → CONFIGURED, only after that passing connection test.
//   deactivate  CONFIGURED → DRAFT — pulled from service; config is retained,
//               so it can be re-activated later without re-entering everything.
//
// See prisma Camera model (`provisioningState`) and shared/src/enums.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Adjacency table of permitted lifecycle moves. Self-transitions are
 * deliberately absent: re-activating a CONFIGURED camera (or re-deactivating a
 * DRAFT one) is a conflict, not an idempotent no-op. */
export const PROVISIONING_TRANSITIONS: Record<CameraProvisioning, CameraProvisioning[]> = {
  [CameraProvisioning.DRAFT]: [CameraProvisioning.CONFIGURED],
  [CameraProvisioning.CONFIGURED]: [CameraProvisioning.DRAFT],
};

/** True iff `to` is a permitted next state from `from`. */
export function canTransition(from: CameraProvisioning, to: CameraProvisioning): boolean {
  return PROVISIONING_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Guard form of {@link canTransition} — throws ConflictError (409) naming both
 * states, so the API surfaces a clear "can't do that from here" to the caller. */
export function assertTransition(from: CameraProvisioning, to: CameraProvisioning): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Cannot transition camera from ${from} to ${to}`);
  }
}

/** Whether a camera in this state may be streamed / probed / shown on the Live
 * Wall. Only CONFIGURED cameras qualify — a DRAFT camera has no stream config
 * and must never be handed to the health scheduler or playback service. */
export function isStreamable(state: CameraProvisioning): boolean {
  return state === CameraProvisioning.CONFIGURED;
}
