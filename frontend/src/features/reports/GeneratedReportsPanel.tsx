import { Download, FileSpreadsheet, FileText, Loader2, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CardTitle } from '@/components/ui';
import type { GeneratedReport } from './reports.types';
import { GENERATED_REPORT_STATUS_BADGE_VARIANT, GENERATED_REPORT_STATUS_LABEL } from './badgeMaps';
import { formatTimestamp } from './reports.utils';

interface GeneratedReportsPanelProps {
  reports: GeneratedReport[];
  onClear: () => void;
}

/**
 * Client-local history of report exports triggered from this page (see
 * useGeneratedReports.ts doc comment — the backend has no "list my exports"
 * endpoint, so this list only reflects what was generated in this browser).
 */
export function GeneratedReportsPanel({ reports, onClear }: GeneratedReportsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated reports</CardTitle>
        {reports.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={onClear}
          >
            Clear history
          </Button>
        )}
      </CardHeader>

      {reports.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No reports generated yet — use “Export XLSX” / “Export PDF” above.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {reports.map((r) => {
            const FormatIcon = r.format === 'xlsx' ? FileSpreadsheet : FileText;
            return (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  {r.status === 'PROCESSING' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FormatIcon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {r.type === 'uptime' ? 'Uptime' : 'Incidents'} report ·{' '}
                    <span className="uppercase text-gray-500">{r.format}</span>
                  </p>
                  <p className="truncate text-xs text-gray-500">{r.filtersSummary}</p>
                  {r.status === 'FAILED' && r.errorMessage && (
                    <p className="truncate text-xs text-red-500">{r.errorMessage}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant={GENERATED_REPORT_STATUS_BADGE_VARIANT[r.status]} size="sm">
                    {GENERATED_REPORT_STATUS_LABEL[r.status]}
                  </Badge>
                  <span className="text-xs text-gray-400">{formatTimestamp(r.requestedAt)}</span>
                </div>
                {r.status === 'READY' && r.downloadUrl && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => window.open(r.downloadUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Download
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
