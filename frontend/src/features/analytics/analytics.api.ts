import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type {
  CameraHealthRow,
  CameraQualityArgs,
  QualityPoint,
  ZoneRollup,
} from './analytics.types';

// Backed by the Stage 2 health module (backend/src/modules/health/health.router.ts,
// mounted at /api, requireAuth, no role gate on reads):
//   GET /cameras/health              — flat scoped camera list w/ health fields
//   GET /zones/health-rollup         — per-zone status counts + avg health score
//   GET /cameras/:id/health/quality  — ConnectionQualityHourly series (?hours)
export const analyticsApi = api
  .enhanceEndpoints({ addTagTypes: ['FleetHealth', 'ZoneHealthRollup', 'CameraQualitySeries'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      getFleetHealth: builder.query<CameraHealthRow[], void>({
        query: () => '/cameras/health',
        transformResponse: unwrapEnvelope<CameraHealthRow[]>,
        providesTags: [{ type: 'FleetHealth', id: 'LIST' }],
      }),

      getZoneRollups: builder.query<ZoneRollup[], void>({
        query: () => '/zones/health-rollup',
        transformResponse: unwrapEnvelope<ZoneRollup[]>,
        providesTags: [{ type: 'ZoneHealthRollup', id: 'LIST' }],
      }),

      getCameraQuality: builder.query<QualityPoint[], CameraQualityArgs>({
        query: ({ cameraId, hours }) => ({
          url: `/cameras/${cameraId}/health/quality`,
          params: { hours },
        }),
        transformResponse: unwrapEnvelope<QualityPoint[]>,
        providesTags: (_result, _error, { cameraId }) => [
          { type: 'CameraQualitySeries', id: cameraId },
        ],
      }),
    }),
  });

export const { useGetFleetHealthQuery, useGetZoneRollupsQuery, useGetCameraQualityQuery } =
  analyticsApi;
