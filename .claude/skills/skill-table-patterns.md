# Skill — Table Patterns

Production-quality data tables: sortable, filterable, selectable, exportable, mobile-responsive.

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
          <tr className="border-b border-[var(--border-color)]">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={selected.size === data.length && data.length > 0}
                  onChange={toggleAll} className="rounded" />
              </th>
            )}
            {columns.map(col => (
              <th key={col.key}
                className={`px-4 py-3 text-left text-xs font-medium text-[var(--secondary-text-color)] uppercase tracking-wide whitespace-nowrap ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.sortable ? 'cursor-pointer hover:text-[var(--primary-text-color)] select-none' : ''}`}
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
            <tr key={i} className="border-b border-[var(--ui-bg-border-color)]">
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
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-16 text-center text-[var(--secondary-text-color)]">
                {emptyMessage}
              </td>
            </tr>
          )}

          {!isLoading && data.map(row => (
            <tr key={rowKey(row)}
              className={`border-b border-[var(--ui-bg-border-color)] hover:bg-[var(--primary-background-hover-color)] transition-colors duration-[70ms] ${selected.has(rowKey(row)) ? 'bg-[var(--primary-highlighted-color)]' : ''}`}
            >
              {selectable && (
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(rowKey(row))} onChange={() => toggleRow(row)} className="rounded" />
                </td>
              )}
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-[var(--primary-text-color)] ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}>
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
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
      <span className="text-sm text-[var(--secondary-text-color)]">
        Showing {from}–{to} of {total} records
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

---

## Bulk action bar

```typescript
// Shows when rows are selected
function BulkActionBar({ count, onApproveAll, onDeleteAll, onClear }: {
  count: number;
  onApproveAll: () => void;
  onDeleteAll:  () => void;
  onClear:      () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="animate-slide-up flex items-center gap-3 px-4 py-2 bg-[var(--primary-highlighted-color)] border border-[var(--primary-color)] rounded-md mb-3">
      <span className="text-sm font-medium text-[var(--primary-color)]">{count} selected</span>
      <div className="flex-1" />
      <button className="btn btn--positive btn--sm" onClick={onApproveAll}>Approve all</button>
      <button className="btn btn--negative btn--sm" onClick={onDeleteAll}>Delete all</button>
      <button className="btn btn--ghost btn--sm" onClick={onClear}>Clear</button>
    </div>
  );
}
```

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

## Complete page usage

```typescript
export function ItemListPage() {
  const { filters, setFilter } = useItemFilters();
  const [selectedRows, setSelectedRows] = useState<Item[]>([]);
  const { data, isLoading } = useGetItemsQuery(filters);
  const [exportPdf, { isLoading: exporting }] = useExportItemsPdfMutation();

  const columns: Column<Item>[] = [
    { key: 'name', header: 'Name', sortable: true,
      render: r => <span className="font-medium">{r.name}</span> },
    { key: 'type',   header: 'Type',   sortable: true, render: r => <span className="badge badge--primary">{r.type}</span> },
    { key: 'from',   header: 'From',   sortable: true, render: r => formatDate(r.startDate) },
    { key: 'to',     header: 'To',                     render: r => formatDate(r.endDate), hideOnMobile: true },
    { key: 'status', header: 'Status', sortable: true,
      render: r => <StatusPill status={r.status} /> },
    { key: 'actions', header: '',
      render: r => <ActionMenu id={r.id} status={r.status} /> },
  ];

  return (
    <div className="floating-card rounded-[var(--card-radius)] p-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[var(--border-color)]">
        <ItemFilterBar />
        <div className="flex-1" />
        <button className="btn btn--secondary btn--sm" onClick={() => exportPdf(filters)} disabled={exporting}>
          {exporting ? '⟳' : '↓'} Export
        </button>
      </div>

      <BulkActionBar count={selectedRows.length} onClear={() => setSelectedRows([])} onApproveAll={handleBulkApprove} onDeleteAll={handleBulkDelete} />

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
        emptyMessage="No items found. Adjust filters or create one."
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

---

## Mobile card fallback (for very narrow screens)

```typescript
{/* On <640px, show cards instead of table */}
<div className="sm:hidden space-y-3">
  {data?.data.map(r => (
    <div key={r.id} className="floating-card rounded-[var(--card-radius)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{r.name}</span>
        <StatusPill status={r.status} />
      </div>
      <p className="text-sm text-[var(--secondary-text-color)]">{r.type} · {formatDate(r.startDate)} → {formatDate(r.endDate)}</p>
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
- [ ] Skeleton rows shown while loading (not spinner — avoids layout shift)
- [ ] Empty state has descriptive message + CTA (not just "No data")
- [ ] Sort toggles `asc`/`desc` on same column click
- [ ] Bulk action bar slides up only when rows are selected
- [ ] Pagination shows "Showing X–Y of Z" count
- [ ] Column visibility state persisted to `localStorage`
- [ ] Mobile card layout provided for `< sm` screens
- [ ] Row hover uses `var(--primary-background-hover-color)`, not hardcoded color
