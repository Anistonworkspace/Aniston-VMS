import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { RootState } from './store';
import { clearCredentials, setCredentials } from '@/features/auth/auth.slice';
import type { AuthResult } from '@/features/auth/auth.types';
import type { ApiEnvelope } from '@/lib/apiError';

// Generic RTK Query base slice. Injects the Bearer token from the `auth`
// slice (features/auth/auth.slice.ts, see .claude/skills/skill-auth-patterns.md)
// and silently retries once on 401 via POST /api/auth/refresh (httpOnly
// cookie carries the refresh token — the access token itself lives in Redux
// memory only). No tagTypes are declared here — every feature adds its own
// via api.enhanceEndpoints({ addTagTypes }).injectEndpoints({ ... }) exactly
// like features/overview/overview.api.ts already does.
const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

// Single-flight guard — several queries can 401 at the same moment (access
// token expiry); only the first triggers a refresh, the rest await it.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(
  api: Parameters<typeof rawBaseQuery>[1],
  extraOptions: Parameters<typeof rawBaseQuery>[2]
): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const result = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions);
    const body = result.data as ApiEnvelope<AuthResult> | undefined;
    if (result.error || !body?.data) {
      api.dispatch(clearCredentials());
      return false;
    }
    api.dispatch(setCredentials(body.data));
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const url = typeof args === 'string' ? args : args.url;
  let result = await rawBaseQuery(args, api, extraOptions);

  // Never refresh-and-retry the auth-FLOW endpoints — a 401 from refresh/login/
  // logout must not kick off another refresh (that would loop or resurrect a
  // dead session). But /auth/me is a normal authenticated read: on a cold page
  // load (deep-link, bookmark, hard refresh) the access token lives only in
  // memory, so the very first /auth/me 401s and MUST refresh-and-retry to
  // rehydrate the current user — otherwise every role-gated control (write
  // buttons, admin nav) silently disappears. See e2e/fixtures.ts auth model.
  const isAuthFlow = url === '/auth/refresh' || url === '/auth/login' || url === '/auth/logout';
  if (result.error?.status === 401 && !isAuthFlow) {
    const refreshed = await refreshAccessToken(api, extraOptions);
    if (refreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [],
  endpoints: () => ({}),
});
