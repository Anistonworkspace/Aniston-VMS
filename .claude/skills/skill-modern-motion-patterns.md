# Skill — Advanced Framer Motion Patterns

Motion patterns beyond basic "fade + slide": gesture-driven cards, shared-layout transitions, spring physics
presets. Used across incident/health state transitions in the dashboard. Every pattern respects
`useReducedMotion()` and the soft-SaaS timing scale (`skill-ui-ux-checklist.md` §15: 70–160ms micro-interactions).

---

## Spring physics presets

```typescript
// frontend/src/lib/motionSprings.ts
export const SPRINGS = {
  gentle: { type: 'spring', stiffness: 200, damping: 24, mass: 0.6 },  // card hover, tile settle
  snappy: { type: 'spring', stiffness: 400, damping: 30, mass: 0.5 },  // tab indicator, toggle
  bouncy: { type: 'spring', stiffness: 300, damping: 15, mass: 0.8 },  // toast entrance, badge pop
} as const;
```

- [ ] Never invent a one-off spring config inline — pull from `SPRINGS` so motion feels consistent app-wide

---

## Pattern 1 — Shared layout transition (Magic Move)

```typescript
// Camera detail tabs: Overview / Health / Live / Playback / Incidents / Settings
const TABS = ['Overview', 'Health', 'Live', 'Playback', 'Incidents', 'Settings'] as const;

function TabsWithSharedIndicator({ active, onSelect }: { active: string; onSelect: (t: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-[var(--hairline)]" role="tablist">
      {TABS.map(tab => (
        <button
          key={tab}
          role="tab"
          aria-selected={active === tab}
          onClick={() => onSelect(tab)}
          className={`relative px-4 py-2 text-sm font-medium ${active === tab ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}
        >
          {tab}
          {active === tab && (
            <motion.div
              layoutId="camera-tab-indicator"
              className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--sage)]"
              transition={SPRINGS.snappy}
            />
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] One `layoutId` per indicator group — never reuse `"camera-tab-indicator"` for an unrelated tab set on the
  same page (it will visibly fly across the screen)
- [ ] Indicator color is `--sage`; it's the only element that moves — tab text itself just swaps color/weight

---

## Pattern 2 — Staggered list entrance

```typescript
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

function ZoneStaggerList({ zones }: { zones: Zone[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.ul variants={reduceMotion ? undefined : containerVariants} initial="hidden" animate="visible" className="space-y-2">
      {zones.map(zone => (
        <motion.li key={zone.id} variants={reduceMotion ? undefined : itemVariants}>
          <SidebarZoneItem zone={zone} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

- [ ] `staggerChildren` stays ≤ 0.04s per item (see checklist §15) — a 12-zone list should finish entering in
  under half a second, not cascade for 3 seconds
- [ ] Variants are skipped entirely (`undefined`) under reduced motion, not just sped up

---

## Pattern 3 — Draggable dismiss card (incident acknowledge/resolve)

```typescript
// Swiping an incident kanban card right acknowledges it, left dismisses/snoozes it
function SwipeCard({ incident, onAcknowledge, onSnooze }: { incident: Incident; onAcknowledge: () => void; onSnooze: () => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const bg = useTransform(x, [-150, 0, 150], ['var(--coral)', 'var(--card)', 'var(--sage)']);

  return (
    <motion.div
      style={{ x, rotate, background: bg }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120) onAcknowledge();
        else if (info.offset.x < -120) onSnooze();
      }}
      className="cursor-grab rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-soft)] active:cursor-grabbing"
    >
      <p className="font-medium text-[var(--ink)]">{incident.code}</p>
      <p className="text-sm text-[var(--muted)]">{incident.summary}</p>
    </motion.div>
  );
}
```

- [ ] Drag threshold is ±120px before commit — a small nudge snaps back, it doesn't need to be a full swipe
- [ ] Background tint previews the outcome (`--coral` for snooze/left, `--sage` for acknowledge/right) —
  the operator always knows what letting go will do
- [ ] Card springs back to `x: 0` if released under threshold (Framer Motion's default drag behavior — don't override it)

---

## Pattern 4 — Animated number (count-up)

```typescript
// frontend/src/components/ui/AnimatedNumber.tsx
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 100, damping: 30 });
  const inView = useInView(ref, { once: true });

  useEffect(() => { if (inView) motionVal.set(value); }, [inView, value]);

  useEffect(() => spring.on('change', v => {
    if (ref.current) ref.current.textContent = v.toFixed(decimals);
  }), [spring, decimals]);

  return <span ref={ref} className="tabular-nums">0</span>;
}
```

- [ ] Only animates once, on first viewport entry (`useInView({ once: true })`) — never re-triggers on every re-render when a live metric ticks
- [ ] Used for dashboard KPIs (cameras online, open incidents, uptime %) — see `skill-modern-hero-patterns.md` Pattern 5
- [ ] Always wrapped in `tabular-nums` so digit width doesn't jitter mid-count

---

## Pattern 5 — Scroll-linked progress bar

```typescript
// Reading-progress indicator at the top of a long incident postmortem / health report page
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 40 });
  return (
    <motion.div
      style={{ scaleX, transformOrigin: '0%' }}
      className="fixed inset-x-0 top-0 z-50 h-0.5 bg-[var(--sage)]"
    />
  );
}
```

- [ ] `transformOrigin: '0%'` so the bar fills left-to-right, never centers outward
- [ ] Only used on long-form single-column pages (incident postmortem, report detail) — never on the main
  dashboard grid, where there's no single scroll narrative to track

---

## Pattern 6 — Tilt card on hover (3D perspective)

```typescript
// Evidence-photo gallery: subtle tilt toward the cursor on hover
function TiltCard({ children }: { children: React.ReactNode }) {
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, SPRINGS.gentle);
  const springY = useSpring(rotateY, SPRINGS.gentle);

  const onMouseMove = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 8);
    rotateX.set(py * -8);
  };

  return (
    <motion.div
      onMouseMove={onMouseMove}
      onMouseLeave={() => { rotateX.set(0); rotateY.set(0); }}
      style={{ rotateX: springX, rotateY: springY, transformStyle: 'preserve-3d' }}
      className="rounded-[var(--radius-tile)] shadow-[var(--shadow-soft)]"
    >
      {children}
    </motion.div>
  );
}
```

- [ ] Tilt range stays within ±8deg — anything more looks like a glitch, not a premium touch
- [ ] Wraps `EvidencePhotoCard`/`SnapshotCompare` thumbnails in a gallery — not applied to data-dense
  components like tables or the health donut, where tilt would misread as motion sickness bait
- [ ] Disabled on touch (no `onMouseMove` fires there anyway — no extra gate needed, but don't add a
  duplicate touch handler that fakes it)

---

## Pattern 7 — Animated toast queue (incident alerts)

```typescript
function AnimatedToast({ toasts, onDismiss }: { toasts: { id: string; status: 'critical' | 'warning' | 'healthy'; message: string }[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={SPRINGS.bouncy}
            className={`w-80 rounded-[var(--radius-tile)] border-l-4 bg-[var(--card)] p-3 shadow-[var(--shadow-soft)] ${
              t.status === 'critical' ? 'border-[var(--coral)]' : t.status === 'warning' ? 'border-l-[#E2A93B]' : 'border-[var(--sage)]'
            }`}
          >
            <p className="text-sm text-[var(--ink)]">{t.message}</p>
            {t.status !== 'critical' && (
              <button onClick={() => onDismiss(t.id)} className="mt-1 text-xs text-[var(--muted)]">Dismiss</button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] `layout` prop lets remaining toasts reflow smoothly when one is dismissed — no jump-cut
- [ ] Critical incident toasts have no auto-dismiss/no "Dismiss" button shortcut — they persist until the
  incident is acknowledged in the app (see checklist §17)
- [ ] Left accent bar color always matches `StatusBadge` semantics — never a mismatched color between the
  toast and the status it's reporting

---

## Checklist

- [ ] Every spring transition comes from `SPRINGS` (`gentle`/`snappy`/`bouncy`) — no bespoke stiffness/damping per component
- [ ] Shared `layoutId`s are scoped per component instance, never duplicated across unrelated tab groups on one page
- [ ] Stagger, drag threshold, and tilt ranges match the numbers in this file — don't "tune" them ad hoc per PR
- [ ] `useReducedMotion()` gates every pattern here; verify by toggling OS-level reduced motion and confirming
  nothing breaks (content still fully usable, just without the animation)
