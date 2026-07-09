import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { ReactNode } from 'react';

/**
 * Redirect to /login if no session. Phase 2a may add a loading spinner.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session);
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}