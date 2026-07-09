/**
 * RBAC: pure TS, no Supabase. Frontend gate only — backend RLS is the source of truth.
 *
 * Phase 0 stub — Phase 1 backend-dev will reconcile with the actual RLS policies
 * defined in `supabase/migrations/0002_rls.sql`.
 */

import type { Role } from '../types/contracts';

// Re-export so consumers can `import { can, Role } from '../utils/rbac'`.
export type { Role };

/** Returns true if `role` is in the allowed list (or is admin). */
export function can(role: Role, allowed: readonly Role[]): boolean {
  if (role === 'admin') return true;
  return allowed.includes(role);
}

/** Page-level permission matrix. Keep in sync with Layout.tsx nav tabs.
 *  v0.2.1: `tickets` removed (tickets module deprecated per user feedback). */
export const PAGE_PERMISSIONS = {
  home: ['presales', 'pm', 'delivery', 'postsales', 'admin'] as Role[],
  opportunities: ['presales', 'pm', 'admin'] as Role[],
  projects: ['pm', 'delivery', 'postsales', 'admin'] as Role[],
  admin: ['admin'] as Role[],
} as const;

/** Action-level helpers (used by buttons + RLS-equivalent frontend gates).
 *  v0.2.1: `canSyncITHub` removed (tickets module deprecated). */
export const canCreateOpportunity = (r: Role) => can(r, ['presales', 'admin']);
export const canHandoverOpportunity = (r: Role) => can(r, ['presales', 'admin']);
export const canDeleteOpportunity = (r: Role) => can(r, ['presales', 'admin']);
export const canUpdateOpportunity = (r: Role) => can(r, ['presales', 'admin']);
export const canEditProject = (r: Role) => can(r, ['pm', 'admin']);
export const canAssignTask = (r: Role) => can(r, ['pm', 'delivery', 'admin']);
export const canCompleteTask = (r: Role) => can(r, ['delivery', 'pm', 'admin']);
export const canViewAdminDashboard = (r: Role) => can(r, ['admin']);

// v0.2 additions
export const canManageUsers = (r: Role) => can(r, ['admin']);
export const canManageCustomFields = (r: Role) => can(r, ['admin']);