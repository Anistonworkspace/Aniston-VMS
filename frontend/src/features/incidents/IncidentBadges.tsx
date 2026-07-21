import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { prettyEnum } from '@/lib/prettyEnum';
import { SEVERITY_VARIANT, STATUS_CHIP } from './incidents.constants';
import type { IncidentSeverity, IncidentStatus } from './incidents.types';

export function SeverityBadge({ severity }: { severity: IncidentSeverity }): JSX.Element {
  return (
    <Badge variant={SEVERITY_VARIANT[severity]} size="sm" dot>
      {prettyEnum(severity)}
    </Badge>
  );
}

export function IncidentStatusChip({
  status,
  className,
}: {
  status: IncidentStatus;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_CHIP[status] ?? 'bg-surface text-muted',
        className
      )}
    >
      {prettyEnum(status)}
    </span>
  );
}
