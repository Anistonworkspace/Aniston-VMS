import { UserRole } from './enums.js';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

export const PERMISSIONS: Record<string, Record<PermissionAction, UserRole[]>> = {
  organizations: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    create: [UserRole.SUPER_ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN],
  },
  users: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  employees: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  departments: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  designations: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  dashboard: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE],
    create: [],
    update: [],
    delete: [],
  },
  settings: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN],
  },
  auditLogs: {
    read: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    create: [],
    update: [],
    delete: [],
  },
};

export function hasPermission(role: UserRole, resource: string, action: PermissionAction): boolean {
  const resourcePerms = PERMISSIONS[resource];
  if (!resourcePerms) return false;
  return resourcePerms[action]?.includes(role) ?? false;
}
