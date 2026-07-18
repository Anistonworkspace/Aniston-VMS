import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type {
  EndSessionInput,
  HeartbeatInput,
  RecordingSegment,
  SegmentsQuery,
  SessionListQuery,
  StartSessionInput,
  StreamSession,
  StreamSessionWithParticipants,
} from './playback.types';

// Real endpoints (backend/src/modules/playback/playback.router.ts, mounted at /api):
//   POST /streams/start                    — begin a LIVE_SUB/LIVE_MAIN/PLAYBACK session
//   POST /streams/:id/heartbeat             — keep-alive (resets STREAM_SESSION_TIMEOUT_SECONDS)
//   POST /streams/:id/end                   — end a session (idempotent)
//   GET  /streams/:id                       — session detail (owner or admin)
//   GET  /streams                           — active sessions across users (OPERATOR+)
//   GET  /cameras/:id/recording/segments    — recorded segment timeline (?startAt&endAt&track)
export const playbackApi = api
  .enhanceEndpoints({ addTagTypes: ['StreamSession', 'RecordingSegment'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      startSession: builder.mutation<StreamSession, StartSessionInput>({
        query: (body) => ({ url: '/streams/start', method: 'POST', body }),
        transformResponse: unwrapEnvelope<StreamSession>,
        invalidatesTags: [{ type: 'StreamSession' as const, id: 'ACTIVE_LIST' }],
      }),

      getSession: builder.query<StreamSession, string>({
        query: (id) => `/streams/${id}`,
        transformResponse: unwrapEnvelope<StreamSession>,
        providesTags: (_result, _error, id) => [{ type: 'StreamSession' as const, id }],
      }),

      listActiveSessions: builder.query<StreamSessionWithParticipants[], SessionListQuery>({
        query: (params) => ({ url: '/streams', params }),
        transformResponse: unwrapEnvelope<StreamSessionWithParticipants[]>,
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: 'StreamSession' as const, id })),
                { type: 'StreamSession' as const, id: 'ACTIVE_LIST' },
              ]
            : [{ type: 'StreamSession' as const, id: 'ACTIVE_LIST' }],
      }),

      heartbeatSession: builder.mutation<StreamSession, { id: string; body: HeartbeatInput }>({
        query: ({ id, body }) => ({ url: `/streams/${id}/heartbeat`, method: 'POST', body }),
        transformResponse: unwrapEnvelope<StreamSession>,
        invalidatesTags: (_result, _error, { id }) => [{ type: 'StreamSession' as const, id }],
      }),

      endSession: builder.mutation<StreamSession, { id: string; body?: EndSessionInput }>({
        query: ({ id, body }) => ({ url: `/streams/${id}/end`, method: 'POST', body: body ?? {} }),
        transformResponse: unwrapEnvelope<StreamSession>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'StreamSession' as const, id },
          { type: 'StreamSession' as const, id: 'ACTIVE_LIST' },
        ],
      }),

      listRecordingSegments: builder.query<
        RecordingSegment[],
        { cameraId: string } & SegmentsQuery
      >({
        query: ({ cameraId, ...params }) => ({
          url: `/cameras/${cameraId}/recording/segments`,
          params,
        }),
        transformResponse: unwrapEnvelope<RecordingSegment[]>,
        providesTags: (_result, _error, { cameraId }) => [
          { type: 'RecordingSegment' as const, id: cameraId },
        ],
      }),
    }),
  });

export const {
  useStartSessionMutation,
  useGetSessionQuery,
  useListActiveSessionsQuery,
  useHeartbeatSessionMutation,
  useEndSessionMutation,
  useListRecordingSegmentsQuery,
} = playbackApi;
