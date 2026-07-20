import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Database, HardDrive } from 'lucide-react';
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
import {
  useGetCapacityOverviewQuery,
  useGetSystemSettingsQuery,
  useUpdateSystemSettingsMutation,
} from './settings.api';
import type { SystemSettings } from './settings.types';

// Admin-only (backend: settings.router.ts requires SUPER_ADMIN/PROJECT_ADMIN;
// the tab itself is also hidden for other roles in SettingsPage.tsx).

interface PanelProps {
  toast: ReturnType<typeof useToast>;
}

type SettingKey = keyof SystemSettings;

// Bounds mirror backend updateSystemSettingsSchema (settings.schemas.ts).
const FIELDS: Array<{ key: SettingKey; label: string; min: number; max: number }> = [
  { key: 'retention_days', label: 'Retention (days)', min: 1, max: 3650 },
  { key: 'compression_quality', label: 'Compression quality (%)', min: 10, max: 100 },
  { key: 'max_live_sessions_global', label: 'Max live sessions — global', min: 1, max: 10_000 },
  { key: 'max_live_sessions_per_site', label: 'Max live sessions — per site', min: 1, max: 1_000 },
];

export function SystemCapacityPanel({ toast }: PanelProps) {
  const { data: settings, isLoading: settingsLoading } = useGetSystemSettingsQuery();
  const { data: capacity, isLoading: capacityLoading } = useGetCapacityOverviewQuery();
  const [updateSettings, { isLoading: saving }] = useUpdateSystemSettingsMutation();
  const [draft, setDraft] = useState<Record<SettingKey, string> | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft({
        retention_days: String(settings.retention_days),
        compression_quality: String(settings.compression_quality),
        max_live_sessions_global: String(settings.max_live_sessions_global),
        max_live_sessions_per_site: String(settings.max_live_sessions_per_site),
      });
    }
  }, [settings]);

  const dirty =
    !!settings && !!draft && FIELDS.some((f) => draft[f.key] !== String(settings[f.key]));

  const handleSave = async () => {
    if (!settings || !draft) return;
    const patch: Partial<SystemSettings> = {};
    for (const f of FIELDS) {
      const n = Number(draft[f.key]);
      if (!Number.isFinite(n) || n < f.min || n > f.max) {
        toast.error(`${f.label} must be between ${f.min} and ${f.max}`);
        return;
      }
      if (n !== settings[f.key]) patch[f.key] = n;
    }
    if (Object.keys(patch).length === 0) return;
    try {
      await updateSettings(patch).unwrap();
      toast.success('System settings updated');
    } catch (err) {
      toast.error(getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  return (
    <motion.div variants={pageChild} className="space-y-6">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>System settings</CardTitle>
            <CardDescription>
              Retention, compression and live-stream caps. Caps are enforced by the backend when
              live sessions start.
            </CardDescription>
          </div>
        </CardHeader>
        {settingsLoading || !draft ? (
          <SkeletonCard />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <Input
                  key={f.key}
                  label={`${f.label} (${f.min}–${f.max})`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Capacity overview</CardTitle>
            <CardDescription>
              Live-session usage against caps, plus storage estimates from each camera&apos;s
              expected bitrate.
            </CardDescription>
          </div>
        </CardHeader>
        {capacityLoading || !capacity ? (
          <SkeletonCard />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-100 bg-white/70 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <Activity className="h-3.5 w-3.5" /> Live sessions
                </div>
                <p className="mt-1.5 font-sora text-xl font-semibold text-gray-900">
                  {capacity.live.activeGlobal}
                  <span className="text-sm font-normal text-gray-400">
                    {' '}
                    / {capacity.caps.maxLiveSessionsGlobal}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {capacity.caps.maxLiveSessionsPerSite} per site ·{' '}
                  {capacity.caps.perCameraStreamCap} per camera
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white/70 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <HardDrive className="h-3.5 w-3.5" /> Est. storage / day
                </div>
                <p className="mt-1.5 font-sora text-xl font-semibold text-gray-900">
                  {capacity.storage.estimatedDailyGb} GB
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {capacity.storage.cameraCount} cameras · quality{' '}
                  {capacity.storage.compressionQuality}%
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white/70 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <Database className="h-3.5 w-3.5" /> Retained footprint
                </div>
                <p className="mt-1.5 font-sora text-xl font-semibold text-gray-900">
                  {capacity.storage.estimatedRetainedGb} GB
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  at {capacity.storage.retentionDays}-day retention
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-4 font-medium">Site</th>
                    <th className="py-2 pr-4 font-medium">Zone</th>
                    <th className="py-2 pr-4 font-medium">Cameras</th>
                    <th className="py-2 pr-4 font-medium">Live now</th>
                    <th className="py-2 font-medium">Est. GB/day</th>
                  </tr>
                </thead>
                <tbody>
                  {capacity.perSite.map((row) => (
                    <tr key={row.siteId} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-800">{row.siteName}</td>
                      <td className="py-2 pr-4 text-gray-500">{row.zoneName}</td>
                      <td className="py-2 pr-4 text-gray-700">{row.cameraCount}</td>
                      <td className="py-2 pr-4 text-gray-700">
                        {row.activeLiveSessions}
                        <span className="text-gray-400">
                          {' '}
                          / {capacity.caps.maxLiveSessionsPerSite}
                        </span>
                      </td>
                      <td className="py-2 text-gray-700">{row.estimatedDailyGb}</td>
                    </tr>
                  ))}
                  {capacity.perSite.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-gray-400">
                        No sites yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
