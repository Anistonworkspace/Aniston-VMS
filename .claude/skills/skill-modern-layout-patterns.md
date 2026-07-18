# Skill — Modern Layout Patterns (Bento, Marquee, Sticky-Scroll, Parallax)

Non-standard grid and motion-driven layouts you'll see on Linear, Vercel, Cal.com, Framer, Aceternity — all
built with the existing design tokens (see `skill-ui-ux-checklist.md`: same radii, same fonts, same
sage/indigo/coral/sand accents). On the dashboard these patterns are populated with real camera/zone/incident
data via `LiveWallGrid`, `ZoneCard`, `DonutCard`, and `ActivityListCard` — not decorative placeholder tiles.

---

## Prerequisites

- `useReducedMotion()` before any transform-driven layout
- `IntersectionObserver` / `whileInView` to defer offscreen animation work
- Parallax and magnetic effects are **desktop-only** — disable on touch/mobile for both feel and battery

---

## Pattern 1 — Bento grid (mixed cell sizes)

```typescript
// frontend/src/features/dashboard/DashboardBento.tsx
export interface BentoItem {
  id: string;
  span: 'sm' | 'md' | 'lg' | 'full';   // maps to SPAN_CLASSES below
  content: React.ReactNode;
}

const SPAN_CLASSES: Record<BentoItem['span'], string> = {
  sm:   'col-span-1 row-span-1',
  md:   'col-span-2 row-span-1',
  lg:   'col-span-2 row-span-2',
  full: 'col-span-4 row-span-1',
};

export function DashboardBento({ items }: { items: BentoItem[] }) {
  return (
    <div className="grid grid-cols-4 gap-6 auto-rows-[160px]">
      {items.map(item => (
        <div key={item.id} className={`${SPAN_CLASSES[item.span]} rounded-[var(--radius-card)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)]`}>
          {item.content}
        </div>
      ))}
    </div>
  );
}

// Usage — the operator dashboard's first-fold layout
const items: BentoItem[] = [
  { id: 'health',   span: 'lg',  content: <DonutCard title="Platform health" /> },
  { id: 'zones',    span: 'md',  content: <ZoneCards limit={4} /> },
  { id: 'activity', span: 'md',  content: <ActivityListCard limit={6} /> },
  { id: 'wall',     span: 'full', content: <LiveWallGrid layout="3x2" cameras={pinnedCameras} /> },
];
```

- [ ] Mixed cell sizes read intentionally (a large health donut anchors the grid) — never a uniform boring grid
- [ ] Every bento cell is `--card` + `--radius-card` + `--shadow-soft` — same card recipe as everywhere else
- [ ] Beyond 4 columns on desktop, collapse to 2 columns on tablet, 1 on mobile; `LiveWallGrid` full-width cell always reflows its own internal grid too

---

## Pattern 2 — Marquee (infinite horizontal scroll, pause on hover)

```typescript
// frontend/src/components/Marquee.tsx
export function Marquee({ children, speed = 40, pauseOnHover = true }: { children: React.ReactNode; speed?: number; pauseOnHover?: boolean }) {
  return (
    <div className="group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      {[0, 1].map(i => (
        <div
          key={i}
          aria-hidden={i === 1}
          className={`flex shrink-0 items-center gap-10 ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
          style={{ animation: `marquee ${speed}s linear infinite` }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
```

```css
/* frontend/src/styles/globals.css */
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-100%); }
}
```

- [ ] Children are duplicated (`[0, 1].map`) for a seamless loop — a single copy will visibly jump
- [ ] Used for the client-logo trust bar (`skill-modern-hero-patterns.md`) **and** the dashboard's recent-evidence
  snapshot strip (scrolling `EvidencePhotoCard` thumbnails) — same primitive, two contexts
- [ ] `prefers-reduced-motion` pauses the marquee entirely (`animation-play-state: paused` at the media query, not just slower)

---

## Pattern 3 — Sticky-scroll story

```typescript
// "How Aniston VMS catches an incident" — 4-chapter explainer on the marketing page
interface Chapter { title: string; text: string; media: React.ReactNode; }

const CHAPTERS: Chapter[] = [
  { title: '1. A camera goes quiet',      text: 'RTSP handshake fails or the stream drops mid-recording.', media: <CameraCard status="offline" preview /> },
  { title: '2. Health check flags it',    text: 'The 5-stage probe (reachability → RTSP → ONVIF → recording → storage) isolates the failure.', media: <PlatformHealthTile stage="rtsp" status="critical" /> },
  { title: '3. Escalation notifies ops',  text: 'WhatsApp + email fire on a timer; the incident timeline tracks every step.', media: <EscalationTimeline incidentId="ANI-CAM-2026-000145" /> },
  { title: '4. Recovery is verified',     text: 'An operator confirms the fix and the incident closes with a full audit trail.', media: <DiagnosisBanner status="recovery-verified" /> },
];

function StickyScrollStory() {
  const [active, setActive] = useState(0);

  return (
    <div className="grid gap-12 md:grid-cols-2">
      <div className="space-y-32 py-24">
        {CHAPTERS.map((chapter, i) => (
          <motion.div key={chapter.title} onViewportEnter={() => setActive(i)} viewport={{ amount: 0.6 }}>
            <h3 className="font-heading text-2xl text-[var(--ink)]">{chapter.title}</h3>
            <p className="mt-2 text-[var(--muted)]">{chapter.text}</p>
          </motion.div>
        ))}
      </div>
      <div className="sticky top-24 h-[420px] self-start rounded-[var(--radius-card)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)]">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {CHAPTERS[active].media}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] Media panel is `sticky`, pinned while the text column scrolls past — never the reverse
- [ ] Active chapter is driven by scroll position (`onViewportEnter`/`useInView`), not a manual click-only stepper
- [ ] Each chapter's media is a real component (`CameraCard`, `PlatformHealthTile`, `EscalationTimeline`,
  `DiagnosisBanner`) — not a generic illustration, since the story *is* the product

---

## Pattern 4 — Parallax image

```typescript
function ParallaxLiveWallImage() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div ref={ref} className="relative h-[420px] overflow-hidden rounded-[var(--radius-card)]">
      <motion.img
        src="/marketing/live-wall-mockup.png"
        alt="Live wall showing a 3x2 camera grid"
        style={{ y: reduceMotion || !isDesktop ? 0 : y }}
        className="h-[130%] w-full object-cover"
      />
    </div>
  );
}
```

- [ ] Parallax is desktop-only (`isDesktop` gate) — mobile gets the static image, both for perf and because
  touch scroll + parallax fights the OS's own momentum scrolling
- [ ] `useReducedMotion()` disables the transform entirely, not just slows it

---

## Pattern 5 — Magnetic button

```typescript
function MagneticButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const isDesktop = useMediaQuery('(pointer: fine)');

  const onMouseMove = (e: MouseEvent) => {
    if (!isDesktop || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = e.clientX - rect.left - rect.width / 2;
    const relY = e.clientY - rect.top - rect.height / 2;
    setPos({ x: relX * 0.25, y: relY * 0.25 });
  };

  return (
    <motion.button
      ref={ref}
      {...props}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setPos({ x: 0, y: 0 })}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }}
      className="btn btn--primary"
    >
      {children}
    </motion.button>
  );
}
```

- [ ] Gated on `(pointer: fine)` — never attached to a touch device, where it does nothing useful and can
  interfere with tap
- [ ] Spring settles back to `{0, 0}` on `onMouseLeave` — never leaves the button visibly offset
- [ ] Used sparingly — one magnetic CTA per page max ("Open Live Wall"/"Get started"), not every button

---

## `SoftDivider`

```typescript
// A 1px hairline section divider, used between bento rows / marketing sections
function SoftDivider() {
  return <div className="h-px w-full bg-[var(--hairline)]" />;
}
```

---

## Checklist

- [ ] Bento cells populated with real dashboard components (`DonutCard`, `ZoneCards`, `ActivityListCard`,
  `LiveWallGrid`), not generic lorem-ipsum placeholder boxes
- [ ] Marquee duplicates its children and pauses on hover / respects reduced motion
- [ ] Sticky-scroll story's active chapter is scroll-driven, media is a real VMS component per chapter
- [ ] Parallax and magnetic effects are desktop-only and both bail out under `useReducedMotion()`
- [ ] All gaps are `gap-6` (24px), all cards are `--radius-card` + `--shadow-soft` — no bespoke radius/shadow per pattern
