import { Activity, AlertTriangle, Brush, Cctv } from 'lucide-react';
import { StatCard } from '@/features/reports/StatCard';
import type { CameraHealthRow } from './analytics.types';

/** KPI row derived client-side from the GET /cameras/health list. */
export function FleetSummaryCards({ rows }: { rows: CameraHealthRow[] }): JSX.Element {
  const total = rows.length;
  const healthy = rows.filter((r) => r.status === 'HEALTHY').length;
  const critical = rows.filter((r) => r.status === 'CRITICAL').length;
  const needsCleaning = rows.filter((r) => r.diagnosis === 'IMAGE_PROBLEM').length;
  const avgScore = total ? Math.round(rows.reduce((sum, r) => sum + r.healthScore, 0) / total) : 0;
  const healthyPct = total ? Math.round((healthy / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Cameras"
        value={total}
        hint={`${healthyPct}% healthy`}
        icon={<Cctv size={18} />}
        tone="info"
      />
      <StatCard
        label="Avg health score"
        value={avgScore}
        hint="Fleet-wide, out of 100"
        icon={<Activity size={18} />}
        tone="success"
      />
      <StatCard
        label="Critical"
        value={critical}
        hint="Needs immediate attention"
        icon={<AlertTriangle size={18} />}
        tone="danger"
      />
      <StatCard
        label="Needs cleaning"
        value={needsCleaning}
        hint="Dust / image problems"
        icon={<Brush size={18} />}
        tone="warning"
      />
    </div>
  );
}
