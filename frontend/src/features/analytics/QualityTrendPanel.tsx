import { useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { Select } from '@/features/reports/Select';
import { useGetCameraQualityQuery } from './analytics.api';
import { QUALITY_RANGE_OPTIONS } from './analytics.types';
import type { CameraHealthRow } from './analytics.types';

/** successRate is stored as a 0–1 ratio; tolerate 0–100 defensively. */
function toPct(rate: number): number {
  return Math.round((rate <= 1 ? rate * 100 : rate) * 10) / 10;
}

const hourFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayHourFmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
});

/** ConnectionQualityHourly series for one camera (GET /cameras/:id/health/quality). */
export function QualityTrendPanel({ cameras }: { cameras: CameraHealthRow[] }): JSX.Element {
  const [selectedId, setSelectedId] = useState('');
  const [hours, setHours] = useState<number>(QUALITY_RANGE_OPTIONS[0].hours);
  // Default to the first camera (backend orders worst-first) until the user picks one.
  const cameraId = selectedId || cameras[0]?.id || '';

  const { data, isFetching, error } = useGetCameraQualityQuery(
    cameraId ? { cameraId, hours } : skipToken
  );

  const points = (data ?? []).map((point) => ({
    hour: point.hour,
    successPct: toPct(point.successRate),
    latencyMs: point.medianLatencyMs,
    jitterMs: point.jitterMs,
  }));
  const tickFmt = hours > 48 ? dayHourFmt : hourFmt;
  const minSignal = (data ?? []).reduce<number | null>(
    (min, point) =>
      point.minSignalDbm === null
        ? min
        : min === null
          ? point.minSignalDbm
          : Math.min(min, point.minSignalDbm),
    null
  );

  return (
    <Card>
      <CardHeader className="mb-2 flex-wrap">
        <div>
          <CardTitle>Connection quality</CardTitle>
          <CardDescription>
            Hourly success rate, median latency and jitter per camera
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-60">
            <Select
              value={cameraId}
              onValueChange={setSelectedId}
              options={cameras.map((camera) => ({
                value: camera.id,
                label: `${camera.name} (${camera.cameraCode})`,
              }))}
              placeholder="Select camera…"
              disabled={cameras.length === 0}
            />
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-white/70 p-0.5">
            {QUALITY_RANGE_OPTIONS.map((option) => (
              <button
                key={option.hours}
                type="button"
                onClick={() => setHours(option.hours)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  hours === option.hours
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      {!cameraId ? (
        <p className="py-10 text-center text-sm text-gray-500">No cameras in scope.</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-600">{getApiErrorMessage(error)}</p>
      ) : isFetching && points.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : points.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          No quality samples recorded for this window yet.
        </p>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(value: string) => tickFmt.format(new Date(value))}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="pct"
                  domain={[0, 100]}
                  unit="%"
                  width={44}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                />
                <YAxis
                  yAxisId="ms"
                  orientation="right"
                  unit="ms"
                  width={52}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                />
                <Tooltip labelFormatter={(value) => dayHourFmt.format(new Date(String(value)))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  yAxisId="pct"
                  type="monotone"
                  dataKey="successPct"
                  name="Success rate"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.12}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="ms"
                  type="monotone"
                  dataKey="latencyMs"
                  name="Median latency"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  yAxisId="ms"
                  type="monotone"
                  dataKey="jitterMs"
                  name="Jitter"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {minSignal !== null && (
            <p className="mt-2 text-xs text-gray-500">
              Weakest SIM signal in window: {minSignal} dBm
            </p>
          )}
        </>
      )}
    </Card>
  );
}
