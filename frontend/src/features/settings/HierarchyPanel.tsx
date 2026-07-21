import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Globe2,
  MapPin,
  Pencil,
  Plus,
  Router as RouterIcon,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  SkeletonTable,
  Tooltip,
} from '@/components/ui';
import type { useToast } from '@/hooks/useToast';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { getApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { pageChild } from '@/lib/animations';
import { ConfirmDialog } from './ConfirmDialog';
import {
  RegionFormModal,
  RouterFormModal,
  SiteFormModal,
  ZoneFormModal,
} from './HierarchyFormModal';
import {
  useDeleteRegionMutation,
  useDeleteRouterMutation,
  useDeleteSiteMutation,
  useDeleteZoneMutation,
  useListRegionsQuery,
  useListRoutersQuery,
  useListSitesQuery,
  useListZonesQuery,
} from './settings.api';
import { canManageHierarchy, canWriteRouters } from './settings.types';
import type {
  HierarchyKind,
  Region,
  Router as HierarchyRouterModel,
  Site,
  Zone,
} from './settings.types';

type Toast = ReturnType<typeof useToast>;

interface DeleteTarget {
  kind: HierarchyKind;
  id: string;
  name: string;
}

// Administrative scale — a single page of up to 100 children per node is a
// reasonable ceiling for regions/zones/sites/routers; the backend still
// paginates (`PaginatedResult`) so extremely large deployments would need a
// "load more" control, which is out of scope for this settings surface.
const CHILD_LIST_LIMIT = 100;

function RowShell({
  depth,
  icon: Icon,
  iconTone,
  expandable,
  expanded,
  onToggle,
  title,
  badge,
  meta,
  actions,
}: {
  depth: 0 | 1 | 2 | 3;
  icon: typeof Globe2;
  iconTone: string;
  expandable: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  title: string;
  badge?: React.ReactNode;
  meta?: string;
  actions?: React.ReactNode;
}) {
  const depthPad = { 0: '', 1: 'pl-7', 2: 'pl-14', 3: 'pl-[4.5rem]' }[depth];
  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-3 rounded-lg py-2 pr-2 transition-colors hover:bg-surface',
        depthPad
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-muted"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', iconTone)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-sm font-medium text-ink">{title}</span>
        {badge}
        {meta && <span className="shrink-0 text-xs text-muted">{meta}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {actions}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'default'} size="sm">
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function ActionButton({
  label,
  onClick,
  icon: Icon,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Pencil;
  danger?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface',
          danger ? 'hover:text-coral' : 'hover:text-muted'
        )}
        aria-label={label}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

// ── Router row (leaf) ─────────────────────────────────────────────────────
function RouterRow({
  router,
  canRouter,
  canManage,
  onEdit,
  onDelete,
}: {
  router: HierarchyRouterModel;
  canRouter: boolean;
  canManage: boolean;
  onEdit: (router: HierarchyRouterModel) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  return (
    <RowShell
      depth={3}
      icon={RouterIcon}
      iconTone="bg-sage-soft text-sage"
      expandable={false}
      title={router.serialNumber}
      badge={
        <Badge variant={router.connectionStatus === 'ONLINE' ? 'success' : 'default'} size="sm">
          {router.connectionStatus}
        </Badge>
      }
      meta={`${router._count.cameras} camera${router._count.cameras === 1 ? '' : 's'}`}
      actions={
        <>
          {canRouter && (
            <ActionButton label="Edit router" icon={Pencil} onClick={() => onEdit(router)} />
          )}
          {canManage && (
            <ActionButton
              label="Delete router"
              icon={Trash2}
              danger
              onClick={() => onDelete({ kind: 'router', id: router.id, name: router.serialNumber })}
            />
          )}
        </>
      }
    />
  );
}

// ── Site row ───────────────────────────────────────────────────────────────
function SiteRow({
  site,
  canManage,
  canRouter,
  onEditSite,
  onAddRouter,
  onEditRouter,
  onDelete,
}: {
  site: Site;
  canManage: boolean;
  canRouter: boolean;
  onEditSite: (site: Site) => void;
  onAddRouter: (siteId: string) => void;
  onEditRouter: (router: HierarchyRouterModel) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    data: routers,
    isLoading,
    error,
  } = useListRoutersQuery({ siteId: site.id, limit: CHILD_LIST_LIMIT }, { skip: !expanded });

  return (
    <div>
      <RowShell
        depth={2}
        icon={Building2}
        iconTone="bg-state-success-soft text-state-success"
        expandable
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        title={site.name}
        badge={<StatusBadge status={site.status} />}
        meta={`${site._count.routers} router${site._count.routers === 1 ? '' : 's'} · ${site._count.cameras} camera${site._count.cameras === 1 ? '' : 's'}`}
        actions={
          <>
            {canRouter && (
              <ActionButton label="Add router" icon={Plus} onClick={() => onAddRouter(site.id)} />
            )}
            {canManage && (
              <ActionButton label="Edit site" icon={Pencil} onClick={() => onEditSite(site)} />
            )}
            {canManage && (
              <ActionButton
                label="Delete site"
                icon={Trash2}
                danger
                onClick={() => onDelete({ kind: 'site', id: site.id, name: site.name })}
              />
            )}
          </>
        }
      />
      {expanded && (
        <div className="pb-1">
          {isLoading && <SkeletonTable rows={2} />}
          {error && <p className="pl-[4.5rem] text-xs text-coral">{getApiErrorMessage(error)}</p>}
          {!isLoading && !error && routers?.items.length === 0 && (
            <p className="pl-[4.5rem] py-1.5 text-xs text-muted">No routers yet.</p>
          )}
          {routers?.items.map((r) => (
            <RouterRow
              key={r.id}
              router={r}
              canRouter={canRouter}
              canManage={canManage}
              onEdit={onEditRouter}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Zone row ───────────────────────────────────────────────────────────────
function ZoneRow({
  zone,
  canManage,
  canRouter,
  onEditZone,
  onAddSite,
  onEditSite,
  onAddRouter,
  onEditRouter,
  onDelete,
}: {
  zone: Zone;
  canManage: boolean;
  canRouter: boolean;
  onEditZone: (zone: Zone) => void;
  onAddSite: (zoneId: string) => void;
  onEditSite: (site: Site) => void;
  onAddRouter: (siteId: string) => void;
  onEditRouter: (router: HierarchyRouterModel) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    data: sites,
    isLoading,
    error,
  } = useListSitesQuery({ zoneId: zone.id, limit: CHILD_LIST_LIMIT }, { skip: !expanded });

  return (
    <div>
      <RowShell
        depth={1}
        icon={MapPin}
        iconTone="bg-state-info-soft text-state-info"
        expandable
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        title={zone.name}
        badge={<StatusBadge status={zone.status} />}
        meta={`${zone._count.sites} site${zone._count.sites === 1 ? '' : 's'}`}
        actions={
          <>
            {canManage && (
              <ActionButton label="Add site" icon={Plus} onClick={() => onAddSite(zone.id)} />
            )}
            {canManage && (
              <ActionButton label="Edit zone" icon={Pencil} onClick={() => onEditZone(zone)} />
            )}
            {canManage && (
              <ActionButton
                label="Delete zone"
                icon={Trash2}
                danger
                onClick={() => onDelete({ kind: 'zone', id: zone.id, name: zone.name })}
              />
            )}
          </>
        }
      />
      {expanded && (
        <div className="pb-1">
          {isLoading && <SkeletonTable rows={2} />}
          {error && <p className="pl-14 text-xs text-coral">{getApiErrorMessage(error)}</p>}
          {!isLoading && !error && sites?.items.length === 0 && (
            <p className="pl-14 py-1.5 text-xs text-muted">No sites yet.</p>
          )}
          {sites?.items.map((s) => (
            <SiteRow
              key={s.id}
              site={s}
              canManage={canManage}
              canRouter={canRouter}
              onEditSite={onEditSite}
              onAddRouter={onAddRouter}
              onEditRouter={onEditRouter}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Region row ─────────────────────────────────────────────────────────────
function RegionRow({
  region,
  canManage,
  canRouter,
  onEditRegion,
  onAddZone,
  onEditZone,
  onAddSite,
  onEditSite,
  onAddRouter,
  onEditRouter,
  onDelete,
}: {
  region: Region;
  canManage: boolean;
  canRouter: boolean;
  onEditRegion: (region: Region) => void;
  onAddZone: (regionId: string) => void;
  onEditZone: (zone: Zone) => void;
  onAddSite: (zoneId: string) => void;
  onEditSite: (site: Site) => void;
  onAddRouter: (siteId: string) => void;
  onEditRouter: (router: HierarchyRouterModel) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    data: zones,
    isLoading,
    error,
  } = useListZonesQuery({ regionId: region.id, limit: CHILD_LIST_LIMIT }, { skip: !expanded });

  return (
    <div className="border-b border-hairline last:border-b-0">
      <RowShell
        depth={0}
        icon={Globe2}
        iconTone="bg-indigo text-indigo"
        expandable
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        title={region.name}
        badge={<StatusBadge status={region.status} />}
        meta={`${region._count.zones} zone${region._count.zones === 1 ? '' : 's'}`}
        actions={
          <>
            {canManage && (
              <ActionButton label="Add zone" icon={Plus} onClick={() => onAddZone(region.id)} />
            )}
            {canManage && (
              <ActionButton
                label="Edit region"
                icon={Pencil}
                onClick={() => onEditRegion(region)}
              />
            )}
            {canManage && (
              <ActionButton
                label="Delete region"
                icon={Trash2}
                danger
                onClick={() => onDelete({ kind: 'region', id: region.id, name: region.name })}
              />
            )}
          </>
        }
      />
      {expanded && (
        <div className="pb-1">
          {isLoading && <SkeletonTable rows={2} />}
          {error && <p className="pl-7 text-xs text-coral">{getApiErrorMessage(error)}</p>}
          {!isLoading && !error && zones?.items.length === 0 && (
            <p className="pl-7 py-1.5 text-xs text-muted">No zones yet.</p>
          )}
          {zones?.items.map((z) => (
            <ZoneRow
              key={z.id}
              zone={z}
              canManage={canManage}
              canRouter={canRouter}
              onEditZone={onEditZone}
              onAddSite={onAddSite}
              onEditSite={onEditSite}
              onAddRouter={onAddRouter}
              onEditRouter={onEditRouter}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PanelProps {
  toast: Toast;
}

export function HierarchyPanel({ toast }: PanelProps) {
  const { data: user } = useGetCurrentUserQuery();
  const canManage = canManageHierarchy(user?.role);
  const canRouter = canWriteRouters(user?.role);

  const { data: regions, isLoading, error } = useListRegionsQuery({ limit: CHILD_LIST_LIMIT });

  const [regionModal, setRegionModal] = useState<{ region?: Region } | null>(null);
  const [zoneModal, setZoneModal] = useState<{ regionId: string; zone?: Zone } | null>(null);
  const [siteModal, setSiteModal] = useState<{ zoneId: string; site?: Site } | null>(null);
  const [routerModal, setRouterModal] = useState<{
    siteId: string;
    router?: HierarchyRouterModel;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [deleteRegion, { isLoading: deletingRegion }] = useDeleteRegionMutation();
  const [deleteZone, { isLoading: deletingZone }] = useDeleteZoneMutation();
  const [deleteSite, { isLoading: deletingSite }] = useDeleteSiteMutation();
  const [deleteRouter, { isLoading: deletingRouter }] = useDeleteRouterMutation();
  const deleting = deletingRegion || deletingZone || deletingSite || deletingRouter;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      switch (deleteTarget.kind) {
        case 'region':
          await deleteRegion(deleteTarget.id).unwrap();
          break;
        case 'zone':
          await deleteZone(deleteTarget.id).unwrap();
          break;
        case 'site':
          await deleteSite(deleteTarget.id).unwrap();
          break;
        case 'router':
          await deleteRouter(deleteTarget.id).unwrap();
          break;
      }
      toast.success(`${deleteTarget.kind[0].toUpperCase()}${deleteTarget.kind.slice(1)} deleted`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(
        'Delete failed',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <motion.div variants={pageChild} className="space-y-6">
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Site hierarchy</CardTitle>
            <CardDescription>
              Regions, zones, sites and routers across the deployment.
            </CardDescription>
          </div>
          {canManage && (
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setRegionModal({})}
            >
              Add region
            </Button>
          )}
        </CardHeader>

        {!canManage && !canRouter && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-state-info bg-state-info-soft px-4 py-3 text-sm text-state-info">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>You have read-only access to the site hierarchy.</span>
          </div>
        )}

        {isLoading && <SkeletonTable rows={5} />}
        {error && <p className="text-sm text-coral">{getApiErrorMessage(error)}</p>}
        {!isLoading && !error && regions?.items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            No regions have been created yet.
          </p>
        )}
        {!isLoading && !error && regions && regions.items.length > 0 && (
          <div>
            {regions.items.map((region) => (
              <RegionRow
                key={region.id}
                region={region}
                canManage={canManage}
                canRouter={canRouter}
                onEditRegion={(r) => setRegionModal({ region: r })}
                onAddZone={(regionId) => setZoneModal({ regionId })}
                onEditZone={(z) => setZoneModal({ regionId: z.regionId, zone: z })}
                onAddSite={(zoneId) => setSiteModal({ zoneId })}
                onEditSite={(s) => setSiteModal({ zoneId: s.zoneId, site: s })}
                onAddRouter={(siteId) => setRouterModal({ siteId })}
                onEditRouter={(r) => setRouterModal({ siteId: r.siteId, router: r })}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </Card>

      {regionModal && (
        <RegionFormModal
          open={!!regionModal}
          onClose={() => setRegionModal(null)}
          toast={toast}
          region={regionModal.region}
        />
      )}
      {zoneModal && (
        <ZoneFormModal
          open={!!zoneModal}
          onClose={() => setZoneModal(null)}
          toast={toast}
          regionId={zoneModal.regionId}
          zone={zoneModal.zone}
        />
      )}
      {siteModal && (
        <SiteFormModal
          open={!!siteModal}
          onClose={() => setSiteModal(null)}
          toast={toast}
          zoneId={siteModal.zoneId}
          site={siteModal.site}
        />
      )}
      {routerModal && (
        <RouterFormModal
          open={!!routerModal}
          onClose={() => setRouterModal(null)}
          toast={toast}
          siteId={routerModal.siteId}
          router={routerModal.router}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.kind ?? ''}`}
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This cannot be undone.`}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
}

export default HierarchyPanel;
