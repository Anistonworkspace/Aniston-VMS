import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { CameraListQuery, CameraLite, PaginatedResult } from './playback.types';

// A deliberately minimal, read-only slice of the cameras API used only to
// populate the camera picker on the Playback page. Real endpoint:
//   GET /cameras (?page&limit&siteId&routerId&status&q) — backend/src/modules/
//   cameras/camera.router.ts, scoped to the caller's access scope server-side.
// This does NOT duplicate ownership of the cameras feature — it injects a
// uniquely named endpoint onto the shared `api` so it composes cleanly
// alongside a future (or concurrently developed) features/cameras/cameras.api.ts.
export const cameraPickerApi = api
  .enhanceEndpoints({ addTagTypes: ['PlaybackCameraPicker'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      listCamerasForPlayback: builder.query<PaginatedResult<CameraLite>, CameraListQuery | void>({
        query: (params) => ({ url: '/cameras', params: params ?? { page: 1, limit: 100 } }),
        transformResponse: unwrapEnvelope<PaginatedResult<CameraLite>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map(({ id }) => ({ type: 'PlaybackCameraPicker' as const, id })),
                { type: 'PlaybackCameraPicker' as const, id: 'LIST' },
              ]
            : [{ type: 'PlaybackCameraPicker' as const, id: 'LIST' }],
      }),
    }),
  });

export const { useListCamerasForPlaybackQuery } = cameraPickerApi;
