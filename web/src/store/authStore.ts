import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/contracts';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  setSession: (s: Session | null) => void;
  setProfile: (p: Profile | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      profile: null,
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      reset: () => set({ session: null, profile: null }),
    }),
    {
      name: 'pm-portal-auth',
      // Only persist profile (lightweight); session is re-hydrated from Supabase on mount.
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
);