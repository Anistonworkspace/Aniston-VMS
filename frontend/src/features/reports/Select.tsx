import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Local select primitive — components/ui has no Select yet. Built from
// @radix-ui/react-select in the same visual language as components/ui/Input.tsx
// (rounded-lg border bg-white/70 backdrop-blur-sm ...).

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
  const selectId = label ? `report-select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700">
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
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border bg-white/70 backdrop-blur-sm text-sm text-gray-900',
            'border-gray-200 hover:border-gray-300 px-3.5 py-2 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
            'disabled:cursor-not-allowed disabled:bg-gray-100/50 disabled:text-gray-400',
            'data-[placeholder]:text-gray-400',
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-64 overflow-hidden rounded-lg border border-white/30 bg-white/95 shadow-glass backdrop-blur-md"
          >
            <SelectPrimitive.Viewport className="max-h-64 p-1">
              {options.map((opt) => {
                const itemValue = opt.value === '' ? ALL_VALUE : opt.value;
                return (
                  <SelectPrimitive.Item
                    key={itemValue}
                    value={itemValue}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 pr-8 text-sm text-gray-800 outline-none',
                      'data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700'
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
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
