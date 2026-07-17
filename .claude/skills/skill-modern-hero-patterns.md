# Skill — Modern Hero Section Patterns

Landing-page and dashboard hero patterns matching reactbits.dev / Aceternity /
Magic UI aesthetic. Every pattern here respects the existing design system
(see `skill-ui-ux-checklist.md`) — same tokens, same radii, same fonts.

**Rule:** every animation short-circuits under `prefers-reduced-motion`. No
exceptions.

---

## Prerequisites

- Framer Motion already installed (project convention).
- Tailwind + design tokens already available (`skill-ui-ux-checklist.md`).
- Lucide icons at `size={14-16}, strokeWidth={1.8}` — same as everywhere else.

---

## Pattern 1 — Spotlight hero (radial-gradient headline)

Signature look for AI / dev-tool landing pages. A radial gradient behind the
headline draws the eye without distracting.

```typescript
// frontend/src/features/landing/HeroSpotlight.tsx
import { motion, useReducedMotion } from 'framer-motion';

export function HeroSpotlight() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      {/* Radial spotlight */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(600px circle at 50% 20%, rgba(0,115,234,0.15), transparent 40%)',
        }}
      />
      <div className="mx-auto max-w-3xl px-4 text-center">
        <motion.h1
          initial={reduce ? undefined : { opacity: 0, y: 20 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-heading text-4xl leading-tight sm:text-6xl"
        >
          Ship features, <span className="text-[var(--primary-color)]">not scaffolds</span>.
        </motion.h1>
        <motion.p
          initial={reduce ? undefined : { opacity: 0, y: 12 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-lg text-[var(--secondary-text-color)]"
        >
          The production-ready fullstack boilerplate with agents, tests, and observability built in.
        </motion.p>
        <div className="mt-8 flex justify-center gap-3">
          <button className="btn btn--primary">Get started</button>
          <button className="btn btn--secondary">Read docs</button>
        </div>
      </div>
    </section>
  );
}
```

---

## Pattern 2 — Split with device mockup

Left column pitch + CTA, right column an animated mockup (or Lottie). Standard
for SaaS landing pages.

```typescript
export function HeroSplit({ mockup }: { mockup: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-24 lg:grid-cols-2 lg:items-center">
      <div>
        <span className="rounded-[var(--radius-small)] bg-[var(--ui-background-color)] px-2 py-1 text-xs font-medium text-[var(--secondary-text-color)]">
          v2.0 · Just shipped
        </span>
        <h1 className="mt-4 font-heading text-4xl leading-tight lg:text-5xl">
          Every feature, <br /> wired end-to-end.
        </h1>
        <p className="mt-6 text-lg text-[var(--secondary-text-color)]">
          Controllers, services, tests, and UI wire themselves. Push to green in one shot.
        </p>
        <div className="mt-8 flex gap-3">
          <button className="btn btn--primary">Try the demo</button>
          <button className="btn btn--secondary">Watch a video</button>
        </div>
      </div>
      <motion.div
        initial={reduce ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
        animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="floating-card rounded-[var(--radius-big)] p-2"
      >
        {mockup}
      </motion.div>
    </section>
  );
}
```

---

## Pattern 3 — Animated grid backdrop

Subtle grid that fades toward the center. Popular on Vercel / Linear / Cal.com
style pages.

```typescript
export function GridBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(to_right,rgba(208,212,228,0.4)_1px,transparent_1px),linear-gradient(to_bottom,rgba(208,212,228,0.4)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
    />
  );
}
```

Compose with any hero: `<HeroSpotlight />` becomes `<section><GridBackdrop /><HeroSpotlight /></section>`.

---

## Pattern 4 — Gradient text headline

For a single accent word inside a headline. Uses `background-clip: text`.

```typescript
<h1 className="font-heading text-5xl">
  Build{' '}
  <span className="bg-gradient-to-r from-[var(--primary-color)] to-[#8b5cf6] bg-clip-text text-transparent">
    ambitious
  </span>{' '}
  software.
</h1>
```

**Rule:** keep the gradient inside brand tokens. Don't invent random purples.
If you need a second brand color, add it to `skill-ui-ux-checklist.md`.

---

## Pattern 5 — Animated word rotator

Cycle through 3–5 words in the headline. Framer Motion `AnimatePresence`.

```typescript
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

const WORDS = ['features', 'workflows', 'products', 'startups'];

export function WordRotatorHeadline() {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <h1 className="font-heading text-5xl leading-tight">
      Ship better{' '}
      <span className="relative inline-block h-[1.2em] w-[6ch] align-middle">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={WORDS[i]}
            initial={reduce ? undefined : { y: '100%', opacity: 0 }}
            animate={reduce ? undefined : { y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: '-100%', opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 text-[var(--primary-color)]"
          >
            {WORDS[i]}
          </motion.span>
        </AnimatePresence>
      </span>
      .
    </h1>
  );
}
```

Reduced-motion path: static first word, no rotation. Good.

---

## Pattern 6 — Trust bar (logo strip)

Under the hero: "Trusted by X, Y, Z". Grayscale until hover.

```typescript
export function TrustBar({ logos }: { logos: { src: string; alt: string }[] }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 py-8 opacity-70">
      <span className="text-sm uppercase tracking-wide text-[var(--tertiary-text-color)]">
        Trusted by teams at
      </span>
      {logos.map((l) => (
        <img
          key={l.alt}
          src={l.src}
          alt={l.alt}
          className="h-6 grayscale transition hover:grayscale-0"
          loading="lazy"
        />
      ))}
    </div>
  );
}
```

For a scrolling infinite marquee version, see `skill-modern-layout-patterns.md`.

---

## Pattern 7 — CTA card at the bottom (glass shell)

Bottom-of-page conversion card with soft glass background.

```typescript
export function BottomCta() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <div
        className="floating-card rounded-[var(--radius-big)] p-10 text-center"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 0%, rgba(0,115,234,0.08), transparent 60%)',
        }}
      >
        <h2 className="font-heading text-3xl">Start shipping this week.</h2>
        <p className="mt-3 text-[var(--secondary-text-color)]">
          One command clones and boots. Zero yak-shaving.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn btn--primary">Get started</button>
          <button className="btn btn--secondary">Talk to us</button>
        </div>
      </div>
    </section>
  );
}
```

---

## Do-not

- **No parallax on mobile.** Bad for perceived performance, bad for
  vestibular users. Wrap in `md:` breakpoint or short-circuit under `matchMedia('(pointer: coarse)')`.
- **No autoplay video.** Autoplay muted video is fine but users still expect
  a control. Use a static image + play-on-click by default.
- **No fixed height sections.** Modern browsers with mobile chrome bars will
  fight you. Use `min-h-*` with content-driven height instead.
- **No 3D backdrops on marketing pages** unless the entire brand leans into
  it. Adds 100–500 KB of bundle for negligible conversion gain.

---

## Checklist

- [ ] All animations short-circuit under `prefers-reduced-motion`
- [ ] Only tokens from `skill-ui-ux-checklist.md` used — no ad-hoc hex
- [ ] Radii from the spec (4 / 8 / 16px) — no bespoke values
- [ ] Font families: Poppins (headings), Figtree (body)
- [ ] Primary CTA uses `.btn.btn--primary` (existing primitive)
- [ ] Trust bar images are `loading="lazy"` and correctly sized
- [ ] Hero fits above the fold on 1366×768 without scrolling for main headline
- [ ] Dark-mode parity verified — every token used has a `.dark` value
- [ ] Lighthouse Performance ≥ 90 after adding the hero (no motion-heavy JS
      shipped to first render)
