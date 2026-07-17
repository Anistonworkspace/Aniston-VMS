# Skill — Onboarding Flow Patterns

Multi-step signup, product tour, first-run setup. Uses URL-synced state
(shareable, back-button friendly), Framer Motion between-step transitions,
and the existing form primitives from `skill-form-patterns.md`.

Prereqs: React Hook Form + Zod (project convention), `useSearchParams`
from React Router, Framer Motion. Design tokens from
`skill-ui-ux-checklist.md`.

---

## Rule — URL is the source of truth

Every step lives at `?step=N`. Users can share their progress link, refresh
without losing state, and use the browser back button naturally.

## Rule — Progress state persists

If the user closes the tab mid-onboarding, restore where they were. Use
`localStorage` for draft data with a per-user key.

## Rule — Never mandatory-block

Every step has a "Skip for now" or "Do this later" unless the app literally
cannot function without it (only auth qualifies).

---

## Pattern 1 — Step orchestrator with URL sync

```typescript
// frontend/src/features/onboarding/Onboarding.tsx
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { StepIdentity } from './StepIdentity';
import { StepOrganization } from './StepOrganization';
import { StepPreferences } from './StepPreferences';
import { StepInvite } from './StepInvite';

const STEPS = [
  { key: 'identity',     Component: StepIdentity,     label: 'You' },
  { key: 'organization', Component: StepOrganization, label: 'Workspace' },
  { key: 'preferences',  Component: StepPreferences,  label: 'Preferences' },
  { key: 'invite',       Component: StepInvite,       label: 'Invite team' },
] as const;

const STORAGE_KEY = 'onboarding_draft_v1';

type OnboardingData = {
  identity?: { fullName: string; timezone: string };
  organization?: { name: string; slug: string };
  preferences?: { theme: 'light' | 'dark'; notifications: boolean };
  invite?: { emails: string[] };
};

export function Onboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const stepIdx = Math.max(0, Math.min(STEPS.length - 1, Number(searchParams.get('step') ?? 0)));
  const step = STEPS[stepIdx];

  const [data, setData] = useState<OnboardingData>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const setStepData = (key: keyof OnboardingData, value: OnboardingData[typeof key]) => {
    setData((d) => {
      const next = { ...d, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const goto = (n: number) => setSearchParams({ step: String(n) });
  const next = () => (stepIdx < STEPS.length - 1 ? goto(stepIdx + 1) : finish());
  const back = () => (stepIdx > 0 ? goto(stepIdx - 1) : navigate('/'));

  const finish = async () => {
    // POST all data to backend; clear localStorage on success
    localStorage.removeItem(STORAGE_KEY);
    navigate('/dashboard');
  };

  const Component = step.Component;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <ProgressDots current={stepIdx} labels={STEPS.map((s) => s.label)} />
      <AnimatePresence mode="wait">
        <motion.div
          key={step.key}
          initial={reduce ? undefined : { opacity: 0, x: 20 }}
          animate={reduce ? undefined : { opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 flex-1"
        >
          <Component
            data={data}
            onSubmit={(value) => { setStepData(step.key as keyof OnboardingData, value); next(); }}
            onBack={back}
            onSkip={next}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

---

## Pattern 2 — Progress dots

```typescript
function ProgressDots({ current, labels }: { current: number; labels: readonly string[] }) {
  return (
    <div className="flex items-center gap-3">
      {labels.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'pending';
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                state === 'done'
                  ? 'bg-[var(--positive-color)]'
                  : state === 'active'
                    ? 'bg-[var(--primary-color)]'
                    : 'bg-[var(--layout-border-color)]'
              }`}
            />
            <span
              className={`text-xs ${
                state === 'active'
                  ? 'text-[var(--primary-text-color)] font-medium'
                  : 'text-[var(--tertiary-text-color)]'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

Alternative: horizontal progress bar. Use dots when you have ≤ 5 steps, a
bar for > 5.

---

## Pattern 3 — Individual step (form + Skip)

```typescript
// frontend/src/features/onboarding/StepIdentity.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  fullName: z.string().min(2).max(120),
  timezone: z.string().min(3),
});
type Values = z.infer<typeof schema>;

export function StepIdentity({
  data,
  onSubmit,
  onBack,
  onSkip,
}: {
  data: OnboardingData;
  onSubmit: (v: Values) => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: data.identity ?? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Welcome — let's set up your account.</h1>
        <p className="mt-2 text-sm text-[var(--secondary-text-color)]">
          Tell us a bit about you. Takes under a minute.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm">Full name</span>
        <input {...register('fullName')} className="input-field" autoFocus />
        {errors.fullName && <span className="mt-1 block text-xs text-[var(--negative-color)]">{errors.fullName.message}</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">Timezone</span>
        <input {...register('timezone')} className="input-field" />
      </label>
      <div className="flex items-center justify-between">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>← Back</button>
        <div className="flex gap-2">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onSkip}>Skip</button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Continue →'}
          </button>
        </div>
      </div>
    </form>
  );
}
```

---

## Pattern 4 — Optional guided tour (post-onboarding)

Once the user is in the app, offer a 3-step guided tour with animated
tooltips. Use `driver.js` (`npm install driver.js`) — battle-tested, tiny.

```typescript
// frontend/src/features/onboarding/tour.ts
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function startTour() {
  const drv = driver({
    animate: true,
    showProgress: true,
    steps: [
      {
        element: '#nav-notes',
        popover: { title: 'Your notes live here', description: 'Cmd+K opens the palette from anywhere.' },
      },
      {
        element: '#btn-create',
        popover: { title: 'Create a note', description: 'Click here or press Cmd+N.' },
      },
      {
        element: '#user-menu',
        popover: { title: 'You', description: 'Preferences, sign out, and workspace switching.' },
      },
    ],
  });
  drv.drive();
  localStorage.setItem('tour_completed', '1');
}
```

Only show if `!localStorage.getItem('tour_completed')` — never on repeat
visits.

---

## Pattern 5 — Resume-progress banner

Detect a partial onboarding on any page and offer to resume.

```typescript
export function ResumeOnboardingBanner() {
  const [dismissed, setDismissed] = useState(false);
  const draft = useMemo(() => {
    try {
      const raw = localStorage.getItem('onboarding_draft_v1');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);
  if (!draft || dismissed) return null;
  const filledSteps = Object.keys(draft).length;
  return (
    <aside className="floating-card mx-auto max-w-3xl rounded-[var(--radius-medium)] p-3 text-sm flex items-center justify-between">
      <span>
        Continue your setup — {filledSteps} of 4 steps done.
      </span>
      <div className="flex gap-2">
        <button className="btn btn--primary btn--sm" onClick={() => navigate('/onboarding?step=' + filledSteps)}>Resume</button>
        <button className="btn btn--ghost btn--sm" onClick={() => { localStorage.removeItem('onboarding_draft_v1'); setDismissed(true); }}>Dismiss</button>
      </div>
    </aside>
  );
}
```

---

## Do-not

- **No mandatory-fields at every step.** The user just signed up — every
  step should have a Skip except auth.
- **No storing sensitive data in localStorage.** Draft the workspace name,
  not the credit card.
- **No animations between steps > 300ms.** Users tap Next expecting instant
  response; long animations feel broken.
- **No progress that resets on refresh.** URL + localStorage — always
  restore.
- **No tour on the second visit.** Persist `tour_completed`.
- **No 10-step onboarding.** More than 5 steps: split into "essential now"
  and "polish later" and let the user complete the second half from
  Settings.

---

## Checklist

- [ ] Current step lives in URL (`?step=N`), shareable & refresh-safe
- [ ] Draft data persists in `localStorage` under a per-user key
- [ ] Every step has an explicit "Skip" (unless it's auth)
- [ ] Progress dots or bar visible on every step
- [ ] Between-step animation ≤ 300ms with `AnimatePresence mode="wait"`
- [ ] Animation short-circuits under `prefers-reduced-motion`
- [ ] Back button navigates to previous step (or `/` on step 0)
- [ ] Auto-focus the first input on each step
- [ ] Timezone auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- [ ] Resume-progress banner shown on other pages if draft exists
- [ ] `localStorage` cleared on successful completion
- [ ] Tour (if any) shown once, dismissal persisted
- [ ] Dark-mode parity
- [ ] Total step count ≤ 5
