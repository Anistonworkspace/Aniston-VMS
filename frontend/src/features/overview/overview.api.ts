import { api } from '@/app/api';
import type {
  CurrentUser,
  EvidenceSnapshot,
  HealthSummary,
  IncidentSummary,
  ZoneSummary,
} from '@/types/vms';
import {
  mockCurrentUser,
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

export const overviewApi = api
  .enhanceEndpoints({ addTagTypes: ['Zone', 'Incident', 'Health', 'Evidence', 'CurrentUser'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      listZones: builder.query<ZoneSummary[], void>({
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

      getCurrentUser: builder.query<CurrentUser, void>({
        queryFn: () => fromFixture(mockCurrentUser),
        providesTags: [{ type: 'CurrentUser' as const, id: 'ME' }],
      }),
    }),
  });

export const {
  useListZonesQuery,
  useGetHealthSummaryQuery,
  useListRecentIncidentsQuery,
  useGetLatestEvidenceQuery,
  useGetCurrentUserQuery,
} = overviewApi;
