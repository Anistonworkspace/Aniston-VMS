# Skill — Table Patterns

Production-quality data tables: sortable, filterable, selectable, exportable, mobile-responsive. Used for
the camera list, the incident list, and the maintenance-task list — all through the same `DataTable`
primitive with `StatusBadge` for every status column.

---

## Base data table component

```typescript
// frontend/src/components/ui/DataTable.tsx
import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key:        string;
  header:     string;
  width?:     string;
  sortable?:  boolean;
  render:     (row: T) => React.ReactNode;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns:    Column<T>[];
  data:       T[];
  isLoading?: boolean;
  sortBy?:    string;
  sortDir?:   'asc' | 'desc';
  onSort?:    (key: string) => void;
  selectable?: boolean;
  onSelect?:  (selected: T[]) => void;
  emptyMessage?: string;
  rowKey:     (row: T) => string;
}

export function DataTable<T>({ columns, data, isLoading, sortBy, sortDir, onSort, selectable, onSelect, emptyMessage = 'No records found', rowKey }: DataTableProps<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set());
      onSelect?.([]);
    } else {
      const all = new Set(data.map(rowKey));
      setSelected(all);
      onSelect?.(data);
    }
  };

  const toggleRow = (row: T) => {
    const id = rowKey(row);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    onSelect?.(data.filter(r => next.has(rowKey(r))));
  };

  const SortIcon = ({ col }: { col: Column<T> }) => {
    if (!col.sortable) return null;
    if (sortBy !== col.key) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--hairline)]">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={selected.size === data.length && data.length > 0}
                  onChange={toggleAll} className="rounded" />
              </th>
            )}
            {columns.map(col => (
              <th key={col.key}
                className={`px-4 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wide whitespace-nowrap ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.sortable ? 'cursor-pointer hover:text-[var(--ink)] select-none' : ''}`}
                style={{ width: col.width }}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  <SortIcon col={col} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-[var(--hairline)]">
              {selectable && <td className="px-4 py-3"><div className="skeleton h-4 w-4" /></td>}
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}>
                  <div className="skeleton h-4 rounded" style={{ width: col.width ?? '80%' }} />
                </td>
              ))}
            </tr>
          ))}

          {!isLoading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-16 text-center text-[var(--muted)]">
                {emptyMessage}
              </td>
            </tr>
          )}

          {!isLoading && data.map(row => (
            <tr key={rowKey(row)}
              className={`border-b border-[var(--hairline)] hover:bg-[var(--surface)] transition-colors duration-[70ms] ${selected.has(rowKey(row)) ? 'bg-[#E7F1EA]' : ''}`}
            >
              {selectable && (
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(rowKey(row))} onChange={() => toggleRow(row)} className="rounded" />
                </td>
              )}
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-[var(--ink)] ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Row hover is `--surface` (cream), selected row is the Healthy-status soft bg `#E7F1EA` — reused
  intentionally rather than inventing a new "selected" tint
- [ ] Header text is 11–12px uppercase `--muted`; sortable headers darken to `--ink` on hover
- [ ] Divider rule is `--hairline` everywhere — never a heavier `--sidebar`-colored border inside a table

---

## Pagination component

```typescript
// frontend/src/components/ui/Pagination.tsx
interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--hairline)]">
      <span className="text-sm text-[var(--muted)]">
        Showing {from}–{to} of {total} cameras
      </span>
      <div className="flex items-center gap-1">
        <button className="btn btn--ghost btn--sm btn--icon" disabled={page === 1} onClick={() => onPageChange(1)}>«</button>
        <button className="btn btn--ghost btn--sm btn--icon" disabled={page === 1} onClick={() => onPageChange(page - 1)}>‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          return p <= totalPages ? (
            <button key={p} className={`btn btn--sm btn--icon ${p === page ? 'btn--primary' : 'btn--ghost'}`} onClick={() => onPageChange(p)}>{p}</button>
          ) : null;
        })}
        <button className="btn btn--ghost btn--sm btn--icon" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>›</button>
        <button className="btn btn--ghost btn--sm btn--icon" disabled={page === totalPages} onClick={() => onPageChange(totalPages)}>»</button>
      </div>
    </div>
  );
}
```

- [ ] "Showing X–Y of Z" uses the entity's actual name ("cameras", "incidents") — never a generic "records"
- [ ] Current-page button is the only `.btn--primary` in the pager — everything else is `.btn--ghost`

---

## Bulk action bar

```typescript
// Shows when rows are selected — camera list example
function BulkActionBar({ count, onCheckNow, onDecommission, onClear }: {
  count: number;
  onCheckNow:      () => void;
  onDecommission:  () => void;
  onClear:         () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="animate-slide-up flex items-center gap-3 px-4 py-2 bg-[#E7F1EA] border border-[var(--sage)] rounded-[var(--radius-control)] mb-3">
      <span className="text-sm font-medium text-[var(--sage)]">{count} camera{count > 1 ? 's' : ''} selected</span>
      <div className="flex-1" />
      <button className="btn btn--positive btn--sm" onClick={onCheckNow}>Run health check now</button>
      <button className="btn btn--negative btn--sm" onClick={onDecommission}>Decommission</button>
      <button className="btn btn--ghost btn--sm" onClick={onClear}>Clear</button>
    </div>
  );
}
```

- [ ] Bar background is the Healthy soft-bg tint (`#E7F1EA`) with a `--sage` border — same reused tint as the
  selected-row state above, so the whole selection state reads as one visual system
- [ ] Destructive bulk actions (`onDecommission`) are always `.btn--negative` (`--coral`) and should confirm
  via a dialog before firing — a bulk action bar is not the place for an un-confirmed destructive click

---

## Column visibility toggle

```typescript
function ColumnToggle({ columns, visible, onChange }: {
  columns: Column<any>[];
  visible: Set<string>;
  onChange: (key: string, show: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button className="btn btn--secondary btn--sm" onClick={() => setOpen(!open)}>Columns ▾</button>
      {open && (
        <div className="dropdown-panel absolute right-0 top-10 w-48 p-2 z-50">
          {columns.map(col => (
            <label key={col.key} className="dropdown-item cursor-pointer">
              <input type="checkbox" checked={visible.has(col.key)} onChange={e => onChange(col.key, e.target.checked)} className="rounded" />
              <span className="text-sm">{col.header}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Complete page usage — `CameraListPage`

```typescript
export function CameraListPage() {
  const { filters, setFilter } = useCameraFilters();
  const [selectedRows, setSelectedRows] = useState<Camera[]>([]);
  const { data, isLoading } = useGetCamerasQuery(filters);

  const columns: Column<Camera>[] = [
    { key: 'name', header: 'Camera', sortable: true,
      render: r => <span className="font-medium">{r.name}</span> },
    { key: 'zone',     header: 'Zone',      sortable: true, render: r => r.zone.name },
    { key: 'protocol', header: 'Protocol',                  render: r => <span className="badge badge--secondary">{r.protocol}</span>, hideOnMobile: true },
    { key: 'lastCheckedAt', header: 'Last checked', sortable: true, render: r => formatDate(r.lastCheckedAt), hideOnMobile: true },
    { key: 'status', header: 'Status', sortable: true,
      render: r => <StatusBadge status={r.status} /> },
    { key: 'actions', header: '',
      render: r => <ActionMenu id={r.id} status={r.status} /> },
  ];

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--card)] shadow-[var(--shadow-soft)] p-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[var(--hairline)]">
        <CameraFilterBar />
        <div className="flex-1" />
        <ReportExportBar scope="health" filters={filters} />
      </div>

      <BulkActionBar count={selectedRows.length} onClear={() => setSelectedRows([])} onCheckNow={handleBulkCheckNow} onDecommission={handleBulkDecommission} />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={r => r.id}
        selectable
        onSelect={setSelectedRows}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir}
        onSort={(key) => { setFilter('sortBy', key); setFilter('sortDir', filters.sortDir === 'asc' ? 'desc' : 'asc'); }}
        emptyMessage="No cameras match these filters. Adjust filters or add a camera."
      />

      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          total={data.meta.total}
          limit={data.meta.limit}
          onPageChange={(p) => setFilter('page', String(p))}
        />
      )}
    </div>
  );
}
```

- [ ] Table lives inside the standard card shell (`--radius-card` + `--shadow-soft`) — same recipe as every
  other card on the dashboard
- [ ] Toolbar embeds `CameraFilterBar` (see `skill-search-filter-patterns.md`) and `ReportExportBar` (see
  `skill-report-export-patterns.md`) — this page doesn't reinvent either
- [ ] Empty state names the actual filter/action available ("Adjust filters or add a camera"), never bare "No data"

---

## Mobile card fallback (for very narrow screens)

```typescript
{/* On <640px, show cards instead of table */}
<div className="sm:hidden space-y-3">
  {data?.data.map(r => (
    <div key={r.id} className="rounded-[var(--radius-card)] bg-[var(--card)] shadow-[var(--shadow-soft)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{r.name}</span>
        <StatusBadge status={r.status} />
      </div>
      <p className="text-sm text-[var(--muted)]">{r.zone.name} · {r.protocol} · checked {formatDate(r.lastCheckedAt)}</p>
      <ActionMenu id={r.id} status={r.status} />
    </div>
  ))}
</div>
<div className="hidden sm:block">
  <DataTable {...tableProps} />
</div>
```

---

## Checklist

- [ ] Table wrapped in `overflow-x-auto` — no horizontal bleed on mobile
- [ ] Skeleton rows shown while loading (not a spinner — avoids layout shift)
- [ ] Empty state has a descriptive message + CTA (not just "No data")
- [ ] Sort toggles `asc`/`desc` on the same column click
- [ ] Status column always renders `StatusBadge`, never a raw colored `<span>` or badge with a hand-picked hex
- [ ] Bulk action bar slides up only when rows are selected; destructive bulk actions are `.btn--negative` and confirm first
- [ ] Pagination shows "Showing X–Y of Z {entity}"
- [ ] Column visibility state persisted to `localStorage`
- [ ] Mobile card layout provided for `< sm` screens
- [ ] Row hover uses `--surface`, selected row uses the Healthy soft-bg tint (`#E7F1EA`) — no hardcoded one-off colors
