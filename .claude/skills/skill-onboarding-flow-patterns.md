# Skill — Onboarding Flow Patterns

Multi-step operator setup, product tour, resume-progress banner. Frame Motion between-step transitions.
Steps are URL-synced (shareable, back-button friendly) and drafts persist to `localStorage` so a new
operator never loses progress on a refresh. Tokens/components per `skill-ui-ux-checklist.md`.

---

## Prerequisites

- `react-hook-form` + `zodResolver` for every step's validation
- `useSearchParams` for step position — never step state that only lives in a `useState` (it must survive
  a refresh and be linkable)

---

## Pattern 1 — Step orchestrator

```typescript
// frontend/src/features/onboarding/Onboarding.tsx
import { StepIdentity } from './StepIdentity';
import { StepOrganization } from './StepOrganization';
import { StepPreferences } from './StepPreferences';
import { StepInvite } from './StepInvite';

const STORAGE_KEY = 'vms.onboarding.draft';

const STEPS = [
  { key: 'identity',     component: StepIdentity,     label: 'Your details' },
  { key: 'organization', component: StepOrganization,  label: 'Organization & site' },
  { key: 'preferences',  component: StepPreferences,   label: 'Alert preferences' },
  { key: 'invite',       component: StepInvite,        label: 'Invite your team' },
] as const;

export function Onboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const stepIdx = Math.min(Math.max(Number(searchParams.get('step')) || 0, 0), STEPS.length - 1);

  const [data, setData] = useState<OnboardingData>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  });

  const goto = (i: number) => setSearchParams({ step: String(i) });
  const next = (partial: Partial<OnboardingData>) => {
    const merged = { ...data, ...partial };
    setData(merged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    if (stepIdx === STEPS.length - 1) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem('vms.onboarding.completed', 'true');
    } else {
      goto(stepIdx + 1);
    }
  };
  const back = () => goto(Math.max(0, stepIdx - 1));

  const Step = STEPS[stepIdx].component;

  return (
    <div className="mx-auto max-w-lg py-16">
      <ProgressDots current={stepIdx} total={STEPS.length} labels={STEPS.map(s => s.label)} />
      <AnimatePresence mode="wait">
        <motion.div key={stepIdx} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
          <Step data={data} onNext={next} onBack={stepIdx > 0 ? back : undefined} onSkip={stepIdx === STEPS.length - 1 ? undefined : () => goto(stepIdx + 1)} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ProgressDots({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2" role="progressbar" aria-valuenow={current + 1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-2 w-2 rounded-full transition-colors ${i <= current ? 'bg-[var(--sage)]' : 'bg-[var(--hairline)]'}`} title={labels[i]} />
      ))}
    </div>
  );
}
```

- [ ] Step position lives in `?step=` — refreshing or sharing the URL lands on the same step
- [ ] Draft merges into `localStorage['vms.onboarding.draft']` after every step, cleared only on final submit
- [ ] `ProgressDots` uses `--sage` for completed/current, `--hairline` for upcoming — never a red/gray combo
- [ ] Step transition is a 250ms horizontal slide+fade — matches the 70–160ms micro-interaction scale for
  hover but is intentionally a touch longer since it's a full-screen content swap

---

## Pattern 2 — Individual step (identity)

```typescript
// frontend/src/features/onboarding/StepIdentity.tsx
const IdentitySchema = z.object({
  fullName: z.string().min(2).max(120),
  email:    z.string().email(),
  phone:    z.string().min(8),   // used for WhatsApp incident alerts
  password: z.string().min(10),
});
type IdentityForm = z.infer<typeof IdentitySchema>;

function StepIdentity({ data, onNext }: { data: OnboardingData; onNext: (d: Partial<OnboardingData>) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<IdentityForm>({
    resolver: zodResolver(IdentitySchema),
    defaultValues: data.identity,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <h2 className="font-heading text-2xl text-[var(--ink)]">Let's get you set up</h2>
      <p className="text-sm text-[var(--muted)]">This is the account you'll use to monitor your sites.</p>

      <div>
        <label className="text-sm font-medium text-[var(--ink)]">Full name</label>
        <input {...register('fullName')} autoFocus className="input-field mt-1 w-full" />
        {errors.fullName && <p className="mt-1 text-xs text-[var(--coral)]">{errors.fullName.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium text-[var(--ink)]">Work email</label>
        <input {...register('email')} type="email" className="input-field mt-1 w-full" />
        {errors.email && <p className="mt-1 text-xs text-[var(--coral)]">{errors.email.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium text-[var(--ink)]">WhatsApp number</label>
        <input {...register('phone')} type="tel" className="input-field mt-1 w-full" />
        <p className="mt-1 text-xs text-[var(--muted)]">Critical incident alerts go here first.</p>
        {errors.phone && <p className="mt-1 text-xs text-[var(--coral)]">{errors.phone.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium text-[var(--ink)]">Password</label>
        <input {...register('password')} type="password" className="input-field mt-1 w-full" />
        {errors.password && <p className="mt-1 text-xs text-[var(--coral)]">{errors.password.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting} className="btn btn--primary w-full">
        {isSubmitting ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
```

- [ ] `zodResolver` schema per step — never a giant single schema shared across all 4 steps
- [ ] Timezone (used in `StepOrganization`) is captured via `Intl.DateTimeFormat().resolvedOptions().timeZone`, never hand-picked from a stale dropdown default
- [ ] Field-level errors in `--coral`, 12px, directly under the field — never a top-of-form error summary only
- [ ] First field `autoFocus`; submit button shows a present-participle loading label ("Saving…"), never freezes with no feedback

---

## Pattern 3 — Product tour (driver.js)

```typescript
// frontend/src/features/onboarding/tour.ts
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function startTour() {
  const tour = driver({
    showProgress: true,
    steps: [
      { element: '#nav-dashboard',   popover: { title: 'Your dashboard', description: 'Every camera\'s health, at a glance — updated in real time.' } },
      { element: '#btn-add-camera',  popover: { title: 'Add your first camera', description: 'RTSP or ONVIF — we auto-probe reachability, stream, and recording.' } },
      { element: '#nav-incidents',   popover: { title: 'Incidents', description: 'If a health check ever fails, it shows up here with a full escalation timeline.' } },
      { element: '#nav-reports',     popover: { title: 'Reports', description: 'Export a health or incident report as PDF/Excel any time.' } },
    ],
    onDestroyed: () => localStorage.setItem('vms.tour.completed', 'true'),
  });
  tour.drive();
}
```

- [ ] Tour targets real, stable element IDs (`#nav-dashboard`, `#btn-add-camera`, `#nav-incidents`,
  `#nav-reports`) — verify each exists before shipping, a missing target silently breaks the whole tour
- [ ] Completion flag (`vms.tour.completed`) gates re-showing the tour on next login
- [ ] Copy explains *why* a feature matters to an operator, not just what it's called

---

## Pattern 4 — Resume-onboarding banner

```typescript
function ResumeOnboardingBanner() {
  const [dismissed, setDismissed] = useState(false);
  const hasDraft = !!localStorage.getItem('vms.onboarding.draft');
  if (!hasDraft || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
        className="flex items-center gap-3 rounded-[var(--radius-tile)] bg-[var(--indigo)]/10 border border-[var(--indigo)]/20 px-4 py-3"
      >
        <span className="text-sm text-[var(--ink)]">You're 2 steps away from finishing setup — pick up where you left off.</span>
        <div className="flex-1" />
        <a href="/onboarding" className="btn btn--secondary btn--sm">Continue setup</a>
        <button onClick={() => setDismissed(true)} className="btn btn--ghost btn--sm">Dismiss</button>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] Banner only renders when an unfinished draft exists in `localStorage` — never shown after `vms.onboarding.completed`
- [ ] Tint is `--indigo` at low opacity (informational, not urgent) — never `--coral`, which is reserved for
  actual incidents

---

## Pattern 5 — Back/Skip navigation

```typescript
function StepNav({ onBack, onSkip, isSubmitting, isLast }: { onBack?: () => void; onSkip?: () => void; isSubmitting: boolean; isLast: boolean }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button type="button" onClick={onBack} disabled={!onBack} className="btn btn--ghost btn--sm disabled:opacity-0">Back</button>
      <div className="flex gap-2">
        {onSkip && <button type="button" onClick={onSkip} className="btn btn--ghost btn--sm">Skip for now</button>}
        <button type="submit" disabled={isSubmitting} className="btn btn--primary btn--sm">
          {isSubmitting ? 'Saving…' : isLast ? 'Finish setup' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] "Skip for now" only appears on skippable steps (preferences/invite) — identity and organization are required
- [ ] Disabled `Back` on step 1 fades out rather than disappearing, so the layout doesn't shift

---

## Checklist

- [ ] Step position synced to `?step=`, draft persisted to `localStorage`, both cleared correctly on completion
- [ ] Product tour targets real element IDs and its copy is VMS-specific ("Add your first camera", never "Create a note")
- [ ] Resume banner only shows for an actual unfinished draft, dismissible, uses `--indigo` not `--coral`
- [ ] Every step form uses its own Zod schema + `zodResolver`, inline field errors in `--coral`
- [ ] `ProgressDots` uses `--sage`/`--hairline` only
