import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from './store';

// Generic RTK Query base slice. Injects the Bearer token from an `auth` slice
// IF you add one (see .claude/skills/skill-auth-patterns.md). No tagTypes are
// declared yet — add them per feature via api.injectEndpoints({ ... }).
const baseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState & { auth?: { accessToken?: string } }).auth?.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: [],
  endpoints: () => ({}),
});
