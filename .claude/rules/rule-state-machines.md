---
# State Machine Rules
Canon: memory/alignment-dictionary.md §2 (status/diagnosis code catalog), docs/05-backend-schema.md.

Every workflow with a status field MUST define:
  All valid states (list every enum value)
  Valid transitions: from → to, what triggers it, which role can trigger it
  Blocked transitions: what is NOT allowed and why
  Terminal states: states that are irreversible (e.g. `CLOSED`)
  Rollback states: how to revert if something goes wrong (e.g. `REOPENED`)
  Self-transition guard: can a resource transition to its current state? (usually no)
  Concurrency handling: what happens if two probes/users act simultaneously?

## Camera health state machine (`CameraStatus`)

  Driven by `HealthCheck` rows written by `apps/workers` probes (`CheckType`: RTSP probe, TCP port check,
  ONVIF query, router ping, SIM signal, image-analysis pass). Each `HealthCheck.diagnosis` field stores a
  fine-grained code from the catalog (`CAMERA_REACHABLE`, `CAMERA_TIMEOUT`, `RTSP_AUTHENTICATED`,
  `INVALID_CREDENTIALS`, `INVALID_STREAM_PATH`, `CAMERA_PORT_CLOSED`, `PORT_FORWARDING_FAILURE`,
  `RTSP_PROTOCOL_FAILURE`, `STREAM_DEGRADED`, `UNSTABLE_STREAM`, `LOW_BITRATE`, `LOW_FPS`,
  `WRONG_RESOLUTION`, `WRONG_CODEC`, `CONFIG_ERROR`, `IMAGE_PROBLEM`, `LENS_CLEANING`, `VIDEO_HEALTHY`, …) —
  the coarse `Camera.status` transitions based on the pattern of recent diagnosis codes, not a single probe:

  - `VIDEO_HEALTHY` (or an equivalent healthy diagnosis) sustained across the confirmation window →
    `Camera.status = ONLINE`
  - Any degraded diagnosis code (`STREAM_DEGRADED`, `LOW_BITRATE`, `LOW_FPS`, `WRONG_RESOLUTION`,
    `WRONG_CODEC`) → `Camera.status = DEGRADED`
  - `CAMERA_OFFLINE`, `CAMERA_TIMEOUT`, `CAMERA_PORT_CLOSED`, `RTSP_PROTOCOL_FAILURE`, `INVALID_CREDENTIALS`,
    or an upstream `ROUTER_OFFLINE` / `SIM_DISCONNECTED` / `SITE_INTERNET_DOWN` → `Camera.status = OFFLINE`
  - Never let a camera skip straight from `OFFLINE` to `ONLINE` without passing through the recovery
    verification sub-machine below — a single good probe after an outage is not proof of a real fix

## Recovery verification sub-machine

  An `OFFLINE`/`DEGRADED` camera does not silently flip back to `ONLINE`. It must pass through
  `RECOVERY_VERIFIED`: N consecutive healthy `HealthCheck` probes (per docs/02-TRD.md's confirmation window)
  before the Incident tied to it is allowed to move to `RESOLVED`. This prevents flapping cameras from
  spamming operators with open/close/open incident churn.

## Incident state machine (`IncidentStatus`)

  States: `OPEN → ACKNOWLEDGED → ESCALATED → RECOVERY_VERIFIED → RESOLVED → CLOSED`, with `REOPENED` as the
  explicit re-open path out of `CLOSED`.
  - `OPEN`: created automatically by a health-check worker when a camera's diagnosis crosses the incident
    threshold; references the camera and the triggering `HealthCheck`
  - `ACKNOWLEDGED`: a PROJECT_ADMIN (or SUPER_ADMIN) claims it — `acknowledgedById` recorded
  - `ESCALATED`: policy-driven (unacknowledged past SLA, or severity-based) — creates an `Escalation` row and
    triggers a Notification (email/SMS/WhatsApp)
  - `RECOVERY_VERIFIED`: system-set once the recovery verification sub-machine above passes — NOT
    human-settable directly, only a worker/service can set it based on real HealthCheck evidence
  - `RESOLVED`: a human confirms closure after `RECOVERY_VERIFIED` (or manually, with a documented
    root-cause note, if resolving without automatic recovery — e.g. a hardware swap confirmed on-site)
  - `CLOSED`: terminal. Irreversible without the explicit `REOPENED` transition (which creates a new audit
    trail entry, it does not delete the old one)

  Blocked transitions: `OPEN → RESOLVED` directly (must pass through acknowledgement), `CLOSED →` anything
  except `REOPENED`, self-transition to the same status.

Use the Prisma optimistic lock pattern for state transitions:
  Use `updateMany` with the current status in the where clause
  This prevents race conditions without explicit locks
  If 0 rows updated, the state changed under you — return 409 Conflict
  Example: `prisma.incident.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'ACKNOWLEDGED', acknowledgedById } })`
  Never use a separate find + update — this creates a race condition (two operators acknowledging the same
  incident at once)

Red flags that mean a transition is broken:
  A UI button (e.g. "Acknowledge", "Escalate", "Resolve") triggers a transition that the service does not handle
  A service handles a transition but there is no role/zone-scope check
  A `CameraStatus`, `IncidentStatus`, or diagnosis code exists in the catalog but no handler exists for it
  A state change happens without a socket emit to refresh the live wall / incident board