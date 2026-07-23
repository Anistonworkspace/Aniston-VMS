# Edit Saved Camera Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator edit an already-configured (non-DRAFT) camera's placement, RTSP, stream spec, snapshot cadence, and name via a new `EditCameraModal`, saving through the existing `PATCH /cameras/:id`.

**Architecture:** Extract the map / RTSP / stream-spec input clusters from `ConfigureCameraModal` into three shared, controlled field components plus a pure `cameraConfigForm.ts` logic module (form state, prefill, validation, body builders). `EditCameraModal` composes those with `useUpdateCameraMutation`; RTSP secrets are write-only (blank = keep) because the API strips them. A post-save advisory re-probe reuses `useRunCameraCheckMutation`. Entry points: the detail drawer (primary) and configured camera cards, both permission-gated.

**Tech Stack:** React 18 + TypeScript, Redux Toolkit Query, MapLibre GL, Tailwind, Vitest 4 + React Testing Library + jsdom.

**Source spec:** `docs/superpowers/specs/edit-camera-config.md` (approved).

## Global Constraints

- **No backend changes.** No new endpoints, no zod/schema edits, no Prisma migration, no RBAC/role changes. Save uses existing `PATCH /cameras/:id` (`updateCameraSchema` + `camera.service.updateCamera`), which already does partial RTSP re-encryption and accepts `snapshotIntervalMinutes`.
- **Never auto-activate** and **never send** `maintenanceMode` or `status` from the edit modal. `maintenanceMode` stays on the drawer's existing toggle.
- **RTSP secrets are write-only:** blank on open, "leave blank to keep the saved value"; omit any blank RTSP field from the PATCH body (never send `''`).
- **No client zod.** Validation is manual, reusing `frontend/src/features/cameras/coordinates.ts`.
- **Anti-drift:** the map, RTSP, and stream-spec inputs are shared components used by BOTH `ConfigureCameraModal` and `EditCameraModal`. The refactor of `ConfigureCameraModal` must be behavior-preserving (its existing test stays green).
- **Permission floors:** entry points gate on `isCameraWriteRole(user?.role)`; the modal re-checks defensively; the server remains the final authority.
- **Numeric bounds (mirror backend):** `expectedFps` 1–240, `expectedBitrateKbps` 1–1_000_000, `onvifPort` 1–65535, `snapshotIntervalMinutes` 1–60, `latitude` −90..90, `longitude` −180..180.
- **Run tests from the repo root** with: `npm --prefix frontend run test -- <path>` and typecheck with `npm --prefix frontend run typecheck`.

---

## File Structure

**New**
- `frontend/src/features/cameras/cameraConfigForm.ts` — pure form logic: constants, `CameraConfigFormState` + slice types, `configFormFromCamera`, `validateConfigForm`, `buildConfigureBody`, `buildUpdateBody`.
- `frontend/src/features/cameras/cameraConfigForm.test.ts` — unit tests for the above.
- `frontend/src/features/cameras/StreamSpecFields.tsx` (+ `.test.tsx`) — codec/resolution/fps/bitrate/adapter inputs.
- `frontend/src/features/cameras/RtspCredentialFields.tsx` (+ `.test.tsx`) — RTSP URLs/creds/onvifPort, `mode: 'create' | 'edit'`.
- `frontend/src/features/cameras/CameraPlacementFields.tsx` (+ `.test.tsx`) — site/router selects + MapLibre pin + lat/lng.
- `frontend/src/features/cameras/EditCameraModal.tsx` (+ `.test.tsx`) — the feature.

**Modified**
- `frontend/src/features/cameras/cameras.types.ts` — widen `UpdateCameraInput`.
- `frontend/src/features/cameras/ConfigureCameraModal.tsx` — consume the shared components + module (behavior-preserving).
- `frontend/src/features/cameras/CameraCard.tsx` — add `onEdit` affordance for configured cards.
- `frontend/src/features/cameras/CamerasPage.tsx` — `editCamera` state + render `EditCameraModal`.
- `frontend/src/features/cameras/CameraDetailDrawer.tsx` — "Edit configuration" button + render `EditCameraModal`.

---

## Task 1: Widen `UpdateCameraInput` + create `cameraConfigForm.ts` (constants, state, prefill)

**Files:**
- Modify: `frontend/src/features/cameras/cameras.types.ts` (the `UpdateCameraInput` interface, ~lines 88–92)
- Create: `frontend/src/features/cameras/cameraConfigForm.ts`
- Test: `frontend/src/features/cameras/cameraConfigForm.test.ts`

**Interfaces:**
- Consumes: `Camera`, `PlaybackAdapter` from `./cameras.types`; `formatCoordinate` from `./coordinates`.
- Produces:
  - `PLAYBACK_ADAPTERS: { value: PlaybackAdapter; label: string }[]`
  - `SELECT_CLASSES: string`
  - `interface CameraConfigFormState` (all fields `string` except `playbackAdapter: PlaybackAdapter`)
  - `type PlacementValue`, `RtspValue`, `StreamSpecValue` (Pick slices of `CameraConfigFormState`)
  - `type ConfigFormErrors = Partial<Record<keyof CameraConfigFormState, string>>`
  - `configFormFromCamera(camera: Camera): CameraConfigFormState`

- [ ] **Step 1: Widen `UpdateCameraInput`**

In `cameras.types.ts`, replace the `UpdateCameraInput` interface with:

```ts
/** PATCH /cameras/:id — backend updateCameraSchema (partial identity/config +
 * maintenanceMode + snapshotIntervalMinutes). The edit modal sends the config
 * subset; RTSP secrets are omitted unless re-entered. */
export interface UpdateCameraInput {
  name?: string;
  maintenanceMode?: boolean;
  snapshotIntervalMinutes?: number;
  siteId?: string;
  routerId?: string;
  mainRtspUrl?: string;
  subRtspUrl?: string;
  rtspUsername?: string;
  rtspPassword?: string;
  onvifPort?: number;
  playbackAdapter?: PlaybackAdapter;
  expectedCodec?: string;
  expectedResolution?: string;
  expectedFps?: number;
  expectedBitrateKbps?: number;
  latitude?: number;
  longitude?: number;
}
```

(`PlaybackAdapter` is already imported/defined in this file — it is used by `Camera` and `ConfigureCameraInput`.)

- [ ] **Step 2: Verify existing callers still typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: PASS (widening is additive; `updateCamera({ id, body: { name } })` and `{ maintenanceMode }` in the drawer remain valid).

- [ ] **Step 3: Write the failing test for `configFormFromCamera`**

Create `frontend/src/features/cameras/cameraConfigForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Camera } from './cameras.types';
import { configFormFromCamera } from './cameraConfigForm';

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: 'cam-1', siteId: 'site-1', routerId: 'router-1', cameraCode: 'CAM-GGN-021',
    name: 'Lobby Cam', brand: 'Hikvision', model: 'DS-2CD', firmware: 'v5.7',
    serialNumber: 'SN-123', onvifPort: 80, latitude: 28.600148, longitude: 77.19458,
    playbackAdapter: 'ONVIF_G', expectedCodec: 'H.264', expectedResolution: '1920x1080',
    expectedFps: 15, expectedBitrateKbps: 2048, provisioningState: 'CONFIGURED',
    healthScore: 92, status: 'HEALTHY', diagnosis: null,
    lastHealthyAt: '2026-08-27T10:00:00.000Z', lastSnapshotAt: null, maintenanceMode: false,
    snapshotIntervalMinutes: 30, createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z', site: { id: 'site-1', name: 'HQ' },
    router: { id: 'router-1', connectionStatus: 'ONLINE', signalStrength: -55, operator: 'Jio' },
    ...overrides,
  };
}

describe('configFormFromCamera', () => {
  it('prefills non-secret fields and leaves RTSP blank', () => {
    const form = configFormFromCamera(makeCamera());
    expect(form.name).toBe('Lobby Cam');
    expect(form.siteId).toBe('site-1');
    expect(form.routerId).toBe('router-1');
    expect(form.latitude).toBe('28.600148');
    expect(form.longitude).toBe('77.19458');
    expect(form.expectedFps).toBe('15');
    expect(form.expectedBitrateKbps).toBe('2048');
    expect(form.snapshotIntervalMinutes).toBe('30');
    expect(form.onvifPort).toBe('80');
    expect(form.playbackAdapter).toBe('ONVIF_G');
    // secrets never come back from the API — always blank
    expect(form.mainRtspUrl).toBe('');
    expect(form.subRtspUrl).toBe('');
    expect(form.rtspUsername).toBe('');
    expect(form.rtspPassword).toBe('');
  });

  it('maps null placement/stream fields (DRAFT) to empty strings', () => {
    const form = configFormFromCamera(
      makeCamera({ siteId: null, routerId: null, latitude: null, longitude: null,
        expectedCodec: null, expectedResolution: null, expectedFps: null,
        expectedBitrateKbps: null, onvifPort: null })
    );
    expect(form.siteId).toBe('');
    expect(form.latitude).toBe('');
    expect(form.expectedCodec).toBe('');
    expect(form.expectedFps).toBe('');
    expect(form.onvifPort).toBe('');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm --prefix frontend run test -- src/features/cameras/cameraConfigForm.test.ts`
Expected: FAIL — cannot resolve `./cameraConfigForm` / `configFormFromCamera` is not a function.

- [ ] **Step 5: Create `cameraConfigForm.ts` with constants, state type, slices, and prefill**

Create `frontend/src/features/cameras/cameraConfigForm.ts`:

```ts
import type { Camera, PlaybackAdapter } from './cameras.types';
import { formatCoordinate } from './coordinates';

export const SELECT_CLASSES =
  'h-9 w-full rounded-lg border border-hairline bg-card px-3 text-sm text-ink transition-colors hover:border-sage focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage';

export const PLAYBACK_ADAPTERS: { value: PlaybackAdapter; label: string }[] = [
  { value: 'NONE', label: 'None (live only)' },
  { value: 'ONVIF_G', label: 'ONVIF (Profile G)' },
  { value: 'HIKVISION', label: 'Hikvision' },
  { value: 'DAHUA', label: 'Dahua' },
];

export interface CameraConfigFormState {
  name: string;
  siteId: string;
  routerId: string;
  mainRtspUrl: string;
  subRtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
  onvifPort: string;
  playbackAdapter: PlaybackAdapter;
  expectedCodec: string;
  expectedResolution: string;
  expectedFps: string;
  expectedBitrateKbps: string;
  latitude: string;
  longitude: string;
  snapshotIntervalMinutes: string;
}

export type PlacementValue = Pick<CameraConfigFormState, 'siteId' | 'routerId' | 'latitude' | 'longitude'>;
export type RtspValue = Pick<CameraConfigFormState, 'mainRtspUrl' | 'subRtspUrl' | 'rtspUsername' | 'rtspPassword' | 'onvifPort'>;
export type StreamSpecValue = Pick<CameraConfigFormState, 'playbackAdapter' | 'expectedCodec' | 'expectedResolution' | 'expectedFps' | 'expectedBitrateKbps'>;

export type ConfigFormErrors = Partial<Record<keyof CameraConfigFormState, string>>;

const numToStr = (n: number | null | undefined): string => (n != null ? String(n) : '');

/** Build editable form state from a sanitized Camera. RTSP secrets are ALWAYS
 * blank because the API strips them (sanitizeCamera); everything else prefills. */
export function configFormFromCamera(camera: Camera): CameraConfigFormState {
  return {
    name: camera.name,
    siteId: camera.siteId ?? '',
    routerId: camera.routerId ?? '',
    mainRtspUrl: '',
    subRtspUrl: '',
    rtspUsername: '',
    rtspPassword: '',
    onvifPort: numToStr(camera.onvifPort),
    playbackAdapter: camera.playbackAdapter,
    expectedCodec: camera.expectedCodec ?? '',
    expectedResolution: camera.expectedResolution ?? '',
    expectedFps: numToStr(camera.expectedFps),
    expectedBitrateKbps: numToStr(camera.expectedBitrateKbps),
    latitude: camera.latitude != null ? formatCoordinate(camera.latitude) : '',
    longitude: camera.longitude != null ? formatCoordinate(camera.longitude) : '',
    snapshotIntervalMinutes: String(camera.snapshotIntervalMinutes),
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm --prefix frontend run test -- src/features/cameras/cameraConfigForm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/cameras/cameras.types.ts frontend/src/features/cameras/cameraConfigForm.ts frontend/src/features/cameras/cameraConfigForm.test.ts
git commit -m "feat(cameras): shared camera-config form state + widen UpdateCameraInput"
```

---

## Task 2: `validateConfigForm` (manual validation, mode-aware)

**Files:**
- Modify: `frontend/src/features/cameras/cameraConfigForm.ts`
- Test: `frontend/src/features/cameras/cameraConfigForm.test.ts`

**Interfaces:**
- Consumes: `validateLatitude`, `validateLongitude` from `./coordinates`.
- Produces: `validateConfigForm(form: CameraConfigFormState, mode: 'create' | 'edit'): ConfigFormErrors`

- [ ] **Step 1: Write the failing tests**

Append to `cameraConfigForm.test.ts`:

```ts
import { validateConfigForm } from './cameraConfigForm';
import type { CameraConfigFormState } from './cameraConfigForm';

function validForm(overrides: Partial<CameraConfigFormState> = {}): CameraConfigFormState {
  return {
    name: 'Lobby Cam', siteId: 'site-1', routerId: 'router-1',
    mainRtspUrl: 'rtsp://10.0.0.1/main', subRtspUrl: 'rtsp://10.0.0.1/sub',
    rtspUsername: 'admin', rtspPassword: 'secret', onvifPort: '80',
    playbackAdapter: 'ONVIF_G', expectedCodec: 'H.264', expectedResolution: '1920x1080',
    expectedFps: '15', expectedBitrateKbps: '2048', latitude: '28.6', longitude: '77.2',
    snapshotIntervalMinutes: '30', ...overrides,
  };
}

describe('validateConfigForm', () => {
  it('passes a fully valid form in both modes', () => {
    expect(validateConfigForm(validForm(), 'create')).toEqual({});
    expect(validateConfigForm(validForm(), 'edit')).toEqual({});
  });

  it('requires RTSP fields in create mode', () => {
    const errs = validateConfigForm(
      validForm({ mainRtspUrl: '', rtspUsername: '', rtspPassword: '' }), 'create');
    expect(errs.mainRtspUrl).toBeTruthy();
    expect(errs.rtspUsername).toBeTruthy();
    expect(errs.rtspPassword).toBeTruthy();
  });

  it('allows blank RTSP fields in edit mode (blank = keep)', () => {
    const errs = validateConfigForm(
      validForm({ mainRtspUrl: '', subRtspUrl: '', rtspUsername: '', rtspPassword: '' }), 'edit');
    expect(errs.mainRtspUrl).toBeUndefined();
    expect(errs.rtspUsername).toBeUndefined();
    expect(errs.rtspPassword).toBeUndefined();
  });

  it('still format-checks a non-blank RTSP URL in edit mode', () => {
    const errs = validateConfigForm(validForm({ mainRtspUrl: 'http://nope' }), 'edit');
    expect(errs.mainRtspUrl).toBeTruthy();
  });

  it('requires non-RTSP fields in both modes and bounds numbers', () => {
    const errs = validateConfigForm(
      validForm({ name: '', siteId: '', expectedFps: '999', snapshotIntervalMinutes: '0', latitude: '200' }), 'edit');
    expect(errs.name).toBeTruthy();
    expect(errs.siteId).toBeTruthy();
    expect(errs.expectedFps).toBeTruthy();
    expect(errs.snapshotIntervalMinutes).toBeTruthy();
    expect(errs.latitude).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm --prefix frontend run test -- src/features/cameras/cameraConfigForm.test.ts`
Expected: FAIL — `validateConfigForm` is not exported.

- [ ] **Step 3: Implement `validateConfigForm`**

Append to `cameraConfigForm.ts` (add the two imports at the top of the file):

```ts
import { validateLatitude, validateLongitude } from './coordinates';

const RTSP_URL_SHAPE = /^rtsps?:\/\/.+/i;

function boundedInt(value: string, min: number, max: number): boolean {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
}

export function validateConfigForm(
  form: CameraConfigFormState,
  mode: 'create' | 'edit'
): ConfigFormErrors {
  const errors: ConfigFormErrors = {};

  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.siteId) errors.siteId = 'Site is required';
  if (!form.routerId) errors.routerId = 'Router is required';
  if (!form.expectedCodec.trim()) errors.expectedCodec = 'Codec is required';
  if (!form.expectedResolution.trim()) errors.expectedResolution = 'Resolution is required';

  const latErr = validateLatitude(form.latitude);
  if (latErr) errors.latitude = latErr;
  const lngErr = validateLongitude(form.longitude);
  if (lngErr) errors.longitude = lngErr;

  if (!boundedInt(form.expectedFps, 1, 240)) errors.expectedFps = 'FPS must be a whole number 1–240';
  if (!boundedInt(form.expectedBitrateKbps, 1, 1_000_000))
    errors.expectedBitrateKbps = 'Bitrate must be 1–1,000,000 kbps';
  if (!boundedInt(form.snapshotIntervalMinutes, 1, 60))
    errors.snapshotIntervalMinutes = 'Snapshot interval must be 1–60 minutes';
  if (form.onvifPort.trim() && !boundedInt(form.onvifPort, 1, 65535))
    errors.onvifPort = 'ONVIF port must be 1–65535';

  const rtspRequired = mode === 'create';
  const checkUrl = (key: 'mainRtspUrl' | 'subRtspUrl', label: string): void => {
    const raw = form[key].trim();
    if (rtspRequired && !raw) errors[key] = `${label} is required`;
    else if (raw && !RTSP_URL_SHAPE.test(raw)) errors[key] = `${label} must be an rtsp:// URL`;
  };
  checkUrl('mainRtspUrl', 'Main RTSP URL');
  checkUrl('subRtspUrl', 'Sub RTSP URL');
  if (rtspRequired && !form.rtspUsername.trim()) errors.rtspUsername = 'Username is required';
  if (rtspRequired && !form.rtspPassword.trim()) errors.rtspPassword = 'Password is required';

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend run test -- src/features/cameras/cameraConfigForm.test.ts`
Expected: PASS (all `validateConfigForm` + `configFormFromCamera` tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cameras/cameraConfigForm.ts frontend/src/features/cameras/cameraConfigForm.test.ts
git commit -m "feat(cameras): mode-aware manual validation for camera config form"
```

---

## Task 3: Body builders `buildConfigureBody` + `buildUpdateBody`

**Files:**
- Modify: `frontend/src/features/cameras/cameraConfigForm.ts`
- Test: `frontend/src/features/cameras/cameraConfigForm.test.ts`

**Interfaces:**
- Consumes: `ConfigureCameraInput`, `UpdateCameraInput` from `./cameras.types`.
- Produces:
  - `buildConfigureBody(form: CameraConfigFormState): ConfigureCameraInput`
  - `buildUpdateBody(form: CameraConfigFormState): UpdateCameraInput`

- [ ] **Step 1: Write the failing tests**

Append to `cameraConfigForm.test.ts`:

```ts
import { buildConfigureBody, buildUpdateBody } from './cameraConfigForm';

describe('buildConfigureBody', () => {
  it('produces the full required configure payload', () => {
    const body = buildConfigureBody(validForm());
    expect(body).toEqual({
      siteId: 'site-1', routerId: 'router-1',
      mainRtspUrl: 'rtsp://10.0.0.1/main', subRtspUrl: 'rtsp://10.0.0.1/sub',
      rtspUsername: 'admin', rtspPassword: 'secret', onvifPort: 80,
      playbackAdapter: 'ONVIF_G', expectedCodec: 'H.264', expectedResolution: '1920x1080',
      expectedFps: 15, expectedBitrateKbps: 2048, latitude: 28.6, longitude: 77.2,
    });
  });
});

describe('buildUpdateBody', () => {
  it('omits every blank RTSP field and never sends status/maintenanceMode', () => {
    const body = buildUpdateBody(validForm({
      mainRtspUrl: '', subRtspUrl: '', rtspUsername: '', rtspPassword: '' }));
    expect('mainRtspUrl' in body).toBe(false);
    expect('subRtspUrl' in body).toBe(false);
    expect('rtspUsername' in body).toBe(false);
    expect('rtspPassword' in body).toBe(false);
    expect('status' in body).toBe(false);
    expect('maintenanceMode' in body).toBe(false);
    expect(body.name).toBe('Lobby Cam');
    expect(body.snapshotIntervalMinutes).toBe(30);
    expect(body.latitude).toBe(28.6);
    expect(body.expectedFps).toBe(15);
  });

  it('includes only the RTSP fields that were re-entered', () => {
    const body = buildUpdateBody(validForm({
      mainRtspUrl: '', subRtspUrl: '', rtspUsername: '', rtspPassword: 'newpass' }));
    expect('mainRtspUrl' in body).toBe(false);
    expect(body.rtspPassword).toBe('newpass');
  });

  it('omits onvifPort when blank', () => {
    const body = buildUpdateBody(validForm({ onvifPort: '' }));
    expect('onvifPort' in body).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm --prefix frontend run test -- src/features/cameras/cameraConfigForm.test.ts`
Expected: FAIL — `buildConfigureBody` / `buildUpdateBody` not exported.

- [ ] **Step 3: Implement the builders**

Append to `cameraConfigForm.ts` (add the type import at top):

```ts
import type { ConfigureCameraInput, UpdateCameraInput } from './cameras.types';

/** Full, all-required configure payload (PUT /cameras/:id/configure). */
export function buildConfigureBody(form: CameraConfigFormState): ConfigureCameraInput {
  return {
    siteId: form.siteId,
    routerId: form.routerId,
    mainRtspUrl: form.mainRtspUrl.trim(),
    subRtspUrl: form.subRtspUrl.trim(),
    rtspUsername: form.rtspUsername,
    rtspPassword: form.rtspPassword,
    onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : undefined,
    playbackAdapter: form.playbackAdapter,
    expectedCodec: form.expectedCodec.trim(),
    expectedResolution: form.expectedResolution.trim(),
    expectedFps: Number(form.expectedFps),
    expectedBitrateKbps: Number(form.expectedBitrateKbps),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
  };
}

/** Partial edit payload (PATCH /cameras/:id). Blank RTSP fields are OMITTED so
 * the server keeps the stored secret; never sends status/maintenanceMode. */
export function buildUpdateBody(form: CameraConfigFormState): UpdateCameraInput {
  const body: UpdateCameraInput = {
    name: form.name.trim(),
    siteId: form.siteId,
    routerId: form.routerId,
    playbackAdapter: form.playbackAdapter,
    expectedCodec: form.expectedCodec.trim(),
    expectedResolution: form.expectedResolution.trim(),
    expectedFps: Number(form.expectedFps),
    expectedBitrateKbps: Number(form.expectedBitrateKbps),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    snapshotIntervalMinutes: Number(form.snapshotIntervalMinutes),
  };
  if (form.onvifPort.trim()) body.onvifPort = Number(form.onvifPort);
  if (form.mainRtspUrl.trim()) body.mainRtspUrl = form.mainRtspUrl.trim();
  if (form.subRtspUrl.trim()) body.subRtspUrl = form.subRtspUrl.trim();
  if (form.rtspUsername.trim()) body.rtspUsername = form.rtspUsername;
  if (form.rtspPassword.trim()) body.rtspPassword = form.rtspPassword;
  return body;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend run test -- src/features/cameras/cameraConfigForm.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cameras/cameraConfigForm.ts frontend/src/features/cameras/cameraConfigForm.test.ts
git commit -m "feat(cameras): configure + partial-update body builders (omit-blank RTSP)"
```

---

## Task 4: `StreamSpecFields` component

**Files:**
- Create: `frontend/src/features/cameras/StreamSpecFields.tsx`
- Test: `frontend/src/features/cameras/StreamSpecFields.test.tsx`

**Interfaces:**
- Consumes: `StreamSpecValue`, `ConfigFormErrors`, `PLAYBACK_ADAPTERS`, `SELECT_CLASSES` from `./cameraConfigForm`; `Input` from `@/components/ui`.
- Produces: `StreamSpecFields(props: { value: StreamSpecValue; errors: ConfigFormErrors; onChange: (patch: Partial<StreamSpecValue>) => void; disabled?: boolean }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/cameras/StreamSpecFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StreamSpecFields } from './StreamSpecFields';
import type { StreamSpecValue } from './cameraConfigForm';

const value: StreamSpecValue = {
  playbackAdapter: 'ONVIF_G', expectedCodec: 'H.264',
  expectedResolution: '1920x1080', expectedFps: '15', expectedBitrateKbps: '2048',
};

describe('StreamSpecFields', () => {
  it('renders current values and emits a patch on edit', () => {
    const onChange = vi.fn();
    render(<StreamSpecFields value={value} errors={{}} onChange={onChange} />);
    expect(screen.getByLabelText(/codec/i)).toHaveValue('H.264');
    fireEvent.change(screen.getByLabelText(/frames per second|fps/i), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith({ expectedFps: '30' });
  });

  it('shows a field error', () => {
    render(<StreamSpecFields value={value} errors={{ expectedFps: 'FPS must be a whole number 1–240' }} onChange={vi.fn()} />);
    expect(screen.getByText(/FPS must be a whole number/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend run test -- src/features/cameras/StreamSpecFields.test.tsx`
Expected: FAIL — cannot resolve `./StreamSpecFields`.

- [ ] **Step 3: Implement `StreamSpecFields.tsx`**

```tsx
import { Input } from '@/components/ui';
import { PLAYBACK_ADAPTERS, SELECT_CLASSES } from './cameraConfigForm';
import type { ConfigFormErrors, StreamSpecValue } from './cameraConfigForm';

interface Props {
  value: StreamSpecValue;
  errors: ConfigFormErrors;
  onChange: (patch: Partial<StreamSpecValue>) => void;
  disabled?: boolean;
}

export function StreamSpecFields({ value, errors, onChange, disabled }: Props): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-tertiary">
        Playback adapter
        <select
          className={SELECT_CLASSES}
          value={value.playbackAdapter}
          disabled={disabled}
          onChange={(e) => onChange({ playbackAdapter: e.target.value as StreamSpecValue['playbackAdapter'] })}
        >
          {PLAYBACK_ADAPTERS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </label>
      <Input
        label="Codec"
        value={value.expectedCodec}
        error={errors.expectedCodec}
        disabled={disabled}
        onChange={(e) => onChange({ expectedCodec: e.target.value })}
      />
      <Input
        label="Resolution"
        value={value.expectedResolution}
        error={errors.expectedResolution}
        disabled={disabled}
        onChange={(e) => onChange({ expectedResolution: e.target.value })}
      />
      <Input
        label="Frames per second"
        inputMode="numeric"
        value={value.expectedFps}
        error={errors.expectedFps}
        disabled={disabled}
        onChange={(e) => onChange({ expectedFps: e.target.value })}
      />
      <Input
        label="Bitrate (kbps)"
        inputMode="numeric"
        value={value.expectedBitrateKbps}
        error={errors.expectedBitrateKbps}
        disabled={disabled}
        onChange={(e) => onChange({ expectedBitrateKbps: e.target.value })}
      />
    </div>
  );
}
```

> If `@/components/ui`'s `Input` does not accept `label`/`error` props, read `frontend/src/components/ui` first and match its actual API (wrap with a `<label>` + error `<p>` exactly as `ConfigureCameraModal` does today). The label text must remain queryable via `getByLabelText`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix frontend run test -- src/features/cameras/StreamSpecFields.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cameras/StreamSpecFields.tsx frontend/src/features/cameras/StreamSpecFields.test.tsx
git commit -m "feat(cameras): extract StreamSpecFields component"
```

---

## Task 5: `RtspCredentialFields` component (mode-aware, write-only in edit)

**Files:**
- Create: `frontend/src/features/cameras/RtspCredentialFields.tsx`
- Test: `frontend/src/features/cameras/RtspCredentialFields.test.tsx`

**Interfaces:**
- Consumes: `RtspValue`, `ConfigFormErrors` from `./cameraConfigForm`; `Input` from `@/components/ui`.
- Produces: `RtspCredentialFields(props: { value: RtspValue; errors: ConfigFormErrors; mode: 'create' | 'edit'; onChange: (patch: Partial<RtspValue>) => void; disabled?: boolean }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/cameras/RtspCredentialFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RtspCredentialFields } from './RtspCredentialFields';
import type { RtspValue } from './cameraConfigForm';

const blank: RtspValue = { mainRtspUrl: '', subRtspUrl: '', rtspUsername: '', rtspPassword: '', onvifPort: '' };

describe('RtspCredentialFields', () => {
  it('shows a "leave blank to keep" hint in edit mode', () => {
    render(<RtspCredentialFields value={blank} errors={{}} mode="edit" onChange={vi.fn()} />);
    expect(screen.getAllByText(/leave blank to keep/i).length).toBeGreaterThan(0);
  });

  it('does not show the keep-hint in create mode', () => {
    render(<RtspCredentialFields value={blank} errors={{}} mode="create" onChange={vi.fn()} />);
    expect(screen.queryByText(/leave blank to keep/i)).toBeNull();
  });

  it('emits a patch when the password is typed', () => {
    const onChange = vi.fn();
    render(<RtspCredentialFields value={blank} errors={{}} mode="edit" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/rtsp password/i), { target: { value: 'newpass' } });
    expect(onChange).toHaveBeenCalledWith({ rtspPassword: 'newpass' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend run test -- src/features/cameras/RtspCredentialFields.test.tsx`
Expected: FAIL — cannot resolve `./RtspCredentialFields`.

- [ ] **Step 3: Implement `RtspCredentialFields.tsx`**

```tsx
import { Input } from '@/components/ui';
import type { ConfigFormErrors, RtspValue } from './cameraConfigForm';

interface Props {
  value: RtspValue;
  errors: ConfigFormErrors;
  mode: 'create' | 'edit';
  onChange: (patch: Partial<RtspValue>) => void;
  disabled?: boolean;
}

export function RtspCredentialFields({ value, errors, mode, onChange, disabled }: Props): JSX.Element {
  const keepHint = mode === 'edit' ? 'Leave blank to keep the saved value' : undefined;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input
        label="Main RTSP URL"
        placeholder={mode === 'edit' ? '•••• (unchanged)' : 'rtsp://…'}
        hint={keepHint}
        value={value.mainRtspUrl}
        error={errors.mainRtspUrl}
        disabled={disabled}
        onChange={(e) => onChange({ mainRtspUrl: e.target.value })}
      />
      <Input
        label="Sub RTSP URL"
        placeholder={mode === 'edit' ? '•••• (unchanged)' : 'rtsp://…'}
        hint={keepHint}
        value={value.subRtspUrl}
        error={errors.subRtspUrl}
        disabled={disabled}
        onChange={(e) => onChange({ subRtspUrl: e.target.value })}
      />
      <Input
        label="RTSP username"
        autoComplete="off"
        hint={keepHint}
        value={value.rtspUsername}
        error={errors.rtspUsername}
        disabled={disabled}
        onChange={(e) => onChange({ rtspUsername: e.target.value })}
      />
      <Input
        label="RTSP password"
        type="password"
        autoComplete="new-password"
        hint={keepHint}
        value={value.rtspPassword}
        error={errors.rtspPassword}
        disabled={disabled}
        onChange={(e) => onChange({ rtspPassword: e.target.value })}
      />
      <Input
        label="ONVIF port (optional)"
        inputMode="numeric"
        value={value.onvifPort}
        error={errors.onvifPort}
        disabled={disabled}
        onChange={(e) => onChange({ onvifPort: e.target.value })}
      />
    </div>
  );
}
```

> `label`/`error`/`hint`/`placeholder` must match the real `Input` API (read `frontend/src/components/ui`). If `Input` has no `hint` prop, render the keep-hint as a sibling `<p className="mt-1 text-xs text-tertiary">` under each field, still containing the text "Leave blank to keep the saved value". Keep the label text so `getByLabelText(/rtsp password/i)` resolves.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix frontend run test -- src/features/cameras/RtspCredentialFields.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cameras/RtspCredentialFields.tsx frontend/src/features/cameras/RtspCredentialFields.test.tsx
git commit -m "feat(cameras): extract RtspCredentialFields (write-only in edit mode)"
```

---

## Task 6: `CameraPlacementFields` component (site/router selects + MapLibre pin + lat/lng)

**Files:**
- Create: `frontend/src/features/cameras/CameraPlacementFields.tsx`
- Test: `frontend/src/features/cameras/CameraPlacementFields.test.tsx`

**Interfaces:**
- Consumes: `PlacementValue`, `ConfigFormErrors`, `SELECT_CLASSES` from `./cameraConfigForm`; `useListSitesLiteQuery`, `useListRoutersLiteQuery` from `./cameras.api`; `DELHI_NCR`, `OSM_RASTER_STYLE` from `./mapStyle`; `parseCoordinate`, `formatCoordinate`, `areCoordinatesValid` from `./coordinates`; `Input` from `@/components/ui`; `maplibre-gl`.
- Produces: `CameraPlacementFields(props: { value: PlacementValue; errors: ConfigFormErrors; onChange: (patch: Partial<PlacementValue>) => void; disabled?: boolean }): JSX.Element`

**Reference:** Read the current site/router/map/lat-lng block in `ConfigureCameraModal.tsx` first — this task lifts that exact behavior (map init, marker drag → `onChange({ latitude, longitude })`, text-field → pin sync via `parseCoordinate`/`areCoordinatesValid`) into a self-contained component. The map effect owns `mapRef`/`markerRef` and runs once on mount.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/cameras/CameraPlacementFields.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  marker: { setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(),
    on: vi.fn(), getLngLat: vi.fn(() => ({ lat: 28.6, lng: 77.2 })), remove: vi.fn() },
  map: { addControl: vi.fn(), on: vi.fn(), remove: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() },
}));
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => h.map),
    Marker: vi.fn(() => h.marker),
    NavigationControl: vi.fn(),
  },
}));
vi.mock('./cameras.api', () => ({
  useListSitesLiteQuery: () => ({ data: { items: [{ id: 'site-1', name: 'HQ' }, { id: 'site-2', name: 'DC' }] } }),
  useListRoutersLiteQuery: () => ({ data: { items: [{ id: 'router-1', serialNumber: 'RTR-9', model: 'X' }] } }),
}));

import { CameraPlacementFields } from './CameraPlacementFields';
import type { PlacementValue } from './cameraConfigForm';

const value: PlacementValue = { siteId: 'site-1', routerId: 'router-1', latitude: '28.6', longitude: '77.2' };

beforeEach(() => vi.clearAllMocks());

describe('CameraPlacementFields', () => {
  it('renders site options and emits a patch when the site changes', () => {
    const onChange = vi.fn();
    render(<CameraPlacementFields value={value} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/site/i), { target: { value: 'site-2' } });
    expect(onChange).toHaveBeenCalledWith({ siteId: 'site-2' });
  });

  it('emits lat/lng patch when a coordinate field changes to a valid value', () => {
    const onChange = vi.fn();
    render(<CameraPlacementFields value={value} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '30.5' } });
    expect(onChange).toHaveBeenCalledWith({ latitude: '30.5' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend run test -- src/features/cameras/CameraPlacementFields.test.tsx`
Expected: FAIL — cannot resolve `./CameraPlacementFields`.

- [ ] **Step 3: Implement `CameraPlacementFields.tsx`**

Port the map + selects + coordinate inputs from `ConfigureCameraModal`. Structure:

```tsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Input } from '@/components/ui';
import { SELECT_CLASSES } from './cameraConfigForm';
import type { ConfigFormErrors, PlacementValue } from './cameraConfigForm';
import { useListRoutersLiteQuery, useListSitesLiteQuery } from './cameras.api';
import { DELHI_NCR, OSM_RASTER_STYLE } from './mapStyle';
import { areCoordinatesValid, formatCoordinate, parseCoordinate } from './coordinates';

interface Props {
  value: PlacementValue;
  errors: ConfigFormErrors;
  onChange: (patch: Partial<PlacementValue>) => void;
  disabled?: boolean;
}

export function CameraPlacementFields({ value, errors, onChange, disabled }: Props): JSX.Element {
  const { data: sites } = useListSitesLiteQuery();
  const { data: routers } = useListRoutersLiteQuery();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Init the map once; drag the marker → push lat/lng strings up via onChange.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const start: [number, number] =
      areCoordinatesValid(value.latitude, value.longitude)
        ? [Number(value.longitude), Number(value.latitude)]
        : DELHI_NCR;
    const map = new maplibregl.Map({
      container: mapContainerRef.current, style: OSM_RASTER_STYLE, center: start, zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl());
    const marker = new maplibregl.Marker({ draggable: !disabled }).setLngLat(start).addTo(map);
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat();
      onChange({ latitude: formatCoordinate(lat), longitude: formatCoordinate(lng) });
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Text field → pin sync (only when both coordinates are valid).
  const syncPin = (lat: string, lng: string): void => {
    if (markerRef.current && mapRef.current && areCoordinatesValid(lat, lng)) {
      const lngLat: [number, number] = [Number(lng), Number(lat)];
      markerRef.current.setLngLat(lngLat);
      mapRef.current.setCenter(lngLat);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-tertiary">
          Site
          <select
            className={SELECT_CLASSES}
            value={value.siteId}
            disabled={disabled}
            onChange={(e) => onChange({ siteId: e.target.value })}
          >
            <option value="">Select a site…</option>
            {sites?.items.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.siteId && <span className="mt-1 block text-xs text-state-critical">{errors.siteId}</span>}
        </label>
        <label className="text-xs font-medium text-tertiary">
          Router
          <select
            className={SELECT_CLASSES}
            value={value.routerId}
            disabled={disabled}
            onChange={(e) => onChange({ routerId: e.target.value })}
          >
            <option value="">Select a router…</option>
            {routers?.items.map((r) => (
              <option key={r.id} value={r.id}>{r.serialNumber} · {r.model}</option>
            ))}
          </select>
          {errors.routerId && <span className="mt-1 block text-xs text-state-critical">{errors.routerId}</span>}
        </label>
      </div>

      <div ref={mapContainerRef} className="h-56 w-full overflow-hidden rounded-lg border border-hairline" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Latitude"
          value={value.latitude}
          error={errors.latitude}
          disabled={disabled}
          onChange={(e) => { onChange({ latitude: e.target.value }); syncPin(e.target.value, value.longitude); }}
        />
        <Input
          label="Longitude"
          value={value.longitude}
          error={errors.longitude}
          disabled={disabled}
          onChange={(e) => { onChange({ longitude: e.target.value }); syncPin(value.latitude, e.target.value); }}
        />
      </div>
    </div>
  );
}
```

> Match the real `router` lite-item field names (read `RouterItem` in `cameras.types.ts` — the label is "serial + model"; adjust if the property is `serialNumber`/`model` vs other names) and the real `Input`/`mapStyle` APIs. Behavior must equal today's `ConfigureCameraModal` map.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix frontend run test -- src/features/cameras/CameraPlacementFields.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/cameras/CameraPlacementFields.tsx frontend/src/features/cameras/CameraPlacementFields.test.tsx
git commit -m "feat(cameras): extract CameraPlacementFields (map + placement inputs)"
```

---

## Task 7: Refactor `ConfigureCameraModal` onto the shared components (behavior-preserving)

**Files:**
- Modify: `frontend/src/features/cameras/ConfigureCameraModal.tsx`
- Test (guard, must stay green): `frontend/src/features/cameras/ConfigureCameraModal.test.tsx`

**Interfaces:**
- Consumes: `CameraPlacementFields`, `RtspCredentialFields`, `StreamSpecFields`, and `PLAYBACK_ADAPTERS`, `SELECT_CLASSES`, `buildConfigureBody`, `CameraConfigFormState` from the new modules.
- Produces: no external API change (same props, same `PUT /configure` + activate behavior).

**Reference:** Read `ConfigureCameraModal.tsx` in full before editing.

- [ ] **Step 1: Run the existing test to capture the green baseline**

Run: `npm --prefix frontend run test -- src/features/cameras/ConfigureCameraModal.test.tsx`
Expected: PASS (baseline before refactor).

- [ ] **Step 2: Replace local constants with shared imports**

Remove the local `SELECT_CLASSES` and `PLAYBACK_ADAPTERS` declarations; import them from `./cameraConfigForm`. Add imports for the three field components. Delete the now-unused `maplibregl`, `mapStyle`, and coordinate imports **only if** they are no longer referenced after Step 3 (the map now lives in `CameraPlacementFields`).

```ts
import { CameraPlacementFields } from './CameraPlacementFields';
import { RtspCredentialFields } from './RtspCredentialFields';
import { StreamSpecFields } from './StreamSpecFields';
import { PLAYBACK_ADAPTERS, SELECT_CLASSES, buildConfigureBody } from './cameraConfigForm';
import type { CameraConfigFormState } from './cameraConfigForm';
```

- [ ] **Step 3: Replace the three inline JSX sections with the components**

In the render, swap the inline site/router/map/lat-lng block, RTSP block, and stream block for:

```tsx
<CameraPlacementFields
  value={{ siteId: form.siteId, routerId: form.routerId, latitude: form.latitude, longitude: form.longitude }}
  errors={errors}
  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
/>
<RtspCredentialFields
  mode="create"
  value={{ mainRtspUrl: form.mainRtspUrl, subRtspUrl: form.subRtspUrl, rtspUsername: form.rtspUsername, rtspPassword: form.rtspPassword, onvifPort: form.onvifPort }}
  errors={errors}
  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
/>
<StreamSpecFields
  value={{ playbackAdapter: form.playbackAdapter, expectedCodec: form.expectedCodec, expectedResolution: form.expectedResolution, expectedFps: form.expectedFps, expectedBitrateKbps: form.expectedBitrateKbps }}
  errors={errors}
  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
/>
```

Adopt `CameraConfigFormState` as the modal's single form state (seed with `configFormFromCamera(camera)` where the modal previously initialized fields; the extra `name`/`snapshotIntervalMinutes` fields are simply unused by the configure payload). Keep an `errors` state of type `ConfigFormErrors`. Remove the now-dead map refs/effects and separate `latText`/`lngText` state — that logic moved into `CameraPlacementFields`. Keep `handleProbe`/test-connection and `handleSaveOnly`/`handleSaveAndActivate`, replacing the local `buildBody` with `buildConfigureBody(form)`.

- [ ] **Step 4: Typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the guard test; fix selector drift only (no behavior change)**

Run: `npm --prefix frontend run test -- src/features/cameras/ConfigureCameraModal.test.tsx`
Expected: PASS. If a query breaks purely because label markup moved, update the test selector to the same label text — do not change asserted behavior (save/activate/probe calls and payloads must be unchanged).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/cameras/ConfigureCameraModal.tsx frontend/src/features/cameras/ConfigureCameraModal.test.tsx
git commit -m "refactor(cameras): ConfigureCameraModal consumes shared config field components"
```

---

## Task 8: `EditCameraModal` (the feature)

**Files:**
- Create: `frontend/src/features/cameras/EditCameraModal.tsx`
- Test: `frontend/src/features/cameras/EditCameraModal.test.tsx`

**Interfaces:**
- Consumes: `configFormFromCamera`, `validateConfigForm`, `buildUpdateBody`, `CameraConfigFormState`, `ConfigFormErrors` from `./cameraConfigForm`; the three field components; `useUpdateCameraMutation`, `useRunCameraCheckMutation` from `./cameras.api`; `useGetCurrentUserQuery` from `@/features/auth/auth.api`; `isCameraWriteRole` from `@/features/auth/auth.types`; `AnimatedModal`, `Button`, `Input` from `@/components/ui`; `getApiErrorMessage` from `@/lib/apiError`.
- Produces: `EditCameraModal(props: { open: boolean; camera: Camera; onClose: () => void; notify: { success: (t: string, d?: string) => void; error: (t: string, d?: string) => void } }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/cameras/EditCameraModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Camera } from './cameras.types';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  runCheck: vi.fn(),
  user: { role: 'PROJECT_ADMIN' } as { role: string },
}));
vi.mock('./cameras.api', () => ({
  useUpdateCameraMutation: () => [h.update, { isLoading: false }],
  useRunCameraCheckMutation: () => [h.runCheck, { isLoading: false }],
  useListSitesLiteQuery: () => ({ data: { items: [{ id: 'site-1', name: 'HQ' }] } }),
  useListRoutersLiteQuery: () => ({ data: { items: [{ id: 'router-1', serialNumber: 'RTR-9', model: 'X' }] } }),
}));
vi.mock('@/features/auth/auth.api', () => ({ useGetCurrentUserQuery: () => ({ data: h.user }) }));
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({ addControl: vi.fn(), on: vi.fn(), remove: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() })),
    Marker: vi.fn(() => ({ setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(),
      on: vi.fn(), getLngLat: vi.fn(() => ({ lat: 28.6, lng: 77.2 })), remove: vi.fn() })),
    NavigationControl: vi.fn(),
  },
}));

import { EditCameraModal } from './EditCameraModal';

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: 'cam-1', siteId: 'site-1', routerId: 'router-1', cameraCode: 'CAM-GGN-021',
    name: 'Lobby Cam', brand: 'Hikvision', model: 'DS-2CD', firmware: 'v5.7',
    serialNumber: 'SN-123', onvifPort: 80, latitude: 28.6, longitude: 77.2,
    playbackAdapter: 'ONVIF_G', expectedCodec: 'H.264', expectedResolution: '1920x1080',
    expectedFps: 15, expectedBitrateKbps: 2048, provisioningState: 'CONFIGURED',
    healthScore: 92, status: 'HEALTHY', diagnosis: null, lastHealthyAt: null,
    lastSnapshotAt: null, maintenanceMode: false, snapshotIntervalMinutes: 30,
    createdAt: '', updatedAt: '', site: { id: 'site-1', name: 'HQ' },
    router: { id: 'router-1', connectionStatus: 'ONLINE', signalStrength: -55, operator: 'Jio' },
    ...overrides,
  };
}
const notify = { success: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { role: 'PROJECT_ADMIN' };
  h.update.mockReturnValue({ unwrap: () => Promise.resolve(makeCamera()) });
  h.runCheck.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

describe('EditCameraModal', () => {
  it('prefills non-secret fields and leaves RTSP blank', () => {
    render(<EditCameraModal open camera={makeCamera()} onClose={vi.fn()} notify={notify} />);
    expect(screen.getByLabelText(/name/i)).toHaveValue('Lobby Cam');
    expect(screen.getByLabelText(/rtsp password/i)).toHaveValue('');
  });

  it('saves via PATCH, omits blank RTSP, then fires an advisory re-probe', async () => {
    const onClose = vi.fn();
    render(<EditCameraModal open camera={makeCamera()} onClose={onClose} notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const arg = h.update.mock.calls[0][0];
    expect(arg.id).toBe('cam-1');
    expect('mainRtspUrl' in arg.body).toBe(false);
    expect('maintenanceMode' in arg.body).toBe(false);
    expect(arg.body.snapshotIntervalMinutes).toBe(30);
    await waitFor(() => expect(h.runCheck).toHaveBeenCalledWith('cam-1'));
    expect(notify.success).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends only the RTSP field that was re-entered', async () => {
    render(<EditCameraModal open camera={makeCamera()} onClose={vi.fn()} notify={notify} />);
    fireEvent.change(screen.getByLabelText(/rtsp password/i), { target: { value: 'newpass' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(h.update).toHaveBeenCalled());
    const body = h.update.mock.calls[0][0].body;
    expect(body.rtspPassword).toBe('newpass');
    expect('mainRtspUrl' in body).toBe(false);
  });

  it('blocks save and shows an error when a required field is cleared', async () => {
    render(<EditCameraModal open camera={makeCamera()} onClose={vi.fn()} notify={notify} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(h.update).not.toHaveBeenCalled();
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('does not allow a non-write role to save', () => {
    h.user = { role: 'CLIENT_VIEWER' };
    render(<EditCameraModal open camera={makeCamera()} onClose={vi.fn()} notify={notify} />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend run test -- src/features/cameras/EditCameraModal.test.tsx`
Expected: FAIL — cannot resolve `./EditCameraModal`.

- [ ] **Step 3: Implement `EditCameraModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { AnimatedModal, Button, Input } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isCameraWriteRole } from '@/features/auth/auth.types';
import { CameraPlacementFields } from './CameraPlacementFields';
import { RtspCredentialFields } from './RtspCredentialFields';
import { StreamSpecFields } from './StreamSpecFields';
import { useRunCameraCheckMutation, useUpdateCameraMutation } from './cameras.api';
import type { Camera } from './cameras.types';
import {
  buildUpdateBody, configFormFromCamera, validateConfigForm,
} from './cameraConfigForm';
import type { CameraConfigFormState, ConfigFormErrors } from './cameraConfigForm';

interface Props {
  open: boolean;
  camera: Camera;
  onClose: () => void;
  notify: { success: (t: string, d?: string) => void; error: (t: string, d?: string) => void };
}

export function EditCameraModal({ open, camera, onClose, notify }: Props): JSX.Element {
  const { data: user } = useGetCurrentUserQuery();
  const canWrite = isCameraWriteRole(user?.role);
  const [update, { isLoading }] = useUpdateCameraMutation();
  const [runCheck] = useRunCameraCheckMutation();

  const [form, setForm] = useState<CameraConfigFormState>(() => configFormFromCamera(camera));
  const [errors, setErrors] = useState<ConfigFormErrors>({});

  // Re-seed when a different camera is opened.
  useEffect(() => { setForm(configFormFromCamera(camera)); setErrors({}); }, [camera.id]);

  const patch = (p: Partial<CameraConfigFormState>): void => setForm((f) => ({ ...f, ...p }));
  const belowMinCadence = Number(form.snapshotIntervalMinutes) > 0 && Number(form.snapshotIntervalMinutes) < 15;

  async function handleSave(): Promise<void> {
    if (!canWrite) return;
    const nextErrors = validateConfigForm(form, 'edit');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await update({ id: camera.id, body: buildUpdateBody(form) }).unwrap();
      notify.success('Camera configuration saved');
      // Advisory, non-blocking re-probe — refreshes the Connection pipeline.
      void runCheck(camera.id).unwrap().catch(() => undefined);
      onClose();
    } catch (err) {
      notify.error('Could not save configuration', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  return (
    <AnimatedModal open={open} onClose={onClose} title="Edit configuration">
      <div className="space-y-4">
        {!canWrite && (
          <p className="rounded-lg bg-state-critical/10 p-3 text-xs text-state-critical">
            You don’t have permission to edit this camera.
          </p>
        )}
        <Input
          label="Name"
          value={form.name}
          error={errors.name}
          disabled={!canWrite}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <CameraPlacementFields value={form} errors={errors} onChange={patch} disabled={!canWrite} />
        <RtspCredentialFields mode="edit" value={form} errors={errors} onChange={patch} disabled={!canWrite} />
        <StreamSpecFields value={form} errors={errors} onChange={patch} disabled={!canWrite} />
        <div>
          <Input
            label="Snapshot interval (minutes)"
            inputMode="numeric"
            value={form.snapshotIntervalMinutes}
            error={errors.snapshotIntervalMinutes}
            disabled={!canWrite}
            onChange={(e) => patch({ snapshotIntervalMinutes: e.target.value })}
          />
          {belowMinCadence && (
            <p className="mt-1 text-xs text-state-warning">
              Below 15 min sharply increases snapshot storage.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canWrite || isLoading}>
            {isLoading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
```

> `CameraPlacementFields`/`RtspCredentialFields`/`StreamSpecFields` accept the full `form` because their `value` prop types are `Pick<>` subsets of `CameraConfigFormState` — passing the superset is assignable. Match the real `AnimatedModal`/`Button`/`Input` prop names (read `@/components/ui`); if `AnimatedModal` uses `isOpen`/`heading` instead of `open`/`title`, adapt (mirror `ConfigureCameraModal`'s usage exactly).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix frontend run test -- src/features/cameras/EditCameraModal.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/cameras/EditCameraModal.tsx frontend/src/features/cameras/EditCameraModal.test.tsx
git commit -m "feat(cameras): EditCameraModal — edit saved config via PATCH with write-only RTSP"
```

---

## Task 9: Wire the card + page entry points

**Files:**
- Modify: `frontend/src/features/cameras/CameraCard.tsx`
- Modify: `frontend/src/features/cameras/CamerasPage.tsx`
- Test: `frontend/src/features/cameras/CameraCard.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `EditCameraModal` (Task 8); `isCameraWriteRole` (already imported in `CamerasPage`).
- Produces: `CameraCard` gains `onEdit?: (camera: Camera) => void`.

- [ ] **Step 1: Write the failing test for the card affordance**

Create `frontend/src/features/cameras/CameraCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CameraCard } from './CameraCard';
import type { Camera } from './cameras.types';

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: 'cam-1', siteId: 'site-1', routerId: 'router-1', cameraCode: 'CAM-GGN-021',
    name: 'Lobby Cam', brand: null, model: null, firmware: null, serialNumber: null,
    onvifPort: null, latitude: 28.6, longitude: 77.2, playbackAdapter: 'ONVIF_G',
    expectedCodec: 'H.264', expectedResolution: '1920x1080', expectedFps: 15,
    expectedBitrateKbps: 2048, provisioningState: 'CONFIGURED', healthScore: 90,
    status: 'HEALTHY', diagnosis: null, lastHealthyAt: null, lastSnapshotAt: null,
    maintenanceMode: false, snapshotIntervalMinutes: 30, createdAt: '', updatedAt: '',
    site: { id: 'site-1', name: 'HQ' }, router: null, ...overrides,
  };
}

describe('CameraCard onEdit', () => {
  it('shows an edit control for a configured camera and does not open the drawer', () => {
    const onEdit = vi.fn();
    const onOpen = vi.fn();
    render(<CameraCard camera={makeCamera()} onOpen={onOpen} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /edit .* configuration/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders no edit control when onEdit is absent', () => {
    render(<CameraCard camera={makeCamera()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /edit .* configuration/i })).toBeNull();
  });

  it('renders no edit control for a DRAFT camera', () => {
    render(<CameraCard camera={makeCamera({ provisioningState: 'DRAFT' })} onOpen={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /edit .* configuration/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix frontend run test -- src/features/cameras/CameraCard.test.tsx`
Expected: FAIL — no edit control / `onEdit` prop.

- [ ] **Step 3: Add `onEdit` to `CameraCard`**

In `CameraCard.tsx`: add `SlidersHorizontal` is already imported. Add the prop to the destructure + type:

```tsx
  onEdit,
```
```tsx
  /** Configured cameras expose an inline "Edit configuration" affordance. */
  onEdit?: (camera: Camera) => void;
```

Render an edit button as an **absolutely-positioned sibling of the main `<button>`** (not nested), shown only for configured cameras when `onEdit` is provided. Place it just before the closing `</motion.article>`, after the main `<button>`:

```tsx
      {onEdit && !isDraft && !selectable && (
        <button
          type="button"
          aria-label={`Edit ${camera.name} configuration`}
          onClick={(e) => { e.stopPropagation(); onEdit(camera); }}
          className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-tile bg-canvas text-tertiary transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <SlidersHorizontal size={14} strokeWidth={1.5} />
        </button>
      )}
```

- [ ] **Step 4: Run the card test to verify it passes**

Run: `npm --prefix frontend run test -- src/features/cameras/CameraCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `CamerasPage` state + modal**

In `CamerasPage.tsx`:
1. Import the modal: `import { EditCameraModal } from './EditCameraModal';`
2. Add state near `configureCamera` (~line 93): `const [editCamera, setEditCamera] = useState<Camera | null>(null);`
3. On the `<CameraCard>` (~line 380) add: `onEdit={canRegister ? (cam) => setEditCamera(cam) : undefined}`
4. Render near the other modals (~line 448):
```tsx
      {editCamera && (
        <EditCameraModal
          open
          camera={editCamera}
          onClose={() => setEditCamera(null)}
          notify={{ success, error: notifyError }}
        />
      )}
```

- [ ] **Step 6: Typecheck + full cameras test run**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.
Run: `npm --prefix frontend run test -- src/features/cameras`
Expected: PASS (all cameras-feature tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/cameras/CameraCard.tsx frontend/src/features/cameras/CameraCard.test.tsx frontend/src/features/cameras/CamerasPage.tsx
git commit -m "feat(cameras): configured-card Edit entry point wired to EditCameraModal"
```

---

## Task 10: Wire the drawer entry point (primary)

**Files:**
- Modify: `frontend/src/features/cameras/CameraDetailDrawer.tsx`

**Interfaces:**
- Consumes: `EditCameraModal` (Task 8); existing `canWrite`, `camera`, `notify` in the drawer.
- Produces: no external API change.

**Reference:** Read `CameraDetailDrawer.tsx` first. `canWrite` is defined ~line 131; the `canWrite` header-actions block is ~line 322 (next to Start/End maintenance). The drawer already holds the loaded `camera` and receives `notify`, and imports `SlidersHorizontal` is NOT yet present — add it to the `lucide-react` import.

- [ ] **Step 1: Add local open state + the icon import**

Add `SlidersHorizontal` to the existing `lucide-react` import in the drawer. Near the other `useState` hooks add:

```tsx
  const [editOpen, setEditOpen] = useState(false);
```

- [ ] **Step 2: Add the "Edit configuration" button in the `canWrite` actions block**

Inside the `{canWrite && ( … )}` header-actions region (~line 322), add a button alongside the maintenance toggle:

```tsx
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                  leftIcon={<SlidersHorizontal size={14} />}
                >
                  Edit configuration
                </Button>
```

- [ ] **Step 3: Render the modal once the camera has loaded**

Near the drawer's other modal/portal render (end of the component, where `camera` is in scope and non-null), add:

```tsx
      {camera && (
        <EditCameraModal
          open={editOpen}
          camera={camera}
          onClose={() => setEditOpen(false)}
          notify={notify}
        />
      )}
```

Add the import at the top: `import { EditCameraModal } from './EditCameraModal';`

- [ ] **Step 4: Typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

- [ ] **Step 5: Full cameras-feature test run**

Run: `npm --prefix frontend run test -- src/features/cameras`
Expected: PASS.

- [ ] **Step 6: Lint**

Run: `npm --prefix frontend run lint`
Expected: PASS (no new errors in the cameras feature).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/cameras/CameraDetailDrawer.tsx
git commit -m "feat(cameras): drawer 'Edit configuration' entry point for EditCameraModal"
```

---

## Self-Review

**1. Spec coverage**
- §2 endpoint (PATCH) → Tasks 1, 3, 8. ✅
- §5.1 shared form module → Tasks 1–3. ✅
- §5.2–5.4 field components → Tasks 4–6. ✅
- §5.5/5.6 EditCameraModal + test → Task 8. ✅
- §5.7 `UpdateCameraInput` widening → Task 1. ✅
- §5.8 ConfigureCameraModal refactor → Task 7. ✅
- §5.9/5.10 card + page entry → Task 9. ✅
- §5.11 drawer entry → Task 10. ✅
- §6 write-only RTSP → Tasks 2, 3, 5, 8 (validation + omit-blank builder + UI + assertions). ✅
- §7 permissions (both entry points + defensive modal + server) → Tasks 8 (gate), 9 (`canRegister`), 10 (`canWrite`). ✅
- §8 exclude maintenance / include snapshotInterval → Tasks 3, 8. ✅
- §9 post-save advisory re-probe → Task 8. ✅
- §10 manual validation + bounds → Task 2. ✅
- §14.4 router↔site risk → surfaced as the reference note in Task 6 (keep router select consistent with site). ✅

**2. Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above"/"similar to Task N" — every code and test step contains real content. ✅

**3. Type consistency:** `CameraConfigFormState`, `PlacementValue`/`RtspValue`/`StreamSpecValue`, `ConfigFormErrors`, `configFormFromCamera`, `validateConfigForm`, `buildConfigureBody`, `buildUpdateBody` are defined once (Tasks 1–3) and consumed with the same names/signatures in Tasks 4–10. Component prop shape `{ value, errors, onChange, disabled? }` (+`mode` for RTSP) is consistent across Tasks 4–8. `useUpdateCameraMutation({ id, body })` matches `cameras.api` (`updateCamera: builder.mutation<Camera, { id; body: UpdateCameraInput }>`). ✅

**Known adaptation points (flagged inline for the executor):** exact `@/components/ui` `Input`/`AnimatedModal`/`Button` prop names, `RouterItem` label fields, and `mapStyle` exports must be matched by reading those files first — the plan mirrors `ConfigureCameraModal`'s existing usage, which is the source of truth.
