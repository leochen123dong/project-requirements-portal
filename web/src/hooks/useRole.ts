import { useAuthStore } from '../store/authStore';
import type { Role } from '../types/contracts';

/** Read the current user's role from the auth store. Returns 'guest' if unknown. */
export function useRole(): Role {
  const profile = useAuthStore((s) => s.profile);
  return (profile?.role ?? 'guest') as Role;
}