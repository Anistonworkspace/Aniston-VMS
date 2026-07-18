// Aniston VMS auth domain types — mirrors backend/prisma `Role` enum exactly
// (backend/src/modules/auth/auth.service.ts `publicUser()`). Do NOT reuse
// features/overview/types/vms.ts `VmsRole` — its role literals
// (MONITORING_OPERATOR / MAINTENANCE_ENGINEER) do not match the real API.
export type Role =
  'SUPER_ADMIN' | 'PROJECT_ADMIN' | 'OPERATOR' | 'ENGINEER' | 'CLIENT_VIEWER' | 'AUDITOR';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  PROJECT_ADMIN: 'Project Admin',
  OPERATOR: 'Monitoring Operator',
  ENGINEER: 'Maintenance Engineer',
  CLIENT_VIEWER: 'Client Viewer',
  AUDITOR: 'Auditor',
};

export type ScopeType = 'ALL' | 'REGION' | 'ZONE' | 'SITE';

export interface AccessScope {
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}

export interface CurrentUser extends AuthUser {
  accessScopes: AccessScope[];
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

// Mirrors backend/src/modules/auth/auth.schemas.ts exactly.
export interface LoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'PROJECT_ADMIN'];
const OPERATOR_PLUS_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'PROJECT_ADMIN',
  'OPERATOR',
  'ENGINEER',
];

/** PROJECT_ADMIN+ — registry/admin management, incident close. */
export function isAdminRole(role: Role | undefined | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

/** OPERATOR+ — ack/assign/investigate/resolve incidents, run checks, capture snapshots. */
export function isOperatorPlusRole(role: Role | undefined | null): boolean {
  return !!role && OPERATOR_PLUS_ROLES.includes(role);
}
