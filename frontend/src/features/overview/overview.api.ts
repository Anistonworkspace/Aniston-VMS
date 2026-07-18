import { api } from '@/app/api';
import type { EvidenceSnapshot, HealthSummary, IncidentSummary, ZoneSummary } from '@/types/vms';
import {
  mockHealthSummary,
  mockLatestEvidence,
  mockRecentIncidents,
  mockZones,
} from '@/mocks/vms-fixtures';

// MOCK: Stage 1 has no backend — every endpoint below resolves from
// src/mocks/vms-fixtures.ts via queryFn (with a small latency so loading
// skeletons are visible). Swap each queryFn for `query: () => ({ url: … })`
// when the real API ships; hooks, tags and consumers stay unchanged.
const MOCK_LATENCY_MS = 400;

async function fromFixture<T>(data: T): Promise<{ data: T }> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  return { data };
}

// NOTE on endpoint names: every feature api injects into the single shared
// `api` from @/app/api, and RTK Query keeps the FIRST endpoint registered
// under a given name (`overrideExisting: false`), silently ignoring later
// ones. Endpoint names here must therefore NOT collide with real endpoints
// (e.g. auth.api `getCurrentUser`, settings.api `listZones`) — a collision
// makes real pages receive mock-fixture shapes and crash.
export const overviewApi = api
  .enhanceEndpoints({ addTagTypes: ['Zone', 'Incident', 'Health', 'Evidence'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      // Renamed from `listZones` — that name collided with the REAL paginated
      // GET /zones endpoint in features/settings/settings.api.ts.
      listZoneSummaries: builder.query<ZoneSummary[], void>({
        queryFn: () => fromFixture(mockZones),
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: 'Zone' as const, id })),
                { type: 'Zone' as const, id: 'LIST' },
              ]
            : [{ type: 'Zone' as const, id: 'LIST' }],
      }),

      getHealthSummary: builder.query<HealthSummary, void>({
        queryFn: () => fromFixture(mockHealthSummary),
        providesTags: [{ type: 'Health' as const, id: 'SUMMARY' }],
      }),

      listRecentIncidents: builder.query<IncidentSummary[], void>({
        queryFn: () => fromFixture(mockRecentIncidents),
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: 'Incident' as const, id })),
                { type: 'Incident' as const, id: 'LIST' },
              ]
            : [{ type: 'Incident' as const, id: 'LIST' }],
      }),

      getLatestEvidence: builder.query<EvidenceSnapshot, void>({
        queryFn: () => fromFixture(mockLatestEvidence),
        providesTags: [{ type: 'Evidence' as const, id: 'LATEST' }],
      }),

      // `getCurrentUser` was REMOVED here: it collided with the real
      // GET /auth/me endpoint in features/auth/auth.api.ts and shadowed it
      // (mock fixture has no `accessScopes`/`email`/`mfaEnabled`), crashing
      // /settings. Use auth.api's useGetCurrentUserQuery instead.
    }),
  });

export const {
  useListZoneSummariesQuery,
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
  useGetLatestEvidenceQuery,
} = overviewApi;
