import { useId, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { snappy } from '@/lib/animations';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading icon (e.g. a lucide-react icon element). */
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible name for the group — required so screen readers announce it. */
  ariaLabel: string;
  className?: string;
}

/**
 * Single-select segmented toggle with an animated sliding indicator.
 *
 * Semantics: `role="radiogroup"` + `role="radio"` (a segmented view switch is a
 * one-of-N choice, not a set of tab panels — this avoids an orphan `tablist`
 * with no associated `tabpanel`). Keyboard follows the WAI-ARIA radiogroup
 * pattern — roving `tabIndex` plus Arrow/Home/End with selection following
 * focus (none of the repo's existing tab bars implement this; added here
 * properly). The sliding pill uses a framer-motion `layoutId` that is unique
 * per instance (`useId`) so multiple controls never animate into one another,
 * and it is made instant under `prefers-reduced-motion`.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  const reduceMotion = useReducedMotion();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function moveTo(index: number) {
    const next = (index + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    buttonRefs.current[next]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveTo(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveTo(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-hairline bg-card p-1 shadow-soft',
        className
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-sage',
              active ? 'text-white' : 'text-muted hover:text-ink'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-sage shadow-sm"
                transition={reduceMotion ? { duration: 0 } : snappy}
                aria-hidden
              />
            )}
            {option.icon && <span className="relative z-10 flex">{option.icon}</span>}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
