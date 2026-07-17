# Skill — Advanced Framer Motion Patterns

Motion patterns beyond the basic "fade + slide": shared layout transitions,
gesture-driven cards, stagger children, spring physics presets, motion
values, `useTransform` composition.

Prereqs: Framer Motion installed (project convention), design system tokens
loaded (`skill-ui-ux-checklist.md`). Every pattern respects
`prefers-reduced-motion`.

---

## Spring physics preset table

Use these instead of hand-tuning `stiffness`/`damping` per component.

```typescript
// frontend/src/lib/motionSprings.ts
export const SPRINGS = {
  // Snappy — good for menus, drawers, tab underlines
  snappy: { type: 'spring' as const, stiffness: 500, damping: 40, mass: 0.8 },
  // Smooth — good for cards, modals
  smooth: { type: 'spring' as const, stiffness: 260, damping: 26, mass: 1 },
  // Bouncy — reserve for playful microinteractions (delete confirmation, celebrations)
  bouncy: { type: 'spring' as const, stiffness: 180, damping: 12, mass: 0.6 },
  // Molasses — deliberate slowness for emphasis (never for regular UI)
  molasses: { type: 'spring' as const, stiffness: 80, damping: 24, mass: 1.5 },
} as const;

// Standard easings (cubic-bezier form) — canonical from skill-ui-ux-checklist §motion
export const EASE = {
  smooth: [0.16, 1, 0.3, 1] as const,        // enters
  standard: [0.4, 0, 0.2, 1] as const,       // sidebar / layout
  overshoot: [0.34, 1.56, 0.64, 1] as const, // playful pop-in
} as const;

// Standard durations from the spec
export const DUR = {
  micro: 0.07,        // 70ms — hover state changes
  fast: 0.1,          // 100ms — button press feedback
  base: 0.15,         // 150ms — dropdown open
  expressive: 0.25,   // 250ms — modal enter, drawer slide
  large: 0.4,         // 400ms — page transition
} as const;
```

Use across every animated component:

```typescript
import { SPRINGS, EASE, DUR } from '@/lib/motionSprings';

<motion.div transition={SPRINGS.smooth} />
<motion.div transition={{ duration: DUR.expressive, ease: EASE.smooth }} />
```

---

## Pattern 1 — Shared layout transition (magic move)

Element morphs between positions when React re-parents it. Signature Linear /
Framer effect.

```typescript
import { motion, LayoutGroup } from 'framer-motion';

export function TabsWithSharedIndicator({
  tabs,
  active,
  onSelect,
}: {
  tabs: string[];
  active: string;
  onSelect: (t: string) => void;
}) {
  return (
    <LayoutGroup id="tabs">
      <div className="flex gap-1 border-b border-[var(--layout-border-color)]">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className="relative px-4 py-2 text-sm"
          >
            <span
              className={active === t ? 'text-[var(--primary-text-color)]' : 'text-[var(--secondary-text-color)]'}
            >
              {t}
            </span>
            {active === t && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-x-2 -bottom-px h-0.5 bg-[var(--primary-color)]"
                transition={SPRINGS.snappy}
              />
            )}
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
```

**Rule:** `layoutId` must be UNIQUE globally. Two components with the same
`layoutId` will animate between each other, which is either magical or a bug.

---

## Pattern 2 — Stagger children

Container fades in and its children stagger. Cleaner than delaying each child
manually.

```typescript
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.expressive, ease: EASE.smooth } },
};

export function StaggerList({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      variants={reduce ? undefined : containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-2"
    >
      {items.map((it) => (
        <motion.li key={it} variants={reduce ? undefined : itemVariants} className="floating-card p-3">
          {it}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

---

## Pattern 3 — Draggable card (swipe to dismiss)

Card that follows the pointer and dismisses on release past a threshold.

```typescript
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';

export function SwipeCard({
  onDismiss,
  children,
}: {
  onDismiss: (direction: 'left' | 'right') => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const opacity = useTransform(x, [-300, -150, 0, 150, 300], [0, 1, 1, 1, 0]);
  const reduce = useReducedMotion();

  return (
    <motion.div
      drag={reduce ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      style={{ x, rotate, opacity }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 150) onDismiss('right');
        else if (info.offset.x < -150) onDismiss('left');
      }}
      className="floating-card rounded-[var(--radius-big)] p-6 cursor-grab active:cursor-grabbing"
    >
      {children}
    </motion.div>
  );
}
```

---

## Pattern 4 — Count-up number (animated KPI)

Number tweens up when it enters the viewport. Perfect for stat rows.

```typescript
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef, useEffect } from 'react';

export function AnimatedNumber({
  value,
  duration = 1.2,
  format = (n: number) => Math.round(n).toLocaleString(),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v) => format(v));

  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);

  return <motion.span ref={ref}>{display}</motion.span>;
}
```

Usage: `<AnimatedNumber value={12483} format={(n) => `$${Math.round(n).toLocaleString()}`} />`.

---

## Pattern 5 — Scroll-linked progress bar

Reading progress bar tied to page scroll.

```typescript
import { motion, useScroll, useSpring } from 'framer-motion';

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, mass: 0.5 });
  return (
    <motion.div
      className="fixed left-0 top-0 z-50 h-1 w-full origin-left bg-[var(--primary-color)]"
      style={{ scaleX }}
      aria-hidden
    />
  );
}
```

Mount once in `AppShell.tsx`. Cost: negligible — no re-renders.

---

## Pattern 6 — Presence transitions (AnimatePresence)

Element enters and exits with proper unmount cleanup. Use for modals,
toasts, dropdowns.

```typescript
import { AnimatePresence, motion } from 'framer-motion';

export function AnimatedToast({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={SPRINGS.smooth}
          className="fixed bottom-4 right-4 floating-card rounded-[var(--radius-medium)] p-4"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Rule:** every mount/unmount animation MUST use `AnimatePresence`. Without it
the exit animation never runs (React unmounts before Framer can play it).

---

## Pattern 7 — Gesture-driven card 3D tilt

Card tilts toward the cursor. Great for a hero product mockup.

```typescript
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';

export function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-8, 8]);
  const reduce = useReducedMotion();

  const onMove = (e: React.MouseEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 800 }}
      className="floating-card rounded-[var(--radius-big)] p-6"
    >
      {children}
    </motion.div>
  );
}
```

---

## Do-not

- **No `motion.*` on every list item** — 100 animated items is 100 render
  subscribers. Use CSS transitions for hover states instead; reserve
  `motion.*` for entry/exit or complex gestures.
- **No `animate` without `initial`** — Framer will play from a default state
  you didn't intend.
- **No `AnimatePresence` without a stable `key`** — dynamic children need
  `key={id}`, or the exit animation never plays.
- **No `layoutId` collision** — two components with the same id anywhere on
  the page will jump between each other.
- **No motion prop drilling** — if you need to animate a deep child, use
  `motion.*` at the leaf, not pass values through 5 layers.

---

## Checklist

- [ ] Every animation checks `useReducedMotion` (or `motion-safe:` in Tailwind)
- [ ] Springs / durations / easings come from `SPRINGS`, `DUR`, `EASE` — never
      hand-tuned per component
- [ ] Every `layoutId` is unique globally
- [ ] `AnimatePresence` wraps every mount/unmount animation
- [ ] `viewport={{ once: true }}` on `whileInView` — no repeat firing on scroll-back
- [ ] Motion values (`useMotionValue`, `useTransform`) preferred over
      `useState` for continuous animation — no per-frame re-renders
- [ ] Lighthouse Performance ≥ 90 with all motion enabled
- [ ] Dark-mode parity — no hardcoded colors in `style={{ ... }}` blocks
