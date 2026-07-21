import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const iconToneMap: Record<StatTone, string> = {
  default: 'bg-state-unknown-soft text-state-unknown',
  success: 'bg-state-healthy-soft text-state-healthy',
  warning: 'bg-state-warning-soft text-state-warning',
  danger: 'bg-state-critical-soft text-state-critical',
  info: 'bg-state-maintenance-soft text-state-maintenance',
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  tone?: StatTone;
}

/** Small metric tile used in the summary rows above each report's table (Uptime + Incidents panels). */
export function StatCard({ label, value, icon, hint, tone = 'default' }: StatCardProps) {
  return (
    <Card padding="sm" className="flex items-start gap-3">
      {icon && (
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            iconToneMap[tone]
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="font-heading text-xl font-semibold text-ink">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  );
}
