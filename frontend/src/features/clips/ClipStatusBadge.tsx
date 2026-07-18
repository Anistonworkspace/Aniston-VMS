import { Badge } from '@/components/ui';
import type { ClipStatus } from './clips.types';

const STATUS_META: Record<
  ClipStatus,
  { label: string; variant: 'info' | 'warning' | 'success' | 'danger' }
> = {
  QUEUED: { label: 'Queued', variant: 'info' },
  PROCESSING: { label: 'Processing', variant: 'warning' },
  DONE: { label: 'Done', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
};

export function ClipStatusBadge({ status }: { status: ClipStatus }): JSX.Element {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} dot>
      {meta.label}
    </Badge>
  );
}
