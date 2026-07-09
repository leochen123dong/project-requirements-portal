import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { ReactNode } from 'react';

/**
 * Redirect to /login if no session.
 *
 * Race-condition guard: `loading` is true while App.tsx is calling
 * supabase.auth.getSession() on mount. Without this, RequireAuth
 * synchronously sees session=null on first render and bounces to
 * /login before the async session restore completes — causing the
 * "refresh logs me out" bug. Now we show a tiny loading placeholder
 * until the session is known.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}
      >
        加载中…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}