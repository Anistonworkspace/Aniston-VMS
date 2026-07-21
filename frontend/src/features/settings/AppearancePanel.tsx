import { motion } from 'framer-motion';
import { Laptop, Moon, Sun } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import type { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { pageChild } from '@/lib/animations';
import { Switch } from './Switch';
import { useAppearancePrefs, type ThemeMode } from './useAppearancePrefs';

interface PanelProps {
  toast: ReturnType<typeof useToast>;
}

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Laptop },
];

export function AppearancePanel({ toast }: PanelProps) {
  const { prefs, update } = useAppearancePrefs();

  return (
    <motion.div variants={pageChild} className="space-y-6">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Choose how Aniston VMS looks on this device.</CardDescription>
          </div>
        </CardHeader>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = prefs.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  update('theme', opt.id);
                  toast.success(`Theme set to ${opt.label}`);
                }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                  active
                    ? 'border-sage bg-sage-soft text-sage'
                    : 'border-hairline bg-card text-muted hover:border-hairline'
                )}
                aria-pressed={active}
              >
                <Icon className="h-5 w-5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Layout</CardTitle>
            <CardDescription>Adjust density and motion to your preference.</CardDescription>
          </div>
        </CardHeader>
        <div className="divide-y divide-hairline">
          <div className="py-3 first:pt-0 last:pb-0">
            <Switch
              checked={prefs.density === 'compact'}
              onChange={(checked) => update('density', checked ? 'compact' : 'comfortable')}
              label="Compact tables"
              description="Reduce row height and padding in lists and tables."
            />
          </div>
          <div className="py-3 first:pt-0 last:pb-0">
            <Switch
              checked={prefs.reduceMotion}
              onChange={(checked) => update('reduceMotion', checked)}
              label="Reduce motion"
              description="Minimize animation and transition effects."
            />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default AppearancePanel;
