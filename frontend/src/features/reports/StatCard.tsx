import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const iconToneMap: Record<StatTone, string> = {
  default: 'bg-gray-100 text-gray-600',
  success: 'bg-emerald-100 text-emerald-600',
  warning: 'bg-amber-100 text-amber-600',
  danger: 'bg-red-100 text-red-600',
  info: 'bg-sky-100 text-sky-600',
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
        <p className="truncate text-xs font-medium text-gray-500">{label}</p>
        <p className="font-sora text-xl font-semibold text-gray-900">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-gray-400">{hint}</p>}
      </div>
    </Card>
  );
}
