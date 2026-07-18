import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { ClipExport, ClipListQuery, CreateClipInput } from './playback.types';

// Real endpoints (backend/src/modules/clips/clip.router.ts + cameras.router.ts, mounted at /api):
//   POST /cameras/:id/clips  — request a clip export for a time range (audited, OPERATOR+)
//   GET  /clips              — list clip exports (?cameraId&status&incidentId&limit)
//   GET  /clips/:id          — poll a single clip export's status/downloadUrl
// clip.downloadUrl is already a fully signed URL produced server-side via
// signStorageUrl() — never construct storage keys/URLs on the client.
export const clipsApi = api.enhanceEndpoints({ addTagTypes: ['ClipExport'] }).injectEndpoints({
  endpoints: (builder) => ({
    createClipExport: builder.mutation<ClipExport, { cameraId: string; body: CreateClipInput }>({
      query: ({ cameraId, body }) => ({
        url: `/cameras/${cameraId}/clips`,
        method: 'POST',
        body,
      }),
      transformResponse: unwrapEnvelope<ClipExport>,
      invalidatesTags: [{ type: 'ClipExport' as const, id: 'LIST' }],
    }),

    listClipExports: builder.query<ClipExport[], ClipListQuery>({
      query: (params) => ({ url: '/clips', params }),
      transformResponse: unwrapEnvelope<ClipExport[]>,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'ClipExport' as const, id })),
              { type: 'ClipExport' as const, id: 'LIST' },
            ]
          : [{ type: 'ClipExport' as const, id: 'LIST' }],
    }),

    getClipExport: builder.query<ClipExport, string>({
      query: (id) => `/clips/${id}`,
      transformResponse: unwrapEnvelope<ClipExport>,
      providesTags: (_result, _error, id) => [{ type: 'ClipExport' as const, id }],
    }),
  }),
});

export const { useCreateClipExportMutation, useListClipExportsQuery, useGetClipExportQuery } =
  clipsApi;
