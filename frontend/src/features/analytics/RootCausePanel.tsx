import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DIAGNOSIS_BAR_CLASS, DIAGNOSIS_LABEL } from './diagnosisLabels';
import type { CameraHealthRow, DiagnosisCode } from './analytics.types';

const MAX_CLEANING_ROWS = 5;

/** Distribution of backend root-cause diagnoses + the PRD §6.10 "Needs cleaning" list. */
export function RootCausePanel({ rows }: { rows: CameraHealthRow[] }): JSX.Element {
  const counts = new Map<DiagnosisCode, number>();
  for (const row of rows) {
    if (row.diagnosis) counts.set(row.diagnosis, (counts.get(row.diagnosis) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  const needsCleaning = rows.filter((r) => r.diagnosis === 'IMAGE_PROBLEM');

  return (
    <Card>
      <CardHeader className="mb-2 flex-col items-start gap-0.5">
        <CardTitle>Root causes</CardTitle>
        <CardDescription>Diagnosed faults across cameras in scope</CardDescription>
      </CardHeader>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No diagnosed faults — fleet looks clean.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map(([code, count]) => (
            <li key={code}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-gray-700">{DIAGNOSIS_LABEL[code]}</span>
                <span className="shrink-0 tabular-nums text-gray-500">{count}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn('h-full rounded-full', DIAGNOSIS_BAR_CLASS[code])}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {needsCleaning.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Needs cleaning
          </p>
          <ul className="space-y-1.5">
            {needsCleaning.slice(0, MAX_CLEANING_ROWS).map((camera) => (
              <li key={camera.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-gray-800">{camera.name}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {camera.cameraCode} · {camera.site.name}
                </span>
              </li>
            ))}
          </ul>
          {needsCleaning.length > MAX_CLEANING_ROWS && (
            <p className="mt-1.5 text-xs text-gray-400">
              +{needsCleaning.length - MAX_CLEANING_ROWS} more
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
