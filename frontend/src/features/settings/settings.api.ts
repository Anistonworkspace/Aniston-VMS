import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { ApiEnvelope } from '@/lib/apiError';
import type {
  CreateRegionInput,
  CreateRouterInput,
  CreateSiteInput,
  CreateZoneInput,
  MfaCodeInput,
  MfaSetupResult,
  MfaStatusResult,
  PaginatedResult,
  Region,
  RegionListQuery,
  Router as HierarchyRouterModel,
  RouterListQuery,
  Site,
  SiteListQuery,
  UpdateRegionInput,
  UpdateRouterInput,
  UpdateSiteInput,
  UpdateZoneInput,
  Zone,
  ZoneListQuery,
} from './settings.types';

// Real backend endpoints — every hierarchy route below exists exactly as
// written in backend/src/modules/hierarchy/hierarchy.router.ts (mounted at
// /api, i.e. GET/POST /regions, /zones, /sites, /routers). MFA routes exist
// exactly as written in backend/src/modules/auth/auth.router.ts. None of
// these are mocked/assumed.
function toQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export const settingsApi = api
  .enhanceEndpoints({ addTagTypes: ['AuthUser', 'Region', 'Zone', 'Site', 'Router'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      // ── Regions ──────────────────────────────────────────────────────
      listRegions: builder.query<PaginatedResult<Region>, RegionListQuery | void>({
        query: (params) => `/regions${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<PaginatedResult<Region>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((r) => ({ type: 'Region' as const, id: r.id })),
                { type: 'Region' as const, id: 'LIST' },
              ]
            : [{ type: 'Region' as const, id: 'LIST' }],
      }),
      createRegion: builder.mutation<Region, CreateRegionInput>({
        query: (body) => ({ url: '/regions', method: 'POST', body }),
        transformResponse: unwrapEnvelope<Region>,
        invalidatesTags: [{ type: 'Region', id: 'LIST' }],
      }),
      updateRegion: builder.mutation<Region, { id: string; body: UpdateRegionInput }>({
        query: ({ id, body }) => ({ url: `/regions/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<Region>,
        invalidatesTags: (_result, _error, arg) => [
          { type: 'Region', id: arg.id },
          { type: 'Region', id: 'LIST' },
        ],
      }),
      deleteRegion: builder.mutation<void, string>({
        query: (id) => ({ url: `/regions/${id}`, method: 'DELETE' }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: [{ type: 'Region', id: 'LIST' }],
      }),

      // ── Zones ────────────────────────────────────────────────────────
      listZones: builder.query<PaginatedResult<Zone>, ZoneListQuery | void>({
        query: (params) => `/zones${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<PaginatedResult<Zone>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((z) => ({ type: 'Zone' as const, id: z.id })),
                { type: 'Zone' as const, id: 'LIST' },
              ]
            : [{ type: 'Zone' as const, id: 'LIST' }],
      }),
      createZone: builder.mutation<Zone, CreateZoneInput>({
        query: (body) => ({ url: '/zones', method: 'POST', body }),
        transformResponse: unwrapEnvelope<Zone>,
        invalidatesTags: [
          { type: 'Zone', id: 'LIST' },
          { type: 'Region', id: 'LIST' },
        ],
      }),
      updateZone: builder.mutation<Zone, { id: string; body: UpdateZoneInput }>({
        query: ({ id, body }) => ({ url: `/zones/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<Zone>,
        invalidatesTags: (_result, _error, arg) => [
          { type: 'Zone', id: arg.id },
          { type: 'Zone', id: 'LIST' },
        ],
      }),
      deleteZone: builder.mutation<void, string>({
        query: (id) => ({ url: `/zones/${id}`, method: 'DELETE' }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: [
          { type: 'Zone', id: 'LIST' },
          { type: 'Region', id: 'LIST' },
        ],
      }),

      // ── Sites ────────────────────────────────────────────────────────
      listSites: builder.query<PaginatedResult<Site>, SiteListQuery | void>({
        query: (params) => `/sites${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<PaginatedResult<Site>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((s) => ({ type: 'Site' as const, id: s.id })),
                { type: 'Site' as const, id: 'LIST' },
              ]
            : [{ type: 'Site' as const, id: 'LIST' }],
      }),
      createSite: builder.mutation<Site, CreateSiteInput>({
        query: (body) => ({ url: '/sites', method: 'POST', body }),
        transformResponse: unwrapEnvelope<Site>,
        invalidatesTags: [
          { type: 'Site', id: 'LIST' },
          { type: 'Zone', id: 'LIST' },
        ],
      }),
      updateSite: builder.mutation<Site, { id: string; body: UpdateSiteInput }>({
        query: ({ id, body }) => ({ url: `/sites/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<Site>,
        invalidatesTags: (_result, _error, arg) => [
          { type: 'Site', id: arg.id },
          { type: 'Site', id: 'LIST' },
        ],
      }),
      deleteSite: builder.mutation<void, string>({
        query: (id) => ({ url: `/sites/${id}`, method: 'DELETE' }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: [
          { type: 'Site', id: 'LIST' },
          { type: 'Zone', id: 'LIST' },
        ],
      }),

      // ── Routers ──────────────────────────────────────────────────────
      listRouters: builder.query<PaginatedResult<HierarchyRouterModel>, RouterListQuery | void>({
        query: (params) => `/routers${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<PaginatedResult<HierarchyRouterModel>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((r) => ({ type: 'Router' as const, id: r.id })),
                { type: 'Router' as const, id: 'LIST' },
              ]
            : [{ type: 'Router' as const, id: 'LIST' }],
      }),
      createRouter: builder.mutation<HierarchyRouterModel, CreateRouterInput>({
        query: (body) => ({ url: '/routers', method: 'POST', body }),
        transformResponse: unwrapEnvelope<HierarchyRouterModel>,
        invalidatesTags: [
          { type: 'Router', id: 'LIST' },
          { type: 'Site', id: 'LIST' },
        ],
      }),
      updateRouter: builder.mutation<HierarchyRouterModel, { id: string; body: UpdateRouterInput }>(
        {
          query: ({ id, body }) => ({ url: `/routers/${id}`, method: 'PATCH', body }),
          transformResponse: unwrapEnvelope<HierarchyRouterModel>,
          invalidatesTags: (_result, _error, arg) => [
            { type: 'Router', id: arg.id },
            { type: 'Router', id: 'LIST' },
          ],
        }
      ),
      deleteRouter: builder.mutation<void, string>({
        query: (id) => ({ url: `/routers/${id}`, method: 'DELETE' }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: [
          { type: 'Router', id: 'LIST' },
          { type: 'Site', id: 'LIST' },
        ],
      }),

      // ── MFA (auth.router.ts /auth/mfa/*) ────────────────────────────
      // Not defined in features/auth/auth.api.ts (that file only owns
      // login/refresh/me/logout/changePassword) — added here per this
      // feature's API rules, invalidating the shared `AuthUser` tag so
      // useGetCurrentUserQuery (features/auth/auth.api.ts) refetches.
      setupMfa: builder.mutation<MfaSetupResult, void>({
        query: () => ({ url: '/auth/mfa/setup', method: 'POST' }),
        transformResponse: unwrapEnvelope<MfaSetupResult>,
      }),
      verifyMfa: builder.mutation<MfaStatusResult, MfaCodeInput>({
        query: (body) => ({ url: '/auth/mfa/verify', method: 'POST', body }),
        transformResponse: unwrapEnvelope<MfaStatusResult>,
        invalidatesTags: [{ type: 'AuthUser', id: 'ME' }],
      }),
      disableMfa: builder.mutation<MfaStatusResult, MfaCodeInput>({
        query: (body) => ({ url: '/auth/mfa/disable', method: 'POST', body }),
        transformResponse: unwrapEnvelope<MfaStatusResult>,
        invalidatesTags: [{ type: 'AuthUser', id: 'ME' }],
      }),
    }),
  });

export const {
  useListRegionsQuery,
  useCreateRegionMutation,
  useUpdateRegionMutation,
  useDeleteRegionMutation,
  useListZonesQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useDeleteZoneMutation,
  useListSitesQuery,
  useCreateSiteMutation,
  useUpdateSiteMutation,
  useDeleteSiteMutation,
  useListRoutersQuery,
  useCreateRouterMutation,
  useUpdateRouterMutation,
  useDeleteRouterMutation,
  useSetupMfaMutation,
  useVerifyMfaMutation,
  useDisableMfaMutation,
} = settingsApi;
