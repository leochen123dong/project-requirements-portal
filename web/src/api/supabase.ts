/**
 * Supabase client. Phase 0 stub — Phase 1 backend-dev will fill in the Database
 * type from the Postgres schema (use `supabase gen types typescript` to regenerate).
 *
 * If env is not configured, we return null so the app can render a setup hint
 * instead of crashing on first import.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/**
 * Phase 1 TODO: replace `any` with the generated Database type:
 *
 *   import type { Database } from '../types/database';
 *   export const supabase = createClient<Database>(url, anonKey);
 *
 * The Database type is regenerated from migrations:
 *   supabase gen types typescript --project-id <ref> > web/src/types/database.ts
 */

// ─── Helpers (used by Phase 2a pages) ──────────────────────────────────────

export async function signInWithMagicLink(email: string, redirectTo?: string) {
  if (!supabase) throw new Error('Supabase 未配置 (检查 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo ?? window.location.origin + '/#/home' },
  });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Fetch a profile row for the current user. Phase 2a will use this in Layout. */
export async function fetchProfile(userId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}