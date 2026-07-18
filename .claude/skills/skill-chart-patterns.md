# Skill — Chart & Dashboard Patterns

Recharts integration, health/incident KPI cards, report date range picker, real-time connection-quality chart driven off the health-check socket.

Design tokens: see `docs/04-uiux-brief.md` (soft-SaaS — cream canvas, white rounded cards, sage/indigo/coral/sand accents). Never hardcode hex in chart code — use `var(--sage)`, `var(--indigo)`, `var(--coral)`, `var(--sand)`, `var(--muted)`.

---

## KPI stat cards

```tsx
// frontend/src/components/dashboard/StatCard.tsx
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  trend?: { direction: 'up' | 'down'; value: number; goodDirection: 'up' | 'down' };
  icon: ReactNode;
}

export function StatCard({ label, value, trend, icon }: StatCardProps) {
  const trendGood = trend && trend.direction === trend.goodDirection;
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : TrendingDown;

  return (
    <div className="bg-[var(--card)] rounded-[var(--card-radius)] shadow-sm border border-[var(--hairline)] p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-[var(--base-tint)] flex items-center justify-center text-[var(--primary-color)]">
        {icon}
      </div>
      <div>
        <div className="text-sm text-[var(--muted)]">{label}</div>
        <div className="text-2xl font-semibold text-[var(--ink)]">{value}</div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${trendGood ? 'text-[var(--sage)]' : 'text-[var(--coral)]'}`}>
            <TrendIcon size={12} /> {trend.value}% vs last 7 days
          </div>
        )}
      </div>
    </div>
  );
}
```

Dashboard row: **Cameras Online**, **Open Incidents**, **Avg Health Score**, **SLA Uptime (30d)**. "Good direction" differs per metric — open incidents trending *down* is good, cameras online trending *up* is good. Always pass `goodDirection` explicitly; never assume up = good.

## Connection quality trend — `ConnectionQualityChart`

```tsx
// frontend/src/components/charts/ConnectionQualityChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRealtimeChartData } from '@/hooks/useSocket';

interface DataPoint { ts: string; signalPct: number; fps: number; bitrateKbps: number }

export function ConnectionQualityChart({ cameraId, initialData }: { cameraId: string; initialData: DataPoint[] }) {
  const data = useRealtimeChartData<DataPoint>({
    channel: `camera:${cameraId}:health-tick`,
    initialData,
    maxPoints: 60,
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
        <XAxis dataKey="ts" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted)" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-small)' }}
          wrapperStyle={{ outline: 'none' }}
        />
        <Line type="monotone" dataKey="signalPct" stroke="var(--indigo)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="fps" stroke="var(--sage)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

`useRealtimeChartData` subscribes to the camera's health-tick socket room (the 30s heartbeat from `docs/03-app-flow.md` §4), appends the new point, and drops the oldest once `maxPoints` is exceeded — the same ring-buffer trick works for any live metric, not just video.

## Incidents by zone — `IncidentsByZoneChart` (bar)

```tsx
// frontend/src/components/charts/IncidentsByZoneChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function IncidentsByZoneChart({ data }: { data: { zone: string; open: number; resolved: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
        <XAxis dataKey="zone" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--base-tint)' }} />
        <Bar dataKey="open" fill="var(--coral)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="resolved" fill="var(--sage)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

## Camera status breakdown — donut

```tsx
// frontend/src/components/charts/CameraStatusDonut.tsx
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  Healthy: 'var(--sage)',
  Warning: 'var(--sand)',
  Critical: 'var(--coral)',
  Offline: 'var(--muted)',
};

export function CameraStatusDonut({ data }: { data: { status: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="status" innerRadius={58} outerRadius={80} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? 'var(--muted)'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => [`${v} cameras`, '']} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

## `HealthScoreRing` — single-value gauge

Same donut primitive, one active segment vs. a track, centered numeric label. Used on `PlatformHealthTile` and the zone dashboard header.

```tsx
// frontend/src/components/charts/HealthScoreRing.tsx
import { PieChart, Pie, Cell } from 'recharts';

function bandColor(score: number) {
  if (score >= 80) return 'var(--sage)';
  if (score >= 50) return 'var(--sand)';
  return 'var(--coral)';
}

export function HealthScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const data = [{ value: score }, { value: 100 - score }];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie data={data} dataKey="value" innerRadius={size / 2 - 10} outerRadius={size / 2} startAngle={90} endAngle={-270} stroke="none">
          <Cell fill={bandColor(score)} />
          <Cell fill="var(--base-tint)" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-[var(--ink)]">
        {score}
      </div>
    </div>
  );
}
```

Band thresholds (≥80 sage, 50–79 sand, <50 coral) must match the health-score copy everywhere else in the app — don't invent new cutoffs per screen.

## Report date range picker

```tsx
// frontend/src/components/dashboard/ReportDateRangePicker.tsx
const PRESETS = [
  { label: 'Today', from: () => new Date(), to: () => new Date() },
  { label: 'Last 7 days', from: () => addDays(new Date(), -7), to: () => new Date() },
  { label: 'Last 30 days', from: () => addDays(new Date(), -30), to: () => new Date() },
  { label: 'This month', from: () => startOfMonth(new Date()), to: () => new Date() },
];

function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function fmt(d: Date) { return d.toISOString().slice(0, 10); }

export function ReportDateRangePicker({ value, onChange }: { value: { from: Date; to: Date }; onChange: (r: { from: Date; to: Date }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => onChange({ from: p.from(), to: p.to() })}
          className="text-xs px-3 py-1.5 rounded-full border border-[var(--hairline)] text-[var(--muted)] hover:bg-[var(--base-tint)]"
        >
          {p.label}
        </button>
      ))}
      <input type="date" value={fmt(value.from)} onChange={(e) => onChange({ ...value, from: new Date(e.target.value) })} className="input-field" />
      <span className="text-[var(--muted)]">to</span>
      <input type="date" value={fmt(value.to)} onChange={(e) => onChange({ ...value, to: new Date(e.target.value) })} className="input-field" />
    </div>
  );
}
```

Feeds `ReportExportBar` — the PDF/CSV export of uptime & SLA per `docs/03-app-flow.md` §1 (Client Viewer journey).

## Real-time chart update via socket

```ts
// frontend/src/hooks/useSocket.ts
import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';

export function useRealtimeChartData<T>({ channel, initialData, maxPoints = 60 }: { channel: string; initialData: T[]; maxPoints?: number }) {
  const [data, setData] = useState(initialData);
  const bufferRef = useRef(initialData);

  useEffect(() => {
    function onTick(point: T) {
      const next = [...bufferRef.current, point].slice(-maxPoints);
      bufferRef.current = next;
      setData(next);
    }
    socket.on(channel, onTick);
    return () => { socket.off(channel, onTick); };
  }, [channel, maxPoints]);

  return data;
}
```

## Backend — grouped health stats

```ts
// backend/src/modules/health/health.service.ts
export async function getZoneHealthStats(zoneId: string, organizationId: string) {
  const [byStatus, incidentCounts] = await Promise.all([
    prisma.camera.groupBy({ by: ['status'], where: { zoneId, organizationId, deletedAt: null }, _count: true }),
    prisma.incident.groupBy({ by: ['status'], where: { zoneId, organizationId, createdAt: { gte: startOfToday() } }, _count: true }),
  ]);
  return { byStatus, incidentCounts };
}
```

## Checklist

- [ ] All charts wrapped in `<ResponsiveContainer>` — never hardcoded pixel width/height
- [ ] Colors come from `var(--sage)` / `var(--indigo)` / `var(--coral)` / `var(--sand)` / `var(--muted)` tokens — no raw hex in chart code (see `docs/04-uiux-brief.md`)
- [ ] `HealthScoreRing` band thresholds match the health-score copy used elsewhere — single source of truth for "what counts as Warning vs Critical"
- [ ] Skeleton placeholder shown during loading — same rounded `--card-radius` shape as the loaded chart, never a bare spinner over empty space
- [ ] Real-time updates reuse the existing `camera:{id}:health-tick` socket channel — no separate polling loop competing with it
- [ ] Dashboard stats cached server-side (30–60s) — never full-recompute on every load
- [ ] Mobile: `ResponsiveContainer` height reduced on small screens via `useBreakpoint`
- [ ] `organizationId` scoping present in every backend aggregate query — a zone's stats never leak across tenants