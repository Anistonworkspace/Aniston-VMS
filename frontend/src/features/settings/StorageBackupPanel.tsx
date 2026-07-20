import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  SkeletonCard,
} from '@/components/ui';
import type { useToast } from '@/hooks/useToast';
import { getApiErrorMessage } from '@/lib/apiError';
import { pageChild } from '@/lib/animations';
import { cn } from '@/lib/utils';
import {
  useCreateBackupMutation,
  useListBackupsQuery,
  useListSitesQuery,
  useListStoragePoliciesQuery,
  useListZonesQuery,
  useUpsertStoragePolicyMutation,
} from './settings.api';
import { Select } from './Select';
import { Switch } from './Switch';
import type { BackupStatus, StoragePolicyModel, StorageScopeType } from './settings.types';

// Admin-only (backend: settings.router.ts requires SUPER_ADMIN/PROJECT_ADMIN;
// the tab itself is also hidden for other roles in SettingsPage.tsx).

interface PanelProps {
  toast: ReturnType<typeof useToast>;
}

const STATUS_PILL: Record<BackupStatus, string> = {
  QUEUED: 'bg-amber-50 text-amber-700',
  RUNNING: 'bg-indigo-50 text-indigo-700',
  DONE: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-600',
};

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isoDay = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);

export function StorageBackupPanel({ toast }: PanelProps) {
  const { data: policies, isLoading: policiesLoading } = useListStoragePoliciesQuery();
  const { data: zonesData } = useListZonesQuery({ limit: 100 });
  const { data: sitesData } = useListSitesQuery({ limit: 100 });
  const [upsertPolicy, { isLoading: savingPolicy }] = useUpsertStoragePolicyMutation();
  const [createBackup, { isLoading: creatingBackup }] = useCreateBackupMutation();

  // Poll the backup list while any backup is still queued/running.
  const [poll, setPoll] = useState(false);
  const { data: backups = [], isLoading: backupsLoading } = useListBackupsQuery(undefined, {
    pollingInterval: poll ? 4000 : 0,
  });
  useEffect(() => {
    setPoll(backups.some((b) => b.status === 'QUEUED' || b.status === 'RUNNING'));
  }, [backups]);

  const zones = useMemo(() => zonesData?.items ?? [], [zonesData]);
  const sites = useMemo(() => sitesData?.items ?? [], [sitesData]);
  const scopeNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zones) m.set(`ZONE:${z.id}`, z.name);
    for (const s of sites) m.set(`SITE:${s.id}`, s.name);
    return m;
  }, [zones, sites]);

  const [policyForm, setPolicyForm] = useState({
    scopeType: 'ZONE' as StorageScopeType,
    scopeId: '',
    storeClips: true,
    storeSnapshots: true,
  });
  const [backupForm, setBackupForm] = useState({
    scopeType: 'ZONE' as StorageScopeType,
    scopeId: '',
    rangeStart: isoDay(7 * 86_400_000),
    rangeEnd: isoDay(),
  });

  const scopeOptions = (type: StorageScopeType) =>
    (type === 'ZONE' ? zones : sites).map((s) => ({ value: s.id, label: s.name }));

  const handleSavePolicy = async () => {
    if (!policyForm.scopeId) {
      toast.error(`Select a ${policyForm.scopeType === 'ZONE' ? 'zone' : 'site'} first`);
      return;
    }
    try {
      const saved = await upsertPolicy(policyForm).unwrap();
      toast.success(`Storage policy saved for ${saved.scopeName}`);
      setPolicyForm((f) => ({ ...f, scopeId: '' }));
    } catch (err) {
      toast.error(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  const togglePolicy = async (p: StoragePolicyModel, field: 'storeClips' | 'storeSnapshots') => {
    try {
      await upsertPolicy({
        scopeType: p.scopeType,
        scopeId: p.scopeId,
        storeClips: field === 'storeClips' ? !p.storeClips : p.storeClips,
        storeSnapshots: field === 'storeSnapshots' ? !p.storeSnapshots : p.storeSnapshots,
      }).unwrap();
      toast.success(`Policy updated for ${p.scopeName}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  const handleCreateBackup = async () => {
    if (!backupForm.scopeId) {
      toast.error(`Select a ${backupForm.scopeType === 'ZONE' ? 'zone' : 'site'} first`);
      return;
    }
    if (backupForm.rangeStart > backupForm.rangeEnd) {
      toast.error('Backup range start must be before its end');
      return;
    }
    try {
      await createBackup(backupForm).unwrap();
      toast.success('Backup queued — it will appear below when ready');
    } catch (err) {
      toast.error(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  return (
    <motion.div variants={pageChild} className="space-y-6">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Storage policies</CardTitle>
            <CardDescription>
              Enable or disable clip and snapshot storage per zone or per site. Without a policy,
              storage is enabled by default.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="space-y-5">
          <div className="grid items-end gap-3 sm:grid-cols-[8rem,1fr,auto,auto,auto]">
            <Select
              label="Scope"
              options={[
                { value: 'ZONE', label: 'Zone' },
                { value: 'SITE', label: 'Site' },
              ]}
              value={policyForm.scopeType}
              onChange={(e) =>
                setPolicyForm((f) => ({
                  ...f,
                  scopeType: e.target.value as StorageScopeType,
                  scopeId: '',
                }))
              }
            />
            <Select
              label={policyForm.scopeType === 'ZONE' ? 'Zone' : 'Site'}
              placeholder={`Select ${policyForm.scopeType === 'ZONE' ? 'zone' : 'site'}`}
              options={scopeOptions(policyForm.scopeType)}
              value={policyForm.scopeId}
              onChange={(e) => setPolicyForm((f) => ({ ...f, scopeId: e.target.value }))}
            />
            <Switch
              label="Clips"
              checked={policyForm.storeClips}
              onChange={(v) => setPolicyForm((f) => ({ ...f, storeClips: v }))}
            />
            <Switch
              label="Snapshots"
              checked={policyForm.storeSnapshots}
              onChange={(v) => setPolicyForm((f) => ({ ...f, storeSnapshots: v }))}
            />
            <Button onClick={handleSavePolicy} disabled={savingPolicy}>
              {savingPolicy ? 'Saving…' : 'Save policy'}
            </Button>
          </div>

          {policiesLoading ? (
            <SkeletonCard />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-4 font-medium">Scope</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Clips</th>
                    <th className="py-2 pr-4 font-medium">Snapshots</th>
                    <th className="py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(policies ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-800">{p.scopeName}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {p.scopeType}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <Switch
                          checked={p.storeClips}
                          onChange={() => togglePolicy(p, 'storeClips')}
                          disabled={savingPolicy}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <Switch
                          checked={p.storeSnapshots}
                          onChange={() => togglePolicy(p, 'storeSnapshots')}
                          disabled={savingPolicy}
                        />
                      </td>
                      <td className="py-2 text-xs text-gray-500">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(policies ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-gray-400">
                        No storage policies yet — defaults apply everywhere.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Snapshot backups</CardTitle>
            <CardDescription>
              Export a ZIP of original snapshots (with manifest) for a zone or site over a date
              range.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="space-y-5">
          <div className="grid items-end gap-3 sm:grid-cols-[8rem,1fr,auto,auto,auto]">
            <Select
              label="Scope"
              options={[
                { value: 'ZONE', label: 'Zone' },
                { value: 'SITE', label: 'Site' },
              ]}
              value={backupForm.scopeType}
              onChange={(e) =>
                setBackupForm((f) => ({
                  ...f,
                  scopeType: e.target.value as StorageScopeType,
                  scopeId: '',
                }))
              }
            />
            <Select
              label={backupForm.scopeType === 'ZONE' ? 'Zone' : 'Site'}
              placeholder={`Select ${backupForm.scopeType === 'ZONE' ? 'zone' : 'site'}`}
              options={scopeOptions(backupForm.scopeType)}
              value={backupForm.scopeId}
              onChange={(e) => setBackupForm((f) => ({ ...f, scopeId: e.target.value }))}
            />
            <Input
              label="From"
              type="date"
              value={backupForm.rangeStart}
              onChange={(e) => setBackupForm((f) => ({ ...f, rangeStart: e.target.value }))}
            />
            <Input
              label="To"
              type="date"
              value={backupForm.rangeEnd}
              onChange={(e) => setBackupForm((f) => ({ ...f, rangeEnd: e.target.value }))}
            />
            <Button onClick={handleCreateBackup} disabled={creatingBackup}>
              {creatingBackup ? 'Queuing…' : 'Create backup'}
            </Button>
          </div>

          {backupsLoading ? (
            <SkeletonCard />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-4 font-medium">Requested</th>
                    <th className="py-2 pr-4 font-medium">Scope</th>
                    <th className="py-2 pr-4 font-medium">Range</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">By</th>
                    <th className="py-2 font-medium">File</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 text-xs text-gray-500">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 font-medium text-gray-800">
                        {scopeNames.get(`${b.scopeType}:${b.scopeId}`) ?? b.scopeType}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-500">
                        {new Date(b.rangeStart).toLocaleDateString()} –{' '}
                        {new Date(b.rangeEnd).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_PILL[b.status]
                          )}
                          title={b.error ?? undefined}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{fmtBytes(b.sizeBytes)}</td>
                      <td className="py-2 pr-4 text-xs text-gray-500">{b.requesterName ?? '—'}</td>
                      <td className="py-2">
                        {b.downloadUrl ? (
                          <a
                            href={b.downloadUrl}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            download
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-sm text-gray-400">
                        No backups yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
