# Skill — Chart & Dashboard Patterns

Recharts integration, dashboard KPI cards, date range picker, real-time chart from socket.

---

## KPI stat cards

```typescript
// frontend/src/components/dashboard/StatCard.tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title:   string;
  value:   string | number;
  delta?:  number;       // percentage change vs previous period
  suffix?: string;       // e.g. "%", "hrs"
  icon?:   React.ReactNode;
  loading?: boolean;
}

export function StatCard({ title, value, delta, suffix, icon, loading }: StatCardProps) {
  const trendColor =
    delta == null ? '' :
    delta > 0     ? 'text-[var(--positive-color)]' :
    delta < 0     ? 'text-[var(--negative-color)]' :
                    'text-[var(--secondary-text-color)]';

  const TrendIcon = delta == null ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  if (loading) {
    return (
      <div className="floating-card rounded-[var(--card-radius)] p-5">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-8 w-16" />
      </div>
    );
  }

  return (
    <div className="floating-card rounded-[var(--card-radius)] p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-[var(--secondary-text-color)]">{title}</p>
        {icon && <div className="text-[var(--primary-color)]">{icon}</div>}
      </div>
      <p className="mt-2 text-2xl font-semibold font-mono text-[var(--primary-text-color)]">
        {value}{suffix && <span className="text-base font-normal ml-1">{suffix}</span>}
      </p>
      {delta != null && (
        <div className={`mt-1 flex items-center gap-1 text-xs ${trendColor}`}>
          {TrendIcon && <TrendIcon className="h-3.5 w-3.5" />}
          <span>{Math.abs(delta)}% vs last period</span>
        </div>
      )}
    </div>
  );
}
```

---

## Line chart — Recharts

```typescript
// frontend/src/components/charts/ItemsTrendChart.tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

interface DataPoint {
  date:     string;   // formatted: "Jan 1"
  approved: number;
  rejected: number;
  pending:  number;
}

export function ItemsTrendChart({ data, loading }: { data: DataPoint[]; loading?: boolean }) {
  if (loading) return <div className="skeleton h-64 rounded-[var(--border-radius-medium)]" />;

  return (
    <div className="floating-card rounded-[var(--card-radius)] p-5">
      <h3 className="text-sm font-semibold text-[var(--primary-text-color)] mb-4">Item Trends</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 0, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--secondary-text-color)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--secondary-text-color)' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background:  'var(--primary-background-color)',
              border:      '1px solid var(--border-color)',
              borderRadius:'var(--border-radius-small)',
              fontSize:    12,
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="approved" stroke="var(--positive-color)"  strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="rejected" stroke="var(--negative-color)"  strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pending"  stroke="var(--warning-color)"   strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## Bar chart — count by category

```typescript
// frontend/src/components/charts/CategoryCountChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#0073ea', '#00854d', '#e2445c', '#ffcb00', '#a25ddc', '#037f4c'];

export function CategoryCountChart({ data }: { data: { category: string; count: number }[] }) {
  return (
    <div className="floating-card rounded-[var(--card-radius)] p-5">
      <h3 className="text-sm font-semibold text-[var(--primary-text-color)] mb-4">Count by Category</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--secondary-text-color)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--secondary-text-color)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: 'var(--primary-background-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-small)', fontSize: 12 }}
            cursor={{ fill: 'var(--primary-background-hover-color)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## Donut chart — item type breakdown

```typescript
// frontend/src/components/charts/ItemTypeDonut.tsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;    // skip tiny slices
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>{`${(percent * 100).toFixed(0)}%`}</text>;
};

export function ItemTypeDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div className="floating-card rounded-[var(--card-radius)] p-5">
      <h3 className="text-sm font-semibold mb-4">Item by Type</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
            dataKey="value" labelLine={false} label={renderLabel}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(value: number) => [`${value}`, '']} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## Date range picker for dashboard filters

```typescript
// frontend/src/components/dashboard/DateRangePicker.tsx
import { useState } from 'react';
import { format } from 'date-fns';

interface DateRange { from: string; to: string }

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const PRESETS = [
    { label: 'This month',  from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),   to: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Last 30 days',from: format(new Date(Date.now() - 30*86400000), 'yyyy-MM-dd'),                             to: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Last 90 days',from: format(new Date(Date.now() - 90*86400000), 'yyyy-MM-dd'),                             to: format(new Date(), 'yyyy-MM-dd') },
    { label: 'This year',   from: `${new Date().getFullYear()}-01-01`,                                                   to: format(new Date(), 'yyyy-MM-dd') },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.label}
          className={`btn btn--sm ${value.from === p.from && value.to === p.to ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => onChange({ from: p.from, to: p.to })}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input type="date" className="input-field text-xs h-8 px-2" value={value.from}
          onChange={e => onChange({ ...value, from: e.target.value })} />
        <span className="text-[var(--secondary-text-color)] text-xs">to</span>
        <input type="date" className="input-field text-xs h-8 px-2" value={value.to}
          onChange={e => onChange({ ...value, to: e.target.value })} />
      </div>
    </div>
  );
}
```

---

## Real-time chart update from socket

```typescript
// Append new data points to a chart in real-time
import { useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';

export function useRealtimeChartData<T>(
  initialData: T[],
  eventName: string,
  maxPoints = 20,
) {
  const [data, setData] = useState<T[]>(initialData);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.on(eventName, (point: T) => {
      setData(prev => [...prev.slice(-(maxPoints - 1)), point]);
    });
    return () => { socket.off(eventName); };
  }, [socket, eventName, maxPoints]);

  return data;
}

// Usage:
const chartData = useRealtimeChartData(initialData, 'dashboard:stats:update');
```

---

## Backend — dashboard stats query

```typescript
// backend/src/modules/dashboard/dashboard.service.ts
static async getStats(actor: AuthUser, from: string, to: string) {
  const orgId = actor.organizationId;
  const dateFilter = { gte: new Date(from), lte: new Date(to) };

  const [
    totalItems,
    newItems,
    submittedItems,
    approvedItems,
    itemsByType,
    itemsByCategory,
  ] = await prisma.$transaction([
    prisma.item.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.item.count({ where: { organizationId: orgId, deletedAt: null, createdAt: dateFilter } }),
    prisma.item.count({ where: { organizationId: orgId, status: 'SUBMITTED', deletedAt: null } }),
    prisma.item.count({ where: { organizationId: orgId, status: 'APPROVED', deletedAt: null, createdAt: dateFilter } }),
    prisma.item.groupBy({
      by: ['type'],
      where: { organizationId: orgId, status: 'APPROVED', createdAt: dateFilter },
      _sum: { amount: true },
    }),
    prisma.item.groupBy({
      by: ['categoryId'],
      where: { organizationId: orgId, deletedAt: null },
      _count: { id: true },
    }),
  ]);

  return { totalItems, newItems, submittedItems, approvedItems, itemsByType, itemsByCategory };
}
```

---

## Checklist

- [ ] All charts wrapped in `ResponsiveContainer width="100%"` — no fixed pixel widths
- [ ] Skeleton placeholder shown during loading (same dimensions as the chart)
- [ ] Tooltips use `var(--primary-background-color)` and `var(--border-color)` — not hardcoded colors
- [ ] Chart colors use design system values (positive, negative, warning, primary)
- [ ] Date range presets available (this month, last 30 days, last 90 days, this year)
- [ ] Dashboard stats cached for 5 minutes (see skill-caching-patterns.md)
- [ ] `groupBy` aggregation used server-side — never group in the frontend
- [ ] Real-time updates via socket append to existing data — no full refetch
- [ ] Dark mode: chart background/grid use CSS vars, not hardcoded hex values
- [ ] Mobile: `height` on `ResponsiveContainer` reduced for small screens via `useBreakpoint`
