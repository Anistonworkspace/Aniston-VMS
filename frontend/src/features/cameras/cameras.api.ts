import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type {
  Camera,
  CameraChecksQuery,
  CameraHealthDetail,
  CameraListQuery,
  CameraSnapshotsQuery,
  CreateCameraInput,
  HealthCheckRecord,
  Paginated,
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

      // POST /cameras — CR-6 admin/engineer registration. Only the LIST tag is
      // invalidated: the new camera has no health/checks/snapshots rows yet.
      createCamera: builder.mutation<Camera, CreateCameraInput>({
        query: (body) => ({ url: '/cameras', method: 'POST', body }),
        transformResponse: unwrapEnvelope<Camera>,
        invalidatesTags: [{ type: 'Camera' as const, id: 'LIST' }],
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
  useCreateCameraMutation,
  useTestCameraConnectionMutation,
  useListRoutersLiteQuery,
  useUpdateCameraMutation,
  useGetCameraHealthQuery,
  useListCameraChecksQuery,
  useRunCameraCheckMutation,
  useListCameraSnapshotsQuery,
  useCaptureSnapshotMutation,
  useListSitesLiteQuery,
} = camerasApi;
