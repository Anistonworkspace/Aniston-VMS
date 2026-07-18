import { useMemo, useState } from 'react';
import { BellRing, ScrollText, ShieldCheck, Users, Workflow, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkeletonTable } from '@/components/ui';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { canManageEscalation, canReadUsers, canViewAuditLog } from './admin.types';
import { UsersTab } from './UsersTab';
import { EscalationTab } from './EscalationTab';
import { NotificationsTab } from './NotificationsTab';
import { AuditLogTab } from './AuditLogTab';

type AdminTabId = 'users' | 'escalation' | 'notifications' | 'audit';

interface TabDef {
  id: AdminTabId;
  label: string;
  icon: LucideIcon;
}

/**
 * Administration hub — tab visibility mirrors the backend role guards:
 *  Users        SUPER_ADMIN / PROJECT_ADMIN (mutations SUPER_ADMIN only)
 *  Escalation   SUPER_ADMIN / PROJECT_ADMIN
 *  Notifications any authenticated role (rows are access-scope filtered)
 *  Audit log    SUPER_ADMIN / AUDITOR
 */
export function AdminPage(): JSX.Element {
  const { data: me, isLoading } = useGetCurrentUserQuery();
  const role = me?.role;
  const [selected, setSelected] = useState<AdminTabId | null>(null);

  const tabs = useMemo<TabDef[]>(() => {
    const list: TabDef[] = [];
    if (canReadUsers(role)) list.push({ id: 'users', label: 'Users', icon: Users });
    if (canManageEscalation(role))
      list.push({ id: 'escalation', label: 'Escalation', icon: Workflow });
    if (role) list.push({ id: 'notifications', label: 'Notifications', icon: BellRing });
    if (canViewAuditLog(role)) list.push({ id: 'audit', label: 'Audit log', icon: ScrollText });
    return list;
  }, [role]);

  const activeTab: AdminTabId | null =
    selected && tabs.some((tab) => tab.id === selected) ? selected : (tabs[0]?.id ?? null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-card bg-card p-6 shadow-soft">
          <SkeletonTable rows={6} />
        </div>
      </div>
    );
  }

  if (!activeTab) {
    return (
      <div className="rounded-card bg-card p-10 text-center shadow-soft">
        <ShieldCheck size={28} strokeWidth={1.5} className="mx-auto text-gray-300" />
        <p className="mt-3 text-sm font-medium text-ink">No administrative access</p>
        <p className="mt-1 text-sm text-gray-500">
          Your role does not include any administration capabilities.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Administration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Users &amp; access scopes, escalation rules, alert delivery and the compliance trail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Administration sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setSelected(id)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                activeTab === id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/70 text-gray-600 hover:bg-white hover:text-gray-900'
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'escalation' && <EscalationTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'audit' && <AuditLogTab />}
    </div>
  );
}
