import { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, Shield, User as UserIcon, Waypoints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pageChild, pageTransition } from '@/lib/animations';
import { ToastContainer } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { ProfilePanel } from './ProfilePanel';
import { SecurityPanel } from './SecurityPanel';
import { AppearancePanel } from './AppearancePanel';
import { HierarchyPanel } from './HierarchyPanel';

type TabId = 'profile' | 'security' | 'appearance' | 'hierarchy';

const TABS: Array<{ id: TabId; label: string; icon: typeof UserIcon; description: string }> = [
  {
    id: 'profile',
    label: 'Profile',
    icon: UserIcon,
    description: 'Your account details and access scopes',
  },
  {
    id: 'security',
    label: 'Security',
    icon: Shield,
    description: 'Password and two-factor authentication',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'Theme and display preferences',
  },
  {
    id: 'hierarchy',
    label: 'Hierarchy',
    icon: Waypoints,
    description: 'Regions, zones, sites and routers',
  },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const toast = useToast();

  return (
    <motion.div
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <motion.div variants={pageChild}>
        <h1 className="font-sora text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your profile, security, appearance and site hierarchy.
        </p>
      </motion.div>

      <motion.div
        variants={pageChild}
        className="flex flex-wrap gap-1.5 rounded-2xl border border-white/30 bg-white/60 p-1.5 shadow-glass backdrop-blur-md"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                active ? 'text-white' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
              )}
            >
              {active && (
                <motion.span
                  layoutId="settings-tab-pill"
                  className="absolute inset-0 rounded-xl bg-indigo-600 shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </motion.div>

      <motion.div variants={pageChild} className="text-xs uppercase tracking-wide text-gray-400">
        {TABS.find((t) => t.id === activeTab)?.description}
      </motion.div>

      <motion.div key={activeTab} variants={pageChild} initial="hidden" animate="visible">
        {activeTab === 'profile' && <ProfilePanel />}
        {activeTab === 'security' && <SecurityPanel toast={toast} />}
        {activeTab === 'appearance' && <AppearancePanel toast={toast} />}
        {activeTab === 'hierarchy' && <HierarchyPanel toast={toast} />}
      </motion.div>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </motion.div>
  );
}

export default SettingsPage;
