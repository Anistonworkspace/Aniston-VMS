import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { ApiEnvelope } from '@/lib/apiError';

import { clearCredentials, setCredentials } from './auth.slice';
import type { AuthResult, ChangePasswordInput, CurrentUser, LoginInput } from './auth.types';

export const authApi = api.enhanceEndpoints({ addTagTypes: ['AuthUser'] }).injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthResult, LoginInput>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      transformResponse: unwrapEnvelope<AuthResult>,
      invalidatesTags: [{ type: 'AuthUser' as const, id: 'ME' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(setCredentials(data));
      },
    }),
    // POST /auth/refresh — exchanges the httpOnly `vms_refresh` cookie for a
    // fresh access token. Used once at app boot (features/auth/AuthBoot.tsx)
    // to silently restore a session after a page reload; NOT part of the
    // 401 retry-and-replay flow in app/api.ts (that has its own internal
    // single-flight refresh call against the same endpoint).
    refreshSession: builder.mutation<AuthResult, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
      transformResponse: unwrapEnvelope<AuthResult>,
      invalidatesTags: [{ type: 'AuthUser' as const, id: 'ME' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(setCredentials(data));
      },
    }),
    getCurrentUser: builder.query<CurrentUser, void>({
      query: () => '/auth/me',
      transformResponse: unwrapEnvelope<CurrentUser>,
      providesTags: [{ type: 'AuthUser' as const, id: 'ME' }],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      transformResponse: (_response: ApiEnvelope<null>) => undefined,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(clearCredentials());
          dispatch(api.util.resetApiState());
        }
      },
    }),
    changePassword: builder.mutation<void, ChangePasswordInput>({
      query: (body) => ({ url: '/auth/password', method: 'PATCH', body }),
      transformResponse: (_response: ApiEnvelope<null>) => undefined,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          // Backend invalidates the refresh cookie on password change — force re-login.
          dispatch(clearCredentials());
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRefreshSessionMutation,
  useGetCurrentUserQuery,
  useLazyGetCurrentUserQuery,
  useLogoutMutation,
  useChangePasswordMutation,
} = authApi;
