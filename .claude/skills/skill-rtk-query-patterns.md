# Skill — RTK Query Patterns

These are the only correct ways to call APIs and manage server state in the
frontend (`frontend/`) against the NestJS API (`backend/`). Canon: see
`docs/02-TRD.md` (realtime architecture) and `docs/05-backend-schema.md`
(Camera / Zone / Incident / HealthCheck / Escalation models).

---

## API slice structure (one file per domain feature)

```typescript
// frontend/src/features/cameras/cameras.api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Camera, CameraStatus, Incident, ApiResponse, PaginationMeta } from '@aniston-vms/shared';
import type { RootState } from '@/app/store';

export const camerasApi = createApi({
  reducerPath: 'camerasApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Camera', 'Zone', 'Incident', 'HealthCheck'],
  endpoints: (builder) => ({
    listCameras: builder.query<{ data: Camera[]; meta: PaginationMeta }, { zoneId?: string; page?: number; limit?: number }>({
      query: (params) => ({ url: '/cameras', params }),
      providesTags: (result) =>
        result
          ? [...result.data.map(({ id }) => ({ type: 'Camera' as const, id })), { type: 'Camera', id: 'LIST' }]
          : [{ type: 'Camera', id: 'LIST' }],
    }),

    getCamera: builder.query<Camera, string>({
      query: (id) => `/cameras/${id}`, // e.g. CAM-042
      providesTags: (_result, _err, id) => [{ type: 'Camera', id }],
    }),

    updateCameraStatus: builder.mutation<Camera, { id: string; status: CameraStatus }>({
      query: ({ id, status }) => ({ url: `/cameras/${id}/status`, method: 'PATCH', body: { status } }),
      // A status flip (e.g. -> CAMERA_OFFLINE) can also open/close an Incident — invalidate both.
      invalidatesTags: (_result, _err, { id }) => [
        { type: 'Camera', id },
        { type: 'Camera', id: 'LIST' },
        { type: 'Incident', id: 'LIST' },
      ],
    }),

    acknowledgeIncident: builder.mutation<Incident, { id: string; note?: string }>({
      query: ({ id, note }) => ({ url: `/incidents/${id}/acknowledge`, method: 'POST', body: { note } }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Incident', id }, { type: 'Incident', id: 'LIST' }],
    }),

    deleteZone: builder.mutation<void, string>({
      query: (id) => ({ url: `/zones/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Zone', id: 'LIST' }],
    }),
  }),
});

export const {
  useListCamerasQuery,
  useGetCameraQuery,
  useUpdateCameraStatusMutation,
  useAcknowledgeIncidentMutation,
  useDeleteZoneMutation,
} = camerasApi;
```

## Component consuming RTK Query

```tsx
// ✅ CORRECT — handles all 3 states: loading, error, data
export function LiveWallGrid() {
  const { data, isLoading, isError } = useListCamerasQuery({ page: 1, limit: 20 });
  const [acknowledgeIncident] = useAcknowledgeIncidentMutation();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError) return <p className="text-red-500">Failed to load cameras.</p>;

  const handleAcknowledge = async (incidentId: string) => {
    try {
      await acknowledgeIncident({ id: incidentId }).unwrap();
      toast.success('Incident acknowledged');
    } catch {
      toast.error('Failed to acknowledge incident');
    }
  };

  return <div>{data?.data.map((camera) => <VideoTile key={camera.id} camera={camera} onAcknowledge={handleAcknowledge} />)}</div>;
}
```

## NEVER do this

```typescript
// ❌ WRONG — raw fetch instead of RTK Query
const response = await fetch('/api/cameras');
const data = await response.json();

// ❌ WRONG — copying server data into a Redux slice
dispatch(setCameras(data)); // camera/incident data belongs in RTK Query cache, not a hand-rolled slice

// ❌ WRONG — mutation without invalidatesTags (Incident list won't refresh)
acknowledgeIncident: builder.mutation({
  query: ({ id }) => ({ url: `/incidents/${id}/acknowledge`, method: 'POST' }),
  // missing invalidatesTags!
}),
```

## providesTags / invalidatesTags rules

| Endpoint type | providesTags | invalidatesTags |
|--------------|--------------|-----------------|
| list query | `[{ type: 'X', id: 'LIST' }]` | — |
| single query | `[{ type: 'X', id }]` | — |
| create mutation | — | `[{ type: 'X', id: 'LIST' }]` |
| update mutation | — | `[{ type: 'X', id }, { type: 'X', id: 'LIST' }]` |
| delete mutation | — | `[{ type: 'X', id: 'LIST' }]` |

`X` is `Camera`, `Zone`, `Incident`, or `HealthCheck` for this codebase. A
mutation that crosses entities (camera status → incident) must invalidate
both tag types — see `updateCameraStatus` above.

## Real-time cache updates from the socket (health/status push)

Camera health is pushed live over WebSocket by the health-check worker, not
just polled. Don't wait for a refetch — patch the cache and/or invalidate the
affected tag when the socket event arrives:

```typescript
// frontend/src/app/socket.ts
socket.on('camera:status', ({ id, status }: { id: string; status: CameraStatus }) => {
  dispatch(
    camerasApi.util.updateQueryData('listCameras', { page: 1, limit: 20 }, (draft) => {
      const camera = draft.data.find((c) => c.id === id);
      if (camera) camera.status = status;
    }),
  );
  dispatch(camerasApi.util.invalidateTags([{ type: 'Camera', id }]));
});

socket.on('incident:updated', ({ id }: { id: string }) => {
  dispatch(camerasApi.util.invalidateTags([{ type: 'Incident', id }, { type: 'Incident', id: 'LIST' }]));
});
```

Without this listener, only the actor who triggered the mutation sees fresh
state — every other connected viewer (e.g. a `CLIENT_VIEWER` watching the
same site's `LiveWallGrid`) is stale until their next manual refresh.