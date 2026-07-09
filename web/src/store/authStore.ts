import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/contracts';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  // `loading` is true while App.tsx is hydrating from supabase.auth.getSession().
  // RequireAuth shows a spinner while loading=true to avoid the race where
  // RequireAuth sees session=null on first render and bounces to /login
  // before the async session restore resolves.
  loading: boolean;
  setSession: (s: Session | null) => void;
  setProfile: (p: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      profile: null,
      loading: true,
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setLoading: (loading) => set({ loading }),
      reset: () => set({ session: null, profile: null, loading: false }),
    }),
    {
      name: 'pm-portal-auth',
      // Only persist profile (lightweight); session is re-hydrated from Supabase on mount.
      // `loading` is intentionally NOT persisted — it always starts true on hydration.
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
);