import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { Paginated } from '@/features/cameras/cameras.types';
import type {
  AdminUserLite,
  IncidentDetail,
  IncidentListItem,
  IncidentListQuery,
  IncidentMutationResult,
  ResolveIncidentInput,
} from './incidents.types';

// Real endpoints — backend/src/modules/incidents/incident.router.ts:
//   GET  /incidents · /incidents/summary · /incidents/:id
//   POST /incidents/:id/ack | /assign | /status | /resolve   (OPERATOR_PLUS)
//   POST /incidents/:id/close                                 (SUPER/PROJECT admin)
//   GET  /users (admin/users.router.ts, admin-only — assign picker)
export const incidentsApi = api
  .enhanceEndpoints({ addTagTypes: ['Incident', 'IncidentSummary', 'AdminUser'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      listIncidents: builder.query<IncidentListItem[], IncidentListQuery>({
        query: (params) => ({ url: '/incidents', params }),
        transformResponse: unwrapEnvelope<IncidentListItem[]>,
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: 'Incident' as const, id })),
                { type: 'Incident' as const, id: 'LIST' },
              ]
            : [{ type: 'Incident' as const, id: 'LIST' }],
      }),

      getIncidentSummary: builder.query<Record<string, number>, void>({
        query: () => '/incidents/summary',
        transformResponse: unwrapEnvelope<Record<string, number>>,
        providesTags: [{ type: 'IncidentSummary' as const, id: 'ALL' }],
      }),

      getIncidentDetail: builder.query<IncidentDetail, string>({
        query: (id) => `/incidents/${id}`,
        transformResponse: unwrapEnvelope<IncidentDetail>,
        providesTags: (_result, _error, id) => [{ type: 'Incident' as const, id }],
      }),

      ackIncident: builder.mutation<IncidentMutationResult, string>({
        query: (id) => ({ url: `/incidents/${id}/ack`, method: 'POST' }),
        transformResponse: unwrapEnvelope<IncidentMutationResult>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'Incident' as const, id },
          { type: 'Incident' as const, id: 'LIST' },
          { type: 'IncidentSummary' as const, id: 'ALL' },
        ],
      }),

      assignIncident: builder.mutation<
        IncidentMutationResult,
        { id: string; assignedToId: string }
      >({
        query: ({ id, assignedToId }) => ({
          url: `/incidents/${id}/assign`,
          method: 'POST',
          body: { assignedToId },
        }),
        transformResponse: unwrapEnvelope<IncidentMutationResult>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'Incident' as const, id },
          { type: 'Incident' as const, id: 'LIST' },
          { type: 'IncidentSummary' as const, id: 'ALL' },
        ],
      }),

      markInvestigating: builder.mutation<IncidentMutationResult, string>({
        query: (id) => ({
          url: `/incidents/${id}/status`,
          method: 'POST',
          body: { status: 'INVESTIGATING' },
        }),
        transformResponse: unwrapEnvelope<IncidentMutationResult>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'Incident' as const, id },
          { type: 'Incident' as const, id: 'LIST' },
          { type: 'IncidentSummary' as const, id: 'ALL' },
        ],
      }),

      resolveIncident: builder.mutation<
        IncidentMutationResult,
        { id: string; body: ResolveIncidentInput }
      >({
        query: ({ id, body }) => ({ url: `/incidents/${id}/resolve`, method: 'POST', body }),
        transformResponse: unwrapEnvelope<IncidentMutationResult>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'Incident' as const, id },
          { type: 'Incident' as const, id: 'LIST' },
          { type: 'IncidentSummary' as const, id: 'ALL' },
        ],
      }),

      closeIncident: builder.mutation<IncidentMutationResult, string>({
        query: (id) => ({ url: `/incidents/${id}/close`, method: 'POST' }),
        transformResponse: unwrapEnvelope<IncidentMutationResult>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'Incident' as const, id },
          { type: 'Incident' as const, id: 'LIST' },
          { type: 'IncidentSummary' as const, id: 'ALL' },
        ],
      }),

      listAssignableUsers: builder.query<Paginated<AdminUserLite>, void>({
        query: () => ({ url: '/users', params: { page: 1, limit: 100 } }),
        transformResponse: unwrapEnvelope<Paginated<AdminUserLite>>,
        providesTags: [{ type: 'AdminUser' as const, id: 'LIST' }],
      }),
    }),
  });

export const {
  useListIncidentsQuery,
  useGetIncidentSummaryQuery,
  useGetIncidentDetailQuery,
  useAckIncidentMutation,
  useAssignIncidentMutation,
  useMarkInvestigatingMutation,
  useResolveIncidentMutation,
  useCloseIncidentMutation,
  useListAssignableUsersQuery,
} = incidentsApi;
