import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { snappy } from '@/lib/animations';

// Local primitive — no Switch in components/ui/index.ts yet. Styled to match
// the rest of the ui kit (indigo primary, snappy spring per lib/animations.ts).
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  return (
    <div
      className={cn('flex items-center justify-between gap-4', disabled && 'opacity-50', className)}
    >
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1',
          checked ? 'bg-sage' : 'bg-hairline',
          disabled && 'cursor-not-allowed'
        )}
      >
        <motion.span
          layout
          transition={snappy}
          className="block h-5 w-5 rounded-full bg-white shadow"
          style={{ marginLeft: checked ? 22 : 2 }}
        />
      </button>
    </div>
  );
}
