import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type {
  CreateLayoutInput,
  SavedLayout,
  StartStreamInput,
  StreamSession,
  UpdateLayoutInput,
} from './livewall.types';

// Real endpoints:
// - backend/src/modules/layouts/layout.router.ts (auth-only, always scoped to
//   the caller's own rows):  GET/POST /saved-layouts · GET/PATCH/DELETE /saved-layouts/:id
// - backend/src/modules/playback/playback.router.ts (auth-only):
//   POST /streams/start · POST /streams/:id/heartbeat · POST /streams/:id/end
// Stream sessions are ephemeral — no cache tags; the tile owns the lifecycle.
export const livewallApi = api.enhanceEndpoints({ addTagTypes: ['SavedLayout'] }).injectEndpoints({
  endpoints: (builder) => ({
    listSavedLayouts: builder.query<SavedLayout[], void>({
      query: () => '/saved-layouts',
      transformResponse: unwrapEnvelope<SavedLayout[]>,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'SavedLayout' as const, id })),
              { type: 'SavedLayout' as const, id: 'LIST' },
            ]
          : [{ type: 'SavedLayout' as const, id: 'LIST' }],
    }),

    createSavedLayout: builder.mutation<SavedLayout, CreateLayoutInput>({
      query: (body) => ({ url: '/saved-layouts', method: 'POST', body }),
      transformResponse: unwrapEnvelope<SavedLayout>,
      invalidatesTags: [{ type: 'SavedLayout' as const, id: 'LIST' }],
    }),

    updateSavedLayout: builder.mutation<SavedLayout, { id: string; body: UpdateLayoutInput }>({
      query: ({ id, body }) => ({ url: `/saved-layouts/${id}`, method: 'PATCH', body }),
      transformResponse: unwrapEnvelope<SavedLayout>,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'SavedLayout' as const, id },
        { type: 'SavedLayout' as const, id: 'LIST' },
      ],
    }),

    deleteSavedLayout: builder.mutation<null, string>({
      query: (id) => ({ url: `/saved-layouts/${id}`, method: 'DELETE' }),
      transformResponse: unwrapEnvelope<null>,
      invalidatesTags: (_result, _error, id) => [
        { type: 'SavedLayout' as const, id },
        { type: 'SavedLayout' as const, id: 'LIST' },
      ],
    }),

    startStream: builder.mutation<StreamSession, StartStreamInput>({
      query: (body) => ({ url: '/streams/start', method: 'POST', body }),
      transformResponse: unwrapEnvelope<StreamSession>,
    }),

    streamHeartbeat: builder.mutation<StreamSession, { id: string; bytesEstimate?: number }>({
      query: ({ id, bytesEstimate }) => ({
        url: `/streams/${id}/heartbeat`,
        method: 'POST',
        body: bytesEstimate !== undefined ? { bytesEstimate } : {},
      }),
      transformResponse: unwrapEnvelope<StreamSession>,
    }),

    endStream: builder.mutation<StreamSession, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/streams/${id}/end`,
        method: 'POST',
        body: reason ? { reason } : {},
      }),
      transformResponse: unwrapEnvelope<StreamSession>,
    }),
  }),
});

export const {
  useListSavedLayoutsQuery,
  useCreateSavedLayoutMutation,
  useUpdateSavedLayoutMutation,
  useDeleteSavedLayoutMutation,
  useStartStreamMutation,
  useStreamHeartbeatMutation,
  useEndStreamMutation,
} = livewallApi;
