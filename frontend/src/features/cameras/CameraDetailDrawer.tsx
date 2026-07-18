import { useEffect, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import {
  Activity,
  Camera as CameraIcon,
  CheckCircle2,
  Circle,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Button, Drawer, Skeleton } from '@/components/ui';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { isOperatorPlusRole } from '@/features/auth/auth.types';
import type { Role } from '@/features/auth/auth.types';
import { timeAgo } from '@/features/overview/timeAgo';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { CameraStatusBadge } from './CameraStatusBadge';
import { prettyEnum } from '@/lib/prettyEnum';
import {
  useCaptureSnapshotMutation,
  useGetCameraHealthQuery,
  useListCameraChecksQuery,
  useListCameraSnapshotsQuery,
  useRunCameraCheckMutation,
  useUpdateCameraMutation,
} from './cameras.api';
import type { PipelineStage } from './cameras.types';

// PATCH /cameras/:id guard — mirrors camera.router.ts CAMERA_WRITE_ROLES.
const WRITE_ROLES: readonly Role[] = ['SUPER_ADMIN', 'PROJECT_ADMIN', 'ENGINEER'];

const STAGE_LABELS: Record<string, string> = {
  ROUTER_TCP: 'Router reachable',
  RTSP_PORT: 'RTSP port open',
  RTSP_AUTH: 'RTSP authentication',
  VIDEO_VALIDATION: 'Video stream valid',
};

function PipelineRow({ stage }: { stage: PipelineStage }): JSX.Element {
  const ok = stage.success;
  return (
    <li className="rounded-tile bg-card px-4 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        {ok === true ? (
          <CheckCircle2 size={17} strokeWidth={1.5} className="shrink-0 text-state-healthy" />
        ) : ok === false ? (
          <XCircle size={17} strokeWidth={1.5} className="shrink-0 text-state-critical" />
        ) : (
          <Circle size={17} strokeWidth={1.5} className="shrink-0 text-gray-300" />
        )}
        <span className="flex-1 text-sm font-medium text-ink">
          {STAGE_LABELS[stage.checkType] ?? prettyEnum(stage.checkType)}
        </span>
        {typeof stage.responseTimeMs === 'number' && (
          <span className="text-xs tabular-nums text-gray-500">{stage.responseTimeMs} ms</span>
        )}
      </div>
      {ok === false && (stage.errorMessage ?? stage.errorCode) && (
        <p className="mt-1.5 pl-8 text-xs text-state-critical">
          {stage.errorCode ? `${stage.errorCode} — ` : ''}
          {stage.errorMessage ?? 'Check failed'}
        </p>
      )}
      {ok === true &&
        stage.checkType === 'VIDEO_VALIDATION' &&
        (stage.codec ?? stage.resolution) && (
          <p className="mt-1.5 pl-8 text-xs text-gray-500">
            {[
              stage.codec,
              stage.resolution,
              stage.fps ? `${stage.fps} fps` : null,
              stage.bitrateKbps ? `${stage.bitrateKbps} kbps` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      {ok == null && (
        <p className="mt-1.5 pl-8 text-xs text-gray-400">No result yet — run a diagnostic.</p>
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value?: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || '—'}</dd>
    </div>
  );
}

export interface CameraDetailDrawerProps {
  /** null = closed (drawer animates out while keeping the last camera rendered). */
  cameraId: string | null;
  onClose: () => void;
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
}

export function CameraDetailDrawer({
  cameraId,
  onClose,
  notify,
}: CameraDetailDrawerProps): JSX.Element {
  // Keep the last id while the drawer animates out (cameraId is null on exit).
  const [id, setId] = useState(cameraId);
  useEffect(() => {
    if (cameraId) setId(cameraId);
  }, [cameraId]);

  const { data: user } = useGetCurrentUserQuery();
  const canOperate = isOperatorPlusRole(user?.role);
  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  const { data: health, isLoading, error, refetch } = useGetCameraHealthQuery(id ?? skipToken);
  const { data: checks } = useListCameraChecksQuery(id ? { cameraId: id, hours: 24 } : skipToken);
  const { data: snapshots } = useListCameraSnapshotsQuery(
    id ? { cameraId: id, hours: 24, limit: 8 } : skipToken
  );

  const [runCheck, { isLoading: running }] = useRunCameraCheckMutation();
  const [updateCamera, { isLoading: saving }] = useUpdateCameraMutation();
  const [capture, { isLoading: capturing }] = useCaptureSnapshotMutation();

  async function handleRunCheck(): Promise<void> {
    if (!id) return;
    try {
      const result = await runCheck(id).unwrap();
      notify.success('Diagnostic complete', result.diagnosisText ?? 'All pipeline stages passed.');
    } catch (err) {
      notify.error('Diagnostic failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  async function handleToggleMaintenance(): Promise<void> {
    if (!id || !health) return;
    const next = !health.maintenanceMode;
    try {
      await updateCamera({ id, body: { maintenanceMode: next } }).unwrap();
      notify.success(
        next ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
        next ? 'Health alerts for this camera are suppressed.' : 'Health monitoring resumed.'
      );
    } catch (err) {
      notify.error('Update failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  async function handleCapture(): Promise<void> {
    if (!id) return;
    try {
      await capture(id).unwrap();
      notify.success('Snapshot captured', 'The fresh frame appears in the strip below.');
    } catch (err) {
      notify.error('Capture failed', getApiErrorMessage(err as FetchBaseQueryError));
    }
  }

  return (
    <Drawer
      open={cameraId !== null}
      onClose={onClose}
      title={
        health ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate font-heading text-lg font-semibold text-ink">
                {health.name}
              </h2>
              <CameraStatusBadge status={health.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {health.cameraCode}
              {health.site ? ` · ${health.site.name}` : ''}
            </p>
          </div>
        ) : (
          <Skeleton variant="line" width="50%" />
        )
      }
    >
      {error ? (
        <div className="rounded-card bg-card p-8 text-center shadow-soft">
          <p className="text-sm text-gray-600">{getApiErrorMessage(error)}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !health ? (
        <div className="space-y-4">
          <Skeleton height={72} />
          <Skeleton height={180} />
          <Skeleton height={120} />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Health score
              </p>
              <p className="font-heading text-3xl font-semibold text-ink">
                {health.healthScore}
                <span className="text-base font-normal text-gray-400"> /100</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {health.lastHealthyAt
                  ? `Last healthy ${timeAgo(health.lastHealthyAt)}`
                  : 'Never seen healthy'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canOperate && (
                <Button
                  size="sm"
                  loading={running}
                  onClick={handleRunCheck}
                  leftIcon={<Activity size={14} />}
                >
                  Run diagnostic
                </Button>
              )}
              {canOperate && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={capturing}
                  onClick={handleCapture}
                  leftIcon={<CameraIcon size={14} />}
                >
                  Capture snapshot
                </Button>
              )}
              {canWrite && (
                <Button
                  variant={health.maintenanceMode ? 'outline' : 'ghost'}
                  size="sm"
                  loading={saving}
                  onClick={handleToggleMaintenance}
                  leftIcon={<Wrench size={14} />}
                >
                  {health.maintenanceMode ? 'End maintenance' : 'Start maintenance'}
                </Button>
              )}
            </div>
          </section>

          {health.diagnosisText && (
            <div
              className={cn(
                'rounded-tile px-4 py-3 text-sm font-medium',
                health.status === 'CRITICAL'
                  ? 'bg-state-critical-soft text-state-critical'
                  : 'bg-state-warning-soft text-state-warning'
              )}
            >
              {health.diagnosisText}
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold text-ink">Connection pipeline</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Latest result per stage, router → stream.
            </p>
            <ol className="mt-3 space-y-2">
              {health.pipeline.map((stage) => (
                <PipelineRow key={stage.checkType} stage={stage} />
              ))}
            </ol>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Recent snapshots (24 h)</h3>
            {snapshots && snapshots.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {snapshots.map((snapshot) => (
                  <a
                    key={snapshot.id}
                    href={snapshot.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open full snapshot"
                    className="relative block h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-charcoal/10"
                  >
                    <img
                      src={snapshot.thumbUrl}
                      alt={`Snapshot from ${timeAgo(snapshot.capturedAt)}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-[10px] text-white">
                      {timeAgo(snapshot.capturedAt)}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                No snapshots captured in the last 24 hours.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Device</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail label="Site" value={health.site?.name} />
              <Detail
                label="Router"
                value={
                  health.router
                    ? [
                        prettyEnum(health.router.connectionStatus),
                        health.router.signalStrength != null
                          ? `${health.router.signalStrength} dBm`
                          : null,
                        health.router.operator,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : undefined
                }
              />
              <Detail label="Expected codec" value={health.expectedCodec ?? undefined} />
              <Detail
                label="Expected stream"
                value={
                  [
                    health.expectedResolution,
                    health.expectedFps ? `${health.expectedFps} fps` : null,
                    health.expectedBitrateKbps ? `${health.expectedBitrateKbps} kbps` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Checks (last 24 h)</h3>
            {checks && checks.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {checks.slice(0, 15).map((check) => (
                  <li
                    key={check.id}
                    className="flex items-center gap-2.5 rounded-lg bg-card px-3 py-2 text-xs shadow-soft"
                  >
                    {check.success ? (
                      <CheckCircle2
                        size={14}
                        strokeWidth={1.5}
                        className="shrink-0 text-state-healthy"
                      />
                    ) : (
                      <XCircle
                        size={14}
                        strokeWidth={1.5}
                        className="shrink-0 text-state-critical"
                      />
                    )}
                    <span className="shrink-0 font-medium text-ink">
                      {STAGE_LABELS[check.checkType] ?? prettyEnum(check.checkType)}
                    </span>
                    {!check.success && check.errorMessage && (
                      <span className="min-w-0 flex-1 truncate text-gray-500">
                        {check.errorMessage}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 tabular-nums text-gray-400">
                      {typeof check.responseTimeMs === 'number'
                        ? `${check.responseTimeMs} ms · `
                        : ''}
                      {timeAgo(check.startedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-gray-500">No checks recorded in the last 24 hours.</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
