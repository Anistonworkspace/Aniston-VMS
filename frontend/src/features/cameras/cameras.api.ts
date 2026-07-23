import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type {
  ActivateCameraResult,
  Camera,
  CameraChecksQuery,
  CameraHealthDetail,
  CameraListQuery,
  CameraSnapshotsQuery,
  ConfigureCameraInput,
  HealthCheckRecord,
  Paginated,
  RegisterCameraInput,
  RouterItem,
  RunCheckResult,
  SiteItem,
  SnapshotItem,
  TestCameraConnectionInput,
  TestConnectionResult,
  UpdateCameraInput,
} from './cameras.types';

// Real Stage-2 endpoints (unlike overview.api.ts, which still serves fixtures):
//   GET  /cameras · GET /cameras/:id · PATCH /cameras/:id     (camera.router.ts)
//   GET  /cameras/:id/health · /health/checks · POST /health/run (health.router.ts)
//   GET  /cameras/:id/snapshots · POST /snapshots/capture     (snapshot.router.ts)
//   GET  /sites                                               (hierarchy.router.ts)
export const camerasApi = api
  .enhanceEndpoints({
    addTagTypes: ['Camera', 'CameraHealth', 'CameraChecks', 'CameraSnapshots', 'Site', 'Router'],
  })
  .injectEndpoints({
    endpoints: (builder) => ({
      listCameras: builder.query<Paginated<Camera>, CameraListQuery>({
        query: (params) => ({ url: '/cameras', params }),
        transformResponse: unwrapEnvelope<Paginated<Camera>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map(({ id }) => ({ type: 'Camera' as const, id })),
                { type: 'Camera' as const, id: 'LIST' },
              ]
            : [{ type: 'Camera' as const, id: 'LIST' }],
      }),

      getCamera: builder.query<Camera, string>({
        query: (id) => `/cameras/${id}`,
        transformResponse: unwrapEnvelope<Camera>,
        providesTags: (_result, _error, id) => [{ type: 'Camera' as const, id }],
      }),

      updateCamera: builder.mutation<Camera, { id: string; body: UpdateCameraInput }>({
        query: ({ id, body }) => ({ url: `/cameras/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<Camera>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'Camera' as const, id },
          { type: 'Camera' as const, id: 'LIST' },
          { type: 'CameraHealth' as const, id },
        ],
      }),

      // DELETE /cameras/:id — hard delete, ADMIN_ROLES only (server-enforced).
      // Success-only invalidation: return [] when `error` is set so a failed
      // delete leaves the cached list untouched and the camera stays on screen
      // (req 7). RTK already skips invalidation for a rejected mutation, but
      // branching on `error` makes the guarantee explicit and self-documenting
      // rather than relying on that implicit behaviour.
      deleteCamera: builder.mutation<void, string>({
        query: (id) => ({ url: `/cameras/${id}`, method: 'DELETE' }),
        invalidatesTags: (_result, error, id) =>
          error
            ? []
            : [
                { type: 'Camera' as const, id },
                { type: 'Camera' as const, id: 'LIST' },
              ],
      }),

      // POST /cameras — step 1: register a camera with identity only. It is born
      // DRAFT with no config, so only the LIST tag is invalidated (no
      // health/checks/snapshots rows exist yet).
      registerCamera: builder.mutation<Camera, RegisterCameraInput>({
        query: (body) => ({ url: '/cameras', method: 'POST', body }),
        transformResponse: unwrapEnvelope<Camera>,
        invalidatesTags: [{ type: 'Camera' as const, id: 'LIST' }],
      }),

      // PUT /cameras/:id/configure — step 2: save placement + network + stream
      // config. State-preserving (never activates), but the list card shows
      // site/config-derived fields, so invalidate the row and the LIST.
      configureCamera: builder.mutation<Camera, { id: string; body: ConfigureCameraInput }>({
        query: ({ id, body }) => ({ url: `/cameras/${id}/configure`, method: 'PUT', body }),
        transformResponse: unwrapEnvelope<Camera>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'Camera' as const, id },
          { type: 'Camera' as const, id: 'LIST' },
        ],
      }),

      // POST /cameras/:id/activate — step 3: DRAFT → CONFIGURED. The server
      // RE-RUNS the connection test against the stored config; a failing probe
      // returns 200 with { activated: false, test } (not an error). Only flips
      // to CONFIGURED on success, which starts health-probing — so invalidate
      // the row, LIST and CameraHealth. Skip invalidation on transport error.
      activateCamera: builder.mutation<ActivateCameraResult, string>({
        query: (id) => ({ url: `/cameras/${id}/activate`, method: 'POST' }),
        transformResponse: unwrapEnvelope<ActivateCameraResult>,
        invalidatesTags: (_result, error, id) =>
          error
            ? []
            : [
                { type: 'Camera' as const, id },
                { type: 'Camera' as const, id: 'LIST' },
                { type: 'CameraHealth' as const, id },
              ],
      }),

      // POST /cameras/:id/deactivate — CONFIGURED → DRAFT (config retained,
      // health-probing stops). Invalidate the row, LIST and CameraHealth.
      deactivateCamera: builder.mutation<Camera, string>({
        query: (id) => ({ url: `/cameras/${id}/deactivate`, method: 'POST' }),
        transformResponse: unwrapEnvelope<Camera>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'Camera' as const, id },
          { type: 'Camera' as const, id: 'LIST' },
          { type: 'CameraHealth' as const, id },
        ],
      }),

      // POST /cameras/test-connection — CR-6 pre-registration probe (RTSP
      // DESCRIBE + one ffprobe frame). Read-only: nothing persisted, no audit
      // row, so no tags to invalidate.
      testCameraConnection: builder.mutation<TestConnectionResult, TestCameraConnectionInput>({
        query: (body) => ({ url: '/cameras/test-connection', method: 'POST', body }),
        transformResponse: unwrapEnvelope<TestConnectionResult>,
      }),

      getCameraHealth: builder.query<CameraHealthDetail, string>({
        query: (id) => `/cameras/${id}/health`,
        transformResponse: unwrapEnvelope<CameraHealthDetail>,
        providesTags: (_result, _error, id) => [{ type: 'CameraHealth' as const, id }],
      }),

      listCameraChecks: builder.query<HealthCheckRecord[], CameraChecksQuery>({
        query: ({ cameraId, hours = 24, checkType }) => ({
          url: `/cameras/${cameraId}/health/checks`,
          params: { hours, checkType },
        }),
        transformResponse: unwrapEnvelope<HealthCheckRecord[]>,
        providesTags: (_result, _error, { cameraId }) => [
          { type: 'CameraChecks' as const, id: cameraId },
        ],
      }),

      runCameraCheck: builder.mutation<RunCheckResult, string>({
        query: (id) => ({ url: `/cameras/${id}/health/run`, method: 'POST' }),
        transformResponse: unwrapEnvelope<RunCheckResult>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'CameraHealth' as const, id },
          { type: 'CameraChecks' as const, id },
          { type: 'Camera' as const, id },
          { type: 'Camera' as const, id: 'LIST' },
        ],
      }),

      listCameraSnapshots: builder.query<SnapshotItem[], CameraSnapshotsQuery>({
        query: ({ cameraId, hours = 24, kind, limit = 12 }) => ({
          url: `/cameras/${cameraId}/snapshots`,
          params: { hours, kind, limit },
        }),
        transformResponse: unwrapEnvelope<SnapshotItem[]>,
        providesTags: (_result, _error, { cameraId }) => [
          { type: 'CameraSnapshots' as const, id: cameraId },
        ],
      }),

      captureSnapshot: builder.mutation<SnapshotItem, string>({
        query: (id) => ({ url: `/cameras/${id}/snapshots/capture`, method: 'POST' }),
        transformResponse: unwrapEnvelope<SnapshotItem>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'CameraSnapshots' as const, id },
          { type: 'Camera' as const, id },
        ],
      }),

      // Renamed from `listSites` — that name collided with settings.api's
      // parameterized `listSites` on the shared base api (RTK Query keeps the
      // first-registered endpoint and silently drops the other).
      listSitesLite: builder.query<Paginated<SiteItem>, void>({
        query: () => ({ url: '/sites', params: { page: 1, limit: 100 } }),
        transformResponse: unwrapEnvelope<Paginated<SiteItem>>,
        providesTags: [{ type: 'Site' as const, id: 'LIST' }],
      }),

      // GET /routers — powers the add-camera modal's router select (label is
      // serial + model; routers have no display name in the data model).
      listRoutersLite: builder.query<Paginated<RouterItem>, void>({
        query: () => ({ url: '/routers', params: { page: 1, limit: 100 } }),
        transformResponse: unwrapEnvelope<Paginated<RouterItem>>,
        providesTags: [{ type: 'Router' as const, id: 'LIST' }],
      }),
    }),
  });

export const {
  useListCamerasQuery,
  useGetCameraQuery,
  useRegisterCameraMutation,
  useConfigureCameraMutation,
  useActivateCameraMutation,
  useDeactivateCameraMutation,
  useTestCameraConnectionMutation,
  useListRoutersLiteQuery,
  useUpdateCameraMutation,
  useDeleteCameraMutation,
  useGetCameraHealthQuery,
  useListCameraChecksQuery,
  useRunCameraCheckMutation,
  useListCameraSnapshotsQuery,
  useCaptureSnapshotMutation,
  useListSitesLiteQuery,
} = camerasApi;
