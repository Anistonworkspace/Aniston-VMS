import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type {
  DashboardOverview,
  EvidenceSnapshot,
  HealthSummary,
  IncidentSummary,
  ZoneOverview,
  ZoneSummary,
} from '@/types/vms';

// NOTE on endpoint names: every feature api injects into the single shared
// `api` from @/app/api, and RTK Query keeps the FIRST endpoint registered
// under a given name (`overrideExisting: false`), silently ignoring later
// ones. Endpoint names here must therefore NOT collide with real endpoints
// (e.g. auth.api `getCurrentUser`, settings.api `listZones`) — a collision
// makes one page silently shadow another endpoint's shape and crash.
export const overviewApi = api
  .enhanceEndpoints({ addTagTypes: ['Zone', 'Incident', 'Health', 'Evidence', 'Dashboard'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      // CR-2 dashboard overview — REAL backend endpoint (not a mock fixture).
      // Exists exactly as GET /api/dashboard/overview in
      // backend/src/modules/dashboard/dashboard.router.ts; scope-filtered
      // server-side. Envelope { success, data } unwrapped to DashboardOverview.
      getDashboardOverview: builder.query<DashboardOverview, void>({
        query: () => '/dashboard/overview',
        transformResponse: unwrapEnvelope<DashboardOverview>,
        providesTags: [{ type: 'Dashboard' as const, id: 'OVERVIEW' }],
      }),

      // CR-8: REAL scope-aware zone cards for the sidebar + dashboard grid.
      // GET /api/dashboard/zones returns real zone IDs so each card/sidebar row
      // deep-links to its populated /zones/:id page. Renamed from `listZones`
      // to avoid colliding with the paginated GET /zones in settings.api.ts.
      listZoneSummaries: builder.query<ZoneSummary[], void>({
        query: () => '/dashboard/zones',
        transformResponse: unwrapEnvelope<ZoneSummary[]>,
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: 'Zone' as const, id })),
                { type: 'Zone' as const, id: 'LIST' },
              ]
            : [{ type: 'Zone' as const, id: 'LIST' }],
      }),

      // CR-8: populated single-zone overview (KPIs, sites, cameras, open
      // incidents, trailing-30 d uptime). GET /api/dashboard/zones/:id.
      getZoneOverview: builder.query<ZoneOverview, string>({
        query: (zoneId) => `/dashboard/zones/${zoneId}`,
        transformResponse: unwrapEnvelope<ZoneOverview>,
        providesTags: (_result, _err, zoneId) => [{ type: 'Zone' as const, id: zoneId }],
      }),

      // CR-2 overview widgets — REAL scope-aware backend endpoints in
      // backend/src/modules/dashboard/dashboard.widgets.ts. Envelope
      // { success, data } unwrapped; hooks, tags and consumers unchanged.
      getHealthSummary: builder.query<HealthSummary, void>({
        query: () => '/dashboard/health-summary',
        transformResponse: unwrapEnvelope<HealthSummary>,
        providesTags: [{ type: 'Health' as const, id: 'SUMMARY' }],
      }),

      listRecentIncidents: builder.query<IncidentSummary[], void>({
        query: () => '/dashboard/recent-incidents',
        transformResponse: unwrapEnvelope<IncidentSummary[]>,
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: 'Incident' as const, id })),
                { type: 'Incident' as const, id: 'LIST' },
              ]
            : [{ type: 'Incident' as const, id: 'LIST' }],
      }),

      getLatestEvidence: builder.query<EvidenceSnapshot | null, void>({
        query: () => '/dashboard/latest-evidence',
        transformResponse: unwrapEnvelope<EvidenceSnapshot | null>,
        providesTags: [{ type: 'Evidence' as const, id: 'LATEST' }],
      }),

      // `getCurrentUser` was REMOVED here: it collided with the real
      // GET /auth/me endpoint in features/auth/auth.api.ts and shadowed it
      // (mock fixture has no `accessScopes`/`email`/`mfaEnabled`), crashing
      // /settings. Use auth.api's useGetCurrentUserQuery instead.
    }),
  });

export const {
  useGetDashboardOverviewQuery,
  useListZoneSummariesQuery,
  useGetZoneOverviewQuery,
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
  useGetLatestEvidenceQuery,
} = overviewApi;
