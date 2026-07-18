# Skill — Modern Hero Section Patterns

Landing-page and operator-dashboard hero patterns matching reactbits.dev / Framer / Aceternity / Magic UI
motion polish — but every token, radius, shadow, and font comes from the soft-SaaS design system (see
`skill-ui-ux-checklist.md`). Never mix in a foreign color or font just because a reference site uses one.

Two use-cases share these patterns:
1. **Public/marketing hero** — the landing page that sells Aniston VMS to a prospective client.
2. **In-app dashboard hero** — the summary banner at the top of the operator dashboard (health donut +
   zone activity + live wall preview), built from the same primitives with real data instead of copy.

---

## Prerequisites

- Read `skill-ui-ux-checklist.md` first — tokens, radii (`--radius-card` 20px), shadow (`--shadow-soft`)
- All hero motion wraps `useReducedMotion()` — reduced-motion users get a static hero, never a frozen
  half-animated one
- Reuse existing components (`CameraCard`, `ZoneCard`, `DonutCard`, `ActivityListCard`, `PlayerShell`,
  `LiveWallGrid`, `PrimaryCTA`) inside these hero shells — don't hand-roll a new card style per hero

---

## Pattern 1 — Spotlight hero (radial gradient behind headline)

```typescript
// frontend/src/features/landing/HeroSpotlight.tsx
import { motion, useReducedMotion } from 'framer-motion';
import { GridBackdrop } from './GridBackdrop';
import { PrimaryCTA } from '@/components/ui/PrimaryCTA';

export function HeroSpotlight() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-[var(--surface)] px-6 py-24 text-center">
      {/* Faint hairline grid, fades toward the edges */}
      <GridBackdrop className="absolute inset-0 opacity-40" />

      {/* Radial spotlight in sage, sitting behind the headline — never a hard-edged circle */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[520px] w-[900px]"
        style={{
          background: 'radial-gradient(circle at center, rgba(143,188,160,0.18), transparent 70%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.8, ease: 'easeOut' }}
      />

      <motion.h1
        className="relative mx-auto max-w-3xl font-heading text-4xl font-semibold text-[var(--ink)] sm:text-5xl"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        Every camera, every zone,{' '}
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--sage)] to-[var(--indigo)]">
          one dashboard.
        </span>
      </motion.h1>

      <motion.p
        className="relative mx-auto mt-4 max-w-xl text-[var(--muted)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        Aniston VMS watches RTSP health, ONVIF signal, and router uptime across every site — and opens an
        incident before your client notices a dropped feed.
      </motion.p>

      <motion.div
        className="relative mt-8 flex items-center justify-center gap-3"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <PrimaryCTA href="/dashboard">Open Live Wall</PrimaryCTA>
        <button className="btn btn--secondary">See a 2-minute demo</button>
      </motion.div>
    </section>
  );
}
```

- [ ] Spotlight gradient uses `rgba(143,188,160,0.18)` (sage) — never the old `rgba(0,115,234,…)` blue glow
- [ ] Headline is Poppins via the `font-heading` utility; gradient text runs sage → indigo, never sage → purple
- [ ] `GridBackdrop` opacity stays ≤ 0.4 so it reads as texture, not a competing pattern

---

## Pattern 2 — Split hero with device mockup

```typescript
// For the marketing page: left column = pitch + CTA, right column = a real dashboard/LiveWallGrid screenshot
function HeroSplit() {
  return (
    <section className="grid items-center gap-12 px-6 py-20 md:grid-cols-2">
      <div>
        <h1 className="font-heading text-4xl font-semibold text-[var(--ink)]">
          Stop finding out about a dead camera from your client.
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          Five-stage health checks, WhatsApp + email escalation, and a recovery timeline your ops team can
          actually follow — across every zone, every site.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryCTA href="/dashboard">Open Live Wall</PrimaryCTA>
          <button className="btn btn--secondary">Talk to sales</button>
        </div>
        {/* Stat chips reuse the same tokens as the dashboard's own KPI row */}
        <div className="mt-8 flex gap-6 text-sm">
          <div><span className="font-heading text-2xl tabular-nums text-[var(--ink)]">125</span><br /><span className="text-[var(--muted)]">cameras monitored</span></div>
          <div><span className="font-heading text-2xl tabular-nums text-[var(--ink)]">13</span><br /><span className="text-[var(--muted)]">Delhi zones</span></div>
          <div><span className="font-heading text-2xl tabular-nums text-[var(--sage)]">99.2%</span><br /><span className="text-[var(--muted)]">platform uptime</span></div>
        </div>
      </div>

      {/* Mockup: an actual LiveWallGrid/PlayerShell screenshot, framed like a real browser window */}
      <div className="rounded-[var(--radius-card)] bg-[var(--card)] p-2 shadow-[var(--shadow-soft-hover)]">
        <div className="rounded-[var(--radius-tile)] bg-[var(--charcoal)] p-3">
          <img src="/marketing/live-wall-mockup.png" alt="Aniston VMS live wall showing a 3x2 camera grid" className="rounded-[var(--radius-tile)]" />
        </div>
      </div>
    </section>
  );
}
```

- [ ] Mockup frame is `--card` + `--radius-card`, never a bare `<img>` floating with no shell
- [ ] The screenshot inside is a real `LiveWallGrid`/`PlayerShell` capture, not a generic SaaS dashboard stock photo
- [ ] Stat chips use `tabular-nums`; the uptime figure is the only one in `--sage`, the rest are `--ink`

---

## Pattern 3 — Word-rotator headline

```typescript
// frontend/src/features/landing/WordRotatorHeadline.tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const RISKS = ['a dropped RTSP stream', 'a weak SIM signal', 'an offline router', 'a missed recording'];

export function WordRotatorHeadline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex(i => (i + 1) % RISKS.length), 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <h2 className="font-heading text-3xl font-semibold text-[var(--ink)]">
      Catch{' '}
      <span className="relative inline-block min-w-[280px] text-left align-bottom text-[var(--sage)]">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={RISKS[index]}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute left-0"
          >
            {RISKS[index]}
          </motion.span>
        </AnimatePresence>
      </span>{' '}
      <br className="hidden sm:block" />before it becomes an incident.
    </h2>
  );
}
```

- [ ] Rotating words are real VMS failure modes (stream/signal/router/recording), not generic SaaS nouns ("workflows", "teams", "startups")
- [ ] `AnimatePresence mode="popLayout"` so surrounding text doesn't jump as word width changes
- [ ] Interval is cleared on unmount; rotation pauses if `useReducedMotion()` is true (render the first word statically)

---

## Pattern 4 — Trust bar (client logo marquee)

```typescript
function TrustBar() {
  return (
    <section className="border-y border-[var(--hairline)] bg-[var(--card)] py-8">
      <p className="text-center text-xs uppercase tracking-wide text-[var(--muted)]">
        Deployed across 40+ sites for
      </p>
      <div className="mt-4 flex items-center justify-center gap-10 opacity-70 grayscale">
        {/* Reuses the Marquee/pause-on-hover mechanic from skill-modern-layout-patterns.md */}
        <img src="/logos/client-a.svg" alt="Client A" className="h-6" />
        <img src="/logos/client-b.svg" alt="Client B" className="h-6" />
        <img src="/logos/client-c.svg" alt="Client C" className="h-6" />
        <img src="/logos/client-d.svg" alt="Client D" className="h-6" />
      </div>
    </section>
  );
}
```

- [ ] Logos sit on `--card`, divided from the rest of the page by `--hairline`, not a colored band
- [ ] Copy states a concrete, defensible claim ("40+ sites") — never an inflated vanity metric copied from a SaaS template

---

## Pattern 5 — Animated stat counters (dashboard hero variant)

```typescript
// In-app dashboard hero banner — same mechanic as the marketing stat chips, fed by real data
function DashboardHeroStats({ camerasOnline, totalCameras, openIncidents, avgRecoveryMinutes }: {
  camerasOnline: number; totalCameras: number; openIncidents: number; avgRecoveryMinutes: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatTile label="Cameras online" value={camerasOnline} suffix={`/${totalCameras}`} tone="sage" />
      <StatTile label="Open incidents" value={openIncidents} tone={openIncidents > 0 ? 'coral' : 'sage'} />
      <StatTile label="Avg. recovery" value={avgRecoveryMinutes} suffix=" min" tone="indigo" />
      <StatTile label="Platform uptime" value={99.2} suffix="%" tone="sage" />
    </div>
  );
}

// AnimatedNumber — counts up from 0 on mount/viewport-enter, respects reduced motion
function StatTile({ label, value, suffix = '', tone }: { label: string; value: number; suffix?: string; tone: 'sage' | 'coral' | 'indigo' }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--card)] p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-1 font-heading text-2xl tabular-nums text-[var(--${tone})]`}>
        <AnimatedNumber value={value} />{suffix}
      </p>
    </div>
  );
}
```

- [ ] `AnimatedNumber` (see `skill-modern-motion-patterns.md`) drives the count-up — no duplicate implementation here
- [ ] Tone follows status semantics: incidents > 0 → `--coral`, otherwise `--sage`; recovery time is neutral `--indigo`, never alarming unless it breaches an SLA threshold

---

## Pattern 6 — Bottom CTA card (glass shell)

```typescript
function BottomCta() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-3xl rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--card)]/80 p-10 text-center shadow-[var(--shadow-soft-hover)] backdrop-blur">
        <h3 className="font-heading text-2xl font-semibold text-[var(--ink)]">
          See every zone before it becomes an incident.
        </h3>
        <p className="mt-2 text-[var(--muted)]">Set up your first site in under 15 minutes.</p>
        <div className="mt-6 flex justify-center gap-3">
          <PrimaryCTA href="/onboarding">Get started</PrimaryCTA>
          <button className="btn btn--ghost">Book a walkthrough</button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] Glass effect is `bg-[var(--card)]/80` + `backdrop-blur` — not a random translucent gray
- [ ] Only one primary CTA per hero section; secondary action is always `.btn--ghost` or `.btn--secondary`, never a second `.btn--primary`

---

## Checklist

- [ ] No hero references "Trusted by 2M+ users", "50+ integrations", "production-ready boilerplate", or any
  other stock SaaS-template copy — every claim is VMS-specific and concrete
- [ ] Only one hero pattern per page — don't stack Spotlight + Split on the same route
- [ ] All motion respects `useReducedMotion()`
- [ ] Only sage/indigo/coral/sand accents appear anywhere in gradients, glows, or chips
- [ ] Mockups/screenshots show real Aniston VMS UI (`LiveWallGrid`, `PlayerShell`, `ZoneCard`), not generic dashboard stock art
