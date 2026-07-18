import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';

// Every backend response is `{ success: boolean; data: T }` on the happy path
// and `{ success: false; error: { code, message, details } }` on failure
// (backend/src/middleware/errorHandler.ts). RTK Query's fetchBaseQuery parses
// non-2xx JSON bodies into `error.data`, so this is the single place that
// unwraps either shape for feature api.ts files and toasts.
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** Unwrap `{ success, data }` into `data` — use as an RTK Query `transformResponse`. */
export function unwrapEnvelope<T>(response: ApiEnvelope<T>): T {
  return response.data;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'object'
  );
}

/** Extract a human-readable message from any RTK Query error (fetch or serialized). */
export function getApiErrorMessage(
  err: FetchBaseQueryError | SerializedError | undefined | null,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (!err) return fallback;
  if ('status' in err) {
    if (isApiErrorBody(err.data)) return err.data.error.message;
    if (err.status === 'FETCH_ERROR') return 'Network error — check your connection.';
    if (err.status === 'TIMEOUT_ERROR') return 'Request timed out — please retry.';
    if (typeof err.status === 'number' && err.status === 401)
      return 'Session expired — please sign in again.';
    return fallback;
  }
  return err.message ?? fallback;
}

/**
 * Extract the backend `error.code` (e.g. `MFA_REQUIRED`, `INVALID_CREDENTIALS` —
 * backend/src/modules/auth/auth.service.ts `AppError`) from an RTK Query error,
 * so callers can branch on it instead of string-matching the message.
 */
export function getApiErrorCode(
  err: FetchBaseQueryError | SerializedError | undefined | null
): string | undefined {
  if (!err || !('status' in err)) return undefined;
  return isApiErrorBody(err.data) ? err.data.error.code : undefined;
}
