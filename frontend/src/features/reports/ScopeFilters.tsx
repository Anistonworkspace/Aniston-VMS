import { AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, Input } from '@/components/ui';
import {
  useListCameraOptionsQuery,
  useListRegionOptionsQuery,
  useListSiteOptionsQuery,
  useListZoneOptionsQuery,
} from './reports.api';
import { Select, type SelectOption } from './Select';
import { SEVERITY_VALUES } from './reports.types';
import { SEVERITY_LABEL } from './badgeMaps';

const ALL_REGIONS: SelectOption = { value: '', label: 'All regions' };
const ALL_ZONES: SelectOption = { value: '', label: 'All zones' };
const ALL_SITES: SelectOption = { value: '', label: 'All sites' };
const ALL_CAMERAS: SelectOption = { value: '', label: 'All cameras' };
const ALL_SEVERITIES: SelectOption = { value: '', label: 'All severities' };

export interface ScopeFiltersValue {
  startDate: string;
  endDate: string;
  regionId: string;
  zoneId: string;
  siteId: string;
  cameraId: string;
  severity: string;
}

interface ScopeFiltersProps {
  value: ScopeFiltersValue;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onZoneChange: (v: string) => void;
  onSiteChange: (v: string) => void;
  onCameraChange: (v: string) => void;
  onSeverityChange: (v: string) => void;
  showSeverity: boolean;
  rangeError?: string | null;
  rangeWarning?: string | null;
}

/** Date range + Region → Zone → Site → Camera cascading scope filters, shared by the Uptime and Incidents panels. */
export function ScopeFilters({
  value,
  onStartDateChange,
  onEndDateChange,
  onRegionChange,
  onZoneChange,
  onSiteChange,
  onCameraChange,
  onSeverityChange,
  showSeverity,
  rangeError,
  rangeWarning,
}: ScopeFiltersProps) {
  const { regionId, zoneId, siteId, cameraId, severity, startDate, endDate } = value;

  const { data: regionData } = useListRegionOptionsQuery();
  const { data: zoneData } = useListZoneOptionsQuery({ regionId: regionId || undefined });
  const { data: siteData } = useListSiteOptionsQuery({
    zoneId: zoneId || undefined,
    regionId: regionId || undefined,
  });
  const { data: cameraData } = useListCameraOptionsQuery(
    { siteId: siteId || undefined },
    { skip: !siteId }
  );

  const regionOptions: SelectOption[] = [
    ALL_REGIONS,
    ...(regionData ?? []).map((r) => ({ value: r.id, label: r.name })),
  ];
  const zoneOptions: SelectOption[] = [
    ALL_ZONES,
    ...(zoneData ?? []).map((z) => ({ value: z.id, label: z.name })),
  ];
  const siteOptions: SelectOption[] = [
    ALL_SITES,
    ...(siteData ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  const cameraOptions: SelectOption[] = [
    ALL_CAMERAS,
    ...(cameraData ?? []).map((c) => ({ value: c.id, label: `${c.cameraCode} — ${c.name}` })),
  ];
  const severityOptions: SelectOption[] = [
    ALL_SEVERITIES,
    ...SEVERITY_VALUES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] })),
  ];

  function handleRegionChange(next: string) {
    onRegionChange(next);
    onZoneChange('');
    onSiteChange('');
    onCameraChange('');
  }

  function handleZoneChange(next: string) {
    onZoneChange(next);
    onSiteChange('');
    onCameraChange('');
  }

  function handleSiteChange(next: string) {
    onSiteChange(next);
    onCameraChange('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Input
          type="date"
          label="Start date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
        <Input
          type="date"
          label="End date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
        />
        <Select
          label="Region"
          value={regionId}
          onValueChange={handleRegionChange}
          options={regionOptions}
        />
        <Select
          label="Zone"
          value={zoneId}
          onValueChange={handleZoneChange}
          options={zoneOptions}
        />
        <Select
          label="Site"
          value={siteId}
          onValueChange={handleSiteChange}
          options={siteOptions}
        />
        <Select
          label="Camera"
          value={cameraId}
          onValueChange={onCameraChange}
          options={cameraOptions}
          disabled={!siteId}
          hint={!siteId ? 'Select a site first' : undefined}
        />
        {showSeverity && (
          <Select
            label="Severity"
            value={severity}
            onValueChange={onSeverityChange}
            options={severityOptions}
          />
        )}
      </div>
      {rangeError && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {rangeError}
        </p>
      )}
      {!rangeError && rangeWarning && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {rangeWarning}
        </p>
      )}
    </Card>
  );
}
