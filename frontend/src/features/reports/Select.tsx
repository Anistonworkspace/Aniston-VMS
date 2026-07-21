import { useId } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Local select primitive — components/ui has no Select yet. Built from
// @radix-ui/react-select in the same visual language as components/ui/Input.tsx
// (rounded-lg border bg-card/70 ...).

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  className?: string;
}

// Radix disallows an empty-string item value, but "" is exactly what an
// "All regions" style option needs to mean here — map it to this sentinel
// at the Radix boundary only, the outside world never sees it.
const ALL_VALUE = '__all__';

export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  hint,
  className,
}: SelectProps) {
  // useId keeps the label→trigger wiring valid even when two Selects share the
  // same label text on one page (e.g. the Clips filter bar's "Camera" and the
  // New-clip dialog's "Camera") — a slug-only id duplicates and the <label>
  // then resolves to the first match document-wide, leaving this one nameless.
  const uniqueId = useId();
  const selectId = label
    ? `report-select-${label.toLowerCase().replace(/\s+/g, '-')}-${uniqueId.replace(/:/g, '')}`
    : undefined;
  // Radix's trigger is a <button>, and browsers do not compute an accessible
  // name for buttons from an associated <label> (that only works for native
  // inputs) — wire the name explicitly via aria-labelledby.
  const labelId = selectId ? `${selectId}-label` : undefined;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label id={labelId} htmlFor={selectId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <SelectPrimitive.Root
        value={value === '' ? ALL_VALUE : value}
        onValueChange={(v) => onValueChange(v === ALL_VALUE ? '' : v)}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={selectId}
          aria-labelledby={labelId}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border bg-card/70 text-sm text-ink',
            'border-hairline hover:border-muted px-3.5 py-2 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-indigo focus:border-indigo',
            'disabled:cursor-not-allowed disabled:bg-hairline/50 disabled:text-muted',
            'data-[placeholder]:text-muted',
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-64 overflow-hidden rounded-lg border border-hairline bg-card shadow-soft"
          >
            <SelectPrimitive.Viewport className="max-h-64 p-1">
              {options.map((opt) => {
                const itemValue = opt.value === '' ? ALL_VALUE : opt.value;
                return (
                  <SelectPrimitive.Item
                    key={itemValue}
                    value={itemValue}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 pr-8 text-sm text-ink outline-none',
                      'data-[highlighted]:bg-indigo-soft data-[highlighted]:text-indigo'
                    )}
                  >
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                      <Check className="h-4 w-4" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
