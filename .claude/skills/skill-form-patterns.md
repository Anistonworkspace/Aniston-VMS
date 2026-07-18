# Skill — Form Patterns

React Hook Form + Zod + RTK Query — the complete pattern for every VMS form: add camera, edit zone, and the multi-step camera onboarding wizard with RTSP test-connection.

Design tokens: see `docs/04-uiux-brief.md`.

---

## Simple create form (standard pattern) — Add Camera

```ts
// shared/src/schemas/camera.schema.ts
import { z } from 'zod';

export const CreateCameraSchema = z.object({
  name: z.string().min(2, 'Name is required').max(80),
  zoneId: z.string().uuid('Select a zone'),
  rtspUrl: z.string().url('Enter a valid RTSP URL').startsWith('rtsp://', 'Must be an RTSP URL'),
  username: z.string().optional(),
  password: z.string().optional(),
  streamKind: z.enum(['LIVE_MAIN', 'LIVE_SUB']).default('LIVE_SUB'),
});
export type CreateCameraInput = z.infer<typeof CreateCameraSchema>;
```

```tsx
// frontend/src/features/camera/AddCameraModal.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateCameraMutation } from './cameraApi';
import { CreateCameraSchema, type CreateCameraInput } from '@vms/shared/schemas/camera.schema';
import { useToast } from '@/hooks/useToast';
import { getErrorMessage } from '@/lib/errorMessages';

export function AddCameraModal({ zoneId, onClose }: { zoneId: string; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateCameraInput>({
    resolver: zodResolver(CreateCameraSchema),
    defaultValues: { zoneId, streamKind: 'LIVE_SUB' },
  });
  const [createCamera] = useCreateCameraMutation();
  const toast = useToast();

  async function onSubmit(data: CreateCameraInput) {
    try {
      await createCamera(data).unwrap();
      toast.success('Camera added — running connection test…');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--ink)] mb-1">Camera name</label>
        <input id="name" {...register('name')} className="input-field" placeholder="Gate 3 — North" />
        {errors.name && <p className="text-xs text-[var(--coral)] mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="rtspUrl" className="block text-sm font-medium text-[var(--ink)] mb-1">RTSP URL</label>
        <input id="rtspUrl" {...register('rtspUrl')} className="input-field font-mono text-sm" placeholder="rtsp://192.168.1.40:554/stream1" />
        {errors.rtspUrl && <p className="text-xs text-[var(--coral)] mt-1">{errors.rtspUrl.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input {...register('username')} className="input-field" placeholder="Username (optional)" />
        <input {...register('password')} type="password" className="input-field" placeholder="Password (optional)" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn btn-ghost" disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Testing connection…' : 'Add camera'}
        </button>
      </div>
    </form>
  );
}
```

## Edit form (pre-populate, PATCH) — Edit Zone

```ts
export const UpdateZoneSchema = CreateZoneSchema.partial();
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>;
```

```tsx
// frontend/src/features/zone/EditZoneModal.tsx
export function EditZoneModal({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const { register, handleSubmit, formState: { isDirty, isSubmitting } } = useForm<UpdateZoneInput>({
    resolver: zodResolver(UpdateZoneSchema),
    defaultValues: { name: zone.name, siteId: zone.siteId, description: zone.description },
  });
  const [updateZone] = useUpdateZoneMutation();

  async function onSubmit(data: UpdateZoneInput) {
    if (!isDirty) return onClose();
    await updateZone({ id: zone.id, ...data }).unwrap();
    onClose();
  }
  // same field markup as the create form above, submit disabled while !isDirty
}
```

Never re-send the full payload on PATCH — only changed fields — and skip the network call entirely (`if (!isDirty) return onClose()`) when nothing actually changed. Renaming a zone doesn't touch its cameras' `zoneId`; historical incidents keep the zone id they were created under (`docs/03-app-flow.md` §8).

## Multi-step form — Camera onboarding wizard

Mirrors the RTSP save flow in `docs/03-app-flow.md` §7: **Details → Connection → Test connection → Review**, with an admin-override path if the test fails.

```tsx
// frontend/src/features/camera/CameraOnboardingWizard.tsx
const STEPS = ['Details', 'Connection', 'Test', 'Review'] as const;
type Step = typeof STEPS[number];

const fieldsToValidate: Record<Step, (keyof CreateCameraInput)[]> = {
  Details: ['name', 'zoneId'],
  Connection: ['rtspUrl', 'username', 'password'],
  Test: [],
  Review: [],
};

export function CameraOnboardingWizard({ zoneId, onClose }: { zoneId: string; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const methods = useForm<CreateCameraInput>({ resolver: zodResolver(CreateCameraSchema), defaultValues: { zoneId } });
  const { trigger, getValues } = methods;
  const [testConnection, { data: testResult, isLoading: testing }] = useTestCameraConnectionMutation();
  const [createCamera] = useCreateCameraMutation();

  async function goNext() {
    const valid = await trigger(fieldsToValidate[step]);
    if (!valid) return;
    if (step === 'Connection') {
      await testConnection(getValues()).unwrap().catch(() => {}); // failure surfaces in the Test step, not thrown here
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  async function onFinish(overrideFailedTest = false) {
    await createCamera({ ...getValues(), overrideFailedTest }).unwrap();
    onClose();
  }

  return (
    <FormProvider {...methods}>
      <div className="flex gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-[var(--primary-color)]' : 'bg-[var(--hairline)]'}`} />
        ))}
      </div>
      {step === 'Details' && <DetailsStep />}
      {step === 'Connection' && <ConnectionStep />}
      {step === 'Test' && <TestConnectionStep result={testResult} testing={testing} onRetry={() => testConnection(getValues())} />}
      {step === 'Review' && <ReviewStep values={getValues()} testResult={testResult} onFinish={onFinish} />}

      <div className="flex justify-between pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(i - 1, 0))} disabled={stepIndex === 0} className="btn btn-ghost">Back</button>
        {step !== 'Review' && <button type="button" onClick={goNext} className="btn btn-primary">Next</button>}
      </div>
    </FormProvider>
  );
}
```

`TestConnectionStep` runs `DESCRIBE + 1 frame` against the RTSP URL server-side and reports pass/fail — same duplicate-hash + format checks as app-flow §7. On the Review step, if the test failed and the signed-in user is `SUPER_ADMIN` or `PROJECT_ADMIN`, show "Save anyway", which calls `onFinish(true)` and writes an audit override entry. `CLIENT_VIEWER` never sees this wizard at all — read-only role, no create permission.

## Field array — evidence photo attachments (incident note form)

```tsx
const { fields, append, remove } = useFieldArray({ control, name: 'attachments' });

function onFiles(files: FileList) {
  Array.from(files).forEach((file) => append({ file, previewUrl: URL.createObjectURL(file) }));
}
```

Revoke `previewUrl` objects on unmount/removal — they're browser-local blob URLs, not server assets, and leak memory if left dangling.

## Checklist

- [ ] Zod schema shared between frontend form and backend route validation (`shared/src/schemas/*.schema.ts`) — never duplicated rules that can drift
- [ ] `CreateCameraSchema` used for POST, a `.partial()` derivative for PATCH — no hand-written update schema maintained separately
- [ ] Submit button shows a busy label ("Testing connection…") not just a disabled state with no explanation
- [ ] Multi-step wizard validates only the current step's fields via `trigger(fieldsToValidate[step])` before advancing, not the whole schema
- [ ] RTSP test-connection failure never silently blocks save for `SUPER_ADMIN`/`PROJECT_ADMIN` — the override path exists and is audited; it does not exist for `CLIENT_VIEWER`
- [ ] Edit forms skip the network call entirely when `!isDirty`
- [ ] Server-side Zod validation always re-runs — client validation is UX only, never trusted
- [ ] File previews (`URL.createObjectURL`) revoked on unmount to avoid memory leaks
