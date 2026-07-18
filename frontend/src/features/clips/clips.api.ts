import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { ClipExport, ClipListQuery, CreateClipInput } from './clips.types';

// Backed by backend/src/modules/clips/clip.router.ts:
//   GET  /clips                 — scoped list (?cameraId&status&incidentId&limit)
//   GET  /clips/:id             — single clip
//   POST /cameras/:id/clips     — queue an export (OPERATOR+ roles, requireRole)
// Every response is the standard `{ success, data }` envelope. Clips move
// QUEUED → PROCESSING → DONE|FAILED server-side, so the list page polls while
// any clip is still active (see ClipsPage.tsx).
export const clipsApi = api.enhanceEndpoints({ addTagTypes: ['Clip'] }).injectEndpoints({
  endpoints: (builder) => ({
    listClips: builder.query<ClipExport[], ClipListQuery>({
      // fetchBaseQuery strips undefined params, so optional filters can be
      // passed through as-is.
      query: (params) => ({ url: '/clips', params: { ...params } }),
      transformResponse: unwrapEnvelope<ClipExport[]>,
      providesTags: (result) => [
        { type: 'Clip' as const, id: 'LIST' },
        ...(result ?? []).map((clip) => ({ type: 'Clip' as const, id: clip.id })),
      ],
    }),

    getClip: builder.query<ClipExport, string>({
      query: (id) => `/clips/${id}`,
      transformResponse: unwrapEnvelope<ClipExport>,
      providesTags: (_result, _error, id) => [{ type: 'Clip', id }],
    }),

    createClip: builder.mutation<ClipExport, CreateClipInput>({
      query: ({ cameraId, ...body }) => ({
        url: `/cameras/${cameraId}/clips`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrapEnvelope<ClipExport>,
      invalidatesTags: [{ type: 'Clip', id: 'LIST' }],
    }),
  }),
});

export const { useListClipsQuery, useGetClipQuery, useCreateClipMutation } = clipsApi;
