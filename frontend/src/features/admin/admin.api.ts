// Admin API slice — endpoint-for-endpoint mirror of the backend admin module
// (backend/src/modules/admin/*.router.ts, all mounted at the `/api` root in
// backend/src/app.ts). Role guards live server-side; the UI additionally gates
// buttons/tabs via the helpers in admin.types.ts so users never see actions
// their role cannot perform.
import { api } from '@/app/api';
import { unwrapEnvelope } from '@/lib/apiError';
import type { ApiEnvelope } from '@/lib/apiError';
import type {
  AuditLogListQuery,
  AuditLogRow,
  CreateAccessScopeInput,
  CreatePolicyInput,
  CreateRecipientInput,
  CreateStepInput,
  CreateUserInput,
  EscalationPolicy,
  EscalationStep,
  NotificationListQuery,
  NotificationRow,
  Paginated,
  PolicyListQuery,
  PublicUser,
  RecipientListQuery,
  RegionRefLite,
  SiteRefLite,
  UpdatePolicyInput,
  UpdateRecipientInput,
  UpdateStepInput,
  UpdateUserInput,
  UserAccessScope,
  UserListQuery,
  ZoneAlertRecipient,
  ZoneRefLite,
} from './admin.types';

// Same local helper convention as features/settings/settings.api.ts.
function toQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ''
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

export const adminApi = api
  .enhanceEndpoints({
    addTagTypes: [
      'AdminUser',
      'AdminUserScopes',
      'EscPolicy',
      'ZoneRecipient',
      'AdminNotification',
      'AuditLog',
    ],
  })
  .injectEndpoints({
    endpoints: (builder) => ({
      // ── Users (read: SUPER_ADMIN/PROJECT_ADMIN · write: SUPER_ADMIN) ──
      listUsers: builder.query<Paginated<PublicUser>, UserListQuery | void>({
        query: (params) => `/users${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<Paginated<PublicUser>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((user) => ({ type: 'AdminUser' as const, id: user.id })),
                { type: 'AdminUser' as const, id: 'LIST' },
              ]
            : [{ type: 'AdminUser' as const, id: 'LIST' }],
      }),
      createUser: builder.mutation<PublicUser, CreateUserInput>({
        query: (body) => ({ url: '/users', method: 'POST', body }),
        transformResponse: unwrapEnvelope<PublicUser>,
        invalidatesTags: [{ type: 'AdminUser', id: 'LIST' }],
      }),
      updateUser: builder.mutation<PublicUser, { id: string; body: UpdateUserInput }>({
        query: ({ id, body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<PublicUser>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'AdminUser', id },
          { type: 'AdminUser', id: 'LIST' },
        ],
      }),
      // DELETE /users/:id is a soft-delete (deactivate) — returns the user.
      deactivateUser: builder.mutation<PublicUser, string>({
        query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
        transformResponse: unwrapEnvelope<PublicUser>,
        invalidatesTags: (_result, _error, id) => [
          { type: 'AdminUser', id },
          { type: 'AdminUser', id: 'LIST' },
        ],
      }),
      listUserScopes: builder.query<UserAccessScope[], string>({
        query: (userId) => `/users/${userId}/access-scopes`,
        transformResponse: unwrapEnvelope<UserAccessScope[]>,
        providesTags: (_result, _error, userId) => [{ type: 'AdminUserScopes', id: userId }],
      }),
      createUserScope: builder.mutation<
        UserAccessScope,
        { userId: string; body: CreateAccessScopeInput }
      >({
        query: ({ userId, body }) => ({
          url: `/users/${userId}/access-scopes`,
          method: 'POST',
          body,
        }),
        transformResponse: unwrapEnvelope<UserAccessScope>,
        invalidatesTags: (_result, _error, { userId }) => [{ type: 'AdminUserScopes', id: userId }],
      }),
      deleteUserScope: builder.mutation<void, { userId: string; scopeId: string }>({
        query: ({ userId, scopeId }) => ({
          url: `/users/${userId}/access-scopes/${scopeId}`,
          method: 'DELETE',
        }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: (_result, _error, { userId }) => [{ type: 'AdminUserScopes', id: userId }],
      }),

      // ── Escalation policies + steps (SUPER_ADMIN/PROJECT_ADMIN) ──
      listEscalationPolicies: builder.query<Paginated<EscalationPolicy>, PolicyListQuery | void>({
        query: (params) => `/escalation-policies${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<Paginated<EscalationPolicy>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((policy) => ({ type: 'EscPolicy' as const, id: policy.id })),
                { type: 'EscPolicy' as const, id: 'LIST' },
              ]
            : [{ type: 'EscPolicy' as const, id: 'LIST' }],
      }),
      createEscalationPolicy: builder.mutation<EscalationPolicy, CreatePolicyInput>({
        query: (body) => ({ url: '/escalation-policies', method: 'POST', body }),
        transformResponse: unwrapEnvelope<EscalationPolicy>,
        invalidatesTags: [{ type: 'EscPolicy', id: 'LIST' }],
      }),
      updateEscalationPolicy: builder.mutation<
        EscalationPolicy,
        { id: string; body: UpdatePolicyInput }
      >({
        query: ({ id, body }) => ({ url: `/escalation-policies/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<EscalationPolicy>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'EscPolicy', id },
          { type: 'EscPolicy', id: 'LIST' },
        ],
      }),
      deleteEscalationPolicy: builder.mutation<void, string>({
        query: (id) => ({ url: `/escalation-policies/${id}`, method: 'DELETE' }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: (_result, _error, id) => [
          { type: 'EscPolicy', id },
          { type: 'EscPolicy', id: 'LIST' },
        ],
      }),
      createEscalationStep: builder.mutation<
        EscalationStep,
        { policyId: string; body: CreateStepInput }
      >({
        query: ({ policyId, body }) => ({
          url: `/escalation-policies/${policyId}/steps`,
          method: 'POST',
          body,
        }),
        transformResponse: unwrapEnvelope<EscalationStep>,
        invalidatesTags: (_result, _error, { policyId }) => [
          { type: 'EscPolicy', id: policyId },
          { type: 'EscPolicy', id: 'LIST' },
        ],
      }),
      updateEscalationStep: builder.mutation<
        EscalationStep,
        { policyId: string; stepId: string; body: UpdateStepInput }
      >({
        query: ({ policyId, stepId, body }) => ({
          url: `/escalation-policies/${policyId}/steps/${stepId}`,
          method: 'PATCH',
          body,
        }),
        transformResponse: unwrapEnvelope<EscalationStep>,
        invalidatesTags: (_result, _error, { policyId }) => [
          { type: 'EscPolicy', id: policyId },
          { type: 'EscPolicy', id: 'LIST' },
        ],
      }),
      deleteEscalationStep: builder.mutation<void, { policyId: string; stepId: string }>({
        query: ({ policyId, stepId }) => ({
          url: `/escalation-policies/${policyId}/steps/${stepId}`,
          method: 'DELETE',
        }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: (_result, _error, { policyId }) => [
          { type: 'EscPolicy', id: policyId },
          { type: 'EscPolicy', id: 'LIST' },
        ],
      }),

      // ── Zone alert recipients (SUPER_ADMIN/PROJECT_ADMIN) ──
      listZoneRecipients: builder.query<Paginated<ZoneAlertRecipient>, RecipientListQuery | void>({
        query: (params) => `/zone-alert-recipients${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<Paginated<ZoneAlertRecipient>>,
        providesTags: (result) =>
          result
            ? [
                ...result.items.map((row) => ({ type: 'ZoneRecipient' as const, id: row.id })),
                { type: 'ZoneRecipient' as const, id: 'LIST' },
              ]
            : [{ type: 'ZoneRecipient' as const, id: 'LIST' }],
      }),
      createZoneRecipient: builder.mutation<ZoneAlertRecipient, CreateRecipientInput>({
        query: (body) => ({ url: '/zone-alert-recipients', method: 'POST', body }),
        transformResponse: unwrapEnvelope<ZoneAlertRecipient>,
        invalidatesTags: [{ type: 'ZoneRecipient', id: 'LIST' }],
      }),
      updateZoneRecipient: builder.mutation<
        ZoneAlertRecipient,
        { id: string; body: UpdateRecipientInput }
      >({
        query: ({ id, body }) => ({ url: `/zone-alert-recipients/${id}`, method: 'PATCH', body }),
        transformResponse: unwrapEnvelope<ZoneAlertRecipient>,
        invalidatesTags: (_result, _error, { id }) => [
          { type: 'ZoneRecipient', id },
          { type: 'ZoneRecipient', id: 'LIST' },
        ],
      }),
      deleteZoneRecipient: builder.mutation<void, string>({
        query: (id) => ({ url: `/zone-alert-recipients/${id}`, method: 'DELETE' }),
        transformResponse: (_response: ApiEnvelope<null>) => undefined,
        invalidatesTags: (_result, _error, id) => [
          { type: 'ZoneRecipient', id },
          { type: 'ZoneRecipient', id: 'LIST' },
        ],
      }),

      // ── Notification delivery log (any authenticated role, scope-filtered) ──
      listAdminNotifications: builder.query<
        Paginated<NotificationRow>,
        NotificationListQuery | void
      >({
        query: (params) => `/notifications${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<Paginated<NotificationRow>>,
        providesTags: [{ type: 'AdminNotification', id: 'LIST' }],
      }),

      // ── Audit log (SUPER_ADMIN/AUDITOR) ──
      listAuditLog: builder.query<Paginated<AuditLogRow>, AuditLogListQuery | void>({
        query: (params) => `/audit-log${toQueryString({ ...(params ?? {}) })}`,
        transformResponse: unwrapEnvelope<Paginated<AuditLogRow>>,
        providesTags: [{ type: 'AuditLog', id: 'LIST' }],
      }),

      // ── Region / Zone / Site lookups (read-only, for scope + policy pickers) ──
      // Same GET /regions, /zones, /sites routes the hierarchy module exposes
      // (backend/src/modules/hierarchy/hierarchy.router.ts); we only need
      // { id, name } here so we type against the lighter *RefLite shapes
      // instead of importing the settings feature (owned by another agent).
      listRegionOptions: builder.query<Paginated<RegionRefLite>, void>({
        query: () => '/regions?limit=100',
        transformResponse: unwrapEnvelope<Paginated<RegionRefLite>>,
      }),

      listZoneOptions: builder.query<Paginated<ZoneRefLite>, void>({
        query: () => '/zones?limit=100',
        transformResponse: unwrapEnvelope<Paginated<ZoneRefLite>>,
      }),

      listSiteOptions: builder.query<Paginated<SiteRefLite>, void>({
        query: () => '/sites?limit=100',
        transformResponse: unwrapEnvelope<Paginated<SiteRefLite>>,
      }),
    }),
  });

export const {
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeactivateUserMutation,
  useListUserScopesQuery,
  useCreateUserScopeMutation,
  useDeleteUserScopeMutation,
  useListEscalationPoliciesQuery,
  useCreateEscalationPolicyMutation,
  useUpdateEscalationPolicyMutation,
  useDeleteEscalationPolicyMutation,
  useCreateEscalationStepMutation,
  useUpdateEscalationStepMutation,
  useDeleteEscalationStepMutation,
  useListZoneRecipientsQuery,
  useCreateZoneRecipientMutation,
  useUpdateZoneRecipientMutation,
  useDeleteZoneRecipientMutation,
  useListAdminNotificationsQuery,
  useListAuditLogQuery,
  useListZoneOptionsQuery,
  useListRegionOptionsQuery,
  useListSiteOptionsQuery,
} = adminApi;
