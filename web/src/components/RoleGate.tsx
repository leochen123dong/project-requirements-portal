import type { ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';
import { can, type Role } from '../utils/rbac';

/**
 * Renders children only if current user's role is in `roles`.
 * Phase 0 stub — Phase 2a may wrap with fallback slot.
 */
export default function RoleGate({
  roles,
  children,
  fallback = null,
}: {
  roles: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const profile = useAuthStore((s) => s.profile);
  const role = (profile?.role ?? 'guest') as Role;
  return can(role, roles) ? <>{children}</> : <>{fallback}</>;
}