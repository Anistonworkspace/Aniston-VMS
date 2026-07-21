import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Percent,
  RefreshCw,
} from 'lucide-react';
import { Badge, Button, Card, SkeletonCard, SkeletonTable } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/apiError';
import { useGetUptimeReportQuery } from './reports.api';
import type { ReportFormat, ReportScopeFilters } from './reports.types';
import { StatCard } from './StatCard';
import {
  formatDateOnly,
  formatDurationShort,
  formatPercent,
  formatTimestamp,
} from './reports.utils';

interface UptimePanelProps {
  filters: ReportScopeFilters;
  skip: boolean;
  onExport: (format: ReportFormat) => void;
  exporting: boolean;
}

/** Uptime tab: per-camera uptime % vs SLA target, with an xlsx/pdf export action. */
export function UptimePanel({ filters, skip, onExport, exporting }: UptimePanelProps) {
  const { data, isLoading, isError, error, refetch } = useGetUptimeReportQuery(filters, { skip });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">Camera uptime</h2>
          <p className="text-xs text-muted">
            {data
              ? `${formatDateOnly(data.periodStart)} – ${formatDateOnly(data.periodEnd)} · generated ${formatTimestamp(data.generatedAt)}`
              : 'Percentage of the reporting window each camera was reachable.'}
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
          No camera uptime data for the selected scope.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Cameras in scope"
              value={data.summary.cameraCount}
              icon={<Camera className="h-4 w-4" />}
            />
            <StatCard
              label="Average uptime"
              value={formatPercent(data.summary.averageUptimePercent)}
              icon={<Percent className="h-4 w-4" />}
              tone="info"
            />
            <StatCard
              label="SLA target"
              value={formatPercent(data.slaTargetPercent)}
              hint="REPORTS_SLA_UPTIME_TARGET_PCT"
            />
            <StatCard
              label="SLA compliant"
              value={`${data.summary.slaCompliantCount} / ${data.summary.slaCompliantCount + data.summary.slaNonCompliantCount}`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone={data.summary.slaNonCompliantCount === 0 ? 'success' : 'warning'}
            />
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Camera</th>
                    <th className="px-4 py-3 font-medium">Site</th>
                    <th className="px-4 py-3 font-medium">Zone</th>
                    <th className="px-4 py-3 font-medium">Region</th>
                    <th className="px-4 py-3 text-right font-medium">Uptime</th>
                    <th className="px-4 py-3 text-right font-medium">Downtime</th>
                    <th className="px-4 py-3 text-center font-medium">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.rows.map((row) => (
                    <tr key={row.cameraId} className="transition-colors hover:bg-surface/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{row.cameraName}</p>
                        <p className="text-xs text-muted">{row.cameraCode}</p>
                      </td>
                      <td className="px-4 py-3 text-muted">{row.siteName}</td>
                      <td className="px-4 py-3 text-muted">{row.zoneName}</td>
                      <td className="px-4 py-3 text-muted">{row.regionName}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                        {formatPercent(row.uptimePercent)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatDurationShort(row.downtimeSeconds)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={row.slaCompliant ? 'success' : 'danger'} size="sm">
                          {row.slaCompliant ? 'Compliant' : 'Breach'}
                        </Badge>
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
