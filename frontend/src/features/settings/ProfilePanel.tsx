import { motion } from 'framer-motion';
import { AlertTriangle, Building2, Globe2, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Badge, Card, CardDescription, CardHeader, CardTitle, SkeletonCard } from '@/components/ui';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { ROLE_LABELS } from '@/features/auth/auth.types';
import type { AccessScope } from '@/features/auth/auth.types';
import { getApiErrorMessage } from '@/lib/apiError';
import { formatDateTime } from '@/lib/utils';
import { pageChild } from '@/lib/animations';
import { useListRegionsQuery, useListSitesQuery, useListZonesQuery } from './settings.api';

const SCOPE_ICON: Record<AccessScope['scopeType'], typeof Globe2> = {
  ALL: Globe2,
  REGION: Globe2,
  ZONE: MapPin,
  SITE: Building2,
};

function ScopeBadge({ scope }: { scope: AccessScope }) {
  // Best-effort name resolution — falls back to the raw id if the record
  // isn't present in the (paginated) first page of each hierarchy list.
  const isRegion = scope.scopeType === 'REGION' && !!scope.scopeId;
  const isZone = scope.scopeType === 'ZONE' && !!scope.scopeId;
  const isSite = scope.scopeType === 'SITE' && !!scope.scopeId;

  const { data: regions } = useListRegionsQuery({ limit: 100 }, { skip: !isRegion });
  const { data: zones } = useListZonesQuery({ limit: 100 }, { skip: !isZone });
  const { data: sites } = useListSitesQuery({ limit: 100 }, { skip: !isSite });

  const Icon = SCOPE_ICON[scope.scopeType];

  if (scope.scopeType === 'ALL') {
    return (
      <Badge variant="primary" size="md">
        <Icon className="h-3 w-3" /> All regions
      </Badge>
    );
  }

  const name =
    (isRegion && regions?.items.find((r) => r.id === scope.scopeId)?.name) ||
    (isZone && zones?.items.find((z) => z.id === scope.scopeId)?.name) ||
    (isSite && sites?.items.find((s) => s.id === scope.scopeId)?.name) ||
    scope.scopeId;

  return (
    <Badge variant="default" size="md">
      <Icon className="h-3 w-3" />
      <span className="capitalize">{scope.scopeType.toLowerCase()}:</span> {name}
    </Badge>
  );
}

export function ProfilePanel() {
  const { data: user, isLoading, isFetching, error } = useGetCurrentUserQuery();

  if (isLoading) {
    return <SkeletonCard />;
  }

  if (error || !user) {
    return (
      <Card className="flex items-center gap-3 text-red-600">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span className="text-sm">
          {getApiErrorMessage(error) || 'Could not load your profile.'}
        </span>
      </Card>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  return (
    <motion.div variants={pageChild} className="space-y-6">
      <Card padding="lg" className={isFetching ? 'opacity-80 transition-opacity' : undefined}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">
              {initials}
            </span>
            <div className="min-w-0">
              <h2 className="font-sora text-lg font-semibold text-gray-900">{user.name}</h2>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{user.email}</span>
              </div>
              {user.phone && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{user.phone}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge variant="primary" size="lg">
              {ROLE_LABELS[user.role]}
            </Badge>
            <Badge variant={user.mfaEnabled ? 'success' : 'warning'} size="sm">
              <ShieldCheck className="h-3 w-3" />
              {user.mfaEnabled ? 'Two-factor enabled' : 'Two-factor not enabled'}
            </Badge>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Account details</CardTitle>
            <CardDescription>Read-only information managed by your administrator.</CardDescription>
          </div>
        </CardHeader>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Role</dt>
            <dd className="mt-1 text-sm text-gray-800">{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Last login
            </dt>
            <dd className="mt-1 text-sm text-gray-800">
              {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle>Access scopes</CardTitle>
            <CardDescription>
              The regions, zones and sites you can view or act within.
            </CardDescription>
          </div>
        </CardHeader>
        {user.accessScopes.length === 0 ? (
          <p className="text-sm text-gray-500">No access scopes assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {user.accessScopes.map((scope, i) => (
              <ScopeBadge key={`${scope.scopeType}-${scope.scopeId ?? i}`} scope={scope} />
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default ProfilePanel;
