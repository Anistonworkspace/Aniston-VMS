import { useMemo, useState } from 'react';
import { ToastContainer } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { GeneratedReportsPanel } from './GeneratedReportsPanel';
import { IncidentsPanel } from './IncidentsPanel';
import { ScopeFilters, type ScopeFiltersValue } from './ScopeFilters';
import { UptimePanel } from './UptimePanel';
import { SEVERITY_LABEL } from './badgeMaps';
import type {
  IncidentsReportFilters,
  ReportExportQuery,
  ReportFormat,
  ReportKind,
  ReportScopeFilters,
  Severity,
} from './reports.types';
import {
  ASSUMED_MAX_RANGE_DAYS,
  buildFiltersSummary,
  defaultDateRange,
  rangeDaysBetween,
} from './reports.utils';
import { useGeneratedReports } from './useGeneratedReports';

const TABS: { id: ReportKind; label: string }[] = [
  { id: 'uptime', label: 'Uptime' },
  { id: 'incidents', label: 'Incidents' },
];

function emptyFilters(): ScopeFiltersValue {
  return {
    ...defaultDateRange(),
    regionId: '',
    zoneId: '',
    siteId: '',
    cameraId: '',
    severity: '',
  };
}

/** Reports page (`/reports`) — Uptime + Incidents report panels, shared scope filters, and xlsx/pdf export with client-local history. */
export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportKind>('uptime');
  const [filters, setFilters] = useState<ScopeFiltersValue>(emptyFilters);
  const toastApi = useToast();
  const { reports, generate, clear, hasInFlight } = useGeneratedReports();

  function updateFilter<K extends keyof ScopeFiltersValue>(key: K, value: ScopeFiltersValue[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const rangeDays = rangeDaysBetween(filters.startDate, filters.endDate);
  const rangeError =
    !filters.startDate || !filters.endDate
      ? 'Start and end date are required.'
      : rangeDays < 0
        ? 'End date must be on or after the start date.'
        : null;
  const rangeWarning =
    !rangeError && rangeDays > ASSUMED_MAX_RANGE_DAYS
      ? `Range is ${rangeDays} days — the server enforces a maximum range (REPORTS_MAX_RANGE_DAYS, assumed ~${ASSUMED_MAX_RANGE_DAYS} days) and may reject this request.`
      : null;
  const skip = !!rangeError;

  const scopeFilters: ReportScopeFilters = useMemo(
    () => ({
      startDate: filters.startDate,
      endDate: filters.endDate,
      regionId: filters.regionId || undefined,
      zoneId: filters.zoneId || undefined,
      siteId: filters.siteId || undefined,
      cameraId: filters.cameraId || undefined,
    }),
    [
      filters.startDate,
      filters.endDate,
      filters.regionId,
      filters.zoneId,
      filters.siteId,
      filters.cameraId,
    ]
  );

  const incidentsFilters: IncidentsReportFilters = useMemo(
    () => ({ ...scopeFilters, severity: (filters.severity || undefined) as Severity | undefined }),
    [scopeFilters, filters.severity]
  );

  async function handleExport(format: ReportFormat) {
    const severityForType = activeTab === 'incidents' ? (filters.severity as Severity | '') : '';
    const query: ReportExportQuery = {
      ...scopeFilters,
      type: activeTab,
      format,
      ...(severityForType ? { severity: severityForType } : {}),
    };
    const summary = buildFiltersSummary(
      scopeFilters,
      severityForType ? SEVERITY_LABEL[severityForType] : undefined
    );
    const result = await generate(query, summary);
    if (result.ok) {
      toastApi.success('Report generated', 'Your export is ready to download below.');
    } else {
      toastApi.error('Export failed', result.message);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-muted">
          Camera uptime and incident reporting across your fleet, exportable to XLSX or PDF.
        </p>
      </div>

      <ScopeFilters
        value={filters}
        onStartDateChange={(v) => updateFilter('startDate', v)}
        onEndDateChange={(v) => updateFilter('endDate', v)}
        onRegionChange={(v) => updateFilter('regionId', v)}
        onZoneChange={(v) => updateFilter('zoneId', v)}
        onSiteChange={(v) => updateFilter('siteId', v)}
        onCameraChange={(v) => updateFilter('cameraId', v)}
        onSeverityChange={(v) => updateFilter('severity', v)}
        showSeverity={activeTab === 'incidents'}
        rangeError={rangeError}
        rangeWarning={rangeWarning}
      />

      <div
        role="tablist"
        aria-label="Report type"
        className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-card p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:bg-surface'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'uptime' ? (
        <UptimePanel
          filters={scopeFilters}
          skip={skip}
          onExport={handleExport}
          exporting={hasInFlight}
        />
      ) : (
        <IncidentsPanel
          filters={incidentsFilters}
          skip={skip}
          onExport={handleExport}
          exporting={hasInFlight}
        />
      )}

      <GeneratedReportsPanel reports={reports} onClear={clear} />

      <ToastContainer toasts={toastApi.toasts} onDismiss={toastApi.dismiss} />
    </div>
  );
}
