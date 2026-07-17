import { cn } from '@/lib/utils';

// Overlapping initials avatars + "+N" overflow chip — the reference's
// shared-with stack (docs/04-uiux-brief.md §7, ActivityListCard rows).
interface AvatarStackProps {
  names: string[];
  overflow?: number;
  className?: string;
}

const DEFAULT_TONE = 'bg-sage-soft text-state-healthy';
const TONES = [
  DEFAULT_TONE,
  'bg-indigo-soft text-indigo',
  'bg-sand text-sand-deep',
  'bg-coral-soft text-coral',
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  return TONES[hash % TONES.length] ?? DEFAULT_TONE;
}

export function AvatarStack({ names, overflow = 0, className }: AvatarStackProps): JSX.Element {
  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {names.map((name) => (
        <span
          key={name}
          title={name}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-card',
            toneFor(name)
          )}
        >
          {initialsOf(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-hairline text-[11px] font-medium text-ink ring-2 ring-card">
          +{overflow}
        </span>
      )}
    </div>
  );
}
