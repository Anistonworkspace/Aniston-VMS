import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import {
  AnimatedModal,
  Badge,
  Button,
  Drawer,
  Input,
  SkeletonTable,
  ToastContainer,
} from '@/components/ui';
import { Select, type SelectOption } from './Select';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { ROLE_LABELS, type Role, type ScopeType } from '@/features/auth/auth.types';
import {
  useCreateUserMutation,
  useCreateUserScopeMutation,
  useDeactivateUserMutation,
  useDeleteUserScopeMutation,
  useListRegionOptionsQuery,
  useListSiteOptionsQuery,
  useListUserScopesQuery,
  useListUsersQuery,
  useListZoneOptionsQuery,
  useUpdateUserMutation,
} from './admin.api';
import { canWriteUsers, type PublicUser, type UserAccessScope } from './admin.types';
import { ConfirmDialog } from './ConfirmDialog';

const ROLE_BADGE: Record<Role, 'purple' | 'primary' | 'info' | 'warning' | 'default' | 'success'> =
  {
    SUPER_ADMIN: 'purple',
    PROJECT_ADMIN: 'primary',
    OPERATOR: 'info',
    ENGINEER: 'warning',
    CLIENT_VIEWER: 'default',
    AUDITOR: 'success',
  };

const ROLE_OPTIONS: SelectOption[] = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

const SCOPE_TYPE_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'ALL — unrestricted' },
  { value: 'REGION', label: 'REGION' },
  { value: 'ZONE', label: 'ZONE' },
  { value: 'SITE', label: 'SITE' },
];

type Notify = (title: string, description?: string) => void;

// ─── Create / edit modal (POST /users · PATCH /users/:id — SUPER_ADMIN) ───

interface UserModalProps {
  user: PublicUser | null; // null = create
  onClose: () => void;
  onSuccess: Notify;
  onError: Notify;
}

function UserModal({ user, onClose, onSuccess, onError }: UserModalProps): JSX.Element {
  const isEdit = user !== null;
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<string>(user?.role ?? 'OPERATOR');
  const [password, setPassword] = useState('');
  const [activeState, setActiveState] = useState(''); // '' = leave unchanged
  const [formError, setFormError] = useState<string | null>(null);
  const [createUser, { isLoading: creating }] = useCreateUserMutation();
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (password && password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    try {
      if (isEdit) {
        const body: Record<string, unknown> = {};
        if (name.trim() !== user.name) body.name = name.trim();
        if (phone.trim() && phone.trim() !== (user.phone ?? '')) body.phone = phone.trim();
        if (role !== user.role) body.role = role;
        if (password) body.password = password;
        if (activeState !== '') body.isActive = activeState === 'true';
        if (Object.keys(body).length === 0) {
          setFormError('Nothing to save — change at least one field.');
          return;
        }
        await updateUser({ id: user.id, body }).unwrap();
        onSuccess('User updated', name.trim());
      } else {
        if (!email.includes('@')) {
          setFormError('A valid email is required.');
          return;
        }
        if (!phone.trim()) {
          setFormError('Phone is required.');
          return;
        }
        if (password.length < 8) {
          setFormError('Password must be at least 8 characters.');
          return;
        }
        await createUser({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          phone: phone.trim(),
          role: role as Role,
        }).unwrap();
        onSuccess('User created', `${name.trim()} — ${ROLE_LABELS[role as Role]}`);
      }
      onClose();
    } catch (err) {
      onError('Save failed', getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0]));
    }
  };

  return (
    <AnimatedModal open onClose={onClose} title={isEdit ? 'Edit user' : 'New user'} size="md">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isEdit}
          hint={isEdit ? 'Email cannot be changed via the admin API.' : undefined}
          required={!isEdit}
        />
        <Input
          label="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={30}
          required={!isEdit}
        />
        <Select
          label="Role"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        />
        <Input
          label={isEdit ? 'Reset password (optional)' : 'Password'}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={isEdit ? 'Leave blank to keep the current password.' : 'Minimum 8 characters.'}
        />
        {isEdit && (
          <Select
            label="Account status"
            options={[
              { value: '', label: '(leave unchanged)' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Deactivated' },
            ]}
            value={activeState}
            onChange={(event) => setActiveState(event.target.value)}
          />
        )}
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={creating || updating}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </div>
      </form>
    </AnimatedModal>
  );
}

// ─── Access scopes drawer (GET/POST/DELETE /users/:id/access-scopes) ───

interface ScopesDrawerProps {
  user: PublicUser;
  canWrite: boolean;
  onClose: () => void;
  onSuccess: Notify;
  onError: Notify;
}

function ScopesDrawer({
  user,
  canWrite,
  onClose,
  onSuccess,
  onError,
}: ScopesDrawerProps): JSX.Element {
  const { data: scopes, isLoading } = useListUserScopesQuery(user.id);
  const { data: regions } = useListRegionOptionsQuery();
  const { data: zones } = useListZoneOptionsQuery();
  const { data: sites } = useListSiteOptionsQuery();
  const [scopeType, setScopeType] = useState<ScopeType>('ZONE');
  const [scopeId, setScopeId] = useState('');
  const [createScope, { isLoading: adding }] = useCreateUserScopeMutation();
  const [deleteScope] = useDeleteUserScopeMutation();

  const targetOptions: SelectOption[] = useMemo(() => {
    const source: { id: string; name: string }[] | undefined =
      scopeType === 'REGION'
        ? regions?.items
        : scopeType === 'ZONE'
          ? zones?.items
          : scopeType === 'SITE'
            ? sites?.items
            : [];
    return (source ?? []).map((item) => ({ value: item.id, label: item.name }));
  }, [scopeType, regions, zones, sites]);

  const nameFor = (scope: UserAccessScope): string => {
    if (scope.scopeType === 'ALL') return 'All resources';
    const source: { id: string; name: string }[] | undefined =
      scope.scopeType === 'REGION'
        ? regions?.items
        : scope.scopeType === 'ZONE'
          ? zones?.items
          : sites?.items;
    return source?.find((item) => item.id === scope.scopeId)?.name ?? scope.scopeId ?? '—';
  };

  const handleAdd = async (): Promise<void> => {
    if (scopeType !== 'ALL' && !scopeId) {
      onError('Pick a target', 'A target is required unless the scope type is ALL.');
      return;
    }
    try {
      await createScope({
        userId: user.id,
        body: { scopeType, ...(scopeType === 'ALL' ? {} : { scopeId }) },
      }).unwrap();
      setScopeId('');
      onSuccess('Scope added');
    } catch (err) {
      onError(
        'Could not add scope',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  };

  const handleDelete = async (scope: UserAccessScope): Promise<void> => {
    try {
      await deleteScope({ userId: user.id, scopeId: scope.id }).unwrap();
      onSuccess('Scope removed');
    } catch (err) {
      onError(
        'Could not remove scope',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  };

  return (
    <Drawer open onClose={onClose} title={`Access scopes — ${user.name}`}>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Scopes restrict which regions, zones and sites this account can see. An{' '}
          <span className="font-medium text-ink">ALL</span> scope grants unrestricted visibility.
        </p>

        {canWrite && (
          <div className="space-y-3 rounded-lg border border-gray-100 bg-white/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Scope type"
                options={SCOPE_TYPE_OPTIONS}
                value={scopeType}
                onChange={(event) => {
                  setScopeType(event.target.value as ScopeType);
                  setScopeId('');
                }}
              />
              {scopeType !== 'ALL' && (
                <Select
                  label="Target"
                  options={targetOptions}
                  placeholder="Select…"
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                />
              )}
            </div>
            <Button
              size="sm"
              leftIcon={<Plus size={14} />}
              loading={adding}
              onClick={() => {
                void handleAdd();
              }}
            >
              Add scope
            </Button>
          </div>
        )}
        {!canWrite && (
          <p className="text-xs text-gray-400">Scope changes require the SUPER_ADMIN role.</p>
        )}

        {isLoading && <SkeletonTable rows={3} />}
        {!isLoading && (scopes?.length ?? 0) === 0 && (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No scopes — this account currently has no explicit access restrictions configured.
          </p>
        )}
        <ul className="space-y-2">
          {scopes?.map((scope) => (
            <li
              key={scope.id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white/60 px-4 py-2.5"
            >
              <Badge variant={scope.scopeType === 'ALL' ? 'purple' : 'primary'} size="sm">
                {scope.scopeType}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{nameFor(scope)}</span>
              <span className="text-xs text-gray-400">{formatDateTime(scope.createdAt)}</span>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Remove scope"
                  onClick={() => {
                    void handleDelete(scope);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}

// ─── Main tab ───

export function UsersTab(): JSX.Element {
  const { toasts, dismiss, success, error: toastError } = useToast();
  const { data: me } = useGetCurrentUserQuery();
  const canWrite = canWriteUsers(me?.role);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<PublicUser | null>(null);
  const [scopesUser, setScopesUser] = useState<PublicUser | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<PublicUser | null>(null);

  const query = useMemo(
    () => ({
      page,
      limit: 20,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(roleFilter ? { role: roleFilter as Role } : {}),
    }),
    [page, search, roleFilter]
  );
  const { data, isLoading, isError, error, refetch } = useListUsersQuery(query);
  const [deactivateUser, { isLoading: deactivating }] = useDeactivateUserMutation();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleDeactivate = async (): Promise<void> => {
    if (!userToDeactivate) return;
    try {
      await deactivateUser(userToDeactivate.id).unwrap();
      success('User deactivated', userToDeactivate.email);
      setUserToDeactivate(null);
    } catch (err) {
      toastError(
        'Deactivation failed',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input
            label="Search"
            placeholder="Name or email…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-44">
          <Select
            label="Role"
            options={[{ value: '', label: 'All roles' }, ...ROLE_OPTIONS]}
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {canWrite && (
          <Button
            className="ml-auto"
            size="sm"
            leftIcon={<Plus size={15} />}
            onClick={() => setCreateOpen(true)}
          >
            New user
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="rounded-card bg-card p-4 shadow-soft">
          <SkeletonTable rows={6} />
        </div>
      )}
      {isError && (
        <div className="rounded-card bg-card p-10 text-center shadow-soft">
          <p className="text-sm text-gray-600">{getApiErrorMessage(error)}</p>
          <Button
            className="mt-4"
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-card bg-card shadow-soft">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">MFA</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    No users match the current filters.
                  </td>
                </tr>
              )}
              {data.items.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-50 transition-colors last:border-b-0 hover:bg-gray-50/60"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={ROLE_BADGE[user.role]} size="sm">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.mfaEnabled ? 'success' : 'default'} size="sm">
                      {user.mfaEnabled ? 'Enabled' : 'Off'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-label="Access scopes"
                        title="Access scopes"
                        onClick={() => setScopesUser(user)}
                      >
                        <KeyRound size={14} />
                      </Button>
                      {canWrite && (
                        <>
                          <Button
                            variant="ghost"
                            size="xs"
                            aria-label="Edit user"
                            title="Edit"
                            onClick={() => setEditUser(user)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            aria-label="Deactivate user"
                            title="Deactivate"
                            disabled={user.id === me?.id}
                            onClick={() => setUserToDeactivate(user)}
                          >
                            <UserX size={14} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <p className="text-xs text-gray-500">
                Page {data.page} of {totalPages} · {data.total} users
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <UserModal
          user={null}
          onClose={() => setCreateOpen(false)}
          onSuccess={success}
          onError={toastError}
        />
      )}
      {editUser && (
        <UserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={success}
          onError={toastError}
        />
      )}
      {scopesUser && (
        <ScopesDrawer
          user={scopesUser}
          canWrite={canWrite}
          onClose={() => setScopesUser(null)}
          onSuccess={success}
          onError={toastError}
        />
      )}
      <ConfirmDialog
        open={userToDeactivate !== null}
        title="Deactivate user"
        message={`Deactivate ${userToDeactivate?.name ?? ''} (${userToDeactivate?.email ?? ''})? This is a soft delete — the account is disabled and its sessions are revoked.`}
        confirmLabel="Deactivate"
        loading={deactivating}
        onConfirm={() => {
          void handleDeactivate();
        }}
        onClose={() => setUserToDeactivate(null)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </section>
  );
}
