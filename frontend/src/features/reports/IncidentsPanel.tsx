import {
  AlertOctagon,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Timer,
  TimerReset,
} from 'lucide-react';
import { Badge, Button, Card, SkeletonCard, SkeletonTable } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useGetIncidentsReportQuery } from './reports.api';
import type { IncidentsReportFilters, ReportFormat } from './reports.types';
import { StatCard } from './StatCard';
import {
  DIAGNOSIS_LABEL,
  INCIDENT_STATUS_BADGE_VARIANT,
  INCIDENT_STATUS_LABEL,
  SEVERITY_BADGE_VARIANT,
  SEVERITY_LABEL,
} from './badgeMaps';
import {
  formatDateOnly,
  formatDurationShort,
  formatMinutesShort,
  formatTimestamp,
} from './reports.utils';

interface IncidentsPanelProps {
  filters: IncidentsReportFilters;
  skip: boolean;
  onExport: (format: ReportFormat) => void;
  exporting: boolean;
}

/** Incidents tab: incident rows for the scope/date range, plus MTTA/MTTR + severity-mix summary and an xlsx/pdf export action. */
export function IncidentsPanel({ filters, skip, onExport, exporting }: IncidentsPanelProps) {
  const { data, isLoading, isError, error, refetch } = useGetIncidentsReportQuery(filters, {
    skip,
  });

  const criticalCount = data?.summary.countsBySeverity['CRITICAL'] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">Incidents</h2>
          <p className="text-xs text-muted">
            {data
              ? `${formatDateOnly(data.periodStart)} – ${formatDateOnly(data.periodEnd)} · generated ${formatTimestamp(data.generatedAt)}`
              : 'Detected incidents for the selected scope and date range.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FileSpreadsheet className="h-4 w-4" />}
            onClick={() => onExport('xlsx')}
            loading={exporting}
            disabled={skip}
          >
            Export XLSX
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FileText className="h-4 w-4" />}
            onClick={() => onExport('pdf')}
            loading={exporting}
            disabled={skip}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {skip ? (
        <Card className="py-10 text-center text-sm text-muted">
          Fix the date range above to run this report.
        </Card>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonTable rows={6} />
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-state-critical" />
          <p className="text-sm text-muted">{getApiErrorMessage(error)}</p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </Card>
      ) : !data || data.rows.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">
          No incidents for the selected scope.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total incidents"
              value={data.summary.totalIncidents}
              icon={<AlertOctagon className="h-4 w-4" />}
            />
            <StatCard
              label="Critical"
              value={criticalCount}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone={criticalCount > 0 ? 'danger' : 'default'}
            />
            <StatCard
              label="MTTA"
              value={formatMinutesShort(data.summary.mttaMinutes)}
              icon={<Timer className="h-4 w-4" />}
              hint="Mean time to acknowledge"
              tone="info"
            />
            <StatCard
              label="MTTR"
              value={formatMinutesShort(data.summary.mttrMinutes)}
              icon={<TimerReset className="h-4 w-4" />}
              hint="Mean time to resolve"
              tone="info"
            />
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Incident</th>
                    <th className="px-4 py-3 font-medium">Camera / Site</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Diagnosis</th>
                    <th className="px-4 py-3 font-medium">First detected</th>
                    <th className="px-4 py-3 font-medium">Resolved</th>
                    <th className="px-4 py-3 text-right font-medium">Downtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.rows.map((row) => (
                    <tr key={row.incidentId} className="transition-colors hover:bg-surface/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{row.incidentNumber}</p>
                        <p className="text-xs text-muted">{row.type}</p>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <p>{row.cameraName ?? '—'}</p>
                        <p className="text-xs text-muted">
                          {row.siteName} · {row.zoneName}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={SEVERITY_BADGE_VARIANT[row.severity]} size="sm">
                          {SEVERITY_LABEL[row.severity]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={INCIDENT_STATUS_BADGE_VARIANT[row.status]} size="sm">
                          {INCIDENT_STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {row.diagnosis ? DIAGNOSIS_LABEL[row.diagnosis] : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatTimestamp(row.firstDetectedAt)}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatTimestamp(row.resolvedAt)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatDurationShort(row.downtimeSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
