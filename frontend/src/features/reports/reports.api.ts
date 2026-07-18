import { api } from '@/app/api';
import { unwrapEnvelope, type ApiEnvelope } from '@/lib/apiError';
import type {
  CameraOption,
  IncidentsReportFilters,
  IncidentsReportResult,
  ReportExportQuery,
  ReportExportResult,
  ReportScopeFilters,
  ScopeOption,
  UptimeReportResult,
} from './reports.types';

// Backend list endpoints (hierarchy.router.ts / camera.router.ts) return
// `{ items, total, page, limit }`. Reports only ever needs `{ id, name }` (or
// `{ id, name, cameraCode }` for cameras) for a filter dropdown, so every
// list endpoint below narrows the raw items down via transformResponse
// rather than re-declaring their full backend shape here.
interface RawListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// A page size of 100 comfortably covers a single region/zone/site's children
// for a filter dropdown; sites with more than 100 cameras would be truncated
// here — a search box would be the fix, out of scope for this panel.
const SCOPE_OPTION_PAGE_PARAMS = { page: 1, limit: 100 };

/** Drops `undefined` / empty-string values so fetchBaseQuery's `params` only serializes real filters. */
function toQueryParams(filters: object): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value as string | number;
    }
  }
  return params;
}

export const reportsApi = api
  .enhanceEndpoints({ addTagTypes: ['UptimeReport', 'IncidentsReport', 'ReportScopeOptions'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      // GET /reports/uptime — per-camera uptime % vs REPORTS_SLA_UPTIME_TARGET_PCT
      getUptimeReport: builder.query<UptimeReportResult, ReportScopeFilters>({
        query: (filters) => ({ url: '/reports/uptime', params: toQueryParams(filters) }),
        transformResponse: unwrapEnvelope<UptimeReportResult>,
        providesTags: [{ type: 'UptimeReport', id: 'CURRENT' }],
      }),

      // GET /reports/incidents — incident rows + MTTA/MTTR/severity summary
      getIncidentsReport: builder.query<IncidentsReportResult, IncidentsReportFilters>({
        query: (filters) => ({ url: '/reports/incidents', params: toQueryParams(filters) }),
        transformResponse: unwrapEnvelope<IncidentsReportResult>,
        providesTags: [{ type: 'IncidentsReport', id: 'CURRENT' }],
      }),

      // GET /reports/export — renders the report server-side and stores it,
      // returning a signed download URL. Has a side effect (stored artifact +
      // audit log entry), so it is a mutation despite the HTTP GET verb.
      exportReport: builder.mutation<ReportExportResult, ReportExportQuery>({
        query: (filters) => ({
          url: '/reports/export',
          method: 'GET',
          params: toQueryParams(filters),
        }),
        transformResponse: unwrapEnvelope<ReportExportResult>,
      }),

      // GET /regions — region picker.
      // NOTE: these three pickers are prefixed `listReport*` because
      // admin.api.ts also injects `listRegionOptions`/`listZoneOptions`/
      // `listSiteOptions` into the SAME shared base api with an INCOMPATIBLE
      // return shape (Paginated<{items}> vs mapped ScopeOption[]). RTK Query
      // keeps only the first-registered endpoint per name, so a collision
      // silently feeds one page the other's shape and crashes it.
      listReportRegionOptions: builder.query<ScopeOption[], void>({
        query: () => ({ url: '/regions', params: SCOPE_OPTION_PAGE_PARAMS }),
        transformResponse: (response: ApiEnvelope<RawListResult<ScopeOption>>) =>
          response.data.items.map(({ id, name }) => ({ id, name })),
        providesTags: [{ type: 'ReportScopeOptions', id: 'REGIONS' }],
      }),

      // GET /zones?regionId= — zone picker, optionally scoped to a region
      listReportZoneOptions: builder.query<ScopeOption[], { regionId?: string } | void>({
        query: (arg) => ({
          url: '/zones',
          params: toQueryParams({ ...SCOPE_OPTION_PAGE_PARAMS, regionId: arg?.regionId }),
        }),
        transformResponse: (response: ApiEnvelope<RawListResult<ScopeOption>>) =>
          response.data.items.map(({ id, name }) => ({ id, name })),
        providesTags: [{ type: 'ReportScopeOptions', id: 'ZONES' }],
      }),

      // GET /sites?zoneId=&regionId= — site picker, optionally scoped to a zone and/or region
      listReportSiteOptions: builder.query<
        ScopeOption[],
        { zoneId?: string; regionId?: string } | void
      >({
        query: (arg) => ({
          url: '/sites',
          params: toQueryParams({
            ...SCOPE_OPTION_PAGE_PARAMS,
            zoneId: arg?.zoneId,
            regionId: arg?.regionId,
          }),
        }),
        transformResponse: (response: ApiEnvelope<RawListResult<ScopeOption>>) =>
          response.data.items.map(({ id, name }) => ({ id, name })),
        providesTags: [{ type: 'ReportScopeOptions', id: 'SITES' }],
      }),

      // GET /cameras?siteId= — camera picker, scoped to a site
      listCameraOptions: builder.query<CameraOption[], { siteId?: string } | void>({
        query: (arg) => ({
          url: '/cameras',
          params: toQueryParams({ ...SCOPE_OPTION_PAGE_PARAMS, siteId: arg?.siteId }),
        }),
        transformResponse: (response: ApiEnvelope<RawListResult<CameraOption>>) =>
          response.data.items.map(({ id, name, cameraCode }) => ({ id, name, cameraCode })),
        providesTags: [{ type: 'ReportScopeOptions', id: 'CAMERAS' }],
      }),
    }),
  });

export const {
  useGetUptimeReportQuery,
  useGetIncidentsReportQuery,
  useExportReportMutation,
  useListReportRegionOptionsQuery,
  useListReportZoneOptionsQuery,
  useListReportSiteOptionsQuery,
  useListCameraOptionsQuery,
} = reportsApi;
