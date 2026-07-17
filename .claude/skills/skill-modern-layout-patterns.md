# Skill — Modern Layout Patterns (Bento, Marquee, Sticky-Scroll, Parallax)

Non-standard grid and motion-driven layouts you'll see on Linear, Vercel,
Cal.com, Framer, Aceternity. All use the existing design tokens (see
`skill-ui-ux-checklist.md`) and respect `prefers-reduced-motion`.

---

## Prerequisites

- Framer Motion installed.
- Tailwind + design tokens (`skill-ui-ux-checklist.md`).
- IntersectionObserver (built-in) for scroll patterns.

---

## Pattern 1 — Bento grid

Feature-showcase grid with mixed cell sizes. Signature of Apple/Linear landing
pages. Each cell is a `.floating-card` primitive.

```typescript
// frontend/src/features/landing/BentoGrid.tsx
import { motion, useReducedMotion } from 'framer-motion';

type BentoItem = {
  title: string;
  body: string;
  span: 'sm' | 'md' | 'lg';    // controls col-span
  media?: React.ReactNode;
};

const SPAN_CLASSES: Record<BentoItem['span'], string> = {
  sm: 'md:col-span-1',
  md: 'md:col-span-2',
  lg: 'md:col-span-3',
};

export function BentoGrid({ items }: { items: BentoItem[] }) {
  const reduce = useReducedMotion();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((it, i) => (
          <motion.article
            key={it.title}
            initial={reduce ? undefined : { opacity: 0, y: 16 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`floating-card rounded-[var(--radius-big)] p-6 ${SPAN_CLASSES[it.span]}`}
          >
            {it.media && <div className="mb-4">{it.media}</div>}
            <h3 className="font-heading text-lg">{it.title}</h3>
            <p className="mt-2 text-sm text-[var(--secondary-text-color)]">{it.body}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
```

**Bento rules that matter:**
- Prefer 3 columns; anything wider fights readability.
- Mix spans irregularly — 1-2-1-3-2 reads more interesting than 1-1-1-1-1.
- Use different media types per cell (chart / code / illustration / big
  number). Same media type in every cell → dashboard, not bento.
- Never let a cell be shorter than 3 lines of body text.

---

## Pattern 2 — Infinite marquee (logo strip)

Auto-scrolling logo bar. CSS-only animation, no JS needed.

```typescript
// frontend/src/components/Marquee.tsx
export function Marquee({
  children,
  speed = 40,
  pauseOnHover = true,
}: {
  children: React.ReactNode;
  speed?: number;
  pauseOnHover?: boolean;
}) {
  return (
    <div className="relative flex overflow-hidden [--gap:2rem] [gap:var(--gap)] [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      {[0, 1].map((n) => (
        <div
          key={n}
          className={`flex shrink-0 items-center [gap:var(--gap)] motion-safe:animate-marquee ${
            pauseOnHover ? 'hover:[animation-play-state:paused]' : ''
          }`}
          style={{ animationDuration: `${speed}s` }}
          aria-hidden={n === 1}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
```

Add the keyframes to `globals.css`:

```css
/* frontend/src/styles/globals.css */
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(calc(-100% - var(--gap, 2rem))); }
}
.animate-marquee { animation: marquee linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .animate-marquee { animation: none; }
}
```

Usage:

```typescript
<Marquee speed={30} pauseOnHover>
  {LOGOS.map((l) => (
    <img key={l.alt} src={l.src} alt={l.alt} className="h-6 grayscale" />
  ))}
</Marquee>
```

---

## Pattern 3 — Sticky-scroll storytelling

Left column pins a heading, right column scrolls sections. Popular on
Stripe / Vercel product pages.

```typescript
export function StickyScrollStory({
  chapters,
}: {
  chapters: { title: string; body: React.ReactNode }[];
}) {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-16 md:grid-cols-[1fr_2fr]">
      <div className="md:sticky md:top-24 md:h-fit">
        <h2 className="font-heading text-3xl">How it works</h2>
        <p className="mt-3 text-[var(--secondary-text-color)]">
          Four steps from prompt to production.
        </p>
      </div>
      <div className="space-y-16">
        {chapters.map((c, i) => (
          <article key={c.title} className="floating-card rounded-[var(--radius-big)] p-6">
            <span className="text-sm font-medium text-[var(--primary-color)]">
              0{i + 1}
            </span>
            <h3 className="mt-2 font-heading text-xl">{c.title}</h3>
            <div className="mt-3 text-[var(--secondary-text-color)]">{c.body}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

---

## Pattern 4 — Reveal-on-scroll

Elements fade + slide up when they enter the viewport. Foundation for every
"animated marketing page" — but keep it subtle.

```typescript
import { motion, useReducedMotion } from 'framer-motion';

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? undefined : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

Compose:

```typescript
<Reveal>
  <h2>Section headline</h2>
</Reveal>
<Reveal delay={0.1}>
  <p>Body copy.</p>
</Reveal>
```

**Rule:** never stagger more than 3 reveals in a row. Beyond that it feels
slow. Chunk into groups.

---

## Pattern 5 — Parallax hero image (desktop only)

Image scrolls slightly slower than the page. Only on desktop; mobile
parallax hurts perceived performance.

```typescript
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';

export function ParallaxImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -80]);
  return (
    <div ref={ref} className="relative aspect-video overflow-hidden rounded-[var(--radius-big)]">
      <motion.img
        src={src}
        alt={alt}
        className="h-full w-full object-cover md:h-[120%]"
        style={reduce ? undefined : { y }}
      />
    </div>
  );
}
```

Wrap under a `md:` breakpoint at the parent level — don't render the parallax
component at all on mobile.

---

## Pattern 6 — Magnetic button

Button that pulls toward the cursor. Fun for CTAs; use sparingly.

```typescript
import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export function MagneticButton({
  children,
  strength = 12,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { strength?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const reduce = useReducedMotion();

  const onMove = (e: React.MouseEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    setPos({ x: (dx / r.width) * strength, y: (dy / r.height) * strength });
  };
  const reset = () => setPos({ x: 0, y: 0 });

  return (
    <motion.button
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }}
      className="btn btn--primary"
      {...props}
    >
      {children}
    </motion.button>
  );
}
```

**Rule:** magnetic buttons only on primary CTA. Never on nav items or
tertiary buttons — feels chaotic.

---

## Pattern 7 — Section divider (soft glow line)

Divide sections without a hard rule. Used across most modern landing pages.

```typescript
export function SoftDivider() {
  return (
    <div
      className="mx-auto my-16 h-px w-4/5 max-w-3xl"
      style={{
        backgroundImage:
          'linear-gradient(to right, transparent, var(--layout-border-color) 30%, var(--layout-border-color) 70%, transparent)',
      }}
    />
  );
}
```

---

## Do-not

- **No parallax on mobile** — see Pattern 5 note.
- **No bento cells shorter than 3 lines** — makes the grid look broken.
- **No infinite marquee without `mask-image` fade** — the reset "jump" is
  obvious without the edge fade.
- **No sticky-scroll story with more than 5 chapters** — user fatigue.
- **No `whileInView` with `once: false`** — animations re-firing on every
  scroll-back is unpleasant.
- **No `useScroll` on lots of elements simultaneously** — kills scroll FPS
  on low-end mobile.

---

## Checklist

- [ ] All motion respects `useReducedMotion` / `prefers-reduced-motion`
- [ ] Marquee has `mask-image` gradient fade on left+right edges
- [ ] Bento grid uses `.floating-card` primitive, not bespoke cards
- [ ] Only spec tokens for colors, radii, spacing
- [ ] Parallax + magnetic buttons are desktop-only (`md:` breakpoint)
- [ ] Reveal-on-scroll uses `viewport={{ once: true }}` — never fires twice
- [ ] Dark-mode parity — all colors resolve via CSS variables
- [ ] Sections are content-height, not fixed height
- [ ] Lighthouse Performance ≥ 90 after adding motion sections
